export type DiagnosisGateResult =
  | { allowed: true; mode: "premium" | "legacy" }
  | { allowed: false; reason: "auth_required" | "upgrade_required" | "entitlement_unavailable"; message: string };

export type ResolveDiagnosisGateInput = {
  canDiagnose?: boolean;
  entitlementError?: boolean;
  isAuthenticated: boolean;
  wasLegacyDiagnosisAvailable: boolean;
};

export const resolveDiagnosisGate = ({
  canDiagnose,
  entitlementError,
  isAuthenticated,
  wasLegacyDiagnosisAvailable,
}: ResolveDiagnosisGateInput): DiagnosisGateResult => {
  if (!isAuthenticated) {
    return wasLegacyDiagnosisAvailable
      ? { allowed: true, mode: "legacy" }
      : {
          allowed: false,
          message: "AI diagnostika je Premium funkcia. Prihlásenie pripraví účet na bezpečné ukladanie histórie.",
          reason: "auth_required",
        };
  }

  if (entitlementError) {
    return {
      allowed: false,
      message: "Nepodarilo sa overiť Premium prístup. Z bezpečnostných dôvodov diagnostiku nespúšťam.",
      reason: "entitlement_unavailable",
    };
  }

  if (!canDiagnose) {
    return {
      allowed: false,
      message: "AI diagnostika je súčasťou Plantie Premium. Platby ešte nie sú zapnuté, preto Premium neaktivujeme lokálne.",
      reason: "upgrade_required",
    };
  }

  return { allowed: true, mode: "premium" };
};
