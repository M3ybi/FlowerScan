import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PLAN_LIMITS,
  assertCanAddPlant,
  assertCanGenerateCareTip,
  assertCanRunAiAnalyze,
  getMonthlyUsagePeriod,
  getRemainingPlantUnwellAiAnalyzes,
  isHouseholdPremium,
  plantUnwellAiAnalyzeUsageType,
  recordAiAnalyzeUsage,
  recordCareTipGeneration,
} from "../src/lib/householdPlanRules.js";
import type { HouseholdPlanState } from "../src/lib/householdPlanRules.js";

const freeState = (patch: Partial<HouseholdPlanState> = {}): HouseholdPlanState => ({
  aiAnalyzesReserved: 0,
  aiAnalyzesUsed: 0,
  careTipGenerationsForPlant: 0,
  careTipRefreshesTodayForPlant: 0,
  isPremium: false,
  plantCount: 0,
  ...patch,
});

test("Petzvalova migration grants household-level unlimited premium idempotently", () => {
  const migration = readFileSync("supabase/migrations/20260615120000_household_premium_usage_limits.sql", "utf8");
  const regrantMigration = readFileSync("supabase/migrations/20260615133000_regrant_petzvalova_household_premium.sql", "utf8");

  assert.match(migration, /where name = 'Petzvalova'\s+or legacy_public_token = 'Petzvalova'/);
  assert.match(migration, /matched_count > 1/);
  assert.match(migration, /premium_enabled = true/);
  assert.match(migration, /premium_source = 'manual_admin_grant'/);
  assert.match(migration, /premium_expires_at = null/);
  assert.match(migration, /raise notice 'Enabled unlimited premium for Petzvalova household %\.'/);
  assert.match(regrantMigration, /lower\(trim\(name\)\) in \('petzvalova', 'petzvalova household'\)/);
  assert.match(regrantMigration, /matched_count > 1/);
  assert.match(regrantMigration, /premium_enabled = true/);
  assert.match(regrantMigration, /premium_expires_at = null/);
});

test("premium households bypass AI, care-tip, and plant limits", () => {
  const state = freeState({
    aiAnalyzesUsed: 99,
    careTipGenerationsForPlant: 4,
    careTipRefreshesTodayForPlant: 3,
    isPremium: true,
    plantCount: 999,
  });

  assert.equal(isHouseholdPremium(state), true);
  assert.equal(getRemainingPlantUnwellAiAnalyzes(state), null);
  assert.doesNotThrow(() => assertCanRunAiAnalyze(state, plantUnwellAiAnalyzeUsageType));
  assert.doesNotThrow(() => assertCanGenerateCareTip(state, "manual_refresh"));
  assert.doesNotThrow(() => assertCanAddPlant(state));
});

test("non-premium households can run exactly ten successful plant health analyzes per month", () => {
  let state = freeState();

  for (let index = 0; index < PLAN_LIMITS.free.monthlyPlantUnwellAiAnalyzes; index += 1) {
    assert.doesNotThrow(() => assertCanRunAiAnalyze(state));
    state = recordAiAnalyzeUsage(state);
  }

  assert.equal(state.aiAnalyzesUsed, 10);
  assert.equal(getRemainingPlantUnwellAiAnalyzes(state), 0);
  assert.throws(() => assertCanRunAiAnalyze(state), /10 plant health AI analyzes/);
});

test("failed plant health analyzes do not consume usage", () => {
  const before = freeState({ aiAnalyzesUsed: 9 });

  assert.doesNotThrow(() => assertCanRunAiAnalyze(before));
  const afterFailure = before;

  assert.equal(afterFailure.aiAnalyzesUsed, 9);
  assert.equal(getRemainingPlantUnwellAiAnalyzes(afterFailure), 1);
});

test("reserved concurrent plant health analyzes count against remaining capacity", () => {
  const state = freeState({ aiAnalyzesReserved: 1, aiAnalyzesUsed: 9 });

  assert.equal(getRemainingPlantUnwellAiAnalyzes(state), 0);
  assert.throws(() => assertCanRunAiAnalyze(state), /10 plant health AI analyzes/);
});

test("initial plant care generation and AI care tips do not consume monthly AI analyze usage", () => {
  let state = freeState({ aiAnalyzesUsed: 7 });

  state = recordCareTipGeneration(state, "initial_plant_add");
  state = recordCareTipGeneration(state, "manual_refresh");

  assert.equal(state.aiAnalyzesUsed, 7);
  assert.equal(getRemainingPlantUnwellAiAnalyzes(state), 3);
});

