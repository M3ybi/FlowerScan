export type ImageErrorCode = "ORIGINAL_IMAGE_TOO_LARGE" | "IMAGE_TOO_LARGE" | "UNSUPPORTED_IMAGE_FORMAT" |
  "INVALID_IMAGE" | "IMAGE_COMPRESSION_FAILED" | "IMAGE_VALIDATION_FAILED" | "IMAGE_UPLOAD_FAILED" |
  "AUTHENTICATION_REQUIRED" | "HOUSEHOLD_ACCESS_DENIED" | "IMAGE_NETWORK_TIMEOUT" | "IMAGE_NETWORK_FAILED" | "IMAGE_SERVICE_UNAVAILABLE";

const english: Record<ImageErrorCode, string> = {
  ORIGINAL_IMAGE_TOO_LARGE: "The original photo exceeds 15 MB. Choose a smaller photo.",
  IMAGE_TOO_LARGE: "The processed photo exceeds 2 MB. Choose another photo.",
  UNSUPPORTED_IMAGE_FORMAT: "Choose a JPEG, PNG or WebP photo. Renaming a file does not convert it.",
  INVALID_IMAGE: "This photo is empty, corrupted or unreadable. Choose another photo.",
  IMAGE_COMPRESSION_FAILED: "The photo could not be optimized within 2 MB. Choose another photo.",
  IMAGE_VALIDATION_FAILED: "Use a clear plant photo without people, private documents or sensitive background content.",
  IMAGE_UPLOAD_FAILED: "The photo could not be stored. Your form is preserved; please try again.",
  AUTHENTICATION_REQUIRED: "Sign in again before uploading the photo.",
  HOUSEHOLD_ACCESS_DENIED: "You need active plant-management access to this household to upload a photo.",
  IMAGE_NETWORK_TIMEOUT: "The image request timed out. Check your connection and try again.",
  IMAGE_NETWORK_FAILED: "The image service could not be reached. Check your connection and try again.",
  IMAGE_SERVICE_UNAVAILABLE: "Image processing is temporarily unavailable. Please try again.",
};
const slovak: Record<ImageErrorCode, string> = {
  ORIGINAL_IMAGE_TOO_LARGE: "Pôvodná fotka presahuje 15 MB. Vyber menšiu fotku.",
  IMAGE_TOO_LARGE: "Spracovaná fotka presahuje 2 MB. Vyber inú fotku.",
  UNSUPPORTED_IMAGE_FORMAT: "Vyber fotku JPEG, PNG alebo WebP. Premenovanie súboru nezmení jeho formát.",
  INVALID_IMAGE: "Fotka je prázdna, poškodená alebo sa nedá načítať. Vyber inú fotku.",
  IMAGE_COMPRESSION_FAILED: "Fotku sa nepodarilo optimalizovať do 2 MB. Vyber inú fotku.",
  IMAGE_VALIDATION_FAILED: "Použi jasnú fotku rastliny bez ľudí, súkromných dokumentov a citlivého pozadia.",
  IMAGE_UPLOAD_FAILED: "Fotku sa nepodarilo uložiť. Formulár zostal vyplnený; skús to znova.",
  AUTHENTICATION_REQUIRED: "Pred nahraním fotky sa znova prihlás.",
  HOUSEHOLD_ACCESS_DENIED: "Na nahranie fotky potrebuješ aktívny prístup k rastlinám v tejto domácnosti.",
  IMAGE_NETWORK_TIMEOUT: "Čas na spracovanie fotky vypršal. Skontroluj pripojenie a skús to znova.",
  IMAGE_NETWORK_FAILED: "Služba na spracovanie fotiek je nedostupná. Skontroluj pripojenie a skús to znova.",
  IMAGE_SERVICE_UNAVAILABLE: "Spracovanie fotiek je dočasne nedostupné. Skús to znova.",
};

export class ImageUploadError extends Error {
  constructor(public readonly code: ImageErrorCode, public readonly status = 400) {
    super(english[code]);
    this.name = "ImageUploadError";
  }
}
export const imageErrorMessage = (error: unknown, language: unknown): string | null =>
  error instanceof ImageUploadError ? (language === "sk" ? slovak : english)[error.code] : null;

export const imageErrorFromResponse = async (error: unknown): Promise<ImageUploadError | null> => {
  if (error instanceof ImageUploadError) return error;
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json() as { code?: unknown };
      if (typeof payload.code === "string" && Object.prototype.hasOwnProperty.call(english, payload.code)) {
        return new ImageUploadError(payload.code as ImageErrorCode, context.status);
      }
    } catch { /* Use only public error codes, never provider diagnostics. */ }
    if (context.status === 401) return new ImageUploadError("AUTHENTICATION_REQUIRED", 401);
  }
  if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) {
    return new ImageUploadError("IMAGE_NETWORK_TIMEOUT", 504);
  }
  if (error instanceof Error && ["TypeError", "FunctionsFetchError"].includes(error.name)) return new ImageUploadError("IMAGE_NETWORK_FAILED", 502);
  return null;
};
