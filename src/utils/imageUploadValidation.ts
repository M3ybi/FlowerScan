import { ImageUploadError } from "../lib/imageUploadErrors.js";
import { callBackendFunction } from "../lib/backendConfig.js";
import type { PlantieLanguage } from "../lib/onboarding.js";
import { rememberImageValidationReceipt } from "../lib/imageValidationReceipts.js";
import {
  imageUploadRejectionMessage,
  isImageUploadAllowed,
  isImageUploadValidationPayload,
} from "../lib/imageUploadValidationRules.js";

export { imageUploadRejectionMessage };

export const validatePlantImageForUpload = async (imageDataUrl: string, language?: PlantieLanguage | null, signal?: AbortSignal) => {
  try {
    const data = await callBackendFunction<{ validation?: unknown; receipt?: unknown }>({
      body: { imageDataUrl, language },
      functionName: "validate-plant-image",
      netlifyPath: "/.netlify/functions/validate-plant-image",
      signal,
    });

    if (!isImageUploadValidationPayload(data.validation) || !isImageUploadAllowed(data.validation)) {
      throw new ImageUploadError("IMAGE_VALIDATION_FAILED", 422);
    }
    if (!signal?.aborted) rememberImageValidationReceipt(imageDataUrl, data.receipt);
  } catch (error) {
    throw error instanceof ImageUploadError ? error : new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503);
  }
};
