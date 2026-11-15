import { imageUploadSafetyPolicy } from "../../../src/lib/imageUploadValidationRules.ts";

export const imageSafetyPromptVersion = "plant-image-safety-v1";
export const imageSafetyPrompt = "You are a strict image safety validator for Plantie, a plant-care app. Analyze the entire uploaded image before it is stored. The image must clearly contain a plant, tree, flower, leaf, shrub, herb, crop, garden plant, houseplant, or similar botanical subject. Reject images with people, faces, children, readable personal data, IDs, documents, mail, bills, screens, emails, chats, QR codes, barcodes, license plates, explicit content, unsafe content, private or restricted footage, confidential information, weapons, drugs, gore, self-harm, hate symbols, or anything inappropriate for a plant-care app. Be conservative. If uncertain, reject. Return only valid JSON using the required schema. Do not include markdown, prose, explanations, or extra fields.";
export const imageSafetySchema = {
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
  required: ["containsPlant", "plantConfidence", "hasSensitiveBackground", "hasExplicitOrUnsafeContent",
    "hasRestrictedFootageOrPrivateContent", "shouldAllowUpload", "failureReasons", "safeUserMessage"],
  type: "object",
};

// Receipts bind the configured model and actual prompt/schema/decision policy.
// This digest contains no user data or signing material.
export const imageSafetyPolicyFingerprint = async () => {
  const model = typeof Deno === "undefined" ? "gpt-4o" : Deno.env.get("OPENAI_MODEL") || "gpt-4o";
  const policy = JSON.stringify({ version: imageSafetyPromptVersion, preprocessing: "normalized-jpeg-v1", model,
    detail: "high", outputLimit: 700, prompt: imageSafetyPrompt, schema: imageSafetySchema, decision: imageUploadSafetyPolicy });
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(policy));
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");
};
