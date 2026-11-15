import { imageBlobToDataUrl, imageDataUrlToBlob, prepareImageBlobForUpload, preprocessImageFile, releaseNormalizedImage } from "../../src/lib/imageCaptureService";

export const runImageRoundTripChecks = async (check: (value: unknown, message: string) => void) => {
  const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#32914a"; context.fillRect(0, 0, canvas.width, canvas.height);
  const source = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), "image/png"));
  canvas.width = canvas.height = 0;
  const normalized = await preprocessImageFile(source);
  const originalArrayRead = FileReader.prototype.readAsArrayBuffer;
  const originalDataRead = FileReader.prototype.readAsDataURL;
  const originalFetch = globalThis.fetch;
  const reads = { array: 0, dataUrl: 0, fetch: 0 };
  try {
    FileReader.prototype.readAsArrayBuffer = function(blob) { reads.array++; return originalArrayRead.call(this, blob); };
    FileReader.prototype.readAsDataURL = function(blob) { reads.dataUrl++; return originalDataRead.call(this, blob); };
    globalThis.fetch = (...args) => { reads.fetch++; return originalFetch(...args); };
    const recovered = await imageDataUrlToBlob(normalized.dataUrl);
    const prepared = await prepareImageBlobForUpload(recovered);
    const encoded = await imageBlobToDataUrl(prepared);
    check(encoded === normalized.dataUrl, "normalized save round trip preserves exact encoded bytes");
    check(reads.array === 0 && reads.dataUrl === 0 && reads.fetch === 0,
      `owned normalized save avoids repeated reads and encoding: ${JSON.stringify(reads)}`);
    check(recovered === normalized.blob && prepared === normalized.blob, "owned normalized save reuses the immutable original Blob");
  } finally {
    FileReader.prototype.readAsArrayBuffer = originalArrayRead;
    FileReader.prototype.readAsDataURL = originalDataRead;
    globalThis.fetch = originalFetch;
    releaseNormalizedImage(normalized);
  }
  check(await imageDataUrlToBlob(normalized.dataUrl) !== normalized.blob, "disposed selection cannot reuse a stale Blob reference");
  const owned = await preprocessImageFile(source);
  const clone = new Blob([owned.blob], { type: "image/jpeg" });
  let cloneReads = 0;
  try {
    FileReader.prototype.readAsArrayBuffer = function(blob) { cloneReads++; return originalArrayRead.call(this, blob); };
    check(await prepareImageBlobForUpload(clone) === clone && cloneReads > 0, "equal bytes from an unknown Blob still receive header/privacy validation");
  } finally { FileReader.prototype.readAsArrayBuffer = originalArrayRead; }
  const now = Date.now;
  try {
    Date.now = () => now() + 120_001;
    check(await imageDataUrlToBlob(owned.dataUrl) !== owned.blob, "expired reverse lookup falls back to byte decoding");
  } finally { Date.now = now; releaseNormalizedImage(owned); }
  const weakRef = Object.getOwnPropertyDescriptor(globalThis, "WeakRef")!;
  try {
    Object.defineProperty(globalThis, "WeakRef", { value: undefined, configurable: true, writable: true });
    const legacy = await preprocessImageFile(source);
    check(await imageDataUrlToBlob(legacy.dataUrl) !== legacy.blob, "older runtimes without WeakRef keep the safe decoding fallback");
    releaseNormalizedImage(legacy);
  } finally { Object.defineProperty(globalThis, "WeakRef", weakRef); }
  const samples: Array<{ cachedMs: number; fallbackMs: number }> = [];
  for (let i = 0; i < 10; i++) {
    const image = await preprocessImageFile(source);
    const start = performance.now();
    await imageBlobToDataUrl(await prepareImageBlobForUpload(await imageDataUrlToBlob(image.dataUrl)));
    const cachedMs = performance.now() - start;
    releaseNormalizedImage(image);
    const fallbackStart = performance.now();
    await imageBlobToDataUrl(await prepareImageBlobForUpload(await imageDataUrlToBlob(image.dataUrl)));
    samples.push({ cachedMs, fallbackMs: performance.now() - fallbackStart });
  }
  (globalThis as typeof globalThis & { __imageRoundTripTiming?: unknown }).__imageRoundTripTiming = { source: "640x480 generated PNG", samples, note: "Current cached path versus current uncached fallback; local timings, no inference or fidelity change" };
};
