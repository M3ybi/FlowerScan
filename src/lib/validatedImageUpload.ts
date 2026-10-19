import { imageErrorFromResponse, ImageUploadError } from "./imageUploadErrors.js";
import { forgetImageValidationReceipt, imageValidationReceipt } from "./imageValidationReceipts.js";

type UploadResponse = { data: unknown; error: unknown };

// A receipt rejection occurs before storage. Only that explicit rejection is safe
// to retry automatically: an ambiguous upload failure must retain its identity.
export const uploadWithValidationRecovery = async (
  image: string,
  invoke: (receipt: string | undefined) => Promise<UploadResponse>,
) => {
  let receipt = imageValidationReceipt(image);
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: UploadResponse;
    try {
      response = await invoke(receipt);
    } catch (error) {
      response = { data: null, error: (await imageErrorFromResponse(error)) ?? new ImageUploadError("IMAGE_NETWORK_FAILED", 502) };
    }
    if (!response.error) return response.data;
    const failure = (await imageErrorFromResponse(response.error)) ?? new ImageUploadError("IMAGE_UPLOAD_FAILED", 502);
    if (attempt === 0 && receipt && failure.code === "IMAGE_VALIDATION_REQUIRED") {
      forgetImageValidationReceipt(image);
      receipt = undefined;
      continue;
    }
    throw failure;
  }
  throw new ImageUploadError("IMAGE_VALIDATION_FAILED", 422);
};
