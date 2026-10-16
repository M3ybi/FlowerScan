import { Capacitor } from "@capacitor/core";
import { detectImageMimeType, imageUploadConfig, jpegDimensions } from "./imageUploadConfig.js";
import { ImageUploadError, isImageSelectionCancelled, logImageProcessingFailure } from "./imageUploadErrors.js";
import { withRequestTimeout } from "./requestTimeout.js";
import { detectDeviceImageMimeType, stripEncodedJpegMetadata } from "./imageFormats.js";

export type ImageCaptureSource = "camera" | "gallery" | "prompt";
export type ImagePickerLabels = { camera: string; gallery: string; cancel: string };
export type ImageRuntime = "web" | "ios" | "android";

export type NormalizedImage = {
  blob: Blob;
  dataUrl: string;
  mimeType: "image/jpeg";
  name: string;
  previewUrl: string;
  runtime: ImageRuntime;
  sizeBytes: number;
  source: ImageCaptureSource;
};

export type ImageValidationInput = {
  size: number;
  type: string;
};

export type ImagePreprocessOptions = {
  signal?: AbortSignal;
  createPreviewUrl?: (blob: Blob) => string;
  dataUrlFromBlob?: (blob: Blob) => Promise<string>;
  maxInputBytes?: number;
  maxDimension?: number;
  outputQuality?: number;
  transformImage?: (file: Blob, maxDimension: number, outputQuality: number) => Promise<{ blob: Blob; dataUrl: string }>;
};

export type SignedUrlClient = {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (path: string, expiresIn: number) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
    };
  };
};

const allowedImageTypes = new Set<string>(imageUploadConfig.supportedInputMimeTypes);
export const defaultMaxImageBytes = imageUploadConfig.maxOriginalBytes;

export const detectImageRuntime = (platform = Capacitor.getPlatform()): ImageRuntime =>
  platform === "ios" || platform === "android" ? platform : "web";

export const shouldUseNativeCamera = (runtime: ImageRuntime) => runtime === "ios" || runtime === "android";

export const validateImageInput = (input: ImageValidationInput, maxBytes = defaultMaxImageBytes) => {
  if (!allowedImageTypes.has(input.type)) throw new ImageUploadError("UNSUPPORTED_IMAGE_FORMAT", 415);
  if (!Number.isFinite(input.size) || input.size <= 0) throw new ImageUploadError("INVALID_IMAGE");
  if (input.size > Math.min(maxBytes, defaultMaxImageBytes)) throw new ImageUploadError("ORIGINAL_IMAGE_TOO_LARGE", 413);
};

const checkCancelled = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException("Image selection cancelled", "AbortError");
};

const readBlob = (blob: Blob, kind: "bytes" | "dataUrl", signal?: AbortSignal, maxBytes = Infinity): Promise<ArrayBuffer | string> => {
  checkCancelled(signal);
  if (typeof FileReader === "undefined") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    const finish = (error?: unknown) => {
      signal?.removeEventListener("abort", abort);
      reader.onload = reader.onerror = reader.onabort = reader.onprogress = null;
      if (error) reject(error); else resolve(reader.result as ArrayBuffer | string);
    };
    reader.onerror = () => finish(reader.error ?? new Error("File read failed"));
    reader.onabort = () => finish(new DOMException("Image selection cancelled", "AbortError"));
    reader.onload = () => finish();
    reader.onprogress = event => {
      if (event.loaded > maxBytes) { finish(new ImageUploadError("ORIGINAL_IMAGE_TOO_LARGE", 413)); reader.abort(); }
    };
    signal?.addEventListener("abort", abort, { once: true });
    try { kind === "bytes" ? reader.readAsArrayBuffer(blob) : reader.readAsDataURL(blob); }
    catch (error) { finish(error); }
  });
};

const readImageBytes = async (blob: Blob, signal?: AbortSignal, stage = "file-read"): Promise<Uint8Array> => {
  for (let attempt = 0; ; attempt++) {
    try {
      const bytes = new Uint8Array(await readBlob(blob, "bytes", signal) as ArrayBuffer);
      checkCancelled(signal);
      if (bytes.length !== blob.size) throw new ImageUploadError("IMAGE_READ_FAILED");
      return bytes;
    } catch (error) {
      checkCancelled(signal);
      // A fresh reader can recover a transient Android gallery provider failure.
      if (attempt === 0 && error instanceof Error && ["NotReadableError", "InvalidStateError"].includes(error.name)) continue;
      const failure = new ImageUploadError("IMAGE_READ_FAILED", 400, error);
      failure.stage = stage;
      throw failure;
    }
  }
};

