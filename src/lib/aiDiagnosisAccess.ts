export type AiDiagnosisPlanUsage = {
  aiAnalyzesRemaining: number | null;
  isPremium: boolean;
};

export type AiDiagnosisAccessStatus =
  | "allowed"
  | "auth_required"
  | "checking"
  | "household_required"
  | "limit_reached";

export type AiDiagnosisAccessResult = {
  allowed: boolean;
  status: AiDiagnosisAccessStatus;
};

export type ResolveAiDiagnosisAccessInput = {
  activeHouseholdId: string;
  householdPlanUsage: AiDiagnosisPlanUsage | null;
  isAuthenticated: boolean;
  requiresSupabaseHousehold: boolean;
};

export const resolveAiDiagnosisAccess = ({
  activeHouseholdId,
  householdPlanUsage,
  isAuthenticated,
  requiresSupabaseHousehold,
}: ResolveAiDiagnosisAccessInput): AiDiagnosisAccessResult => {
  if (!requiresSupabaseHousehold) {
    return { allowed: true, status: "allowed" };
  }

  if (!isAuthenticated) {
    return { allowed: false, status: "auth_required" };
  }

  if (!activeHouseholdId) {
    return { allowed: false, status: "household_required" };
  }

  if (!householdPlanUsage) {
    return { allowed: false, status: "checking" };
  }

  if (householdPlanUsage.isPremium) {
    return { allowed: true, status: "allowed" };
  }

  if (householdPlanUsage.aiAnalyzesRemaining !== null && householdPlanUsage.aiAnalyzesRemaining <= 0) {
    return { allowed: false, status: "limit_reached" };
  }

  return { allowed: true, status: "allowed" };
};
