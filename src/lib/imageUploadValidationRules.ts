export const imageUploadRejectionMessage =
  "Image contains sensitive/explicit information or does not contain a valid plant/tree. Please upload a clear plant image without sensitive background content.";

export type ImageUploadValidationPayload = {
  containsPlant: boolean;
  failureReasons: string[];
  hasExplicitOrUnsafeContent: boolean;
  hasRestrictedFootageOrPrivateContent: boolean;
  hasSensitiveBackground: boolean;
  plantConfidence: number;
  safeUserMessage: string;
  shouldAllowUpload: boolean;
};

export const isImageUploadValidationPayload = (value: unknown): value is ImageUploadValidationPayload => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<ImageUploadValidationPayload>;
  return (
    typeof payload.containsPlant === "boolean" &&
    typeof payload.plantConfidence === "number" &&
    Number.isFinite(payload.plantConfidence) &&
    typeof payload.hasSensitiveBackground === "boolean" &&
    typeof payload.hasExplicitOrUnsafeContent === "boolean" &&
    typeof payload.hasRestrictedFootageOrPrivateContent === "boolean" &&
    typeof payload.shouldAllowUpload === "boolean" &&
    Array.isArray(payload.failureReasons) &&
    payload.failureReasons.every((item) => typeof item === "string") &&
    typeof payload.safeUserMessage === "string"
  );
};

export const isImageUploadAllowed = (payload: ImageUploadValidationPayload) =>
  payload.containsPlant === true &&
  payload.plantConfidence >= 0.75 &&
  payload.hasSensitiveBackground === false &&
  payload.hasExplicitOrUnsafeContent === false &&
  payload.hasRestrictedFootageOrPrivateContent === false &&
  payload.shouldAllowUpload === true &&
  payload.failureReasons.length === 0;
