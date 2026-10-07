import { supabase } from "./supabase.js";
import type { AiAnalyzeType, CareTipGenerationSource } from "./householdPlanRules.js";
import { plantUnwellAiAnalyzeUsageType } from "./householdPlanRules.js";

export type HouseholdPlanUsage = {
  aiAnalyzesMonthlyLimit: number | null;
  aiAnalyzesRemaining: number | null;
  aiAnalyzesUsed: number;
  isPremium: boolean;
  periodEnd: string | null;
  periodStart: string | null;
  plantsLimit: number | null;
  plantsRemaining: number | null;
  plantsUsed: number;
};

export type HouseholdEntitlement = {
  planKey: "free" | "premium" | "premium_monthly" | "premium_yearly";
  isPremium: boolean;
  status: string;
  validUntil: string | null;
  maxMembers: number;
  invitationsEnabled: boolean;
  activeMemberCount: number;
  pendingInviteCount: number;
  suspendedMemberCount: number;
  role: "owner" | "viewer";
  billingBoundHere: boolean;
  billingInterval?: "monthly" | "yearly" | null;
  renewalDate?: string | null;
  cancelAtPeriodEnd?: boolean;
  usedCapacity?: number;
  previousPlanKey?: "premium_monthly" | "premium_yearly" | null;
  previousValidUntil?: string | null;
};

export const getHouseholdEntitlement = async (householdId: string): Promise<HouseholdEntitlement> => {
  const entitlementRequest = getClient().rpc("get_household_entitlement", {
    target_household_id: householdId,
  }).single<{
    plan_key: HouseholdEntitlement["planKey"];
    is_premium: boolean;
    status: string;
    valid_until: string | null;
    max_members: number;
    invitations_enabled: boolean;
    active_member_count: number;
    pending_invite_count: number;
    suspended_member_count: number;
    role: HouseholdEntitlement["role"];
    billing_interval?: HouseholdEntitlement["billingInterval"];
    renewal_date?: string | null;
    cancel_at_period_end?: boolean;
    used_capacity?: number;
    previous_plan_key?: HouseholdEntitlement["previousPlanKey"];
    previous_valid_until?: string | null;
  }>();
  const bindingRequest = getClient().rpc("is_household_billing_bound", { target_household_id: householdId });
  const [{ data, error }, { data: billingBoundHere, error: bindingError }] = await Promise.all([entitlementRequest, bindingRequest]);
  if (error) throw error;
  if (bindingError) throw bindingError;
  if (!data) throw new Error("Household entitlement could not be loaded.");
  return {
    planKey: data.plan_key,
    isPremium: data.is_premium,
    status: data.status,
    validUntil: data.valid_until,
    maxMembers: data.max_members,
    invitationsEnabled: data.invitations_enabled,
    activeMemberCount: data.active_member_count,
    pendingInviteCount: data.pending_invite_count,
    suspendedMemberCount: data.suspended_member_count,
    role: data.role,
    billingBoundHere: billingBoundHere === true,
    billingInterval: data.billing_interval ?? (data.plan_key === "premium_monthly" ? "monthly"
      : data.plan_key === "premium_yearly" ? "yearly" : null),
    renewalDate: data.renewal_date ?? null,
    cancelAtPeriodEnd: data.cancel_at_period_end ?? data.status === "cancelled",
    usedCapacity: data.used_capacity ?? data.active_member_count + data.pending_invite_count,
    previousPlanKey: data.previous_plan_key ?? null,
    previousValidUntil: data.previous_valid_until ?? null,
  };
};

export const beginHouseholdPurchase = async (householdId: string) => {
  const { error } = await getClient().rpc("begin_household_purchase", { target_household_id: householdId });
  if (error) throw error;
};

type DbHouseholdPlanUsage = {
  ai_analyzes_monthly_limit: number | null;
  ai_analyzes_remaining: number | null;
  ai_analyzes_used: number;
  is_premium: boolean;
  period_end: string | null;
  period_start: string | null;
  plants_limit: number | null;
  plants_remaining: number | null;
  plants_used: number;
};

const getClient = () => {
  if (!supabase) {
    throw new Error("Supabase is not configured. Household plan checks require an authenticated Supabase session.");
  }

  return supabase;
};

const mapUsage = (usage: DbHouseholdPlanUsage): HouseholdPlanUsage => ({
  aiAnalyzesMonthlyLimit: usage.ai_analyzes_monthly_limit,
  aiAnalyzesRemaining: usage.ai_analyzes_remaining,
  aiAnalyzesUsed: usage.ai_analyzes_used,
  isPremium: usage.is_premium,
  periodEnd: usage.period_end,
  periodStart: usage.period_start,
  plantsLimit: usage.plants_limit,
  plantsRemaining: usage.plants_remaining,
  plantsUsed: usage.plants_used,
});

export const getHouseholdPlanUsage = async (householdId: string) => {
  const { data, error } = await getClient()
    .rpc("get_household_plan_usage", { target_household_id: householdId })
    .returns<DbHouseholdPlanUsage[]>();

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as DbHouseholdPlanUsage[];
  const [usage] = rows;
  if (!usage) {
    throw new Error("Supabase did not return household plan usage.");
  }

  return mapUsage(usage);
};

export const isHouseholdPremium = async (householdId: string) => {
  const { data, error } = await getClient().rpc("is_household_premium", { target_household_id: householdId });

  if (error) {
    throw error;
  }

  return Boolean(data);
};

export const assertCanAddPlant = async (householdId: string) => {
  const { error } = await getClient().rpc("assert_can_add_plant", { target_household_id: householdId });

  if (error) {
    throw error;
  }
};

export const assertCanRunAiAnalyze = async (
  householdId: string,
  analyzeType: AiAnalyzeType = plantUnwellAiAnalyzeUsageType,
) => {
  const { error } = await getClient().rpc("assert_can_run_ai_analyze", {
    analyze_type: analyzeType,
    target_household_id: householdId,
  });

  if (error) {
    throw error;
  }
};

export const recordAiAnalyzeUsage = async (
  householdId: string,
  analyzeType: AiAnalyzeType = plantUnwellAiAnalyzeUsageType,
  source = "client",
) => {
  const { error } = await getClient().rpc("record_ai_analyze_usage", {
    analyze_type: analyzeType,
    generation_source: source,
    target_household_id: householdId,
  });

  if (error) {
    throw error;
  }
};

export const assertCanGenerateCareTip = async (
  householdId: string,
  plantId: string,
  generationSource: CareTipGenerationSource = "manual_refresh",
) => {
  const { error } = await getClient().rpc("assert_can_generate_care_tip", {
    generation_source: generationSource,
    target_household_id: householdId,
    target_plant_id: plantId,
  });

  if (error) {
    throw error;
  }
};

export const recordCareTipGeneration = async (
  householdId: string,
  plantId: string,
  generationSource: CareTipGenerationSource = "manual_refresh",
) => {
  const { error } = await getClient().rpc("record_care_tip_generation", {
    generation_source: generationSource,
    target_household_id: householdId,
    target_plant_id: plantId,
  });

  if (error) {
    throw error;
  }
};
