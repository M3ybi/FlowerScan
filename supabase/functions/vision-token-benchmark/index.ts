import { createServiceClient, requireUser } from "../_shared/auth.ts";
import { runAiOperation, AiOperationError, aiErrorResponse } from "../_shared/aiOperation.ts";
import { readImageRequest, requireProcessedImage, imageErrorResponse, ImageUploadError } from "../_shared/imageUpload.ts";
import { observeOperation } from "../_shared/observability.ts";
import { validateImageSafety } from "../_shared/plantImageValidation.ts";
import { corsHeaders, json } from "../_shared/cors.ts";

const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// A token-geometry probe, NOT a safety verdict or a diagnostic route. Its
// prompt/fingerprint namespace cannot authorize an ordinary image upload.
Deno.serve(observeOperation("vision_token_benchmark", async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  const auth = await requireUser(request.headers.get("authorization") ?? "");
  if (!auth) return imageErrorResponse(new ImageUploadError("AUTHENTICATION_REQUIRED", 401));
  let body: Record<string, unknown>;
  try { body = await readImageRequest(request); }
  catch (error) { return aiErrorResponse(error); }
  if (typeof body.runId !== "string" || !uuidLike.test(body.runId) || typeof body.inputKey !== "string"
    || !/^[a-z0-9_-]{1,80}$/.test(body.inputKey) || body.model !== undefined || body.detail !== undefined) {
    return json(400, { error: "Invalid evaluation request." });
  }
  const { data, error } = await createServiceClient().rpc("ai_resolve_vision_input", { actor: auth.user.id, run: body.runId, input_key: body.inputKey });
  if (error || !data || !["high", "low"].includes(data.detail)) return imageErrorResponse(new ImageUploadError("HOUSEHOLD_ACCESS_DENIED", 403));
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return imageErrorResponse(new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503));
  try {
    const image = requireProcessedImage(body.imageDataUrl);
    if (data.purpose === "safety") {
      const validation = await validateImageSafety(apiKey, String(body.imageDataUrl), "en", {
        actorId: auth.user.id, kind: "image_validation", image,
        imageDetail: data.detail, preprocessingProfile: data.preprocessingProfile, evaluationInputKey: data.inputKey,
      });
      // Never return an upload receipt or a production validation capability.
      return json(200, { evaluation: { allowed: Boolean(validation) } });
    }
    if (data.purpose !== "probe") return imageErrorResponse(new ImageUploadError("HOUSEHOLD_ACCESS_DENIED", 403));
    const result = await runAiOperation(apiKey, {
      actorId: auth.user.id, kind: "image_validation", image, promptVersion: "vision-token-probe-v1", timeoutMs: 15_000,
      imageDetail: data.detail, preprocessingProfile: data.preprocessingProfile, evaluationInputKey: data.inputKey,
      payload: {
        input: [{ role: "user", content: [
          { type: "input_text", text: "Does this image visibly contain any plant or plant part?" },
          { type: "input_image", detail: data.detail, image_url: body.imageDataUrl },
        ] }],
        max_output_tokens: 32,
        text: { format: { type: "json_schema", name: "vision_geometry_probe", strict: true,
          schema: { type: "object", properties: { containsPlant: { type: "boolean" } }, required: ["containsPlant"], additionalProperties: false } } },
      },
      parse: value => {
        const output = value.output as Array<{ content?: Array<{ type?: string; text?: string }> }> | undefined;
        const text = typeof value.output_text === "string" ? value.output_text
          : output?.flatMap(item => item.content ?? []).find(item => item.type === "output_text")?.text;
        const probe: unknown = JSON.parse(text ?? "");
        if (!probe || typeof probe !== "object" || typeof (probe as { containsPlant?: unknown }).containsPlant !== "boolean") {
          throw new AiOperationError(502, "AI_INVALID_RESULT", "Invalid evaluation result.");
        }
        return { probe: { containsPlant: (probe as { containsPlant: boolean }).containsPlant } };
      },
    });
    return json(200, result);
  } catch (failure) { return aiErrorResponse(failure); }
}));
