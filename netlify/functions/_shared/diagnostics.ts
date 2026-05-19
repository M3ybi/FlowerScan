export type StoredPlantDiagnostic = {
  id: string;
  plantId: string;
  imageDataUrl: string;
  diagnosisTitle: string;
  confidence: number;
  confidenceLabel: "nízka" | "stredná" | "vysoká";
  reasoningSummary: string;
  observedSymptoms: string[];
  recommendedSteps: string[];
  riskLevel: "low" | "medium" | "high";
  disclaimer: string;
  userConfirmation: "confirmed" | "rejected";
  userNote: string;
  createdAt: string;
  updatedAt: string;
};

const sanitizeText = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";

const sanitizeList = (value: unknown, maxLength: number) =>
  Array.isArray(value) ? value.map((item) => sanitizeText(item, maxLength)).filter(Boolean).slice(0, 8) : [];

export const sanitizeDiagnostics = (value: unknown): StoredPlantDiagnostic[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): StoredPlantDiagnostic | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const raw = item as Partial<StoredPlantDiagnostic>;
      const confidence = Number(raw.confidence);
      const confidenceLabel = raw.confidenceLabel;
      const riskLevel = raw.riskLevel;
      const userConfirmation = raw.userConfirmation;
      const observedSymptoms = sanitizeList(raw.observedSymptoms, 160);
      const recommendedSteps = sanitizeList(raw.recommendedSteps, 220);

      if (
        typeof raw.id !== "string" ||
        typeof raw.plantId !== "string" ||
        typeof raw.imageDataUrl !== "string" ||
        !raw.imageDataUrl.startsWith("data:image/") ||
        !Number.isFinite(confidence) ||
        observedSymptoms.length === 0 ||
        recommendedSteps.length === 0 ||
        (confidenceLabel !== "nízka" && confidenceLabel !== "stredná" && confidenceLabel !== "vysoká") ||
        (riskLevel !== "low" && riskLevel !== "medium" && riskLevel !== "high") ||
        (userConfirmation !== "confirmed" && userConfirmation !== "rejected") ||
        typeof raw.createdAt !== "string" ||
        typeof raw.updatedAt !== "string"
      ) {
        return null;
      }

      return {
        confidence: Math.max(0, Math.min(100, Math.round(confidence))),
        confidenceLabel,
        createdAt: raw.createdAt,
        diagnosisTitle: sanitizeText(raw.diagnosisTitle, 140),
        disclaimer: sanitizeText(raw.disclaimer, 240),
        id: raw.id.slice(0, 120),
        imageDataUrl: raw.imageDataUrl.slice(0, 1_500_000),
        observedSymptoms,
        plantId: raw.plantId.slice(0, 120),
        reasoningSummary: sanitizeText(raw.reasoningSummary, 800),
        recommendedSteps,
        riskLevel,
        updatedAt: raw.updatedAt,
        userConfirmation,
        userNote: sanitizeText(raw.userNote, 1200),
      };
    })
    .filter((item): item is StoredPlantDiagnostic => Boolean(item))
    .slice(0, 400);
};
