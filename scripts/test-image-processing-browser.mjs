import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const artifacts = path.resolve(".tmp-tests/image-processing-browser");
await mkdir(artifacts,{recursive:true});
const candidates = process.env.PLANTIE_TEST_BROWSER ? [process.env.PLANTIE_TEST_BROWSER] :
  ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"];
let browser;
for (const candidate of candidates) { try { await access(candidate); browser=candidate; break; } catch { /* Try the next installed browser. */ } }
assert.ok(browser,"Set PLANTIE_TEST_BROWSER to an installed Chromium browser.");
await build({entryPoints:["tests/fixtures/image-processing-browser.ts"],outfile:path.join(artifacts,"fixture.js"),bundle:true,platform:"browser",format:"iife",logLevel:"warning"});
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