const readProviderFile = async (file: File, maxBytes: number, signal?: AbortSignal): Promise<Uint8Array> => {
  let receivedBytes = 0;
  try {
    // File.size/slice/lastModified can snapshot inconsistent Android provider
    // metadata (crbug.com/40123366). Stream first, bounding actual bytes instead.
    return await withRequestTimeout(async (requestSignal) => {
      const reader = file.stream().getReader();
      const abort = () => { void reader.cancel().catch(() => undefined); };
      requestSignal.addEventListener("abort", abort, { once: true });
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          checkCancelled(requestSignal);
          const { value, done } = await reader.read();
          checkCancelled(requestSignal);
          if (done) break;
          length += value.byteLength;
          receivedBytes = length;
          if (length > maxBytes) throw new ImageUploadError("ORIGINAL_IMAGE_TOO_LARGE", 413);
          chunks.push(value);
        }
        if (!length) throw new DOMException("Empty provider stream", "NotReadableError");
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        return bytes;
      } finally {
        requestSignal.removeEventListener("abort", abort);
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    }, 30_000, signal);
  } catch (error) {
    checkCancelled(signal);
    if (error instanceof ImageUploadError) throw error;
    // Retry once through an independent API only if the stream yielded no
    // bytes. Never accept partial bytes or retry cancelled/oversized reads.
    if (!receivedBytes && typeof FileReader !== "undefined" && !(error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name))) {
      if (file.size > maxBytes) throw new ImageUploadError("ORIGINAL_IMAGE_TOO_LARGE", 413);
      logImageProcessingFailure("file-stream-fallback", error, { runtime: detectImageRuntime(), inputMime: file.type, originalBytes: file.size });
      try {
        const bytes = new Uint8Array(await withRequestTimeout(requestSignal => readBlob(file, "bytes", requestSignal, maxBytes), 30_000, signal) as ArrayBuffer);
        validateImageInput({ size: bytes.byteLength, type: "image/jpeg" }, maxBytes);
        return bytes;
      } catch (fallbackError) {
        checkCancelled(signal);
        if (fallbackError instanceof ImageUploadError) throw fallbackError;
        throw new ImageUploadError("IMAGE_READ_FAILED", 400, fallbackError);
      }
    }
    throw new ImageUploadError("IMAGE_READ_FAILED", 400, error);
  }
};

const blobToDataUrl = async (blob: Blob, signal?: AbortSignal): Promise<string> => {
  try {
    const result = await readBlob(blob, "dataUrl", signal);
    checkCancelled(signal);
    if (typeof result !== "string" || !result.startsWith("data:image/jpeg;base64,")) throw new Error("Invalid encoded image");
    return result;
  } catch (error) {
    checkCancelled(signal);
    throw new ImageUploadError("IMAGE_READ_FAILED", 400, error);
  }
};

const dataUrlToBlob = async (dataUrl: string) => {
  const response = await fetch(dataUrl);
  return response.blob();
};

type ImageEncoder = { encode: (maxDimension: number, quality: number) => Promise<Blob>; dispose: () => void };

let nativePickerQueue = Promise.resolve();
// Native OS pickers cannot be dismissed through AbortSignal. Serialize them
// across modal lifetimes and discard cancelled requests before opening another.
const withNativePicker = async <T>(open: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
  const previous = nativePickerQueue;
  let release!: () => void;
  nativePickerQueue = new Promise<void>((resolve) => { release = resolve; });
  try {
    await previous;
    checkCancelled(signal);
    return await open();
  } finally { release(); }
};

