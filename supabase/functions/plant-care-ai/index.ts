import { runAiOperation, AiOperationError, aiErrorResponse } from "../_shared/aiOperation.ts";
import { observeOperation } from "../_shared/observability.ts";
import { readImageRequest, requireProcessedImage, imageErrorResponse, ImageUploadError } from "../_shared/imageUpload.ts";
import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { buildAiLanguageInstruction } from "../../../src/lib/onboarding.ts";


const careSchema = {
  additionalProperties: false,
  properties: {
    displayName: { type: "string" },
    likelyName: { type: "string" },
    identificationConfidence: { enum: ["confident", "likely", "needs-confirmation"], type: "string" },
    shortCare: { type: "string" },
    carePills: {
      items: {
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          value: { type: "string" },
          tone: { enum: ["green", "amber", "blue", "rose"], type: "string" },
        },
        required: ["label", "value", "tone"],
        type: "object",
      },
      type: "array",
    },
    light: { type: "string" },
    watering: { type: "string" },
    wateringIntervalDays: { maximum: 60, minimum: 2, type: "integer" },
    soil: { type: "string" },
    careTips: { items: { type: "string" }, type: "array" },
    identificationNote: { type: "string" },
  },
  required: ["displayName", "likelyName", "identificationConfidence", "shortCare", "carePills", "light", "watering", "wateringIntervalDays", "soil", "careTips", "identificationNote"],
  type: "object",
};

const sanitizeText = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";

const extractOutputText = (response: unknown) => {
  const outputText = (response as { output_text?: unknown }).output_text;
  if (typeof outputText === "string") return outputText;
  const output = (response as { output?: unknown[] }).output;
  if (!Array.isArray(output)) return "";
  for (const item of output) {
    const content = (item as { content?: unknown[] }).content;
    if (!Array.isArray(content)) continue;
    for (const contentItem of content) {
      const text = (contentItem as { text?: unknown }).text;
      if (typeof text === "string") return text;
    }
  }
  return "";
};

const parseCare = (outputText: string) => {
  const parsed = JSON.parse(outputText) as Record<string, unknown>;
  const carePills = Array.isArray(parsed.carePills)
    ? parsed.carePills.map((pill) => ({
        label: sanitizeText((pill as { label?: unknown }).label, 40),
        tone: sanitizeText((pill as { tone?: unknown }).tone, 20),
        value: sanitizeText((pill as { value?: unknown }).value, 55),
      }))
    : [];
  const careTips = Array.isArray(parsed.careTips) ? parsed.careTips.map((tip) => sanitizeText(tip, 150)).filter(Boolean).slice(0, 3) : [];
  const wateringIntervalDays = Number(parsed.wateringIntervalDays);
  const identificationConfidence = sanitizeText(parsed.identificationConfidence, 32);
  const care = {
    carePills,
    careTips,
    displayName: sanitizeText(parsed.displayName, 70),
    identificationConfidence,
    identificationNote: sanitizeText(parsed.identificationNote, 260),
    light: sanitizeText(parsed.light, 260),
    likelyName: sanitizeText(parsed.likelyName, 100),
    shortCare: sanitizeText(parsed.shortCare, 240),
    soil: sanitizeText(parsed.soil, 240),
    watering: sanitizeText(parsed.watering, 260),
    wateringIntervalDays,
  };

  const hasValidPills =
    carePills.length === 5 &&
    new Set(carePills.map((pill) => pill.label)).size === 5 &&
    carePills.every((pill) => pill.label && ["green", "amber", "blue", "rose"].includes(pill.tone) && pill.value);

  if (
    !care.displayName ||
    !care.likelyName ||
    !care.shortCare ||
    !care.light ||
    !care.watering ||
    !care.soil ||
    !care.identificationNote ||
    !Number.isInteger(wateringIntervalDays) ||
    wateringIntervalDays < 2 ||
    wateringIntervalDays > 60 ||
    !["confident", "likely", "needs-confirmation"].includes(identificationConfidence) ||
    !hasValidPills ||
    careTips.length !== 3
  ) {
    return null;
  }

  return care;
};

const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(observeOperation("plant_care", async (request) => {
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
  const plantId = typeof body.plantId === "string" ? body.plantId : "";
  const generationSource = body.generationSource === undefined ? "initial_plant_add" : body.generationSource;
  if (generationSource !== "initial_plant_add" && generationSource !== "manual_refresh") return json(400, { error: "Invalid generation source." });
  const plantName = sanitizeText(body.plantName, 90);
  const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
  if (!uuidLike.test(householdId) || !plantName) return json(400, { error: "Plant name and household are required." });
  let image: ReturnType<typeof requireProcessedImage>;
  try { image = requireProcessedImage(imageDataUrl); }
  catch (error) { return imageErrorResponse(error as ImageUploadError, body.language); }

  if (generationSource === "manual_refresh" && !uuidLike.test(plantId)) return json(400, { error: "Plant ID is required for care tip refresh." });

  try {
    const result = await runAiOperation(apiKey, {
      actorId: auth.user.id, householdId, plantId: generationSource === "manual_refresh" ? plantId : undefined,
      kind: generationSource === "manual_refresh" ? "care_refresh" : "initial_care", retryKey: body.operationKey,
      image, promptVersion: "plant-care-v1", timeoutMs: 30_000,
      payload: {
        instructions: buildAiLanguageInstruction(body.language),
        input: [{
          content: [
            { text: "Identify the houseplant from its photo and supplied name. Return only JSON matching the schema. Localize all user-facing string values, including the display name, care pill labels and values, care description, identification note, and care tips. Give care suitable for ordinary indoor conditions. Calculate a practical watering interval in days based on the plant and its substrate drying needs. Include exactly five carePills for light, watering, humidity, difficulty, and repotting, and exactly three concise practical care tips. Prefer a specific identification when supported by the photo or name.", type: "input_text" },
            { text: `User-provided name: ${plantName}`, type: "input_text" },
            { detail: "high", image_url: imageDataUrl, type: "input_image" },
          ],
          role: "user",
        }],
        max_output_tokens: 1400,
        text: { format: { name: "plant_care_profile", schema: careSchema, strict: true, type: "json_schema" } },
      },
      parse: (payload) => {
        const care = parseCare(extractOutputText(payload));
        if (!care) throw new AiOperationError(502, "AI_INVALID_RESULT", "AI returned incomplete or invalid care data.");
        return { care };
      },
    });
    return json(200, result);
  } catch (error) { return aiErrorResponse(error, body.language); }
}));
