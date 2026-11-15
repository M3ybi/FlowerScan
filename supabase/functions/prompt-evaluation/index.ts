import { createServiceClient, requireUser } from "../_shared/auth.ts";
import { runAiOperation, AiOperationError, aiErrorResponse } from "../_shared/aiOperation.ts";
import { readImageRequest, requireProcessedImage, ImageUploadError, imageErrorResponse } from "../_shared/imageUpload.ts";
import { observeOperation } from "../_shared/observability.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { parseCare } from "../_shared/plantCareContract.ts";
import { parseDiagnosis } from "../_shared/plantDiagnosisContract.ts";
import { extractOutputText } from "../_shared/botanicalResponse.ts";
import { getBotanicalPromptDefinition, normalizeBotanicalContext, allowedEvaluationOutputLimit, botanicalContextHash,
  botanicalDefinitionHash, evaluationPromptVersion, buildBotanicalEvaluationPayload } from "../_shared/botanicalPromptCandidates.ts";
import { botanicalConsistencySignals } from "../_shared/botanicalConsistency.ts";

const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keys = new Set(["runId", "inputKey", "imageDataUrl", "plantName", "symptomNotes", "language"]);

// Isolated experimental outputs, never an ordinary plant-save response or a
// safety receipt. Definitions and exact allowed input are server controlled.
Deno.serve(observeOperation("prompt_evaluation", async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  const auth = await requireUser(request.headers.get("authorization") ?? "");
  if (!auth) return imageErrorResponse(new ImageUploadError("AUTHENTICATION_REQUIRED", 401));
  try {
    const body = await readImageRequest(request);
    if (Object.keys(body).some(key => !keys.has(key)) || typeof body.runId !== "string" || !uuidLike.test(body.runId)
      || typeof body.inputKey !== "string" || !/^[a-z0-9_-]{1,80}$/.test(body.inputKey)) return json(400, { error: "Invalid evaluation request." });
    const { data, error } = await createServiceClient().rpc("ai_resolve_prompt_input", { actor: auth.user.id, run: body.runId, input_key: body.inputKey });
    if (error || !data) return imageErrorResponse(new ImageUploadError("HOUSEHOLD_ACCESS_DENIED", 403));
    const definition = getBotanicalPromptDefinition(data.definitionId), context = normalizeBotanicalContext(body);
    if (!definition || !context.plantName || context.language !== data.language || !allowedEvaluationOutputLimit(definition, data.outputLimit)
      || !uuidLike.test(data.householdId) || (data.kind === "care_refresh" && (typeof data.plantId !== "string" || !uuidLike.test(data.plantId)))
      || data.kind !== (definition.task === "care" ? "care_refresh" : "diagnosis")) return imageErrorResponse(new ImageUploadError("HOUSEHOLD_ACCESS_DENIED", 403));
    const [definitionHash, contextHash] = await Promise.all([botanicalDefinitionHash(definition), botanicalContextHash(context)]);
    const version = evaluationPromptVersion(definition, context.language, data.outputLimit, body.runId);
    if (definitionHash !== data.definitionHash || contextHash !== data.contextHash || version !== data.promptVersion) {
      return imageErrorResponse(new ImageUploadError("HOUSEHOLD_ACCESS_DENIED", 403));
    }
    const image = requireProcessedImage(body.imageDataUrl);
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return imageErrorResponse(new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503));
    const result = await runAiOperation(apiKey, {
      actorId: auth.user.id, householdId: data.householdId, plantId: data.plantId || undefined,
      kind: data.kind, image, promptVersion: version, timeoutMs: 30_000,
      promptEvaluation: { runId: body.runId, inputKey: body.inputKey, definitionHash, contextHash },
      payload: buildBotanicalEvaluationPayload(definition, context, String(body.imageDataUrl), data.outputLimit),
      parse: payload => {
        const parsed = definition.task === "care" ? parseCare(extractOutputText(payload)) : parseDiagnosis(extractOutputText(payload));
        if (!parsed) throw new AiOperationError(502, "AI_INVALID_RESULT", "Invalid evaluation result.");
        return { evaluation: { definitionId: definition.id, promptVersion: definition.version, language: context.language,
          result: definition.task === "care" ? { care: parsed } : { diagnosis: parsed },
          consistencySignals: botanicalConsistencySignals(definition.task, parsed), botanicalQuality: "NOT VERIFIED" } };
      },
    });
    return json(200, result);
  } catch (failure) { return aiErrorResponse(failure); }
}));
