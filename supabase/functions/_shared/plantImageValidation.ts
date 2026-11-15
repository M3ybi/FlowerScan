import { runAiOperation, type SafetyOperationContext } from "./aiOperation.ts";
import { isImageUploadValidationPayload, isImageUploadAllowed } from "../../../src/lib/imageUploadValidationRules.ts";
import { ImageUploadError } from "./imageUpload.ts";
import { buildAiLanguageInstruction } from "../../../src/lib/onboarding.ts";
import { imageSafetyPrompt, imageSafetyPromptVersion, imageSafetySchema } from "./imageSafetyPolicy.ts";

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
    ...context, promptVersion: context.evaluationInputKey ? `${imageSafetyPromptVersion}:evaluation-v1` : imageSafetyPromptVersion, timeoutMs: 15_000,
    payload: {
        instructions: buildAiLanguageInstruction(language),
        input: [
          {
            content: [
              {
                text:
                  imageSafetyPrompt,
                type: "input_text",
              },
              { detail: "high", image_url: imageDataUrl, type: "input_image" },
            ],
            role: "user",
          },
        ],
        max_output_tokens: 700,
        text: { format: { name: "plant_image_upload_validation", schema: imageSafetySchema, strict: true, type: "json_schema" } },
    },
    parse: payload => {
      const parsed: unknown = JSON.parse(extractOutputText(payload));
      if (!isImageUploadValidationPayload(parsed)) throw new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503);
      return { validation: isImageUploadAllowed(parsed) ? parsed : null };
    },
  });
  return isImageUploadValidationPayload(result.validation) && isImageUploadAllowed(result.validation) ? result.validation : null;
};
