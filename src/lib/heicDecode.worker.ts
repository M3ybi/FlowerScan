/// <reference path="./libheif.d.ts" />
import createDecoder from "libheif-js/libheif-wasm/libheif-bundle.mjs";
import { imageUploadConfig } from "./imageUploadConfig.js";

// Third-party decoder diagnostics may contain metadata; keep them in the worker.
console.log = console.warn = console.error = () => undefined;
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<{ bytes: ArrayBuffer }>) => void;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
scope.onmessage = async ({ data }) => {
  try {
    const lib = await createDecoder({ print: () => undefined, printErr: () => undefined });
    const decoder = new lib.HeifDecoder();
    const handles = decoder.decode(new Uint8Array(data.bytes));
    try {
      const image = handles.find(value => value.is_primary()) ?? handles[0];
      if (!image) throw new Error("Decode failed");
      const width = image.get_width(), height = image.get_height();
      // Bound decoded allocation independently of the compressed 15 MiB limit.
      if (!Number.isSafeInteger(width * height) || width <= 0 || height <= 0 || width * height > imageUploadConfig.maxSoftwareDecodePixels) {
        scope.postMessage({ code: "IMAGE_DECODE_LIMIT" }); return;
      }
      const pixels = { width, height, data: new Uint8ClampedArray(width * height * 4) };
      await new Promise<void>((resolve, reject) => image.display(pixels, value => value ? resolve() : reject(new Error("Decode failed"))));
      scope.postMessage(pixels, [pixels.data.buffer]);
    } finally {
      handles.forEach(image => image.free());
      if (decoder.decoder) lib.heif_context_free(decoder.decoder);
    }
  } catch {
    scope.postMessage({ code: "IMAGE_DECODE_FAILED" });
  }
};
