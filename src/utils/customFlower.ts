import type { Flower } from "../data/flowers";

export type GeneratedCare = {
  likelyName: string;
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

export const createFallbackCare = (plantName: string): GeneratedCare => ({
  carePills: [
    { label: "Svetlo", value: "jasné nepriame", tone: "green" },
    { label: "Zálievka", value: "po preschnutí vrchu", tone: "blue" },
    { label: "Vlhkosť", value: "bežná izbová", tone: "green" },
    { label: "Náročnosť", value: "stredná", tone: "amber" },
    { label: "Presádzanie", value: "podľa rastu", tone: "amber" },
  ],
  careTips: [
    "Skontroluj substrát pred každou zálievkou.",
    "Nenechávaj kvetináč stáť vo vode.",
    "Pozoruj listy a uprav starostlivosť podľa reakcie rastliny.",
  ],
  identificationNote: "AI starostlivosť nebola dostupná, preto bol použitý všeobecný profil izbovej rastliny.",
  light: "Najbezpečnejšie je jasné nepriame svetlo bez ostrého poludňajšieho slnka.",
  likelyName: plantName,
  shortCare: "Všeobecný profil izbovej rastliny. Starostlivosť prosím uprav podľa reálnej identifikácie rastliny.",
  soil: "Vzdušný izbový substrát s drenážou.",
  watering: "Zalej po preschnutí vrchnej vrstvy substrátu.",
  wateringIntervalDays: 7,
});

export const fetchGeneratedCare = async (plantName: string, imageDataUrl: string): Promise<GeneratedCare> => {
  const response = await fetch("/.netlify/functions/plant-care-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl, plantName }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { error?: string; details?: string } | null;
    const details = errorBody?.details ? ` ${errorBody.details}` : "";
    throw new Error(`${errorBody?.error ?? "AI starostlivosť sa nepodarilo vygenerovať."}${details}`);
  }

  const data = (await response.json()) as { care?: GeneratedCare };
  if (!data.care) {
    throw new Error("AI nevrátila údaje o starostlivosti.");
  }

  return data.care;
};
