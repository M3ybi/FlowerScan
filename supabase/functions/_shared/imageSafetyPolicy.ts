import { imageUploadSafetyPolicy } from "../../../src/lib/imageUploadValidationRules.ts";

export { imageSafetyPromptVersion, imageSafetyPrompt, imageSafetySchema } from "./imageSafetyContract.ts";
import { imageSafetyPrompt, imageSafetySchema, lunaImageSafetyPrompt } from "./imageSafetyContract.ts";
import { getLunaConfiguration, modelConfigurationHash, type ModelConfiguration } from "./aiModelRegistry.ts";

// Receipts bind the configured model and actual prompt/schema/decision policy.
// This digest contains no user data or signing material.
export const imageSafetyPolicyFingerprint = async (configuration: ModelConfiguration = getLunaConfiguration("image_safety")) => {
  const policy = JSON.stringify({ version: configuration.promptVersion, preprocessing: configuration.profile,
    configurationHash: await modelConfigurationHash(configuration), model: configuration.model, reasoning: configuration.reasoning,
    detail: configuration.detail, outputLimit: configuration.outputLimit,
    prompt: configuration.version === "model-config-v2" ? lunaImageSafetyPrompt : imageSafetyPrompt,
    schema: imageSafetySchema, decision: imageUploadSafetyPolicy });
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(policy));
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");
};
