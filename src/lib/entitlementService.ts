import { supabase } from "./supabase";

export type PlanKey = "free" | "premium_monthly" | "premium_yearly";

export type Entitlement = {
  planKey: PlanKey;
  isPremium: boolean;
  aiScansMonthlyLimit: number | null;
  plantsLimit: number | null;
  qrLabelsLimit: number | null;
  aiDiagnosisEnabled: boolean;
  cloudBackupEnabled: boolean;
  householdSharingEnabled: boolean;
  aiScansUsed: number;
  aiScansRemaining: number | null;
};

type DbEntitlement = {
  plan_key: PlanKey;
  is_premium: boolean;
  ai_scans_monthly_limit: number | null;
  plants_limit: number | null;
  qr_labels_limit: number | null;
  ai_diagnosis_enabled: boolean;
  cloud_backup_enabled: boolean;
  household_sharing_enabled: boolean;
  ai_scans_used: number;
  ai_scans_remaining: number | null;
};

const freeEntitlement: Entitlement = {
  aiDiagnosisEnabled: false,
  aiScansMonthlyLimit: 10,
  aiScansRemaining: 10,
  aiScansUsed: 0,
  cloudBackupEnabled: false,
  householdSharingEnabled: false,
  isPremium: false,
  planKey: "free",
  plantsLimit: 10,
  qrLabelsLimit: 10,
};

const getClient = () => {
  if (!supabase) {
    throw new Error("Supabase is not configured. Entitlement checks require an authenticated Supabase session.");
  }

  return supabase;
};

const mapEntitlement = (entitlement: DbEntitlement): Entitlement => ({
  aiDiagnosisEnabled: entitlement.ai_diagnosis_enabled,
  aiScansMonthlyLimit: entitlement.ai_scans_monthly_limit,
  aiScansRemaining: entitlement.ai_scans_remaining,
  aiScansUsed: entitlement.ai_scans_used,
  cloudBackupEnabled: entitlement.cloud_backup_enabled,
  householdSharingEnabled: entitlement.household_sharing_enabled,
  isPremium: entitlement.is_premium,
  planKey: entitlement.plan_key,
  plantsLimit: entitlement.plants_limit,
  qrLabelsLimit: entitlement.qr_labels_limit,
});

export const getMyEntitlement = async () => {
  const { data, error } = await getClient().rpc("get_my_entitlement").single<DbEntitlement>();

  if (error) {
    throw error;
  }

  return data ? mapEntitlement(data) : freeEntitlement;
};

export const isPremium = async () => {
  const entitlement = await getMyEntitlement();
  return entitlement.isPremium;
};

export const canScanPlant = async () => {
  const { data, error } = await getClient().rpc("can_use_feature", { feature_key: "ai_scan" });

  if (error) {
    throw error;
  }

  return Boolean(data);
};

export const canAddPlant = async (currentPlantCount = 0) => {
  const entitlement = await getMyEntitlement();
  return entitlement.plantsLimit === null || currentPlantCount < entitlement.plantsLimit;
};

export const canCreateQrLabel = async (currentQrLabelCount = 0) => {
  const entitlement = await getMyEntitlement();
  return entitlement.qrLabelsLimit === null || currentQrLabelCount < entitlement.qrLabelsLimit;
};

export const canUseAiDiagnosis = async () => {
  const { data, error } = await getClient().rpc("can_use_feature", { feature_key: "ai_diagnosis" });

  if (error) {
    throw error;
  }

  return Boolean(data);
};

export const incrementAiScanUsage = async () => {
  const { error } = await getClient().rpc("increment_usage_counter", { counter_type: "ai_scan" });

  if (error) {
    throw error;
  }
};

