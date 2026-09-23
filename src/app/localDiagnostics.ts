import type { createTranslator } from "../lib/i18n";
import { sanitizeDiagnosticEntries } from "../utils/diagnostics";
import type { PlantDiagnosticEntry } from "../utils/diagnostics";

export const diagnosticsStorageKey = "flowscan-plant-diagnostics-v1";

export const readStoredDiagnostics = () => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    return sanitizeDiagnosticEntries(JSON.parse(window.localStorage.getItem(diagnosticsStorageKey) ?? "[]"));
  } catch {
    return [];
  }
};

export const riskLevelLabel = (riskLevel: PlantDiagnosticEntry["riskLevel"], t: ReturnType<typeof createTranslator>) =>
  riskLevel === "high" ? t("diagnosis.riskHigh") : riskLevel === "medium" ? t("diagnosis.riskMedium") : t("diagnosis.riskLow");

export const flowerDiagnosticsCount = (flowerId: string, diagnostics: PlantDiagnosticEntry[]) =>
  diagnostics.filter((diagnostic) => diagnostic.plantId === flowerId).length;
