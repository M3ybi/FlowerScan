import { ImageUploadError } from "./imageUpload.ts";

export const requireImageAdmission = async (
  operation: () => PromiseLike<{ error: { message?: string } | null }>,
) => {
  try {
    const { error } = await operation();
    if (!error) return;
    if (error.message?.includes("IMAGE_RATE_LIMITED")) throw new ImageUploadError("IMAGE_RATE_LIMITED", 429);
    if (error.message?.includes("IMAGE_UPLOAD_CAPACITY")) throw new ImageUploadError("IMAGE_UPLOAD_CAPACITY", 429);
    throw new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503);
  } catch (error) {
    throw error instanceof ImageUploadError ? error : new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503);
  }
};