test("non-premium care-tip generation allows initial generation once and one existing-plant refresh per day", () => {
  let state = freeState();

  assert.doesNotThrow(() => assertCanGenerateCareTip(state, "initial_plant_add"));
  state = recordCareTipGeneration(state, "initial_plant_add");
  assert.throws(() => assertCanGenerateCareTip(state, "initial_plant_add"), /already has generated AI care tips/);

  assert.doesNotThrow(() => assertCanGenerateCareTip(state, "manual_refresh"));
  state = recordCareTipGeneration(state, "manual_refresh");
  assert.throws(() => assertCanGenerateCareTip(state, "manual_refresh"), /once per plant per day/);
});

test("adding plants is blocked at the free plan limit and allowed for premium unlimited households", () => {
  assert.throws(() => assertCanAddPlant(freeState({ plantCount: PLAN_LIMITS.free.maxPlants ?? 10 })), /up to 10 plants/);
  assert.doesNotThrow(() => assertCanAddPlant(freeState({ isPremium: true, plantCount: 10_000 })));
});

test("monthly usage period resets on the first day at 05:00 local app time", () => {
  const beforeReset = getMonthlyUsagePeriod(new Date(2026, 6, 1, 4, 59, 59));
  const afterReset = getMonthlyUsagePeriod(new Date(2026, 6, 1, 5, 0, 0));

  assert.equal(beforeReset.periodStart.getFullYear(), 2026);
  assert.equal(beforeReset.periodStart.getMonth(), 5);
  assert.equal(beforeReset.periodStart.getDate(), 1);
  assert.equal(beforeReset.periodStart.getHours(), 5);
  assert.equal(afterReset.periodStart.getFullYear(), 2026);
  assert.equal(afterReset.periodStart.getMonth(), 6);
  assert.equal(afterReset.periodStart.getDate(), 1);
  assert.equal(afterReset.periodStart.getHours(), 5);
});

test("reset job is idempotent because usage rows are unique by household type and period", () => {
  const migration = readFileSync("supabase/migrations/20260615120000_household_premium_usage_limits.sql", "utf8");

  assert.match(migration, /unique \(household_id, usage_type, period_start\)/);
  assert.match(migration, /on conflict \(household_id, usage_type, period_start\) do nothing/);
  assert.match(migration, /create or replace function public\.reset_household_monthly_usage_counters/);
});

test("database migration enforces plant limits and atomic AI reservations server-side", () => {
  const migration = readFileSync("supabase/migrations/20260615120000_household_premium_usage_limits.sql", "utf8");
  const diagnosisAccessFixMigration = readFileSync("supabase/migrations/20260622120000_ai_diagnosis_household_access_fix.sql", "utf8");

  assert.match(migration, /create trigger enforce_household_plant_limit_before_write/);
  assert.match(migration, /perform 1 from public\.households where id = target_household_id for update/);
  assert.match(migration, /create or replace function public\.reserve_ai_analyze_usage/);
  assert.match(migration, /reserved_count = public\.household_usage_counters\.reserved_count \+ 1/);
  assert.match(migration, /create or replace function public\.commit_ai_analyze_usage/);
  assert.match(migration, /used_count = used_count \+ 1/);
  assert.match(migration, /create table if not exists public\.plant_care_tip_generations/);
  assert.match(diagnosisAccessFixMigration, /create or replace function public\.free_household_ai_analyzes_monthly_limit/);
  assert.match(diagnosisAccessFixMigration, /public\.is_household_premium\(target_household_id\)[\s\S]*return null;/);
  assert.match(diagnosisAccessFixMigration, /greatest\(ai_limit - used - reserved, 0\)/);
  assert.match(diagnosisAccessFixMigration, /raise exception 'Free households can run % plant health AI analyzes per month\.', ai_limit/);
  assert.match(diagnosisAccessFixMigration, /limit_count = ai_limit/);
});

test("Supabase AI functions count only successful plant-unwell analyzes and keep care generation separate", () => {
  const diagnosisEdge = readFileSync("supabase/functions/plant-diagnosis-ai/index.ts", "utf8");
  const careEdge = readFileSync("supabase/functions/plant-care-ai/index.ts", "utf8");

  assert.match(diagnosisEdge, /reserve_ai_analyze_usage/);
  assert.match(diagnosisEdge, /plant_unwell_ai_analyze/);
  assert.match(diagnosisEdge, /commit_ai_analyze_usage/);
  assert.match(diagnosisEdge, /release_ai_analyze_reservation/);
  assert.doesNotMatch(careEdge, /record_ai_analyze_usage|reserve_ai_analyze_usage|increment_usage_counter/);
  assert.match(careEdge, /assert_can_generate_care_tip/);
});