const prepareImageEncoder = async (file: Blob, bytes: Uint8Array, maxDimension: number, signal?: AbortSignal, setStage?: (stage: string) => void): Promise<ImageEncoder> => {
  let source: ImageBitmap | HTMLImageElement | HTMLCanvasElement | undefined;
  let sourceUrl: string | null = null;
  try {
    if (typeof createImageBitmap === "function") {
      try {
        const jpeg = jpegDimensions(bytes);
        const png = file.type === "image/png" && bytes.length >= 24
          ? { width: new DataView(bytes.buffer, bytes.byteOffset).getUint32(16), height: new DataView(bytes.buffer, bytes.byteOffset).getUint32(20) } : null;
        // Resize during decoding where dimensions are known and orientation is
        // unambiguous. The canvas still enforces the final bound for all formats.
        const dimensions = jpeg && !jpeg.hasPrivateMetadata ? jpeg : png;
        const ratio = dimensions ? Math.min(1, maxDimension / Math.max(dimensions.width, dimensions.height)) : 1;
        source = await createImageBitmap(file, { imageOrientation: "from-image", ...(dimensions && ratio < 1 ? {
          resizeWidth: Math.max(1, Math.round(dimensions.width * ratio)),
          resizeHeight: Math.max(1, Math.round(dimensions.height * ratio)), resizeQuality: "high",
        } : {}) });
      } catch { /* Some mobile decoders reject images that HTMLImageElement supports. */ }
    }
    if (!source) {
      sourceUrl = URL.createObjectURL(file);
      const image = new Image();
      image.src = sourceUrl;
      source = image;
      await image.decode();
    }
    if (!("naturalWidth" in source ? source.naturalWidth && source.naturalHeight : source.width && source.height)) {
      throw new ImageUploadError("IMAGE_DECODE_FAILED");
    }
  } catch (error) {
    if (source) {
      if ("close" in source) source.close();
      else if ("src" in source) source.src = "";
    }
    source = undefined;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = null;
    checkCancelled(signal);
    if (!file.type.startsWith("image/hei")) throw new ImageUploadError("IMAGE_DECODE_FAILED", 400, error);
    setStage?.("heic-convert");
    const { decodeHeicPixels } = await import("./heicDecoder.js");
    const pixels = await decodeHeicPixels(bytes, signal);
    checkCancelled(signal);
    // The worker is terminated before allocating a main-thread rendering surface.
    // Only one full-resolution software decode is ever retained.
    const canvas = document.createElement("canvas");
    canvas.width = pixels.width; canvas.height = pixels.height;
    const context = canvas.getContext("2d");
    if (!context) { canvas.width = canvas.height = 0; throw new ImageUploadError("IMAGE_DECODE_FAILED"); }
    try { context.putImageData(pixels, 0, 0); }
    catch (error) { canvas.width = canvas.height = 0; throw new ImageUploadError("IMAGE_DECODE_FAILED", 400, error); }
    source = canvas;
  }
  const decodedSource = source;
  const decodedWidth = "naturalWidth" in decodedSource ? decodedSource.naturalWidth : decodedSource.width;
  const decodedHeight = "naturalHeight" in decodedSource ? decodedSource.naturalHeight : decodedSource.height;
  const dispose = () => {
    if ("close" in decodedSource) decodedSource.close();
    else if ("src" in decodedSource) decodedSource.src = "";
    else decodedSource.width = decodedSource.height = 0;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  };
  if (signal?.aborted) { dispose(); checkCancelled(signal); }
  if (!decodedWidth || !decodedHeight) { dispose(); throw new ImageUploadError("IMAGE_DECODE_FAILED"); }
  return {
    dispose,
    encode: async (maxDimension, quality) => {
      checkCancelled(signal);
      // The decoded source is retained across bounded attempts. Only the final
      // encoded JPEG is read as base64; canvas.toDataURL would encode it twice.
      const ratio = Math.min(1, maxDimension / Math.max(decodedWidth, decodedHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(decodedWidth * ratio));
      canvas.height = Math.max(1, Math.round(decodedHeight * ratio));
      try {
        const context = canvas.getContext("2d");
        if (!context) throw new ImageUploadError("IMAGE_COMPRESSION_FAILED");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(decodedSource, 0, 0, canvas.width, canvas.height);
        return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new ImageUploadError("IMAGE_COMPRESSION_FAILED")),
          imageUploadConfig.outputMimeType, quality,
        ));
      } finally {
        canvas.width = canvas.height = 0;
      }
    },
  };
};

