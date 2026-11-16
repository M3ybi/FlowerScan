import { runAiOperation, resolveSafetyConfiguration, type SafetyOperationContext } from "./aiOperation.ts";
import { isImageUploadValidationPayload, isImageUploadAllowed } from "../../../src/lib/imageUploadValidationRules.ts";
import { ImageUploadError } from "./imageUpload.ts";
import { buildImageSafetyPayload } from "./imageSafetyContract.ts";

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
  if (context.evaluationInputKey) throw new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503);
  const config = context.safetyConfiguration ?? await resolveSafetyConfiguration(context.actorId, context.householdId);
  const result = await runAiOperation(apiKey, {
    ...context, safetyConfiguration: config,
    promptVersion: config.promptVersion, timeoutMs: config.timeoutMs,
    payload: buildImageSafetyPayload(imageDataUrl, language, config.model === "gpt-6-luna"),
    parse: payload => {
      const parsed: unknown = JSON.parse(extractOutputText(payload));
      if (!isImageUploadValidationPayload(parsed)) throw new ImageUploadError("IMAGE_SERVICE_UNAVAILABLE", 503);
      return { validation: isImageUploadAllowed(parsed) ? parsed : null };
    },
  });
  return isImageUploadValidationPayload(result.validation) && isImageUploadAllowed(result.validation) ? result.validation : null;
};
