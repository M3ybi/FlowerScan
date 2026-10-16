import { Capacitor } from "@capacitor/core";
import { detectImageMimeType, imageUploadConfig, jpegDimensions } from "./imageUploadConfig.js";
import { ImageUploadError } from "./imageUploadErrors.js";

export type ImageCaptureSource = "camera" | "gallery";
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

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Obrázok sa nepodarilo načítať."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });

const dataUrlToBlob = async (dataUrl: string) => {
  const response = await fetch(dataUrl);
  return response.blob();
};

type ImageEncoder = { encode: (maxDimension: number, quality: number) => Promise<Blob>; dispose: () => void };

const prepareImageEncoder = async (file: Blob): Promise<ImageEncoder> => {
  let source: ImageBitmap | HTMLImageElement | undefined;
  let sourceUrl: string | null = null;
  try {
    if (typeof createImageBitmap === "function") {
      try {
        source = await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch { /* Some mobile decoders reject images that HTMLImageElement supports. */ }
    }
    if (!source) {
      sourceUrl = URL.createObjectURL(file);
      const image = new Image();
      image.src = sourceUrl;
      await image.decode();
      source = image;
    }
  } catch {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    throw new ImageUploadError("INVALID_IMAGE");
  }
  const decodedSource = source;
  const dispose = () => {
    if ("close" in decodedSource) decodedSource.close();
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  };
  if (!decodedSource.width || !decodedSource.height) { dispose(); throw new ImageUploadError("INVALID_IMAGE"); }
  return {
    dispose,
    encode: async (maxDimension, quality) => {
      // The decoded source is retained across bounded attempts. Only the final
      // encoded JPEG is read as base64; canvas.toDataURL would encode it twice.
      const ratio = Math.min(1, maxDimension / Math.max(decodedSource.width, decodedSource.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(decodedSource.width * ratio));
      canvas.height = Math.max(1, Math.round(decodedSource.height * ratio));
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

export const preprocessImageFile = async (
  file: Blob & { name?: string },
  options: ImagePreprocessOptions = {},
): Promise<Pick<NormalizedImage, "blob" | "dataUrl" | "mimeType" | "name" | "previewUrl" | "sizeBytes">> => {
  validateImageInput(file, options.maxInputBytes);
  const detectedType = detectImageMimeType(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  const claimedType = file.type === "image/jpg" ? "image/jpeg" : file.type;
  if (!detectedType) throw new ImageUploadError("INVALID_IMAGE");
  if (detectedType !== claimedType) throw new ImageUploadError("UNSUPPORTED_IMAGE_FORMAT", 415);
  const maxDimension = Math.min(options.maxDimension ?? imageUploadConfig.maxDimension, imageUploadConfig.maxDimension);
  if (!Number.isFinite(maxDimension) || maxDimension < 1) throw new ImageUploadError("IMAGE_COMPRESSION_FAILED");
  const encoder = options.transformImage ? null : await prepareImageEncoder(file);
  try {
    for (const attempt of imageUploadConfig.compressionAttempts) {
      const quality = Math.max(imageUploadConfig.minQuality,
        Math.min(options.outputQuality ?? imageUploadConfig.initialQuality, attempt.quality));
      if (!Number.isFinite(quality)) throw new ImageUploadError("IMAGE_COMPRESSION_FAILED");
      const dimension = Math.max(1, Math.round(maxDimension * attempt.scale));
      const blob = options.transformImage
        ? (await options.transformImage(file, dimension, quality)).blob
        : await encoder!.encode(dimension, quality);
      if (blob.size > imageUploadConfig.maxProcessedBytes) continue;
      if (blob.type !== imageUploadConfig.outputMimeType || blob.size === 0) throw new ImageUploadError("IMAGE_COMPRESSION_FAILED");
      const dimensions = jpegDimensions(new Uint8Array(await blob.arrayBuffer()));
      if (!dimensions || Math.max(dimensions.width, dimensions.height) > maxDimension) throw new ImageUploadError("INVALID_IMAGE");
      const dataUrl = await (options.dataUrlFromBlob ?? blobToDataUrl)(blob);
      const previewUrl = (options.createPreviewUrl ?? ((value: Blob) => URL.createObjectURL(value)))(blob);
      return { blob, dataUrl, mimeType: imageUploadConfig.outputMimeType,
        name: (file.name?.replace(/\.[^.]+$/, "") || "plantie-image") + ".jpg", previewUrl, sizeBytes: blob.size };
    }
    throw new ImageUploadError("IMAGE_COMPRESSION_FAILED");
  } catch (error) {
    throw error instanceof ImageUploadError ? error : new ImageUploadError("IMAGE_COMPRESSION_FAILED");
  } finally {
    encoder?.dispose();
  }
};

export const captureImage = async ({
  file,
  source,
}: {
  file?: File;
  source: ImageCaptureSource;
}): Promise<NormalizedImage> => {
  const runtime = detectImageRuntime();

  if (shouldUseNativeCamera(runtime) && !file) {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      allowEditing: false,
      quality: 100,
      correctOrientation: true,
      resultType: CameraResultType.Uri,
      source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
    });

    if (!photo.webPath) {
      throw new Error("Fotku sa nepodarilo načítať zo zariadenia.");
    }

    const response = await fetch(photo.webPath);
    if (!response.ok) {
      throw new Error("Fotku sa nepodarilo načítať zo zariadenia.");
    }

    const blob = await response.blob();
    const detectedType = detectImageMimeType(new Uint8Array(await blob.slice(0, 12).arrayBuffer()));
    const type = !blob.type || blob.type === "application/octet-stream" ? detectedType || "" : blob.type;
    const processed = await preprocessImageFile(new File([blob], "plantie-mobile-image", { type }));
    return { ...processed, runtime, source };
  }

  if (!file) {
    throw new Error("Vyber fotku z galérie.");
  }

  const processed = await preprocessImageFile(file);
  return { ...processed, runtime, source };
};

export const prepareImageBlobForUpload = async (blob: Blob) => {
  validateImageInput(blob);
  if (blob.type === imageUploadConfig.outputMimeType && blob.size <= imageUploadConfig.maxProcessedBytes) {
    const dimensions = jpegDimensions(new Uint8Array(await blob.arrayBuffer()));
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
