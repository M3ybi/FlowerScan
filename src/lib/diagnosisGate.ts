import { canUseAiDiagnosis, incrementAiScanUsage } from "./entitlementService";
import { resolveDiagnosisGate } from "./diagnosisGateRules";
import type { DiagnosisGateResult } from "./diagnosisGateRules";

export type DiagnosisGateInput = {
  canUseAiDiagnosisOverride?: () => Promise<boolean>;
  isAuthenticated: boolean;
  wasLegacyDiagnosisAvailable: boolean;
};

export const checkDiagnosisGate = async ({
  isAuthenticated,
  wasLegacyDiagnosisAvailable,
  canUseAiDiagnosisOverride,
}: DiagnosisGateInput): Promise<DiagnosisGateResult> => {
  if (!isAuthenticated) {
    return resolveDiagnosisGate({ isAuthenticated, wasLegacyDiagnosisAvailable });
  }

  try {
    const canDiagnose = await (canUseAiDiagnosisOverride ?? canUseAiDiagnosis)();
    return resolveDiagnosisGate({ canDiagnose, isAuthenticated, wasLegacyDiagnosisAvailable });
  } catch {
    return resolveDiagnosisGate({ entitlementError: true, isAuthenticated, wasLegacyDiagnosisAvailable });
  }
};

export const recordDiagnosisUsage = async (mode: "premium" | "legacy") => {
  if (mode !== "premium") {
    return;
  }

  await incrementAiScanUsage();
};
