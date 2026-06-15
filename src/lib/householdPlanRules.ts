export const plantUnwellAiAnalyzeUsageType = "plant_unwell_ai_analyze" as const;
export const aiCareTipUsageType = "ai_care_tip" as const;

export type HouseholdPlanKey = "free" | "premium";
export type AiAnalyzeType = typeof plantUnwellAiAnalyzeUsageType;
export type CareTipGenerationSource = "initial_plant_add" | "manual_refresh";

export type PlanLimits = {
  careTipRefreshPerPlantPerDay: number | null;
  initialCareGenerationCountsAsAnalyze: false;
  maxPlants: number | null;
  monthlyPlantUnwellAiAnalyzes: number | null;
};

export const PLAN_LIMITS: Record<HouseholdPlanKey, PlanLimits> = {
  free: {
    careTipRefreshPerPlantPerDay: 1,
    initialCareGenerationCountsAsAnalyze: false,
    maxPlants: 10,
    monthlyPlantUnwellAiAnalyzes: 5,
  },
  premium: {
    careTipRefreshPerPlantPerDay: null,
    initialCareGenerationCountsAsAnalyze: false,
    maxPlants: null,
    monthlyPlantUnwellAiAnalyzes: null,
  },
};

export type HouseholdPlanState = {
  aiAnalyzesReserved?: number;
  aiAnalyzesUsed: number;
  careTipGenerationsForPlant: number;
  careTipRefreshesTodayForPlant: number;
  isPremium: boolean;
  plantCount: number;
};

export type UsagePeriod = {
  periodEnd: Date;
  periodStart: Date;
};

export const getHouseholdPlanKey = (isPremium: boolean): HouseholdPlanKey => (isPremium ? "premium" : "free");

export const isHouseholdPremium = (state: Pick<HouseholdPlanState, "isPremium">) => state.isPremium;

const atLocalResetHour = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1, 5, 0, 0, 0);

export const getMonthlyUsagePeriod = (now = new Date()): UsagePeriod => {
  const currentMonthReset = atLocalResetHour(now);
  const periodStart =
    now.getTime() >= currentMonthReset.getTime()
      ? currentMonthReset
      : new Date(now.getFullYear(), now.getMonth() - 1, 1, 5, 0, 0, 0);
  const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 1, 5, 0, 0, 0);

  return { periodEnd, periodStart };
};

export const getRemainingPlantUnwellAiAnalyzes = (state: HouseholdPlanState) => {
  const limit = PLAN_LIMITS[getHouseholdPlanKey(state.isPremium)].monthlyPlantUnwellAiAnalyzes;
  if (limit === null) {
    return null;
  }

  return Math.max(0, limit - state.aiAnalyzesUsed - (state.aiAnalyzesReserved ?? 0));
};

export const assertCanAddPlant = (state: Pick<HouseholdPlanState, "isPremium" | "plantCount">) => {
  const limit = PLAN_LIMITS[getHouseholdPlanKey(state.isPremium)].maxPlants;
  if (limit !== null && state.plantCount >= limit) {
    throw new Error(`Free households can have up to ${limit} plants. Upgrade to add unlimited plants.`);
  }
};

export const assertCanRunAiAnalyze = (state: HouseholdPlanState, analyzeType: AiAnalyzeType = plantUnwellAiAnalyzeUsageType) => {
  if (analyzeType !== plantUnwellAiAnalyzeUsageType) {
    throw new Error("Unsupported AI analyze type.");
  }

  const remaining = getRemainingPlantUnwellAiAnalyzes(state);
  if (remaining !== null && remaining <= 0) {
    throw new Error(`Free households can run ${PLAN_LIMITS.free.monthlyPlantUnwellAiAnalyzes} plant health AI analyzes per month.`);
  }
};

export const assertCanGenerateCareTip = (
  state: HouseholdPlanState,
  generationSource: CareTipGenerationSource = "manual_refresh",
) => {
  if (state.isPremium) {
    return;
  }

  if (generationSource === "initial_plant_add") {
    if (state.careTipGenerationsForPlant > 0) {
      throw new Error("This plant already has generated AI care tips.");
    }
    return;
  }

  const dailyLimit = PLAN_LIMITS.free.careTipRefreshPerPlantPerDay;
  if (dailyLimit !== null && state.careTipRefreshesTodayForPlant >= dailyLimit) {
    throw new Error("Free households can refresh AI care tips once per plant per day.");
  }
};

export const recordAiAnalyzeUsage = (state: HouseholdPlanState): HouseholdPlanState =>
  state.isPremium
    ? state
    : {
        ...state,
        aiAnalyzesReserved: Math.max(0, (state.aiAnalyzesReserved ?? 0) - 1),
        aiAnalyzesUsed: state.aiAnalyzesUsed + 1,
      };

export const recordCareTipGeneration = (
  state: HouseholdPlanState,
  generationSource: CareTipGenerationSource = "manual_refresh",
): HouseholdPlanState =>
  state.isPremium
    ? state
    : {
        ...state,
        careTipGenerationsForPlant: state.careTipGenerationsForPlant + 1,
        careTipRefreshesTodayForPlant:
          generationSource === "manual_refresh"
            ? state.careTipRefreshesTodayForPlant + 1
            : state.careTipRefreshesTodayForPlant,
      };
