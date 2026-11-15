import { runAiOperation, type SafetyOperationContext } from "./aiOperation.ts";
import { isImageUploadValidationPayload, isImageUploadAllowed } from "../../../src/lib/imageUploadValidationRules.ts";
import { ImageUploadError } from "./imageUpload.ts";
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

export const validateImageSafety = async (apiKey: string, imageDataUrl: string, language: unknown, context: SafetyOperationContext) => {
  const result = await runAiOperation(apiKey, {
    ...context, promptVersion: "plant-image-safety-v1", timeoutMs: 15_000,
    payload: {
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
        text: { format: { name: "plant_image_upload_validation", schema: validationSchema, strict: true, type: "json_schema" } },
    },
    parse: payload => {
      const parsed: unknown = JSON.parse(extractOutputText(payload));
      if (!isImageUploadValidationPayload(parsed)) throw new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503);
      return { validation: isImageUploadAllowed(parsed) ? parsed : null };
    },
  });
  return result.validation;
};
