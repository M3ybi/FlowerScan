import type { Flower } from "../data/flowers";
import { callBackendFunction } from "../lib/backendConfig.js";

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
  plantId?: string;
};

export const createCustomFlowerId = () => `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const resizeImageFileToDataUrl = (file: File, maxSize = 900): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("The selected file is not an image."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The image could not be loaded."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("The image could not be processed."));
      image.onload = () => {
        const ratio = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * ratio));
        const height = Math.max(1, Math.round(image.height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("The image could not be processed."));
          return;
        }

        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });

export const imageSourceToDataUrl = async (imageSource: string): Promise<string> => {
  if (imageSource.startsWith("data:image/")) {
    return imageSource;
  }

  const response = await fetch(imageSource);
  if (!response.ok) {
    throw new Error("The plant image could not be loaded for AI generation.");
  }

  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("The plant source is not an image.");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The plant image could not be processed."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
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
        plantId: options.plantId ?? "",
        plantName,
      },
      functionName: "plant-care-ai",
      netlifyPath: "/.netlify/functions/plant-care-ai",
    });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "AI care guidance could not be generated.");
  }

  if (!data.care?.displayName || !data.care?.likelyName) {
    throw new Error("AI did not return plant care data.");
  }

  return data.care;
};
