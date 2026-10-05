import type { Handler } from "@netlify/functions";
import { buildAiLanguageInstruction } from "../../src/lib/onboarding.js";

type CareTone = "green" | "amber" | "blue" | "rose";
type IdentificationConfidence = "confident" | "likely" | "needs-confirmation";

type AiCareProfile = {
  displayName: string;
  likelyName: string;
  identificationConfidence: IdentificationConfidence;
  shortCare: string;
  carePills: {
    label: string;
    value: string;
    tone: CareTone;
  }[];
  light: string;
  watering: string;
  wateringIntervalDays: number;
  soil: string;
  careTips: string[];
  identificationNote: string;
};

const headers = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8",
};

const careSchema = {
  additionalProperties: false,
  properties: {
    displayName: {
      description: "Final short localized plant name for the UI, based on image identification and the supplied name.",
      type: "string",
    },
    likelyName: {
      description: "Most likely botanical or cultivar name. Prefer the safest species or genus if cultivar identification is uncertain.",
      type: "string",
    },
    identificationConfidence: {
      enum: ["confident", "likely", "needs-confirmation"],
      type: "string",
    },
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
    careTips: {
      items: { type: "string" },
      type: "array",
    },
    identificationNote: { type: "string" },
  },
  required: [
    "displayName",
    "likelyName",
    "identificationConfidence",
    "shortCare",
    "carePills",
    "light",
    "watering",
    "wateringIntervalDays",
    "soil",
    "careTips",
    "identificationNote",
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

const parseCareProfile = (outputText: string): AiCareProfile | null => {
  const parsed = JSON.parse(outputText) as Partial<AiCareProfile>;
  const displayName = sanitizeText(parsed.displayName, 70);
  const likelyName = sanitizeText(parsed.likelyName, 100);
  const shortCare = sanitizeText(parsed.shortCare, 240);
  const light = sanitizeText(parsed.light, 260);
  const watering = sanitizeText(parsed.watering, 260);
  const soil = sanitizeText(parsed.soil, 240);
  const identificationNote = sanitizeText(parsed.identificationNote, 260);
  const wateringIntervalDays = Number(parsed.wateringIntervalDays);
  const confidence = parsed.identificationConfidence;

  if (
    !displayName ||
    !likelyName ||
    !shortCare ||
    !light ||
    !watering ||
    !soil ||
    !identificationNote ||
    !Number.isInteger(wateringIntervalDays) ||
    wateringIntervalDays < 2 ||
    wateringIntervalDays > 60 ||
    (confidence !== "confident" && confidence !== "likely" && confidence !== "needs-confirmation")
  ) {
    return null;
  }

  if (!Array.isArray(parsed.carePills) || parsed.carePills.length !== 5) {
    return null;
  }

  const carePills = parsed.carePills.map((pill) => ({
    label: sanitizeText(pill.label, 40),
    value: sanitizeText(pill.value, 55),
    tone: pill.tone,
  }));

  const hasValidPills = carePills.every(
    (pill) =>
      pill.label &&
      pill.value &&
      (pill.tone === "green" || pill.tone === "amber" || pill.tone === "blue" || pill.tone === "rose"),
  );

  const careTips = Array.isArray(parsed.careTips) ? parsed.careTips.map((tip) => sanitizeText(tip, 150)).filter(Boolean) : [];

  if (new Set(carePills.map((pill) => pill.label)).size !== 5 || !hasValidPills || careTips.length !== 3) {
    return null;
  }

  return {
    carePills,
    careTips,
    displayName,
    identificationConfidence: confidence,
    identificationNote,
    light,
    likelyName,
    shortCare,
    soil,
    watering,
    wateringIntervalDays,
  };
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
    return { body: JSON.stringify({ error: "OPENAI_API_KEY is not configured." }), headers, statusCode: 503 };
  }

  let body: { imageDataUrl?: string; language?: unknown; plantName?: string };

  try {
    body = JSON.parse(event.body || "{}") as { imageDataUrl?: string; language?: unknown; plantName?: string };
  } catch {
    return { body: JSON.stringify({ error: "Invalid JSON body." }), headers, statusCode: 400 };
  }

  const plantName = typeof body.plantName === "string" ? body.plantName.trim().slice(0, 90) : "";
  const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";

  if (!plantName || !imageDataUrl.startsWith("data:image/")) {
    return { body: JSON.stringify({ error: "Plant name and image are required." }), headers, statusCode: 400 };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      instructions: buildAiLanguageInstruction(body.language),
      input: [
        {
          content: [
            {
              text:
                "Identify the houseplant from its photo and supplied name. Return only JSON matching the schema. displayName must be a short localized name for the UI, not merely a copy of the supplied name. likelyName should be the botanical name or safest likely genus/species. If uncertain, avoid presenting a cultivar as fact and lower identificationConfidence. Give care suitable for ordinary indoor conditions. Calculate a practical average watering interval in days based on the plant and its substrate drying needs. Include exactly five carePills for light, watering, humidity, difficulty, and repotting; localize their labels and all user-facing values. Include exactly three concise practical care tips. Use a specific profile when the photo or name allows accurate identification.", type: "input_text",
            },
            { text: `User-provided name: ${plantName}`, type: "input_text" },
            { detail: "high", image_url: imageDataUrl, type: "input_image" },
          ],
          role: "user",
        },
      ],
      max_output_tokens: 1400,
      model: process.env.OPENAI_MODEL || "gpt-4o",
      text: {
        format: {
          name: "plant_care_profile",
          schema: careSchema,
          strict: true,
          type: "json_schema",
        },
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    return {
      body: JSON.stringify({
        error: "AI request failed.",
        details: details.slice(0, 500),
      }),
      headers,
      statusCode: 502,
    };
  }

  const data = await response.json();
  const outputText = extractOutputText(data);

  if (!outputText) {
    return { body: JSON.stringify({ error: "AI did not return care data." }), headers, statusCode: 502 };
  }

  try {
    const care = parseCareProfile(outputText);

    if (!care) {
      return { body: JSON.stringify({ error: "AI returned incomplete or invalid care data." }), headers, statusCode: 502 };
    }

    return {
      body: JSON.stringify({ care }),
      headers,
      statusCode: 200,
    };
  } catch {
    return { body: JSON.stringify({ error: "AI returned invalid JSON." }), headers, statusCode: 502 };
  }
};
