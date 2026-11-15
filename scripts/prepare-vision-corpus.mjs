import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";
import { visionVariants, estimateGpt4oImageTokens } from "./lib/visionBenchmark.mjs";

// Public catalog photos only. These fixtures have no expert diagnostic labels.
const output = path.resolve(process.env.PLANTIE_VISION_CORPUS_DIR ?? ".tmp-tests/vision-corpus");
await mkdir(output, { recursive: true });
const sources = [
  { key: "portrait", file: "WhatsApp Image 2026-05-16 at 16.38.38.jpeg", transform: "none" },
  { key: "landscape", file: "WhatsApp Image 2026-05-16 at 16.35.44.jpeg", transform: "none" },
  { key: "square", file: "WhatsApp Image 2026-05-16 at 16.38.28.jpeg", transform: "square" },
  { key: "extreme", file: "WhatsApp Image 2026-05-16 at 16.38.38.jpeg", transform: "extreme" },
  { key: "qr_mixed", file: "WhatsApp Image 2026-05-16 at 16.38.38.jpeg", transform: "qr" },
];
const script = await build({ stdin: { resolveDir: process.cwd(), loader: "ts", contents: `
import {preprocessImageFile,releaseNormalizedImage} from './src/lib/imageCaptureService.ts';
import QRCode from 'qrcode';
globalThis.prepare=async(spec,variants)=>{
 const raw=await(await fetch('/photo/'+spec.key)).blob(); const bitmap=await createImageBitmap(raw);
 const original={width:bitmap.width,height:bitmap.height}; let source=raw;
 if(spec.transform!=='none'){
  const canvas=document.createElement('canvas');
  canvas.width=spec.transform==='square'?Math.min(bitmap.width,bitmap.height):bitmap.width;
  canvas.height=spec.transform==='square'?canvas.width:spec.transform==='extreme'?Math.floor(bitmap.width/8):bitmap.height;
  const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,(bitmap.width-canvas.width)/2,(bitmap.height-canvas.height)/2,canvas.width,canvas.height,0,0,canvas.width,canvas.height);
  if(spec.transform==='qr'){const qr=document.createElement('canvas');await QRCode.toCanvas(qr,'https://example.invalid/synthetic-vision-test',{width:240,margin:4});ctx.drawImage(qr,20,20);}
  source=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));canvas.width=canvas.height=0;
 }
 bitmap.close();const decoded=await createImageBitmap(source); const sourceDimensions={width:decoded.width,height:decoded.height};decoded.close();
 const results=[];for(const profile of variants){const started=performance.now();const image=await preprocessImageFile(source,{maxDimension:profile.maxDimension});const b=await createImageBitmap(image.blob);
  results.push({profile:profile.id,detail:profile.detail,width:b.width,height:b.height,bytes:image.blob.size,dataUrl:image.dataUrl,preprocessingMs:performance.now()-started});b.close();releaseNormalizedImage(image);}
 return {original,sourceDimensions,results};
};` }, bundle: true, write: false, platform: "browser", format: "iife", define: { "import.meta.env": "{}" }, logLevel: "silent" });
const photos = new Map(await Promise.all(sources.map(async s => [s.key, await readFile(path.join("FlowersImg", s.file))])));
const server = createServer((req,res) => {
  if (req.url.startsWith("/photo/")) { res.setHeader("Content-Type","image/jpeg");res.end(photos.get(req.url.slice(7))); }
  else if (req.url === "/script") { res.setHeader("Content-Type","text/javascript");res.end(script.outputFiles[0].text); }
  else { res.setHeader("Content-Type","text/html");res.end('<script src="/script"></script>'); }
});
await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
let browser;
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
try {
  browser=await chromium.launch({headless:true,...(process.env.PLANTIE_TEST_BROWSER?{executablePath:process.env.PLANTIE_TEST_BROWSER}:process.platform==="win32"?{executablePath:"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"}:{})});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const manifest=[];
  for(const spec of sources){
    const value=await page.evaluate(async({spec,variants})=>globalThis.prepare(spec,variants),{spec,variants:visionVariants});
    for(const sample of value.results){
      if(spec.key==="qr_mixed" && !["baseline_1600_high","e_original_low"].includes(sample.profile))continue;
      const {dataUrl,...metadata}=sample;const bytes=Buffer.from(dataUrl.split(",")[1],"base64");const key=`${spec.key}_${sample.profile}`;
      await writeFile(path.join(output,`${key}.jpg`),bytes);
      manifest.push({key,source:spec.key,publicRepositoryFile:`FlowersImg/${spec.file}`,transform:spec.transform,original:value.original,sourceDimensions:value.sourceDimensions,
        sourceSha256:sha(photos.get(spec.key)),...metadata,sha256:sha(bytes),...estimateGpt4oImageTokens(sample.width,sample.height,sample.detail),
        purpose:spec.key==="qr_mixed"?"safety":"probe",diagnosticGroundTruth:"NOT VERIFIED"});
    }
  }
  await writeFile(path.join(output,"manifest.json"),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify({fixtures:manifest.length,output,quality:"NOT VERIFIED",privateCustomerImagesUsed:false}));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
