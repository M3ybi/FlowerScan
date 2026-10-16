import { ImageUploadError } from "./imageUploadErrors.js";
import { imageUploadConfig } from "./imageUploadConfig.js";

let queue = Promise.resolve();
export const decodeHeicPixels = async (bytes: Uint8Array, signal?: AbortSignal): Promise<ImageData> => {
  const previous = queue;
  let release!: () => void;
  queue = new Promise<void>(resolve => { release = resolve; });
  try {
    await previous;
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    return await new Promise<ImageData>((resolve, reject) => {
      const worker = new Worker(new URL("./heicDecode.worker.ts", import.meta.url), { type: "module" });
      let settled = false;
      const finish = (error?: unknown, pixels?: ImageData) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        worker.terminate();
        if (error) reject(error); else resolve(pixels!);
      };
      const abort = () => finish(new DOMException("Cancelled", "AbortError"));
      const timer = setTimeout(() => finish(new ImageUploadError("IMAGE_DECODE_FAILED")), 60_000);
      signal?.addEventListener("abort", abort, { once: true });
      worker.onerror = () => finish(new ImageUploadError("IMAGE_DECODE_FAILED"));
      worker.onmessage = ({ data }: MessageEvent<{ code?: string; width: number; height: number; data: Uint8ClampedArray }>) => {
        if (data.code) { finish(new ImageUploadError(data.code === "IMAGE_DECODE_LIMIT" ? "IMAGE_DECODE_LIMIT" : "IMAGE_DECODE_FAILED")); return; }
        if (!Number.isSafeInteger(data.width * data.height) || data.width <= 0 || data.height <= 0
          || data.width * data.height > imageUploadConfig.maxSoftwareDecodePixels || data.data?.length !== data.width * data.height * 4) {
          finish(new ImageUploadError("IMAGE_DECODE_FAILED")); return;
        }
        try { finish(undefined, new ImageData(data.data as Uint8ClampedArray<ArrayBuffer>, data.width, data.height)); }
        catch { finish(new ImageUploadError("IMAGE_DECODE_FAILED")); }
      };
      try {
        const copy = bytes.slice().buffer;
        worker.postMessage({ bytes: copy }, [copy]);
      } catch { finish(new ImageUploadError("IMAGE_DECODE_FAILED")); }
    });
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    throw error instanceof ImageUploadError ? error : new ImageUploadError("IMAGE_DECODE_FAILED", 400, error);
  } finally { release(); }
};
