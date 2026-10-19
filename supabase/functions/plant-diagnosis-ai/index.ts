import { observeOperation } from "../_shared/observability.ts";
import { readImageRequest, requireProcessedImage, imageErrorResponse, ImageUploadError, imageNetworkError, imageProviderFailure } from "../_shared/imageUpload.ts";
import { createServiceClient, requireUser } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { buildAiLanguageInstruction } from "../../../src/lib/onboarding.ts";
import { requireImageAdmission } from "../_shared/imageAdmission.ts";

const diagnosisSchema = {
  additionalProperties: false,
  properties: {
    diagnosis_title: { type: "string" },
    confidence: { maximum: 100, minimum: 0, type: "integer" },
    confidence_label: { enum: ["low", "medium", "high"], type: "string" },
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
  const confidence = parsed.confidence;
  const observedSymptoms = Array.isArray(parsed.observed_symptoms)
    ? parsed.observed_symptoms.map((item) => sanitizeText(item, 160)).filter(Boolean).slice(0, 8)
    : [];
  const recommendedSteps = Array.isArray(parsed.recommended_steps)
    ? parsed.recommended_steps.map((item) => sanitizeText(item, 220)).filter(Boolean).slice(0, 8)
    : [];

  if (
    typeof confidence !== "number" || !Number.isInteger(confidence) || confidence < 0 || confidence > 100 ||
    observedSymptoms.length === 0 ||
    recommendedSteps.length === 0 ||
    (parsed.confidence_label !== "low" && parsed.confidence_label !== "medium" && parsed.confidence_label !== "high") ||
    (parsed.risk_level !== "low" && parsed.risk_level !== "medium" && parsed.risk_level !== "high")
  ) {
    return null;
  }

  const diagnosis = {
    confidence,
    confidence_label: parsed.confidence_label,
    diagnosis_title: sanitizeText(parsed.diagnosis_title, 140),
    disclaimer: sanitizeText(parsed.disclaimer, 240),
    observed_symptoms: observedSymptoms,
    reasoning_summary: sanitizeText(parsed.reasoning_summary, 800),
    recommended_steps: recommendedSteps,
    risk_level: parsed.risk_level,
  };

  return diagnosis.diagnosis_title && diagnosis.reasoning_summary && diagnosis.disclaimer ? diagnosis : null;
};

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
  try { requireProcessedImage(imageDataUrl); }
  catch (error) { return imageErrorResponse(error as ImageUploadError, body.language); }

  try { await requireImageAdmission(() => auth.client.rpc("admit_image_operation", { requested_operation: "diagnosis" })); }
  catch (error) { return imageErrorResponse(error as ImageUploadError, body.language); }

  const { data: reservationId, error: reservationError } = await auth.client.rpc("reserve_ai_analyze_usage", {
    analyze_type: "plant_unwell_ai_analyze",
    generation_source: "plant_unwell_flow",
    target_household_id: householdId,
  });
  if (reservationError) return json(403, { error: reservationError.message || "AI analyze limit reached." });

  const serviceClient = createServiceClient();
  const releaseReservation = async () => {
    if (!reservationId) return;
    try {
      const { error } = await serviceClient.rpc("release_ai_analyze_reservation", {
        analyze_type: "plant_unwell_ai_analyze", reservation_id: reservationId, target_household_id: householdId,
      });
      if (error) console.warn("Diagnosis reservation cleanup failed", { code: "DIAGNOSIS_RESERVATION_RELEASE_FAILED" });
    } catch {
      console.warn("Diagnosis reservation cleanup failed", { code: "DIAGNOSIS_RESERVATION_RELEASE_FAILED" });
    }
  };
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      body: JSON.stringify({
        instructions: buildAiLanguageInstruction(body.language),
        input: [{
          content: [
            { text: "Diagnose the houseplant problem from the affected part shown in the photo. Return only JSON matching the schema. Keep the response concise: at most 5 short observed symptoms, 5 short recommended steps and 3 sentences of reasoning. Be cautious: lower confidence and state uncertainty when the photo or symptoms are unclear. Do not state a definitive diagnosis without visual evidence.", type: "input_text" },
            { text: `Plant: ${plantName}`, type: "input_text" },
            ...(symptomNotes ? [{ text: `User notes: ${symptomNotes}`, type: "input_text" }] : []),
            { detail: "high", image_url: imageDataUrl, type: "input_image" },
          ],
          role: "user",
        }],
        max_output_tokens: 2400,
        model: Deno.env.get("OPENAI_MODEL") || "gpt-4o",
        text: { format: { name: "plant_problem_diagnosis", schema: diagnosisSchema, strict: true, type: "json_schema" } },
      }),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(30_000),
    });

  } catch (error) {
    if (reservationId) {
      await releaseReservation();
    }
    return imageErrorResponse(imageNetworkError(error), body.language);
  }

  if (!response.ok) {
    console.error("Supabase diagnosis AI request failed", { status: response.status, userIdPrefix: `${auth.user.id.slice(0, 8)}...` });
    if (reservationId) {
      await releaseReservation();
    }
    return imageErrorResponse(await imageProviderFailure(response), body.language);
  }

  try {
    const payload = await response.json();
    if (payload.status === "incomplete" || payload.status === "failed") {
      console.error("Diagnosis provider returned no complete result", { status: payload.status });
      if (reservationId) {
        await releaseReservation();
      }
      return imageErrorResponse(new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503), body.language);
    }
    const diagnosis = parseDiagnosis(extractOutputText(payload));
    if (!diagnosis) {
      if (reservationId) {
        await releaseReservation();
      }
      return json(502, { error: "AI returned incomplete diagnosis data." });
    }
    if (reservationId) {
      const { error: commitError } = await serviceClient.rpc("commit_ai_analyze_usage", {
        analyze_type: "plant_unwell_ai_analyze",
        generation_source: "plant_unwell_flow",
        reservation_id: reservationId,
        target_household_id: householdId,
      });
      if (commitError) {
        await releaseReservation();
        return json(409, { error: "AI analyze usage could not be recorded." });
      }
    }
    return json(200, { diagnosis });
  } catch {
    if (reservationId) {
      await releaseReservation();
    }
    return json(502, { error: "AI returned invalid JSON." });
  }
}));