const preprocessImageFileInternal = async (
  file: Blob & { name?: string },
  options: ImagePreprocessOptions,
  setStage: (stage: string, detectedMime?: string) => void,
): Promise<Pick<NormalizedImage, "blob" | "dataUrl" | "mimeType" | "name" | "previewUrl" | "sizeBytes">> => {
  checkCancelled(options.signal);
  const maxInputBytes = Math.min(options.maxInputBytes ?? defaultMaxImageBytes, defaultMaxImageBytes);
  if (!Number.isFinite(maxInputBytes) || maxInputBytes < 1) throw new ImageUploadError("INVALID_IMAGE");
  // Read the provider-backed File once. Decoders and fallback attempts use an
  // owned in-memory Blob, so a later gallery selection cannot invalidate it.
  setStage("file-read");
  const providerStream = typeof File !== "undefined" && file instanceof File && typeof file.stream === "function";
  // Older browsers retain the bounded FileReader path. Owned/native Blobs have
  // stable size metadata and do not need the provider-specific stream path.
  if (!providerStream) validateImageInput({ size: file.size, type: "image/jpeg" }, maxInputBytes);
  const bytes = providerStream ? await readProviderFile(file, maxInputBytes, options.signal) : await readImageBytes(file, options.signal);
  validateImageInput({ size: bytes.byteLength, type: "image/jpeg" }, maxInputBytes);
  setStage("format-check");
  const detectedType = detectImageMimeType(bytes) ?? detectDeviceImageMimeType(bytes);
  setStage("format-check", detectedType ?? "unknown");
  if (!detectedType || (!allowedImageTypes.has(detectedType) && !detectedType.startsWith("image/hei"))) throw new ImageUploadError("UNSUPPORTED_IMAGE_FORMAT", 415);
  setStage("snapshot-create", detectedType);
  const snapshot = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: detectedType });
  const maxDimension = Math.min(options.maxDimension ?? imageUploadConfig.maxDimension, imageUploadConfig.maxDimension);
  if (!Number.isFinite(maxDimension) || maxDimension < 1) throw new ImageUploadError("IMAGE_COMPRESSION_FAILED");
  setStage("image-decode");
  const encoder = options.transformImage ? null : await prepareImageEncoder(snapshot, bytes, maxDimension, options.signal, setStage);
  try {
    for (const attempt of imageUploadConfig.compressionAttempts) {
      setStage("jpeg-encode");
      checkCancelled(options.signal);
      const quality = Math.max(imageUploadConfig.minQuality,
        Math.min(options.outputQuality ?? imageUploadConfig.initialQuality, attempt.quality));
      if (!Number.isFinite(quality)) throw new ImageUploadError("IMAGE_COMPRESSION_FAILED");
      const dimension = Math.max(1, Math.round(maxDimension * attempt.scale));
      // Even small JPEG originals pass through decoded pixels. A valid header
      // alone does not make a provider export canonical encoder output.
      let blob = options.transformImage
        ? (await options.transformImage(snapshot, dimension, quality)).blob
        : await encoder!.encode(dimension, quality);
      if (blob.size > imageUploadConfig.maxProcessedBytes) continue;
      if (blob.type !== imageUploadConfig.outputMimeType || blob.size === 0) throw new ImageUploadError("IMAGE_COMPRESSION_FAILED");
      setStage("output-validate");
      const output = await readImageBytes(blob, options.signal, "output-validate");
      const canonical = stripEncodedJpegMetadata(output);
      const dimensions = jpegDimensions(canonical);
      if (!dimensions || dimensions.hasPrivateMetadata || Math.max(dimensions.width, dimensions.height) > maxDimension) throw new ImageUploadError("INVALID_IMAGE");
      if (canonical !== output) blob = new Blob([canonical as Uint8Array<ArrayBuffer>], { type: imageUploadConfig.outputMimeType });
      setStage("output-read");
      const dataUrl = await (options.dataUrlFromBlob ? options.dataUrlFromBlob(blob) : blobToDataUrl(blob, options.signal));
      checkCancelled(options.signal);
      setStage("preview-create");
      const previewUrl = (options.createPreviewUrl ?? ((value: Blob) => URL.createObjectURL(value)))(blob);
      return { blob, dataUrl, mimeType: imageUploadConfig.outputMimeType,
        name: (file.name?.replace(/\.[^.]+$/, "") || "plantie-image") + ".jpg", previewUrl, sizeBytes: blob.size };
    }
    throw new ImageUploadError("IMAGE_COMPRESSION_FAILED");
  } catch (error) {
    checkCancelled(options.signal);
    throw error instanceof ImageUploadError ? error : new ImageUploadError("IMAGE_COMPRESSION_FAILED", 400, error);
  } finally {
    encoder?.dispose();
  }
};

