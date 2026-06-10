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

export const createCustomFlowerId = () => `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const resizeImageFileToDataUrl = (file: File, maxSize = 900): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Vybraný súbor nie je obrázok."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Obrázok sa nepodarilo načítať."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Obrázok sa nepodarilo spracovať."));
      image.onload = () => {
        const ratio = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * ratio));
        const height = Math.max(1, Math.round(image.height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Obrázok sa nepodarilo spracovať."));
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
    throw new Error("Obrázok rastliny sa nepodarilo načítať pre AI generovanie.");
  }

  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("Zdroj rastliny nie je obrázok.");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Obrázok rastliny sa nepodarilo spracovať."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
};

export const fetchGeneratedCare = async (plantName: string, imageDataUrl: string): Promise<GeneratedCare> => {
  let data: { care?: GeneratedCare };
  try {
    data = await callBackendFunction<{ care?: GeneratedCare }>({
      allowNetlifyFallback: true,
      body: { imageDataUrl, plantName },
      functionName: "plant-care-ai",
      netlifyPath: "/.netlify/functions/plant-care-ai",
    });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "AI starostlivos? sa nepodarilo vygenerova?.");
  }

  if (!data.care?.displayName || !data.care?.likelyName) {
    throw new Error("AI nevr?tila ?daje o starostlivosti.");
  }

  return data.care;
};
