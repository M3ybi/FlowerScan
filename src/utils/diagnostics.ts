import { ImageUploadError } from "../lib/imageUploadErrors.js";
import { preprocessImageFile, validateImageInput } from "../lib/imageCaptureService.js";
import { imageUploadConfig } from "../lib/imageUploadConfig.js";
import { callBackendFunction } from "../lib/backendConfig.js";
import type { PlantieLanguage } from "../lib/onboarding.js";
import { normalizeDiagnosisConfidenceLevel } from "../lib/diagnosisConfidence.js";

export type DiagnosisRiskLevel = "low" | "medium" | "high";
export type DiagnosisConfirmation = "confirmed" | "rejected";
export type DiagnosisStorageMode = "local" | "supabase";

export type PlantDiagnosisDraft = {
  diagnosisTitle: string;
  confidence: number;
  confidenceLabel: string;
  reasoningSummary: string;
  observedSymptoms: string[];
  recommendedSteps: string[];
  riskLevel: DiagnosisRiskLevel;
  disclaimer: string;
};

export type PlantDiagnosticEntry = Omit<PlantDiagnosisDraft, "confidenceLabel"> & {
  confidenceLabel: string;
  id: string;
  plantId: string;
  imageDataUrl: string;
  imagePath?: string;
  storageMode?: DiagnosisStorageMode;
  supabaseId?: string;
  userConfirmation: DiagnosisConfirmation;
  userNote: string;
  createdAt: string;
  updatedAt: string;
};

export const allowedDiagnosticImageTypes = new Set<string>(imageUploadConfig.supportedInputMimeTypes);
export const maxDiagnosticImageBytes = imageUploadConfig.maxOriginalBytes;
export const maxDiagnosticNoteLength = 700;

export const createDiagnosticId = () => `diag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const sanitizeDiagnosticNote = (value: string) =>
  value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxDiagnosticNoteLength);

export const validateDiagnosticImageFile = (file: File) => validateImageInput(file);

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
        (diagnosis.imageDataUrl.startsWith("data:image/") || diagnosis.imageDataUrl === "") &&
        typeof diagnosis.diagnosisTitle === "string" &&
        typeof diagnosis.confidence === "number" &&
        typeof diagnosis.confidenceLabel === "string" &&
        normalizeDiagnosisConfidenceLevel(diagnosis.confidenceLabel) !== null &&
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
      confidenceLabel: normalizeDiagnosisConfidenceLevel(diagnosis.confidenceLabel) ?? "medium",
      observedSymptoms: diagnosis.observedSymptoms.filter((item): item is string => typeof item === "string").slice(0, 8),
      recommendedSteps: diagnosis.recommendedSteps.filter((item): item is string => typeof item === "string").slice(0, 8),
      storageMode: diagnosis.storageMode === "supabase" ? "supabase" : "local",
      userNote: typeof diagnosis.userNote === "string" ? sanitizeDiagnosticNote(diagnosis.userNote) : "",
    }));
};

export const resizeDiagnosticImageFileToDataUrl = async (file: File, maxSize = imageUploadConfig.maxDimension): Promise<string> => {
  const image = await preprocessImageFile(file, { maxDimension: maxSize });
  try { return image.dataUrl; } finally { URL.revokeObjectURL(image.previewUrl); }
};

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
  const confidenceLabel = normalizeDiagnosisConfidenceLevel(raw.confidence_label);
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
    !confidenceLabel ||
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

export const fetchPlantDiagnosis = async (
  plantName: string,
  imageDataUrl: string,
  symptomNotes = "",
  householdId = "",
  language?: PlantieLanguage | null,
): Promise<PlantDiagnosisDraft> => {
  let data: { diagnosis?: unknown };
  try {
    data = await callBackendFunction<{ diagnosis?: unknown }>({
      body: { householdId, imageDataUrl, language, plantName, symptomNotes: sanitizeDiagnosticNote(symptomNotes) },
      functionName: "plant-diagnosis-ai",
      netlifyPath: "/.netlify/functions/plant-diagnosis-ai",
    });
  } catch (error) {
    if (error instanceof ImageUploadError) throw error;
    throw new Error(error instanceof Error && error.message ? error.message : "AI diagnosis failed. Try again with another photo.");
  }

  const diagnosis = normalizeDiagnosis(data.diagnosis);
  if (!diagnosis) {
    throw new Error("AI returned an incomplete diagnosis. Try a different photo.");
  }

  return diagnosis;
};