export const preprocessImageFile = async (file: Blob & { name?: string }, options: ImagePreprocessOptions = {}) => {
  let stage = "input-check";
  let detectedMime: string | undefined;
  try { return await preprocessImageFileInternal(file, options, (value, mime) => { stage = value; if (mime) detectedMime = mime; }); }
  catch (error) {
    checkCancelled(options.signal);
    if (isImageSelectionCancelled(error)) throw error;
    const failure = error instanceof ImageUploadError ? error
      : new ImageUploadError(stage === "heic-convert" || stage === "image-decode" ? "IMAGE_DECODE_FAILED" : "IMAGE_COMPRESSION_FAILED", 400, error);
    failure.stage = stage;
    failure.detectedMime = detectedMime;
    logImageProcessingFailure(stage, failure, { runtime: detectImageRuntime(), inputMime: file.type, originalBytes: file.size });
    throw failure;
  }
};

export const captureImage = async ({
  file,
  source,
  signal,
  pickerLabels,
}: {
  file?: File;
  source: ImageCaptureSource;
  signal?: AbortSignal;
  pickerLabels?: ImagePickerLabels;
}): Promise<NormalizedImage> => {
  const runtime = detectImageRuntime();
  checkCancelled(signal);

  if (shouldUseNativeCamera(runtime) && !file) {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera").catch((error: unknown) => {
      const failure = new ImageUploadError("IMAGE_SELECTION_FAILED", 400, error);
      failure.stage = "native-picker";
      throw failure;
    });
    let photo;
    try { photo = await withNativePicker(() => Camera.getPhoto({
      allowEditing: false,
      quality: 100,
      correctOrientation: true,
      resultType: CameraResultType.Uri,
      source: source === "camera" ? CameraSource.Camera : source === "gallery" ? CameraSource.Photos : CameraSource.Prompt,
      ...(pickerLabels ? { promptLabelPicture: pickerLabels.camera, promptLabelPhoto: pickerLabels.gallery, promptLabelCancel: pickerLabels.cancel, promptLabelHeader: "" } : {}),
    }), signal); } catch (error) {
      if (isImageSelectionCancelled(error)) throw new DOMException("Image selection cancelled", "AbortError");
      const failure = new ImageUploadError(/permission|denied/i.test(error instanceof Error ? error.message : "") ? "CAMERA_PERMISSION_DENIED" : "IMAGE_SELECTION_FAILED", 400, error);
      failure.stage = "native-picker";
      throw failure;
    }
    checkCancelled(signal);

    const blob = await withRequestTimeout(async (requestSignal) => {
      if (!photo.webPath) throw new ImageUploadError("IMAGE_READ_FAILED");
      const response = await fetch(photo.webPath, { signal: requestSignal });
      if (!response.ok) throw new ImageUploadError("IMAGE_READ_FAILED");
      return response.blob();
    }, 30_000, signal).catch((error: unknown) => {
      checkCancelled(signal);
      const failure = new ImageUploadError("IMAGE_READ_FAILED", 400, error);
      failure.stage = "native-read";
      logImageProcessingFailure("native-read", failure, { runtime });
      throw failure;
    });
    const processed = await preprocessImageFile(blob, { signal });
    return { ...processed, runtime, source };
  }

  if (!file) {
    throw new DOMException("No image selected", "AbortError");
  }

  const processed = await preprocessImageFile(file, { signal });
  return { ...processed, runtime, source };
};

export const prepareImageBlobForUpload = async (blob: Blob) => {
  validateImageInput(blob);
  if (blob.type === imageUploadConfig.outputMimeType && blob.size <= imageUploadConfig.maxProcessedBytes) {
    const dimensions = jpegDimensions(await readImageBytes(blob));
    if (dimensions && !dimensions.hasPrivateMetadata && Math.max(dimensions.width, dimensions.height) <= imageUploadConfig.maxDimension) return blob;
  }
  const image = await preprocessImageFile(blob);
  try { return image.blob; } finally { URL.revokeObjectURL(image.previewUrl); }
};

export const imageBlobToDataUrl = async (blob: Blob) => blobToDataUrl(blob);
export const imageDataUrlToBlob = async (dataUrl: string) => dataUrlToBlob(dataUrl);

export const createPrivateImageSignedUrl = async (
  client: SignedUrlClient,
  bucket: string,
  path: string,
  expiresInSeconds = 300,
) => {
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw error instanceof Error ? error : new Error("Signed URL could not be created.");
  }

  return data.signedUrl;
};
