import { Capacitor } from "@capacitor/core";

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

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
export const defaultMaxImageBytes = 8 * 1024 * 1024;
const defaultMaxDimension = 1200;
const defaultOutputQuality = 0.84;

export const detectImageRuntime = (platform = Capacitor.getPlatform()): ImageRuntime =>
  platform === "ios" || platform === "android" ? platform : "web";

export const shouldUseNativeCamera = (runtime: ImageRuntime) => runtime === "ios" || runtime === "android";

export const validateImageInput = (input: ImageValidationInput, maxBytes = defaultMaxImageBytes) => {
  if (!allowedImageTypes.has(input.type)) {
    throw new Error("Vybraný súbor musí byť JPG, PNG alebo WEBP obrázok.");
  }

  if (input.size <= 0) {
    throw new Error("Vybraný obrázok je prázdny.");
  }

  if (input.size > maxBytes) {
    throw new Error("Obrázok je príliš veľký. Použi fotku do 8 MB.");
  }
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

const resizeImageToJpeg = (file: Blob, maxDimension: number, outputQuality: number): Promise<{ blob: Blob; dataUrl: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Obrázok sa nepodarilo načítať."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Obrázok sa nepodarilo spracovať."));
      image.onload = () => {
        const ratio = Math.min(1, maxDimension / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * ratio));
        const height = Math.max(1, Math.round(image.height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Obrázok sa nepodarilo spracovať."));
          return;
        }

        context.drawImage(image, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Obrázok sa nepodarilo skomprimovať."));
              return;
            }
            resolve({ blob, dataUrl: canvas.toDataURL("image/jpeg", outputQuality) });
          },
          "image/jpeg",
          outputQuality,
        );
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });

export const preprocessImageFile = async (
  file: Blob & { name?: string },
  options: ImagePreprocessOptions = {},
): Promise<Pick<NormalizedImage, "blob" | "dataUrl" | "mimeType" | "name" | "previewUrl" | "sizeBytes">> => {
  validateImageInput(file, options.maxInputBytes ?? defaultMaxImageBytes);

  const maxDimension = options.maxDimension ?? defaultMaxDimension;
  const outputQuality = options.outputQuality ?? defaultOutputQuality;
  const name = file.name?.trim() || "plantie-image.jpg";
  const createPreviewUrl = options.createPreviewUrl ?? ((blob: Blob) => URL.createObjectURL(blob));
  const dataUrlFromBlob = options.dataUrlFromBlob ?? blobToDataUrl;
  const transformImage = options.transformImage ?? resizeImageToJpeg;

  try {
    const resized = await transformImage(file, maxDimension, outputQuality);
    const previewUrl = createPreviewUrl(resized.blob);
    return {
      blob: resized.blob,
      dataUrl: resized.dataUrl,
      mimeType: "image/jpeg",
      name,
      previewUrl,
      sizeBytes: resized.blob.size,
    };
  } catch (error) {
    if (file.type !== "image/jpeg") {
      throw error;
    }

    const dataUrl = await dataUrlFromBlob(file);
    return {
      blob: file,
      dataUrl,
      mimeType: "image/jpeg",
      name,
      previewUrl: createPreviewUrl(file),
      sizeBytes: file.size,
    };
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

  if (shouldUseNativeCamera(runtime)) {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      allowEditing: false,
      quality: 84,
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
    const processed = await preprocessImageFile(new File([blob], "plantie-mobile-image.jpg", { type: blob.type || "image/jpeg" }));
    return { ...processed, runtime, source };
  }

  if (!file) {
    throw new Error("Vyber fotku z galérie.");
  }

  const processed = await preprocessImageFile(file);
  return { ...processed, runtime, source };
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
