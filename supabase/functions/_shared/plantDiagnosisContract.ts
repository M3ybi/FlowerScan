import { sanitizeBotanicalText as sanitizeText } from "./botanicalResponse.ts";

export const diagnosisSchema = {
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

export const parseDiagnosis = (outputText: string) => {
  const parsed = JSON.parse(outputText) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
    || !Array.isArray(parsed.observed_symptoms) || parsed.observed_symptoms.some(item => typeof item !== "string")
    || !Array.isArray(parsed.recommended_steps) || parsed.recommended_steps.some(item => typeof item !== "string")) return null;
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
