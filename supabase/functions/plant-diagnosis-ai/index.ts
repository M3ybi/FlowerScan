import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/cors.ts";

const diagnosisSchema = {
  additionalProperties: false,
  properties: {
    diagnosis_title: { type: "string" },
    confidence: { maximum: 100, minimum: 0, type: "integer" },
    confidence_label: { enum: ["nízka", "stredná", "vysoká"], type: "string" },
    reasoning_summary: { type: "string" },
    observed_symptoms: { items: { type: "string" }, type: "array" },
    recommended_steps: { items: { type: "string" }, type: "array" },
    risk_level: { enum: ["low", "medium", "high"], type: "string" },
    disclaimer: { type: "string" },
  },
  required: ["diagnosis_title", "confidence", "confidence_label", "reasoning_summary", "observed_symptoms", "recommended_steps", "risk_level", "disclaimer"],
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

const parseDiagnosis = (outputText: string) => {
  const parsed = JSON.parse(outputText) as Record<string, unknown>;
  const confidence = Number(parsed.confidence);
  const observedSymptoms = Array.isArray(parsed.observed_symptoms)
    ? parsed.observed_symptoms.map((item) => sanitizeText(item, 160)).filter(Boolean).slice(0, 8)
    : [];
  const recommendedSteps = Array.isArray(parsed.recommended_steps)
    ? parsed.recommended_steps.map((item) => sanitizeText(item, 220)).filter(Boolean).slice(0, 8)
    : [];

  if (
    !Number.isInteger(confidence) ||
    observedSymptoms.length === 0 ||
    recommendedSteps.length === 0 ||
    (parsed.confidence_label !== "nízka" && parsed.confidence_label !== "stredná" && parsed.confidence_label !== "vysoká") ||
    (parsed.risk_level !== "low" && parsed.risk_level !== "medium" && parsed.risk_level !== "high")
  ) {
    return null;
  }

  const diagnosis = {
    confidence: Math.max(0, Math.min(100, confidence)),
    confidence_label: parsed.confidence_label,
    diagnosis_title: sanitizeText(parsed.diagnosis_title, 140),
    disclaimer: sanitizeText(parsed.disclaimer, 240) || "AI diagnostika je iba odhad podľa fotografie.",
    observed_symptoms: observedSymptoms,
    reasoning_summary: sanitizeText(parsed.reasoning_summary, 800),
    recommended_steps: recommendedSteps,
    risk_level: parsed.risk_level,
  };

  return diagnosis.diagnosis_title && diagnosis.reasoning_summary ? diagnosis : null;
};

const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 204 });
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json(503, { error: "AI diagnostic service is not configured." });

  const auth = await requireUser(request.headers.get("authorization") ?? "");
  if (!auth) return json(401, { error: "Authentication is required." });

  let body: { householdId?: string; imageDataUrl?: string; plantName?: string; symptomNotes?: string };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const householdId = typeof body.householdId === "string" ? body.householdId : "";
  const plantName = sanitizeText(body.plantName, 90);
  const symptomNotes = sanitizeText(body.symptomNotes, 600);
  const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
  const isSupportedImage = /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(imageDataUrl);
  if (!uuidLike.test(householdId) || !plantName || !isSupportedImage || imageDataUrl.length > 1_600_000) {
    return json(400, { error: "Valid plant name and image are required." });
  }

  const { data: reservationId, error: reservationError } = await auth.client.rpc("reserve_ai_analyze_usage", {
    analyze_type: "plant_unwell_ai_analyze",
    generation_source: "plant_unwell_flow",
    target_household_id: householdId,
  });
  if (reservationError) return json(403, { error: reservationError.message || "AI analyze limit reached." });

  const response = await fetch("https://api.openai.com/v1/responses", {
    body: JSON.stringify({
      input: [{
        content: [
          { text: "Diagnostikuj problém izbovej rastliny podľa fotky postihnutej časti. Odpovedz po slovensky a vráť iba JSON podľa schémy. Buď opatrný a zníž confidence pri nejasnej fotke.", type: "input_text" },
          { text: `Rastlina: ${plantName}`, type: "input_text" },
          ...(symptomNotes ? [{ text: `Poznámky používateľa: ${symptomNotes}`, type: "input_text" }] : []),
          { detail: "high", image_url: imageDataUrl, type: "input_image" },
        ],
        role: "user",
      }],
      max_output_tokens: 1200,
      model: Deno.env.get("OPENAI_MODEL") || "gpt-4o",
      text: { format: { name: "plant_problem_diagnosis", schema: diagnosisSchema, strict: true, type: "json_schema" } },
    }),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    console.error("Supabase diagnosis AI request failed", { status: response.status, userIdPrefix: `${auth.user.id.slice(0, 8)}...` });
    if (reservationId) {
      await auth.client.rpc("release_ai_analyze_reservation", {
        analyze_type: "plant_unwell_ai_analyze",
        reservation_id: reservationId,
        target_household_id: householdId,
      }).catch(() => undefined);
    }
    return json(502, { error: "AI diagnosis failed." });
  }

  try {
    const diagnosis = parseDiagnosis(extractOutputText(await response.json()));
    if (!diagnosis) {
      if (reservationId) {
        await auth.client.rpc("release_ai_analyze_reservation", {
          analyze_type: "plant_unwell_ai_analyze",
          reservation_id: reservationId,
          target_household_id: householdId,
        }).catch(() => undefined);
      }
      return json(502, { error: "AI returned incomplete diagnosis data." });
    }
    if (reservationId) {
      const { error: commitError } = await auth.client.rpc("commit_ai_analyze_usage", {
        analyze_type: "plant_unwell_ai_analyze",
        generation_source: "plant_unwell_flow",
        reservation_id: reservationId,
        target_household_id: householdId,
      });
      if (commitError) return json(409, { error: "AI analyze usage could not be recorded." });
    }
    return json(200, { diagnosis });
  } catch {
    if (reservationId) {
      await auth.client.rpc("release_ai_analyze_reservation", {
        analyze_type: "plant_unwell_ai_analyze",
        reservation_id: reservationId,
        target_household_id: householdId,
      }).catch(() => undefined);
    }
    return json(502, { error: "AI returned invalid JSON." });
  }
});
