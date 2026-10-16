import { preprocessImageFile, prepareImageBlobForUpload, captureImage } from "../../src/lib/imageCaptureService";
import { Capacitor } from "@capacitor/core";
import { imageUploadConfig, jpegDimensions } from "../../src/lib/imageUploadConfig";

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
  const paddedPng = new Blob([png,new Uint8Array(Math.floor(14.9 * 1024 * 1024) - png.size)], { type: "image/png" });
  const converted = await preprocessImageFile(paddedPng);
  assert((await inspect(converted.blob)).width === 40, "14.9 MiB PNG decodes and converts");
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
    [new Blob([landscape], { type: "image/png" }), "UNSUPPORTED_IMAGE_FORMAT"],
    [new Blob([new Uint8Array([255,216,255,0,0])], { type: "image/jpeg" }), "INVALID_IMAGE"],
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
  } finally { Object.defineProperty(globalThis,"createImageBitmap",{value:createBitmap,configurable:true,writable:true}); }
};
void run().then(() => {
  document.getElementById("results")!.textContent = JSON.stringify({ checks, failures: [] });
}).catch((error) => {
  document.getElementById("results")!.textContent = JSON.stringify({ checks, failures: [String(error)] });
});
