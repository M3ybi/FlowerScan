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
    .single<DbHouseholdPlanUsage>();

  if (error) {
    throw error;
  }

  return mapUsage(data);
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
