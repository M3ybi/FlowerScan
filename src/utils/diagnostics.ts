export type DiagnosisRiskLevel = "low" | "medium" | "high";
export type DiagnosisConfirmation = "confirmed" | "rejected";

export type PlantDiagnosisDraft = {
  diagnosisTitle: string;
  confidence: number;
  confidenceLabel: "nízka" | "stredná" | "vysoká";
  reasoningSummary: string;
  observedSymptoms: string[];
  recommendedSteps: string[];
  riskLevel: DiagnosisRiskLevel;
  disclaimer: string;
};

export type PlantDiagnosticEntry = PlantDiagnosisDraft & {
  id: string;
  plantId: string;
  imageDataUrl: string;
  userConfirmation: DiagnosisConfirmation;
  userNote: string;
  createdAt: string;
  updatedAt: string;
};

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxDiagnosticImageBytes = 8 * 1024 * 1024;

export const createDiagnosticId = () => `diag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const sanitizeDiagnosticEntries = (value: unknown): PlantDiagnosticEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is PlantDiagnosticEntry => {
      if (!item || typeof item !== "object") {
        return false;
      }

      const diagnosis = item as Partial<PlantDiagnosticEntry>;
      return (
        typeof diagnosis.id === "string" &&
        typeof diagnosis.plantId === "string" &&
        typeof diagnosis.imageDataUrl === "string" &&
        diagnosis.imageDataUrl.startsWith("data:image/") &&
        typeof diagnosis.diagnosisTitle === "string" &&
        typeof diagnosis.confidence === "number" &&
        typeof diagnosis.confidenceLabel === "string" &&
        typeof diagnosis.reasoningSummary === "string" &&
        Array.isArray(diagnosis.observedSymptoms) &&
        Array.isArray(diagnosis.recommendedSteps) &&
        (diagnosis.riskLevel === "low" || diagnosis.riskLevel === "medium" || diagnosis.riskLevel === "high") &&
        (diagnosis.userConfirmation === "confirmed" || diagnosis.userConfirmation === "rejected") &&
        typeof diagnosis.createdAt === "string" &&
        typeof diagnosis.updatedAt === "string"
      );
    })
    .map((diagnosis) => ({
      ...diagnosis,
      confidence: Math.max(0, Math.min(100, Math.round(diagnosis.confidence))),
      observedSymptoms: diagnosis.observedSymptoms.filter((item): item is string => typeof item === "string").slice(0, 8),
      recommendedSteps: diagnosis.recommendedSteps.filter((item): item is string => typeof item === "string").slice(0, 8),
      userNote: typeof diagnosis.userNote === "string" ? diagnosis.userNote : "",
    }));
};

export const resizeDiagnosticImageFileToDataUrl = (file: File, maxSize = 1200): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!allowedImageTypes.has(file.type)) {
      reject(new Error("Podporované sú iba obrázky JPG, PNG alebo WEBP."));
      return;
    }

    if (file.size > maxDiagnosticImageBytes) {
      reject(new Error("Obrázok je príliš veľký. Maximum je 8 MB."));
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
        resolve(canvas.toDataURL("image/jpeg", 0.84));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });

const normalizeDiagnosis = (value: unknown): PlantDiagnosisDraft | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as {
    diagnosis_title?: unknown;
    confidence?: unknown;
    confidence_label?: unknown;
    reasoning_summary?: unknown;
    observed_symptoms?: unknown;
    recommended_steps?: unknown;
    risk_level?: unknown;
    disclaimer?: unknown;
  };
  const confidence = Number(raw.confidence);
  const confidenceLabel = raw.confidence_label;
  const riskLevel = raw.risk_level;
  const observedSymptoms = Array.isArray(raw.observed_symptoms)
    ? raw.observed_symptoms.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
  const recommendedSteps = Array.isArray(raw.recommended_steps)
    ? raw.recommended_steps.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];

  if (
    typeof raw.diagnosis_title !== "string" ||
    !raw.diagnosis_title.trim() ||
    !Number.isFinite(confidence) ||
    typeof raw.reasoning_summary !== "string" ||
    !raw.reasoning_summary.trim() ||
    observedSymptoms.length === 0 ||
    recommendedSteps.length === 0 ||
    (confidenceLabel !== "nízka" && confidenceLabel !== "stredná" && confidenceLabel !== "vysoká") ||
    (riskLevel !== "low" && riskLevel !== "medium" && riskLevel !== "high") ||
    typeof raw.disclaimer !== "string"
  ) {
    return null;
  }

  return {
    confidence: Math.max(0, Math.min(100, Math.round(confidence))),
    confidenceLabel,
    diagnosisTitle: raw.diagnosis_title.trim().slice(0, 120),
    disclaimer: raw.disclaimer.trim().slice(0, 220),
    observedSymptoms: observedSymptoms.slice(0, 8),
    reasoningSummary: raw.reasoning_summary.trim().slice(0, 700),
    recommendedSteps: recommendedSteps.slice(0, 8),
    riskLevel,
  };
};

export const fetchPlantDiagnosis = async (plantName: string, imageDataUrl: string): Promise<PlantDiagnosisDraft> => {
  const response = await fetch("/.netlify/functions/plant-diagnosis-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl, plantName }),
  });

  if (!response.ok) {
    throw new Error("AI diagnostika zlyhala. Skús to prosím znova.");
  }

  const data = (await response.json()) as { diagnosis?: unknown };
  const diagnosis = normalizeDiagnosis(data.diagnosis);
  if (!diagnosis) {
    throw new Error("AI vrátila neúplnú diagnostiku. Skús inú fotku.");
  }

  return diagnosis;
};
