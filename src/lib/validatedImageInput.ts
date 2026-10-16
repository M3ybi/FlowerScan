import { validateProcessedImageDataUrl } from "./imageUploadConfig.js";

export const parseValidatedJpeg = (imageDataUrl: string) => {
  const result = validateProcessedImageDataUrl(imageDataUrl);
  return "code" in result ? null : result;
};
