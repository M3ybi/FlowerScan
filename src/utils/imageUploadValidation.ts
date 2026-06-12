import { callBackendFunction } from "../lib/backendConfig.js";
import {
  imageUploadRejectionMessage,
  isImageUploadAllowed,
  isImageUploadValidationPayload,
} from "../lib/imageUploadValidationRules.js";

export { imageUploadRejectionMessage };

export const validatePlantImageForUpload = async (imageDataUrl: string) => {
  try {
    const data = await callBackendFunction<{ validation?: unknown }>({
      body: { imageDataUrl },
      functionName: "validate-plant-image",
      netlifyPath: "/.netlify/functions/validate-plant-image",
    });

    if (!isImageUploadValidationPayload(data.validation) || !isImageUploadAllowed(data.validation)) {
      throw new Error(imageUploadRejectionMessage);
    }
  } catch {
    throw new Error(imageUploadRejectionMessage);
  }
};
