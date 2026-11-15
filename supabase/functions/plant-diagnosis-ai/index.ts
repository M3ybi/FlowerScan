import { runAiOperation, AiOperationError, aiErrorResponse } from "../_shared/aiOperation.ts";
import { observeOperation } from "../_shared/observability.ts";
import { readImageRequest, requireProcessedImage, imageErrorResponse, ImageUploadError } from "../_shared/imageUpload.ts";
import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { parseDiagnosis } from "../_shared/plantDiagnosisContract.ts";
import { extractOutputText, sanitizeBotanicalText as sanitizeText } from "../_shared/botanicalResponse.ts";
import { buildProductionDiagnosisPayload, productionDiagnosisPromptVersion } from "../_shared/productionBotanicalPrompts.ts";

const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(observeOperation("plant_diagnosis", async (request) => {
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

  const householdId = typeof body.householdId === "string" ? body.householdId : "";
  const plantName = sanitizeText(body.plantName, 90);
  const symptomNotes = sanitizeText(body.symptomNotes, 600);
  const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
  if (!uuidLike.test(householdId) || !plantName) return json(400, { error: "Plant name and household are required." });
  let image: ReturnType<typeof requireProcessedImage>;
  try { image = requireProcessedImage(imageDataUrl); }
  catch (error) { return imageErrorResponse(error as ImageUploadError, body.language); }

  try {
    const result = await runAiOperation(apiKey, {
      actorId: auth.user.id, householdId, kind: "diagnosis", retryKey: body.operationKey,
      image, promptVersion: productionDiagnosisPromptVersion, timeoutMs: 30_000,
      payload: buildProductionDiagnosisPayload(plantName, imageDataUrl, body.language, symptomNotes),
      parse: (payload) => {
        const diagnosis = parseDiagnosis(extractOutputText(payload));
        if (!diagnosis) throw new AiOperationError(502, "AI_INVALID_RESULT", "AI returned incomplete diagnosis data.");
        return { diagnosis };
      },
    });
    return json(200, result);
  } catch (error) { return aiErrorResponse(error, body.language); }
}));
