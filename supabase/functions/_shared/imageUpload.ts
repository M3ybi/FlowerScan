import { maxImageRequestBytes, validateProcessedImageDataUrl } from "../../../src/lib/imageUploadConfig.ts";
import { ImageUploadError, imageErrorMessage } from "../../../src/lib/imageUploadErrors.ts";
import { json } from "./cors.ts";

export const imageErrorResponse = (error: ImageUploadError, language?: unknown) =>
  json(error.status, { code: error.code, error: imageErrorMessage(error, language) });

export const readImageRequest = async (request: Request): Promise<Record<string, unknown>> => {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxImageRequestBytes) throw new ImageUploadError("IMAGE_TOO_LARGE", 413);
  if (!request.body) throw new ImageUploadError("INVALID_IMAGE");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxImageRequestBytes) {
        await reader.cancel();
        throw new ImageUploadError("IMAGE_TOO_LARGE", 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ImageUploadError("INVALID_IMAGE");
    return body as Record<string, unknown>;
  } catch (error) {
    throw error instanceof ImageUploadError ? error : new ImageUploadError("INVALID_IMAGE");
  } finally {
    reader.releaseLock();
  }
};

export const requireProcessedImage = (value: unknown) => {
  const result = validateProcessedImageDataUrl(value);
  if (result.code !== undefined) throw new ImageUploadError(result.code, result.status);
  return result;
};

export const imageNetworkError = (error: unknown) => {
  const name = error instanceof Error ? error.name : "";
  return new ImageUploadError(["AbortError", "TimeoutError"].includes(name)
    ? "IMAGE_NETWORK_TIMEOUT" : "IMAGE_NETWORK_FAILED", name === "AbortError" || name === "TimeoutError" ? 504 : 502);
};

export const imageProviderFailure = async (response: Response) => {
  try {
    const payload = await response.json() as { error?: { code?: unknown } };
    if (response.status === 400 && typeof payload.error?.code === "string" &&
      /^(invalid_(image|base64_image)|image_parse_error)/.test(payload.error.code)) return new ImageUploadError("INVALID_IMAGE");
  } catch { /* Do not expose provider response bodies. */ }
  return new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503);
};

export { ImageUploadError };
