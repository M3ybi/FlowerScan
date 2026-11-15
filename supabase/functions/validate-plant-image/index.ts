import { observeOperation } from "../_shared/observability.ts";
import { aiErrorResponse } from "../_shared/aiOperation.ts";
import { readImageRequest, requireProcessedImage, imageErrorResponse, ImageUploadError } from "../_shared/imageUpload.ts";
import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { validateImageSafety } from "../_shared/plantImageValidation.ts";
import { issueImageValidationReceipt } from "../_shared/imageValidationReceipt.ts";

Deno.serve(observeOperation("image_validation", async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 204 });
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return imageErrorResponse(new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503));

  const auth = await requireUser(request.headers.get("authorization") ?? "");
  if (!auth) return imageErrorResponse(new ImageUploadError("AUTHENTICATION_REQUIRED", 401));

  let body: Record<string, unknown>;
  try {
    body = await readImageRequest(request);
  } catch (error) {
    return imageErrorResponse(error instanceof ImageUploadError ? error : new ImageUploadError("INVALID_IMAGE"));
  }

  const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
  let parsedImage: ReturnType<typeof requireProcessedImage>;
  try { parsedImage = requireProcessedImage(imageDataUrl); }
  catch (error) { return imageErrorResponse(error as ImageUploadError, body.language); }

  let validation;
  try { validation = await validateImageSafety(apiKey, imageDataUrl, body.language, {
    actorId: auth.user.id, kind: "image_validation", image: parsedImage, retryKey: body.operationKey,
  }); } catch (error) { return aiErrorResponse(error, body.language); }
  if (!validation) return imageErrorResponse(new ImageUploadError("IMAGE_VALIDATION_FAILED", 422), body.language);
  const receipt = await issueImageValidationReceipt(parsedImage.bytes, auth.user.id, Deno.env.get("IMAGE_VALIDATION_SIGNING_SECRET"));
  return json(200, { validation, ...(receipt ? { receipt } : {}) });
}));
