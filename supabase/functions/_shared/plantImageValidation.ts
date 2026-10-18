import { isImageUploadValidationPayload, isImageUploadAllowed } from "../../../src/lib/imageUploadValidationRules.ts";
import { ImageUploadError, imageNetworkError, imageProviderFailure } from "./imageUpload.ts";
import { buildAiLanguageInstruction } from "../../../src/lib/onboarding.ts";
const validationSchema = {
  additionalProperties: false,
  properties: {
    containsPlant: { type: "boolean" },
    plantConfidence: { maximum: 1, minimum: 0, type: "number" },
    hasSensitiveBackground: { type: "boolean" },
    hasExplicitOrUnsafeContent: { type: "boolean" },
    hasRestrictedFootageOrPrivateContent: { type: "boolean" },
    shouldAllowUpload: { type: "boolean" },
    failureReasons: { items: { type: "string" }, type: "array" },
    safeUserMessage: { type: "string" },
  },
  required: [
    "containsPlant",
    "plantConfidence",
    "hasSensitiveBackground",
    "hasExplicitOrUnsafeContent",
    "hasRestrictedFootageOrPrivateContent",
    "shouldAllowUpload",
    "failureReasons",
    "safeUserMessage",
  ],
  type: "object",
};

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

export const validateImageSafety = async (apiKey: string, imageDataUrl: string, language: unknown) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      body: JSON.stringify({
        instructions: buildAiLanguageInstruction(language),
        input: [
          {
            content: [
              {
                text:
                  "You are a strict image safety validator for Plantie, a plant-care app. Analyze the entire uploaded image before it is stored. The image must clearly contain a plant, tree, flower, leaf, shrub, herb, crop, garden plant, houseplant, or similar botanical subject. Reject images with people, faces, children, readable personal data, IDs, documents, mail, bills, screens, emails, chats, QR codes, barcodes, license plates, explicit content, unsafe content, private or restricted footage, confidential information, weapons, drugs, gore, self-harm, hate symbols, or anything inappropriate for a plant-care app. Be conservative. If uncertain, reject. Return only valid JSON using the required schema. Do not include markdown, prose, explanations, or extra fields.",
                type: "input_text",
              },
              { detail: "high", image_url: imageDataUrl, type: "input_image" },
            ],
            role: "user",
          },
        ],
        max_output_tokens: 700,
        model: Deno.env.get("OPENAI_MODEL") || "gpt-4o",
        text: { format: { name: "plant_image_upload_validation", schema: validationSchema, strict: true, type: "json_schema" } },
      }),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error("Validated image upload AI request failed", { status: response.status });
      return await imageProviderFailure(response);
    }

    const parsed = JSON.parse(extractOutputText(await response.json())) as unknown;
    if (!isImageUploadValidationPayload(parsed)) return new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503);
    return isImageUploadAllowed(parsed) ? parsed : null;
  } catch (error) {
    console.error("Validated image upload failed closed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return error instanceof SyntaxError ? new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503) : imageNetworkError(error);
  } finally {
    clearTimeout(timeoutId);
  }
};

