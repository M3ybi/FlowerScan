import type { Handler } from "@netlify/functions";

const headers = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8",
};

const careSchema = {
  additionalProperties: false,
  properties: {
    likelyName: { type: "string" },
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
    wateringIntervalDays: { maximum: 45, minimum: 2, type: "integer" },
    soil: { type: "string" },
    careTips: {
      items: { type: "string" },
      maxItems: 3,
      minItems: 3,
      type: "array",
    },
    identificationNote: { type: "string" },
  },
  required: [
    "likelyName",
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

  const body = JSON.parse(event.body || "{}") as { imageDataUrl?: string; plantName?: string };
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
                "Vygeneruj starostlivosť o izbovú rastlinu po slovensky. Použi zadaný názov ako hlavný názov používateľa, z fotky a názvu odhadni botanický/pravdepodobný názov. Vráť len JSON podľa schémy. Existujúce rastliny v aplikácii neupravuj.",
              type: "input_text",
            },
            { text: `Názov od používateľa: ${plantName}`, type: "input_text" },
            { image_url: imageDataUrl, type: "input_image" },
          ],
          role: "user",
        },
      ],
      max_output_tokens: 900,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
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
    return {
      body: JSON.stringify({ error: "AI request failed." }),
      headers,
      statusCode: 502,
    };
  }

  const data = await response.json();
  const outputText = extractOutputText(data);

  if (!outputText) {
    return { body: JSON.stringify({ error: "AI did not return care data." }), headers, statusCode: 502 };
  }

  return { body: JSON.stringify({ care: JSON.parse(outputText) }), headers, statusCode: 200 };
};
