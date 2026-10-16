import { ImageUploadError, imageErrorFromResponse } from "../lib/imageUploadErrors.js";
import { preprocessImageFile } from "../lib/imageCaptureService.js";
import { imageUploadConfig } from "../lib/imageUploadConfig.js";
import type { Flower } from "../data/flowers";
import { callBackendFunction } from "../lib/backendConfig.js";
import type { PlantieLanguage } from "../lib/onboarding.js";

export type GeneratedCare = {
  displayName: string;
  likelyName: string;
  identificationConfidence: "confident" | "likely" | "needs-confirmation";
  shortCare: string;
  carePills: Flower["carePills"];
  light: string;
  watering: string;
  wateringIntervalDays: number;
  soil: string;
  careTips: string[];
  identificationNote: string;
};

export type GenerateCareOptions = {
  generationSource?: "initial_plant_add" | "manual_refresh";
  householdId?: string;
  language?: PlantieLanguage | null;
  plantId?: string;
};

export const createCustomFlowerId = () => `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const resizeImageFileToDataUrl = async (file: File, maxSize = imageUploadConfig.maxDimension): Promise<string> => {
  const image = await preprocessImageFile(file, { maxDimension: maxSize });
  try { return image.dataUrl; } finally { URL.revokeObjectURL(image.previewUrl); }
};

export const imageSourceToDataUrl = async (imageSource: string): Promise<string> => {
  const response = await fetch(imageSource, { signal: AbortSignal.timeout(30_000) }).catch(async (error: unknown) => {
    throw (await imageErrorFromResponse(error)) ?? new ImageUploadError("IMAGE_NETWORK_FAILED", 502);
  });
  if (!response.ok) throw new Error("The plant image could not be loaded for AI generation.");
  const image = await preprocessImageFile(await response.blob());
  try { return image.dataUrl; } finally { URL.revokeObjectURL(image.previewUrl); }
};

export const fetchGeneratedCare = async (
  plantName: string,
  imageDataUrl: string,
  options: GenerateCareOptions = {},
): Promise<GeneratedCare> => {
  let data: { care?: GeneratedCare };
  try {
    data = await callBackendFunction<{ care?: GeneratedCare }>({
      allowNetlifyFallback: true,
      body: {
        generationSource: options.generationSource ?? "initial_plant_add",
        householdId: options.householdId ?? "",
        imageDataUrl,
        language: options.language,
        plantId: options.plantId ?? "",
        plantName,
      },
      functionName: "plant-care-ai",
      netlifyPath: "/.netlify/functions/plant-care-ai",
    });
  } catch (error) {
    if (error instanceof ImageUploadError) throw error;
    throw new Error(error instanceof Error ? error.message : "AI care guidance could not be generated.");
  }

  if (!data.care?.displayName || !data.care?.likelyName) {
    throw new Error("AI did not return plant care data.");
  }

  return data.care;
};
