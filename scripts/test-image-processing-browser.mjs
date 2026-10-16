import assert from "node:assert/strict";
import { access, mkdir, writeFile, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { build } from "esbuild";
import { chromium, webkit } from "playwright";

const engine = process.argv.includes("--webkit") ? "webkit" : "chromium";
const artifacts = path.resolve(`.tmp-tests/image-processing-${engine}`);
await mkdir(artifacts, { recursive: true });
await build({entryPoints:["src/lib/heicDecode.worker.ts"],outfile:path.join(artifacts,"heic-worker.js"),bundle:true,platform:"browser",format:"iife",logLevel:"warning"});
await build({entryPoints:["tests/fixtures/image-processing-browser.ts"],outfile:path.join(artifacts,"fixture.js"),bundle:true,platform:"browser",format:"iife",jsx:"automatic",define:{"import.meta.env":JSON.stringify({DEV:true,VITE_BACKEND_PROVIDER:"netlify"})},plugins:[{
  name:"native-camera-test-boundary", setup(builder) {
    builder.onResolve({filter:/^@capacitor\/camera$/},()=>({path:"native-camera",namespace:"fixture"}));
    builder.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:`export const CameraResultType={Uri:"uri"}; export const CameraSource={Camera:"CAMERA",Photos:"PHOTOS",Prompt:"PROMPT"}; export const Camera={getPhoto:options=>globalThis.__imageNativeBoundary(options)};`}));
  },
},{
  name:"bundled-codec-worker",setup(builder){
    builder.onLoad({filter:/heicDecoder\.ts$/},async args=>({contents:(await readFile(args.path,"utf8")).replace('new URL("./heicDecode.worker.ts", import.meta.url)','new URL("/heic-worker.js", location.origin)'),loader:"ts"}));
  },
}],logLevel:"warning"});
await writeFile(path.join(artifacts,"fixture.html"),`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><pre id="results" hidden>pending</pre><script src="/fixture.js"></script></body></html>`);
const server=createServer(async(request,response)=>{
  const url=new URL(request.url,"http://localhost");
  const routes=new Map([["/",path.join(artifacts,"fixture.html")],["/fixture.js",path.join(artifacts,"fixture.js")],["/heic-worker.js",path.join(artifacts,"heic-worker.js")],["/styles.css",path.resolve("src/styles.css")],
    ...["iphone-13-pro.heic","iphone-export.jpg","sample.heif"].map(name=>[`/images/${name}`,path.resolve("tests/fixtures/images",name)])]);
  const file=routes.get(url.pathname);
  if(!file){response.writeHead(404).end();return;}
  try{response.setHeader("Content-Type",file.endsWith(".js")?"text/javascript":file.endsWith(".css")?"text/css":"text/html");response.end(await readFile(file));}
  catch{response.writeHead(500).end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
let browser;
try{
  let executablePath;
  if(engine==="chromium"){
    const candidates=process.env.PLANTIE_TEST_BROWSER?[process.env.PLANTIE_TEST_BROWSER]:["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe","C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"];
    for(const candidate of candidates){try{await access(candidate);executablePath=candidate;break;}catch{}}
  }
  browser=await (engine==="webkit"?webkit:chromium).launch({headless:true,...(executablePath?{executablePath}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(()=>document.getElementById("results")?.textContent!=="pending",{},{timeout:90000});
  const result=JSON.parse(await page.locator("#results").textContent());
  await writeFile(path.join(artifacts,"result.json"),JSON.stringify(result,null,2));
  await page.screenshot({path:path.join(artifacts,"picker-mobile.png")});
  assert.deepEqual(result.failures,[],JSON.stringify(result));
  console.log(`${result.checks.length} real ${engine} image checks passed. Results: ${artifacts}`);
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
