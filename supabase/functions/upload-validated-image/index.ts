import { observeOperation } from "../_shared/observability.ts";
import { requireImageAdmission } from "../_shared/imageAdmission.ts";
import { readImageRequest, requireProcessedImage, imageErrorResponse, ImageUploadError, imageNetworkError, imageProviderFailure } from "../_shared/imageUpload.ts";
import { createServiceClient, requireUser } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { validateImageSafety } from "../_shared/plantImageValidation.ts";
import { verifyImageValidationReceipt } from "../_shared/imageValidationReceipt.ts";

type ImageKind = "diagnostic" | "plant";

const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(observeOperation("image_upload", async (request) => {
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

  const householdId = typeof body.householdId === "string" ? body.householdId.toLowerCase() : "";
  const imageId = typeof body.imageId === "string" ? body.imageId.toLowerCase() : "";
  const kind = body.kind;
  const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
  if (!uuidLike.test(householdId) || !uuidLike.test(imageId) || (kind !== "plant" && kind !== "diagnostic")) {
    return imageErrorResponse(new ImageUploadError("INVALID_IMAGE"), body.language);
  }
  const { data: canEdit, error: accessError } = await auth.client.rpc("can_manage_household_content", { target_household_id: householdId });
  if (accessError || !canEdit) {
    return imageErrorResponse(new ImageUploadError("HOUSEHOLD_ACCESS_DENIED", 403), body.language);
  }

  let parsedImage: ReturnType<typeof requireProcessedImage>;
  try { parsedImage = requireProcessedImage(imageDataUrl); }
  catch (error) { return imageErrorResponse(error as ImageUploadError, body.language); }

  try { await requireImageAdmission(() => auth.client.rpc("admit_image_operation", { requested_operation: "upload" })); }
  catch (error) { return imageErrorResponse(error as ImageUploadError, body.language); }

  const receipt = body.imageValidationReceipt;
  const signingSecret = Deno.env.get("IMAGE_VALIDATION_SIGNING_SECRET");
  if (receipt !== undefined && !await verifyImageValidationReceipt(receipt, parsedImage.bytes, auth.user.id, signingSecret)) {
    return imageErrorResponse(new ImageUploadError("IMAGE_VALIDATION_REQUIRED", 422), body.language);
  }
  const validation = receipt === undefined ? await validateImageSafety(apiKey, imageDataUrl, body.language) : true;
  if (validation instanceof ImageUploadError) return imageErrorResponse(validation, body.language);
  if (!validation) {
    return imageErrorResponse(new ImageUploadError("IMAGE_VALIDATION_FAILED", 422), body.language);
  }

  try { await requireImageAdmission(() => auth.client.rpc("reserve_image_upload", { target_household_id: householdId, image_kind: kind, image_id: imageId })); }
  catch (error) { return imageErrorResponse(error as ImageUploadError, body.language); }

  const bucket = kind === "plant" ? "plant-images" : "diagnostic-images";
  const path = kind === "plant" ? `${householdId}/plants/${imageId}/original.jpg` : `${householdId}/diagnostics/${imageId}/image.jpg`;
  try {
    const { error: uploadError } = await createServiceClient().storage.from(bucket).upload(path, parsedImage.bytes, {
      contentType: "image/jpeg",
      // Older clients reuse a plant ID for replacements. New clients generate a
      // fresh path and retain the previous photo until their DB update commits.
      upsert: true,
    });

    if (uploadError) {
      console.error("Validated image upload storage write failed", { bucket, userIdPrefix: `${auth.user.id.slice(0, 8)}...` });
      return imageErrorResponse(new ImageUploadError("IMAGE_UPLOAD_FAILED", 502), body.language);
    }
  } catch (error) {
    return imageErrorResponse(imageNetworkError(error), body.language);
  }

  return json(200, { path });
}));
