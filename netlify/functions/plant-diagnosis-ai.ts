import type { Handler } from "@netlify/functions";

const headers = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8",
};

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
  required: [
    "diagnosis_title",
    "confidence",
    "confidence_label",
    "reasoning_summary",
    "observed_symptoms",
    "recommended_steps",
    "risk_level",
    "disclaimer",
  ],
  type: "object",
};

const extractOutputText = (response: unknown) => {
  const outputText = (response as { output_text?: unknown }).output_text;
  if (typeof outputText === "string") {
    return outputText;
  }

  const output = (response as { output?: unknown[] }).output;
  if (!Array.isArray(output)) {
    return "";
  }

  for (const item of output) {
    const content = (item as { content?: unknown[] }).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      const text = (contentItem as { text?: unknown }).text;
      if (typeof text === "string") {
        return text;
      }
    }
  }

  return "";
};

const sanitizeText = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";

const parseDiagnosis = (outputText: string) => {
  const parsed = JSON.parse(outputText) as {
    diagnosis_title?: unknown;
    confidence?: unknown;
    confidence_label?: unknown;
    reasoning_summary?: unknown;
    observed_symptoms?: unknown;
    recommended_steps?: unknown;
    risk_level?: unknown;
    disclaimer?: unknown;
  };
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

  if (!diagnosis.diagnosis_title || !diagnosis.reasoning_summary) {
    return null;
  }

  return diagnosis;
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { headers, statusCode: 204 };
  }

  if (event.httpMethod !== "POST") {
    return { body: JSON.stringify({ error: "Method not allowed" }), headers, statusCode: 405 };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { body: JSON.stringify({ error: "AI diagnostic service is not configured." }), headers, statusCode: 503 };
  }

  let body: { imageDataUrl?: string; plantName?: string };
  try {
    body = JSON.parse(event.body || "{}") as { imageDataUrl?: string; plantName?: string };
  } catch {
    return { body: JSON.stringify({ error: "Invalid JSON body." }), headers, statusCode: 400 };
  }

  const plantName = typeof body.plantName === "string" ? body.plantName.trim().slice(0, 90) : "";
  const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
  const isSupportedImage = /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(imageDataUrl);

  if (!plantName || !isSupportedImage || imageDataUrl.length > 1_600_000) {
    return { body: JSON.stringify({ error: "Valid plant name and image are required." }), headers, statusCode: 400 };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: [
        {
          content: [
            {
              text:
                "Diagnostikuj problém izbovej rastliny podľa fotky postihnutej časti. Odpovedz po slovensky a vráť iba JSON podľa schémy. Buď opatrný: ak fotka nie je jasná alebo symptómy nie sú jednoznačné, zníž confidence a explicitne uveď neistotu. Neuvádzaj definitívnu diagnózu bez vizuálnych dôkazov. recommended_steps musia byť praktické, bezpečné a vhodné pre bežnú domácu starostlivosť. observed_symptoms musia popisovať iba to, čo vidíš na fotke.",
              type: "input_text",
            },
            { text: `Rastlina: ${plantName}`, type: "input_text" },
            { detail: "high", image_url: imageDataUrl, type: "input_image" },
          ],
          role: "user",
        },
      ],
      max_output_tokens: 1200,
      model: process.env.OPENAI_MODEL || "gpt-4o",
      text: {
        format: {
          name: "plant_problem_diagnosis",
          schema: diagnosisSchema,
          strict: true,
          type: "json_schema",
        },
      },
    }),
  });

  if (!response.ok) {
    console.error("Plant diagnosis AI request failed", { status: response.status });
    return { body: JSON.stringify({ error: "AI diagnosis failed." }), headers, statusCode: 502 };
  }

  const data = await response.json();
  const outputText = extractOutputText(data);

  if (!outputText) {
    return { body: JSON.stringify({ error: "AI did not return diagnosis data." }), headers, statusCode: 502 };
  }

  try {
    const diagnosis = parseDiagnosis(outputText);
    if (!diagnosis) {
      return { body: JSON.stringify({ error: "AI returned incomplete diagnosis data." }), headers, statusCode: 502 };
    }

    return { body: JSON.stringify({ diagnosis }), headers, statusCode: 200 };
  } catch {
    return { body: JSON.stringify({ error: "AI returned invalid JSON." }), headers, statusCode: 502 };
  }
};
