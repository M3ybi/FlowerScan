import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/cors.ts";

const requiredPillLabels = ["Svetlo", "Zálievka", "Vlhkosť", "Náročnosť", "Presádzanie"];

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
          label: { enum: requiredPillLabels, type: "string" },
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
    requiredPillLabels.every((label) => carePills.some((pill) => pill.label === label)) &&
    carePills.every((pill) => ["green", "amber", "blue", "rose"].includes(pill.tone) && pill.value);

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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 204 });
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json(503, { error: "OPENAI_API_KEY is not configured." });

  const auth = await requireUser(request.headers.get("authorization") ?? "");
  if (!auth) return json(401, { error: "Authentication is required." });

  let body: { generationSource?: string; householdId?: string; imageDataUrl?: string; plantId?: string; plantName?: string };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const householdId = typeof body.householdId === "string" ? body.householdId : "";
  const plantId = typeof body.plantId === "string" ? body.plantId : "";
  const generationSource = body.generationSource === "manual_refresh" ? "manual_refresh" : "initial_plant_add";
  const plantName = sanitizeText(body.plantName, 90);
  const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
  if (!uuidLike.test(householdId) || !plantName || !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(imageDataUrl) || imageDataUrl.length > 1_600_000) {
    return json(400, { error: "Plant name and image are required." });
  }

  if (generationSource === "initial_plant_add") {
    const { error } = await auth.client.rpc("assert_can_add_plant", { target_household_id: householdId });
    if (error) return json(403, { error: error.message || "Plant limit reached." });
  } else {
    if (!uuidLike.test(plantId)) return json(400, { error: "Plant ID is required for care tip refresh." });
    const { error } = await auth.client.rpc("assert_can_generate_care_tip", {
      generation_source: generationSource,
      target_household_id: householdId,
      target_plant_id: plantId,
    });
    if (error) return json(403, { error: error.message || "AI care tip limit reached." });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    body: JSON.stringify({
      input: [{
        content: [
          { text: "Identifikuj izbovú rastlinu z fotografie a vstupného názvu. Vráť iba JSON podľa schémy. Starostlivosť musí byť konkrétna pre bežné interiérové podmienky na Slovensku.", type: "input_text" },
          { text: `Názov od používateľa: ${plantName}`, type: "input_text" },
          { detail: "high", image_url: imageDataUrl, type: "input_image" },
        ],
        role: "user",
      }],
      max_output_tokens: 1400,
      model: Deno.env.get("OPENAI_MODEL") || "gpt-4o",
      text: { format: { name: "plant_care_profile", schema: careSchema, strict: true, type: "json_schema" } },
    }),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    console.error("Supabase care AI request failed", { status: response.status, userIdPrefix: `${auth.user.id.slice(0, 8)}...` });
    return json(502, { error: "AI request failed." });
  }

  try {
    const care = parseCare(extractOutputText(await response.json()));
    if (!care) return json(502, { error: "AI returned incomplete or invalid care data." });
    if (generationSource === "manual_refresh") {
      const { error } = await auth.client.rpc("record_care_tip_generation", {
        generation_source: generationSource,
        target_household_id: householdId,
        target_plant_id: plantId,
      });
      if (error) return json(409, { error: "AI care tip usage could not be recorded." });
    }
    return json(200, { care });
  } catch {
    return json(502, { error: "AI returned invalid JSON." });
  }
});
