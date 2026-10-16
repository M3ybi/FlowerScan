import { runImageSelectionChecks, renderImagePickerPreview } from "./image-selection-browser";
import { preprocessImageFile, prepareImageBlobForUpload, captureImage } from "../../src/lib/imageCaptureService";
import { Capacitor } from "@capacitor/core";
import { callBackendFunction } from "../../src/lib/backendConfig";
import { imageUploadConfig, jpegDimensions, validateProcessedImageDataUrl } from "../../src/lib/imageUploadConfig";

const checks: string[] = [];
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); checks.push(message); };
const encode = (canvas: HTMLCanvasElement, type: string) => new Promise<Blob>((resolve, reject) =>
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Fixture encode failed")), type, 0.95));
const canvas = (width: number, height: number) => {
  const value = document.createElement("canvas"); value.width = width; value.height = height;
  const context = value.getContext("2d")!;
  context.fillStyle = "#f00"; context.fillRect(0,0,width/2,height);
  context.fillStyle = "#00f"; context.fillRect(width/2,0,width/2,height);
  return value;
};
const inspect = async (blob: Blob) => jpegDimensions(new Uint8Array(await blob.arrayBuffer()))!;

const run = async () => {
  const timeout = AbortSignal.timeout;
  const originalFetch = globalThis.fetch;
  try {
    Object.defineProperty(AbortSignal,"timeout",{value:undefined,configurable:true,writable:true});
    globalThis.fetch = async (_input, init) => {
      assert(init?.signal instanceof AbortSignal, "image validation retains request cancellation on older browsers");
      return Response.json({ reachedServer: true });
    };
    const result = await callBackendFunction<{reachedServer:boolean}>({ functionName:"validate-plant-image", netlifyPath:"/fixture-image-validation", body:{} });
    assert(result.reachedServer, "image validation reaches the server without AbortSignal.timeout");
  } finally {
    Object.defineProperty(AbortSignal,"timeout",{value:timeout,configurable:true,writable:true});
    globalThis.fetch = originalFetch;
  }
  const small = canvas(40,20);
  const getPlatform = Capacitor.getPlatform;
  try {
    Capacitor.getPlatform = () => "android";
    const imported = await captureImage({ source: "gallery", file: new File([await encode(small,"image/png")],"gallery.png",{type:"image/png"}) });
    assert(imported.runtime === "android" && imported.mimeType === "image/jpeg", "Android file-input gallery selection processes its file without reopening the picker");
    URL.revokeObjectURL(imported.previewUrl);
  } finally { Capacitor.getPlatform = getPlatform; }
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
    const original = await encode(small, type);
    let yielded = false;
    setTimeout(() => { yielded = true; }, 0);
    const image = await preprocessImageFile(original);
    try {
      const dimensions = await inspect(image.blob);
      assert(image.blob.type === "image/jpeg" && dimensions.width === 40 && dimensions.height === 20, `${type} converts to JPEG without upscaling`);
      assert(image.blob.size <= imageUploadConfig.maxProcessedBytes, `${type} output fits 2 MiB`);
      assert(!("code" in validateProcessedImageDataUrl(image.dataUrl)),`${type} normalized output passes the exact server JPEG validator`);
      assert(yielded, `${type} processing yields to the browser`);
      assert(await prepareImageBlobForUpload(image.blob) === image.blob, `${type} optimized output avoids another lossy encode`);
    } finally { URL.revokeObjectURL(image.previewUrl); }
  }
  const large = await encode(canvas(3200,2000), "image/jpeg");
  const paddedJpeg = new Blob([large, new Uint8Array(8 * 1024 * 1024 - large.size)], { type: "image/jpeg" });
  const image = await preprocessImageFile(paddedJpeg);
  try {
    const dimensions = await inspect(image.blob);
    assert(dimensions.width === 1600 && dimensions.height === 1000, "8 MiB JPEG resizes to 1600 px and preserves aspect ratio");
    assert(image.sizeBytes < imageUploadConfig.preferredProcessedBytes, "ordinary photo reaches preferred size under 1 MiB");
  } finally { URL.revokeObjectURL(image.previewUrl); }
  const png = await encode(small,"image/png");
  for(const method of ["stream-error","empty-stream"] as const){
    const selected=new File([png],"provider.png",{type:"image/png"});
    if(method==="empty-stream")Object.defineProperty(selected,"size",{value:0});
    Object.defineProperty(selected,"stream",{value:()=>{
      if(method==="stream-error")throw new TypeError("Stream unavailable");
      return new ReadableStream<Uint8Array>({start(controller){controller.close();}});
    }});
    const recovered=await preprocessImageFile(selected);
    assert(recovered.mimeType==="image/jpeg"&&!("code" in validateProcessedImageDataUrl(recovered.dataUrl)),
      `${method} recovers once through bounded FileReader and still passes server validation`);
    URL.revokeObjectURL(recovered.previewUrl);
  }
  const mismatched=await preprocessImageFile(new Blob([png],{type:"image/heic"}));
  assert(mismatched.mimeType==="image/jpeg","a browser-converted PNG with stale HEIC metadata is decoded using its real bytes");
  URL.revokeObjectURL(mismatched.previewUrl);
  const providerFile=new File([png],"provider.png",{type:"image/png"});
  const readAsArrayBuffer=FileReader.prototype.readAsArrayBuffer;
  let metadataReads=0;
  Object.defineProperty(providerFile,"size",{get(){metadataReads++;return png.size;}});
  Object.defineProperty(providerFile,"stream",{value(){
    if(metadataReads)throw new DOMException("Provider snapshot changed after metadata access","NotReadableError");
    return Blob.prototype.stream.call(providerFile);
  }});
  try {
    FileReader.prototype.readAsArrayBuffer=function(blob){
      if(blob===providerFile&&metadataReads)throw new DOMException("Provider snapshot changed after metadata access","NotReadableError");
      return readAsArrayBuffer.call(this,blob);
    };
    const fromProvider=await preprocessImageFile(providerFile);
    assert(metadataReads===0&&fromProvider.mimeType==="image/jpeg","provider-backed File is read without touching snapshot size metadata first");
    URL.revokeObjectURL(fromProvider.previewUrl);
  } finally {FileReader.prototype.readAsArrayBuffer=readAsArrayBuffer;}
  let pulled=0, cancelled=0;
  const tooLargeProvider=new File([],"large-provider.jpg",{type:"image/jpeg"});
  Object.defineProperty(tooLargeProvider,"stream",{value:()=>new ReadableStream<Uint8Array>({
    pull(controller){pulled++;controller.enqueue(new Uint8Array(8*1024*1024));},
    cancel(){cancelled++;},
  },{highWaterMark:0})});
  let oversizedStream=false;
  try {await preprocessImageFile(tooLargeProvider);}catch(error){oversizedStream=(error as {code?:string}).code==="ORIGINAL_IMAGE_TOO_LARGE";}
  assert(oversizedStream&&pulled===2&&cancelled===1,"provider stream stops and cancels at the actual 15 MiB boundary without buffering the rest");
  const pendingProvider=new File([],"pending-provider.jpg",{type:"image/jpeg"});
  let streamStarted=false,streamCancelled=false;
  Object.defineProperty(pendingProvider,"stream",{value:()=>{
    streamStarted=true;
    return new ReadableStream<Uint8Array>({cancel(){streamCancelled=true;}},{highWaterMark:0});
  }});
  const controller=new AbortController();
  const pendingRead=preprocessImageFile(pendingProvider,{signal:controller.signal}).catch(error=>error);
  assert(streamStarted,"provider streaming begins synchronously during the selection operation");
  controller.abort();
  assert((await pendingRead).name==="AbortError"&&streamCancelled,"closing cancels an in-flight provider stream and releases its reader");
  const fileStream=File.prototype.stream;
  try {
    Object.defineProperty(File.prototype,"stream",{configurable:true,writable:true,value:undefined});
    const oldBrowser=await preprocessImageFile(new File([png],"legacy-provider.png",{type:"image/png"}));
    assert(oldBrowser.mimeType==="image/jpeg","browsers without Blob.stream retain the bounded FileReader compatibility path");
    URL.revokeObjectURL(oldBrowser.previewUrl);
  } finally {Object.defineProperty(File.prototype,"stream",{configurable:true,writable:true,value:fileStream});}
  const phoneCanvas=canvas(6000,4000);
  const phonePhoto=await encode(phoneCanvas,"image/jpeg");phoneCanvas.width=phoneCanvas.height=0;
  const phoneImage=await preprocessImageFile(phonePhoto);
  const phoneDimensions=await inspect(phoneImage.blob);
  assert(phoneDimensions.width===1600&&phoneDimensions.height===1067,"24 megapixel phone image decodes to bounded dimensions and preserves aspect ratio");
  URL.revokeObjectURL(phoneImage.previewUrl);
  const paddedPng = new File([png,new Uint8Array(15 * 1024 * 1024 - png.size)], "boundary.png", { type: "image/png" });
  const converted = await preprocessImageFile(paddedPng);
  assert((await inspect(converted.blob)).width === 40, "15 MiB PNG decodes and converts at the original-size boundary");
  URL.revokeObjectURL(converted.previewUrl);

  const landscape = new Uint8Array(await (await encode(small,"image/jpeg")).arrayBuffer());
  // Real EXIF Orientation=6 (90 degrees clockwise), in a little-endian TIFF IFD.
  const exif = new Uint8Array([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0]);
  const portrait = new Blob([landscape.slice(0,2),exif,landscape.slice(2)],{type:"image/jpeg"});
  const oriented = await preprocessImageFile(portrait);
  try {
    const dimensions = await inspect(oriented.blob);
    assert(dimensions.width === 20 && dimensions.height === 40, "EXIF portrait orientation changes output geometry correctly");
    assert(!dimensions.hasPrivateMetadata, "encoded output removes EXIF and private metadata");
    const bitmap = await createImageBitmap(oriented.blob);
    const sample = document.createElement("canvas"); sample.width=20; sample.height=40;
    const context = sample.getContext("2d")!; context.drawImage(bitmap,0,0); bitmap.close();
    const top = context.getImageData(10,5,1,1).data;
    const bottom = context.getImageData(10,35,1,1).data;
    assert(top[0] > 180 && top[2] < 80 && bottom[2] > 180 && bottom[0] < 80, "portrait pixels rotate clockwise, not only dimensions");
  } finally { URL.revokeObjectURL(oriented.previewUrl); }

  for (const [blob, code] of [
    [new Blob([new Uint8Array([37,80,68,70])], { type: "image/png" }), "UNSUPPORTED_IMAGE_FORMAT"],
    [new Blob([new Uint8Array([255,216,255,0,0])], { type: "image/jpeg" }), "IMAGE_DECODE_FAILED"],
    [new Blob([new Uint8Array(15*1024*1024+1)], { type: "image/jpeg" }), "ORIGINAL_IMAGE_TOO_LARGE"],
  ] as const) {
    let rejected = false;
    try { await preprocessImageFile(blob); } catch(error) { rejected = (error as { code?: string }).code === code; }
    assert(rejected, `${code} rejects the original safely`);
  }
  // Exercise HTMLImageElement fallback used when ImageBitmap is unavailable.
  const createBitmap = globalThis.createImageBitmap;
  try {
    Object.defineProperty(globalThis,"createImageBitmap",{value:undefined,configurable:true,writable:true});
    const fallback = await preprocessImageFile(portrait);
    assert((await inspect(fallback.blob)).height === 40, "HTML image fallback preserves portrait orientation");
    URL.revokeObjectURL(fallback.previewUrl);
    const width=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,"width")!;
    try {
      Object.defineProperty(HTMLImageElement.prototype,"width",{configurable:true,get:()=>0});
      const intrinsic=await preprocessImageFile(portrait);
      assert((await inspect(intrinsic.blob)).height===40,"HTML decoder uses natural pixel dimensions even when rendered width is zero");
      URL.revokeObjectURL(intrinsic.previewUrl);
    } finally {Object.defineProperty(HTMLImageElement.prototype,"width",width);}
  } finally { Object.defineProperty(globalThis,"createImageBitmap",{value:createBitmap,configurable:true,writable:true}); }
  try {
    Object.defineProperty(globalThis,"createImageBitmap",{value:async () => { throw new DOMException("Decoder unavailable", "NotSupportedError"); },configurable:true,writable:true});
    const fallback = await preprocessImageFile(portrait);
    assert((await inspect(fallback.blob)).height === 40, "HTML decoder recovers when ImageBitmap exists but rejects the photo");
    URL.revokeObjectURL(fallback.previewUrl);
  } finally { Object.defineProperty(globalThis,"createImageBitmap",{value:createBitmap,configurable:true,writable:true}); }
  const optimizedJpeg = await encode(canvas(30,20), "image/jpeg");
  const unchanged = await preprocessImageFile(optimizedJpeg);
  assert(!("code" in validateProcessedImageDataUrl(unchanged.dataUrl))&&(await inspect(unchanged.blob)).width===30,
    "small JPEG originals are decoded and normalized before reaching the server");
  URL.revokeObjectURL(unchanged.previewUrl);
  const originalJpeg=new Uint8Array(await optimizedJpeg.arrayBuffer());
  const comment=new Uint8Array([255,254,0,6,116,101,115,116]);
  const withLateComment=new Blob([originalJpeg.slice(0,-2),comment,originalJpeg.slice(-2)],{type:"image/jpeg"});
  const normalizedComment=await preprocessImageFile(withLateComment);
  const normalizedBytes=new Uint8Array(await normalizedComment.blob.arrayBuffer());
  assert(!normalizedBytes.some((byte,index)=>byte===255&&normalizedBytes[index+1]===254),"small originals cannot bypass normalization with metadata after the first scan");
  URL.revokeObjectURL(normalizedComment.previewUrl);
  const toBlob = HTMLCanvasElement.prototype.toBlob;
  try {
    HTMLCanvasElement.prototype.toBlob = (callback) => callback(null);
    let compressionFailed = false;
    try { await preprocessImageFile(png); } catch(error) { compressionFailed=(error as {code?:string}).code==="IMAGE_COMPRESSION_FAILED"; }
    assert(compressionFailed,"canvas allocation/encoding failure has a specific compression error");
  } finally { HTMLCanvasElement.prototype.toBlob=toBlob; }
  const afterFailure=await preprocessImageFile(png);
  assert(afterFailure.mimeType==="image/jpeg","processing recovers after a failed canvas encode");URL.revokeObjectURL(afterFailure.previewUrl);
  try {
    HTMLCanvasElement.prototype.toBlob=function(callback,type,quality){
      toBlob.call(this,blob=>{
        if(!blob){callback(null);return;}
        void blob.arrayBuffer().then(buffer=>{
          const bytes=new Uint8Array(buffer);
          callback(new Blob([bytes.slice(0,2),exif,bytes.slice(2)],{type:"image/jpeg"}));
        });
      },type,quality);
    };
    const canonical=await preprocessImageFile(png);
    assert(!("code" in validateProcessedImageDataUrl(canonical.dataUrl)),"fresh encoder output containing APP1 metadata is sanitized before the exact server validator");
    assert(!(await inspect(canonical.blob)).hasPrivateMetadata,"normalization removes encoder metadata instead of weakening server privacy checks");
    URL.revokeObjectURL(canonical.previewUrl);
  } finally {HTMLCanvasElement.prototype.toBlob=toBlob;}
  let realHeic:Blob|undefined;
  for(const [name,type] of [["iphone-13-pro.heic","image/heic"],["sample.heif","image/heif"],["iphone-export.jpg","image/jpeg"]] as const){
    const response=await fetch(`/images/${name}`);assert(response.ok,`${name} representative codec fixture is available`);
    const bytes=await response.arrayBuffer();
    const file=new File([bytes],name,{type});
    if(type==="image/heic")realHeic=file;
    const fromReader=await new Promise<ArrayBuffer>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result as ArrayBuffer);reader.onerror=()=>reject(reader.error);reader.readAsArrayBuffer(file);});
    const fromArray=await file.arrayBuffer();
    const fromStream=await new Response(file.stream()).arrayBuffer();
    const digest=async(buffer:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",buffer))).join();
    assert(await digest(fromReader)===await digest(fromArray)&&await digest(fromArray)===await digest(fromStream),`${name} FileReader, arrayBuffer and stream return identical real bytes`);
    const normalized=await preprocessImageFile(file);
    const dimensions=await inspect(normalized.blob);
    assert(Math.max(dimensions.width,dimensions.height)<=1600&&normalized.sizeBytes<=imageUploadConfig.maxProcessedBytes,
      `${name} decodes real pixels, preserves bounded output and converts to JPEG`);
    assert(!("code" in validateProcessedImageDataUrl(normalized.dataUrl)),`${name} output passes the exact server JPEG contract`);
    if(name==="iphone-13-pro.heic")assert(dimensions.height===1600&&dimensions.width===1200,"real portrait iPhone HEIC keeps container orientation and aspect ratio");
    URL.revokeObjectURL(normalized.previewUrl);
  }
  const heic = new Blob([new Uint8Array([0,0,0,20,102,116,121,112,104,101,105,99,0,0,0,0,109,105,102,49])],{type:"image/heic"});
  let unsupportedDeviceFormat=false;
    try { await preprocessImageFile(heic); } catch(error) { unsupportedDeviceFormat=(error as {code?:string}).code==="IMAGE_DECODE_FAILED"; }
  assert(unsupportedDeviceFormat,"a corrupted HEIC fails real decoding instead of being renamed JPEG");
  const arrayBuffer=Blob.prototype.arrayBuffer;
  try {
    Object.defineProperty(Blob.prototype,"arrayBuffer",{value:undefined,configurable:true,writable:true});
    const compatible=await preprocessImageFile(png);
    assert((await prepareImageBlobForUpload(compatible.blob))===compatible.blob,"FileReader pipeline works without Blob.arrayBuffer on older mobile browsers");
    URL.revokeObjectURL(compatible.previewUrl);
  } finally {Object.defineProperty(Blob.prototype,"arrayBuffer",{value:arrayBuffer,configurable:true,writable:true});}
  const OriginalWorker=globalThis.Worker;
  let workerStarted:(()=>void)|undefined,terminated=0;
  const started=new Promise<void>(resolve=>{workerStarted=resolve;});
  try {
    globalThis.Worker=class extends OriginalWorker {
      constructor(url:URL|string,options?:WorkerOptions){super(url,options);workerStarted!();}
      terminate(){terminated++;super.terminate();}
    };
    const cancel=new AbortController();
    const decoding=preprocessImageFile(realHeic!,{signal:cancel.signal}).catch(error=>error);
    await started;cancel.abort();
    assert((await decoding).name==="AbortError"&&terminated===1,"cancelling a real HEIC decode terminates its worker and returns an abort instead of stale pixels");
  } finally {globalThis.Worker=OriginalWorker;}
  await runImageSelectionChecks(assert, portrait, realHeic!);
  renderImagePickerPreview(assert);

};
void run().then(() => {
  document.getElementById("results")!.textContent = JSON.stringify({ checks, failures: [] });
}).catch((error) => {
  document.getElementById("results")!.textContent = JSON.stringify({ checks, failures: [String(error)] });
});
