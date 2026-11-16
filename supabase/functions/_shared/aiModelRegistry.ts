import { buildProductionCarePayload, buildProductionDiagnosisPayload } from "./productionBotanicalPrompts.ts";
import type { BotanicalContext } from "./botanicalPromptCandidates.ts";
import { buildImageSafetyPayload } from "./imageSafetyContract.ts";

export type AiRoute = "image_safety" | "initial_care" | "care_refresh" | "diagnosis";
export type ModelConfiguration = Readonly<{
  id: string; route: AiRoute; model: string; reasoning: "none" | "low" | null;
  promptVersion: string; outputLimit: number; timeoutMs: number; priceVersion: string;
  detail: "high"; profile: "normalized-jpeg-v1"; maxAttempts: 1;
  cacheTtl: "30m" | null; version: "model-config-v1" | "model-config-v2";
  // Current official vision tables do not specify Luna/Terra sizing rules.
  // Context fallback is a proven model ceiling, never a measured image count.
  inputBoundPolicy: "provider-context-ceiling";
}>;

export const modelConfigurations: readonly ModelConfiguration[] = Object.freeze(
  (["image_safety", "initial_care", "care_refresh", "diagnosis"] as const).flatMap(route => {
    const choices = route === "image_safety" ? [["gpt-4o", null] as const] : [
      ["gpt-4o", null], ["gpt-6-luna", "none"], ["gpt-6-luna", "low"],
      ["gpt-6.1-terra", "none"], ["gpt-6.1-terra", "low"],
    ] as const;
    return choices.map(([model, reasoning]) => Object.freeze({
      id: `${route}:${model}:${reasoning ?? "legacy"}:v1`, route, model, reasoning,
      promptVersion: route === "image_safety" ? "plant-image-safety-v1" : route === "diagnosis" ? "plant-diagnosis-v1" : "plant-care-v1",
      outputLimit: route === "image_safety" ? 700 : route === "diagnosis" ? 2400 : 1400,
      timeoutMs: 30_000, priceVersion: model === "gpt-4o" ? "openai-standard-2026-11-15" : "openai-multimodel-2026-11-15",
      detail: "high" as const, profile: "normalized-jpeg-v1" as const, maxAttempts: 1 as const,
      cacheTtl: model === "gpt-4o" ? null : "30m" as const, version: "model-config-v1" as const,
      inputBoundPolicy: "provider-context-ceiling" as const,
    }));
  }),
);

// Preserve the sixteen historical definitions/hashes for replay and accounting.
// Only these Luna configurations are eligible for the migration's new work.
export const lunaSafetyConfigurations: readonly ModelConfiguration[] = Object.freeze(
  (["none", "low"] as const).map(reasoning => Object.freeze({
    id: `image_safety:gpt-6-luna:${reasoning}:v2`, route: "image_safety" as const, model: "gpt-6-luna", reasoning,
    promptVersion: `plant-image-safety-luna-${reasoning}-v2`, outputLimit: 700, timeoutMs: 30_000,
    priceVersion: "openai-multimodel-2026-11-15", detail: "high" as const, profile: "normalized-jpeg-v1" as const,
    maxAttempts: 1 as const, cacheTtl: "30m" as const, version: "model-config-v2" as const,
    inputBoundPolicy: "provider-context-ceiling" as const,
  })),
);
export const lunaProductionConfigurations = Object.freeze([
  ...modelConfigurations.filter(config => config.model === "gpt-6-luna"), ...lunaSafetyConfigurations,
]);
export const getModelConfiguration = (id: unknown) => [...modelConfigurations, ...lunaSafetyConfigurations].find(config => config.id === id);
export const getLunaConfiguration = (route: AiRoute, effort: "none" | "low" = "none") =>
  lunaProductionConfigurations.find(config => config.route === route && config.reasoning === effort)!;
export const isLunaConfiguration = (config: ModelConfiguration) => lunaProductionConfigurations.some(item => item.id === config.id);
export const modelConfigurationHash = async (config: ModelConfiguration) => Array.from(new Uint8Array(
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(config)))), byte => byte.toString(16).padStart(2, "0")).join("");
export const routeForKind = (kind: string): AiRoute => kind === "image_validation" || kind === "upload_validation" ? "image_safety"
  : kind === "diagnosis" ? "diagnosis" : kind === "care_refresh" ? "care_refresh" : "initial_care";

export const applyModelConfiguration = (payload: Record<string, unknown>, config: ModelConfiguration) => ({
  ...payload, model: config.model, service_tier: "default", store: false,
  ...(config.reasoning ? { reasoning: { effort: config.reasoning }, prompt_cache_options: { ttl: config.cacheTtl } } : {}),
});

export const buildModelEvaluationPayload = (config: ModelConfiguration, context: BotanicalContext, imageDataUrl: string) => {
  if (config.route === "image_safety") {
    if (!isLunaConfiguration(config)) throw new Error("Historical safety configuration is not evaluation eligible");
    return applyModelConfiguration(buildImageSafetyPayload(imageDataUrl, context.language), config);
  }
  const payload = config.route === "diagnosis"
    ? buildProductionDiagnosisPayload(context.plantName, imageDataUrl, context.language, context.symptomNotes)
    : buildProductionCarePayload(context.plantName, imageDataUrl, context.language);
  return applyModelConfiguration(payload, config);
};
