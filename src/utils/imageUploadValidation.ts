import { ImageUploadError } from "../lib/imageUploadErrors.js";
import { callBackendFunction } from "../lib/backendConfig.js";
import type { PlantieLanguage } from "../lib/onboarding.js";
import {
  imageUploadRejectionMessage,
  isImageUploadAllowed,
  isImageUploadValidationPayload,
} from "../lib/imageUploadValidationRules.js";

export { imageUploadRejectionMessage };

export const validatePlantImageForUpload = async (imageDataUrl: string, language?: PlantieLanguage | null) => {
  try {
    const data = await callBackendFunction<{ validation?: unknown }>({
      body: { imageDataUrl, language },
      functionName: "validate-plant-image",
      netlifyPath: "/.netlify/functions/validate-plant-image",
    });

    if (!isImageUploadValidationPayload(data.validation) || !isImageUploadAllowed(data.validation)) {
      throw new ImageUploadError("IMAGE_VALIDATION_FAILED", 422);
    }
  } catch (error) {
    throw error instanceof ImageUploadError ? error : new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503);
  }
};
