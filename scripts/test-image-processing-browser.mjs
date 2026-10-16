import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import ts from "typescript";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImagePlus } from "lucide-react";

// Render the production add-plant field so browser activation tests exercise
// its real label/input hierarchy, rather than a manually copied approximation.
const app = ts.createSourceFile("App.tsx", await readFile("src/App.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let photoInput, captureHandler;
const visit = (node) => {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(app) === "input"
    && node.getText(app).includes('handleNewPlantImageCapture("gallery"')) photoInput = node;
  if (ts.isVariableDeclaration(node) && node.name.getText(app) === "handleNewPlantImageCapture") captureHandler = node.initializer;
  ts.forEachChild(node, visit);
};
visit(app);
assert.ok(photoInput, "Production add-plant photo input must exist");
let photoField = photoInput.parent;
while (photoField && !(ts.isJsxElement(photoField) && photoField.openingElement.getText(app).includes('className="field"'))) photoField = photoField.parent;
assert.ok(photoField, "Production add-plant photo field must exist");
const renderScript = ts.transpileModule(`globalThis.render = (context) => {
  const { t, newPlantImage, isCapturingNewPlantImage, isAddingPlant, handleNewPlantImageCapture, isNativeImageRuntime } = context;
  return (${photoField.getText(app)});
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const scope = { React, ImagePlus };
vm.runInNewContext(renderScript, scope);
const photoMarkup = renderToStaticMarkup(scope.render({ t: (key) => key, newPlantImage: null,
  isCapturingNewPlantImage: false, isAddingPlant: false, handleNewPlantImageCapture() {}, isNativeImageRuntime: false }));
assert.ok(captureHandler, "Production add-plant capture handler must exist");
const changeHandler = photoInput.attributes.properties.find(node => ts.isJsxAttribute(node) && node.name.getText(app) === "onChange").initializer.expression;
const captureScript = ts.transpileModule(`const createFixture = (context) => {
  const { isHouseholdOperationCurrent, newImageCaptureRef, isAddingPlant, isNativeImageRuntime, captureImage,
    validatePlantImageForUpload, selectedLanguage, newPlantImage, setNewPlantImage, setNewPlantStatus,
    setIsCapturingNewPlantImage, imageErrorMessage, t } = context;
  const handleNewPlantImageCapture = ${captureHandler.getText(app)};
  return { capture: handleNewPlantImageCapture, change: ${changeHandler.getText(app)} };
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

const artifacts = path.resolve(".tmp-tests/image-processing-browser");
await mkdir(artifacts,{recursive:true});
const candidates = process.env.PLANTIE_TEST_BROWSER ? [process.env.PLANTIE_TEST_BROWSER] :
  ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"];
let browser;
for (const candidate of candidates) { try { await access(candidate); browser=candidate; break; } catch { /* Try the next installed browser. */ } }
assert.ok(browser,"Set PLANTIE_TEST_BROWSER to an installed Chromium browser.");
await build({entryPoints:["tests/fixtures/image-processing-browser.ts"],outfile:path.join(artifacts,"fixture.js"),bundle:true,platform:"browser",format:"iife",define:{"import.meta.env":JSON.stringify({VITE_BACKEND_PROVIDER:"netlify"}),"__PRODUCTION_ADD_PLANT_PHOTO_HTML__":JSON.stringify(photoMarkup),"__PRODUCTION_ADD_PLANT_CAPTURE_CODE__":JSON.stringify(captureScript)},logLevel:"warning"});
const html = path.join(artifacts,"fixture.html");
await writeFile(html,'<!doctype html><html><body><pre id="results">pending</pre><script src="fixture.js"></script></body></html>');
const profile = await mkdtemp(path.join(artifacts,"isolated-profile-"));
// Keep the isolated profile/results for diagnosis; never open a user's profile.
const child = spawn(browser,["--headless=new","--no-first-run","--disable-background-networking","--disable-extensions",
  "--remote-debugging-port=0",`--user-data-dir=${profile}`,"about:blank"],{windowsHide:true,stdio:"ignore"});
let socket;
let resultText;
try {
  let port;
  for (let attempt=0; attempt<100; attempt++) {
    try { port=Number((await readFile(path.join(profile,"DevToolsActivePort"),"utf8")).split("\n")[0]); break; }
    catch { await new Promise(resolve=>setTimeout(resolve,50)); }
  }
  assert.ok(port,"Isolated browser did not start its test debugging port.");
  const pages=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket=new WebSocket(pages.find(page=>page.type==="page").webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true});});
  let sequence=0;
  const pending=new Map();
  socket.addEventListener("message",event=>{
    const message=JSON.parse(event.data);const entry=pending.get(message.id);
    if(entry){pending.delete(message.id);clearTimeout(entry.timer);message.error?entry.reject(new Error(JSON.stringify(message.error))):entry.resolve(message.result);}
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`Browser check timed out: ${method}`));},45000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
  await send("Page.navigate",{url:pathToFileURL(html).href});
  const response=await send("Runtime.evaluate",{expression:`new Promise(resolve=>{const poll=()=>{const value=document.getElementById('results')?.textContent;if(value&&value!=='pending')resolve(value);else setTimeout(poll,50)};poll()})`,awaitPromise:true,returnByValue:true,timeout:40000});
  assert.ok(!response.exceptionDetails,JSON.stringify(response.exceptionDetails));
  resultText=response.result.value;
  await writeFile(path.join(artifacts,"result.html"),resultText);
  await send("Browser.close").catch(()=>undefined);
} finally {
  socket?.close();
  child.kill();
}
assert.ok(resultText,"Image browser fixture did not finish.");
const result = JSON.parse(resultText);
await writeFile(path.join(artifacts,"result.json"),JSON.stringify(result,null,2));
assert.deepEqual(result.failures,[],JSON.stringify(result));
console.log(`${result.checks.length} real browser image checks passed. Results: ${artifacts}`);
