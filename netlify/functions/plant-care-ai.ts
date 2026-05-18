import type { Handler } from "@netlify/functions";

type CareTone = "green" | "amber" | "blue" | "rose";
type IdentificationConfidence = "confident" | "likely" | "needs-confirmation";

type AiCareProfile = {
  displayName: string;
  likelyName: string;
  identificationConfidence: IdentificationConfidence;
  shortCare: string;
  carePills: {
    label: "Svetlo" | "Zálievka" | "Vlhkosť" | "Náročnosť" | "Presádzanie";
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
      description: "Finálny krátky slovenský názov rastliny pre UI, podľa AI identifikácie z fotky a vstupného názvu.",
      type: "string",
    },
    likelyName: {
      description: "Najpravdepodobnejší botanický alebo kultivarový názov. Ak kultivar nie je istý, uveď bezpečnejší druh/rod.",
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
          label: { enum: ["Svetlo", "Zálievka", "Vlhkosť", "Náročnosť", "Presádzanie"], type: "string" },
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

const requiredPillLabels = ["Svetlo", "Zálievka", "Vlhkosť", "Náročnosť", "Presádzanie"];

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
    label: pill.label,
    value: sanitizeText(pill.value, 55),
    tone: pill.tone,
  }));

  const hasRequiredPills = requiredPillLabels.every((label) => carePills.some((pill) => pill.label === label));
  const hasValidPills = carePills.every(
    (pill) =>
      requiredPillLabels.includes(pill.label) &&
      pill.value &&
      (pill.tone === "green" || pill.tone === "amber" || pill.tone === "blue" || pill.tone === "rose"),
  );

  const careTips = Array.isArray(parsed.careTips) ? parsed.careTips.map((tip) => sanitizeText(tip, 150)).filter(Boolean) : [];

  if (!hasRequiredPills || !hasValidPills || careTips.length !== 3) {
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

  let body: { imageDataUrl?: string; plantName?: string };

  try {
    body = JSON.parse(event.body || "{}") as { imageDataUrl?: string; plantName?: string };
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
      input: [
        {
          content: [
            {
              text:
                "Identifikuj izbovú rastlinu z fotografie a vstupného názvu. Vráť len JSON podľa schémy. displayName musí byť finálny krátky slovenský názov podľa tvojho rozhodnutia, nie slepé zopakovanie používateľského názvu. likelyName musí byť botanický názov alebo najbezpečnejší rod/druh. Ak si nie si istý, nepíš presný kultivar ako fakt a nastav identificationConfidence na likely alebo needs-confirmation. Starostlivosť musí byť konkrétna pre identifikovanú rastlinu v bežných interiérových podmienkach na Slovensku. wateringIntervalDays vypočítaj podľa rastliny, typu rastu a nárokov na presychanie substrátu; musí to byť praktický priemer v dňoch, nie všeobecný text. carePills musia obsahovať presne položky Svetlo, Zálievka, Vlhkosť, Náročnosť a Presádzanie. careTips musia obsahovať presne 3 krátke praktické tipy. Nepouži všeobecný profil, ak fotka alebo názov umožňujú presnejšiu identifikáciu.",
              type: "input_text",
            },
            { text: `Názov od používateľa: ${plantName}`, type: "input_text" },
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
