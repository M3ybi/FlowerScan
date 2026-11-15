import { sanitizeBotanicalText as sanitizeText } from "./botanicalResponse.ts";

export const careSchema = {
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

export const parseCare = (outputText: string) => {
  const parsed = JSON.parse(outputText) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
    || typeof parsed.wateringIntervalDays !== "number"
    || !Array.isArray(parsed.careTips) || parsed.careTips.some(tip => typeof tip !== "string")
    || !Array.isArray(parsed.carePills) || parsed.carePills.some(pill => !pill || typeof pill !== "object" || Array.isArray(pill))) return null;
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

