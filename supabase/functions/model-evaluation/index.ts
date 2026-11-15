import { createServiceClient, requireUser } from "../_shared/auth.ts";
import { runAiOperation, AiOperationError, aiErrorResponse } from "../_shared/aiOperation.ts";
import { readImageRequest, requireProcessedImage, ImageUploadError, imageErrorResponse } from "../_shared/imageUpload.ts";
import { observeOperation } from "../_shared/observability.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { parseCare } from "../_shared/plantCareContract.ts";
import { parseDiagnosis } from "../_shared/plantDiagnosisContract.ts";
import { extractOutputText } from "../_shared/botanicalResponse.ts";
import { normalizeBotanicalContext, botanicalContextHash, hashBotanicalText } from "../_shared/botanicalPromptCandidates.ts";
import { getModelConfiguration, modelConfigurationHash, buildModelEvaluationPayload } from "../_shared/aiModelRegistry.ts";

const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keys = new Set(["runId", "inputKey", "imageDataUrl", "plantName", "symptomNotes", "language"]);

Deno.serve(observeOperation("model_evaluation", async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  const auth = await requireUser(request.headers.get("authorization") ?? "");
  if (!auth) return imageErrorResponse(new ImageUploadError("AUTHENTICATION_REQUIRED", 401));
  try {
    const body = await readImageRequest(request);
    if (Object.keys(body).some(key => !keys.has(key)) || typeof body.runId !== "string" || !uuidLike.test(body.runId)
      || typeof body.inputKey !== "string" || !/^[a-z0-9_-]{1,80}$/.test(body.inputKey)) return json(400, { error: "Invalid model evaluation request." });
    const { data, error } = await createServiceClient().rpc("ai_resolve_model_input", { actor: auth.user.id, run: body.runId, input_key: body.inputKey });
    if (error || !data) return imageErrorResponse(new ImageUploadError("HOUSEHOLD_ACCESS_DENIED", 403));
    const config = getModelConfiguration(data.configurationId), context = normalizeBotanicalContext(body);
    if (!config || config.route === "image_safety" || context.language !== data.language || !context.plantName
      || !uuidLike.test(data.householdId) || !uuidLike.test(data.plantId)) return imageErrorResponse(new ImageUploadError("HOUSEHOLD_ACCESS_DENIED", 403));
    const [configurationHash, contextHash] = await Promise.all([modelConfigurationHash(config), botanicalContextHash(context)]);
    if (configurationHash !== data.configurationHash || contextHash !== data.contextHash) return imageErrorResponse(new ImageUploadError("HOUSEHOLD_ACCESS_DENIED", 403));
    const image = requireProcessedImage(body.imageDataUrl), apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return imageErrorResponse(new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503));
    return json(200, await runAiOperation(apiKey, {
      actorId: auth.user.id, householdId: data.householdId, plantId: data.plantId,
      // Initial-care and refresh use identical v1 provider payloads. Isolated
      // initial-payload probes use a real care-refresh lease on an owned fixture
      // plant, so they cannot create an ordinary pending-plant draft or save.
      kind: config.route === "diagnosis" ? "diagnosis" : "care_refresh", image,
      retryKey: `eval_${await hashBotanicalText(`${body.runId}:${body.inputKey}`)}`, promptVersion: config.promptVersion, timeoutMs: config.timeoutMs,
      modelEvaluation: { runId: body.runId, inputKey: body.inputKey, configurationId: config.id, configurationHash, contextHash },
      payload: buildModelEvaluationPayload(config, context, String(body.imageDataUrl)),
      parse: payload => {
        const parsed = config.route === "diagnosis" ? parseDiagnosis(extractOutputText(payload)) : parseCare(extractOutputText(payload));
        if (!parsed) throw new AiOperationError(502, "AI_INVALID_RESULT", "Invalid model evaluation result.");
        return { evaluation: { configurationId: config.id, requestedModel: config.model, promptVersion: config.promptVersion,
          language: context.language, botanicalQuality: "NOT VERIFIED", result: config.route === "diagnosis" ? { diagnosis: parsed } : { care: parsed } } };
      },
    }));
  } catch (failure) { return aiErrorResponse(failure); }
}));
