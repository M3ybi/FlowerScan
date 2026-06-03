import assert from "node:assert/strict";
import test from "node:test";
import { flowers } from "../src/data/flowers.js";
import type { LegacyHouseholdState } from "../src/lib/legacyMigrationRules.js";
import {
  compareLegacyAndSupabaseHouseholdState,
  detectDataSourceMode,
  mapSupabaseRowsToLegacyStateShape,
} from "../src/lib/supabaseReadThrough.js";
import type { Household, HouseholdPlant, SupabasePlantDiagnostic } from "../src/lib/plantieRepository.js";

const household: Household = {
  createdAt: "2026-05-31T10:00:00.000Z",
  createdBy: "user-id",
  id: "household-id",
  legacyPublicToken: "abcdefghijklmnopqrstuvwxyz123456",
  name: "Byt",
  updatedAt: "2026-05-31T10:00:00.000Z",
};

const createPlant = (patch: Partial<HouseholdPlant> = {}): HouseholdPlant => ({
  carePills: flowers[0].carePills.map((pill, position) => ({ ...pill, id: `pill-${position}`, position })),
  careTips: flowers[0].careTips.map((tip, position) => ({ id: `tip-${position}`, position, tip })),
  catalogPlantId: "catalog-id",
  createdAt: "2026-05-31T10:00:00.000Z",
  createdBy: "user-id",
  displayName: flowers[0].displayName,
  householdId: household.id,
  id: "supabase-plant-id",
  identification: "confident",
  identificationNote: flowers[0].identificationNote,
  imagePath: null,
  isRemoved: false,
  legacyId: flowers[0].id,
  light: flowers[0].light,
  likelyName: flowers[0].likelyName,
  notificationsEnabled: true,
  shortCare: flowers[0].shortCare,
  soil: flowers[0].soil,
  source: "built_in",
  updatedAt: "2026-05-31T10:00:00.000Z",
  watering: flowers[0].watering,
  wateringIntervalDays: flowers[0].wateringIntervalDays ?? null,
  ...patch,
});

const createDiagnostic = (patch: Partial<SupabasePlantDiagnostic> = {}): SupabasePlantDiagnostic => ({
  confidence: 80,
  confidenceLabel: "stredná",
  createdAt: "2026-05-31T10:00:00.000Z",
  diagnosisTitle: "Preliatie",
  disclaimer: "AI diagnostika je iba odhad.",
  householdId: household.id,
  id: "supabase-diagnostic-id",
  imagePath: null,
  legacyId: "legacy-diagnostic-id",
  observedSymptoms: ["žltý list"],
  plantId: "supabase-plant-id",
  reasoningSummary: "Listy žltnú odspodu.",
  recommendedSteps: ["Skontroluj substrát"],
  riskLevel: "medium",
  updatedAt: "2026-05-31T10:00:00.000Z",
  userConfirmation: "confirmed",
  userNote: "overené",
  ...patch,
});

const createLegacyState = (): LegacyHouseholdState => ({
  activeHousehold: {
    name: household.name,
    publicToken: household.legacyPublicToken ?? "",
  },
  allFlowers: [flowers[0], flowers[1]],
  customFlowers: [],
  diagnostics: [
    {
      ...createDiagnostic(),
      id: "legacy-diagnostic-id",
      imageDataUrl: "",
      plantId: flowers[0].id,
    },
  ],
  records: {
    [flowers[0].id]: {
      lastFertilized: "",
      lastTransplanted: "",
      lastWatered: "2026-05-30",
      note: "legacy note",
    },
  },
  removedFlowerIds: [flowers[1].id],
  reportSettings: {
    recipientEmail: "plantie@example.com",
  },
});

test("feature flag off uses legacy mode", () => {
  assert.equal(
    detectDataSourceMode({
      featureEnabled: false,
      hasAuthenticatedUser: true,
      hasMigratedHousehold: true,
    }),
    "legacy",
  );
});

test("feature flag on without auth uses fallback mode", () => {
  assert.equal(
    detectDataSourceMode({
      featureEnabled: true,
      hasAuthenticatedUser: false,
      hasMigratedHousehold: true,
    }),
    "fallback",
  );
});

test("feature flag on with migrated household and successful read uses readonly Supabase mode", () => {
  assert.equal(
    detectDataSourceMode({
      featureEnabled: true,
      hasAuthenticatedUser: true,
      hasMigratedHousehold: true,
    }),
    "supabase-readonly",
  );
});

test("feature flag on with Supabase read failure reports error mode for legacy fallback", () => {
  assert.equal(
    detectDataSourceMode({
      featureEnabled: true,
      hasAuthenticatedUser: true,
      hasMigratedHousehold: true,
      readError: true,
    }),
    "error",
  );
});

test("feature flag on with Supabase read failure reports error even without a loaded snapshot", () => {
  assert.equal(
    detectDataSourceMode({
      featureEnabled: true,
      hasAuthenticatedUser: true,
      hasMigratedHousehold: false,
      readError: true,
    }),
    "error",
  );
});

test("Supabase rows map back into existing App state shape and preserve legacy IDs", () => {
  const state = mapSupabaseRowsToLegacyStateShape({
    careRecords: [
      {
        lastFertilized: "",
        lastTransplanted: "",
        lastWatered: "2026-05-30",
        note: "safe note",
        plantId: "supabase-plant-id",
      },
    ],
    diagnostics: [createDiagnostic()],
    household,
    plants: [createPlant()],
    reportSettings: {
      householdId: household.id,
      lastPushNotificationDate: "",
      lastSentDate: "",
      recipientEmail: "plantie@example.com",
    },
  });

  assert.equal(state.allFlowers[0].id, flowers[0].id);
  assert.equal(state.customFlowers[0].id, flowers[0].id);
  assert.equal(state.records[flowers[0].id].lastWatered, "2026-05-30");
  assert.equal(state.diagnostics[0].id, "legacy-diagnostic-id");
  assert.equal(state.diagnostics[0].plantId, flowers[0].id);
  assert.equal(state.supabasePlantIdsByLegacyId[flowers[0].id], "supabase-plant-id");
});

test("comparison utility detects count, legacy ID, and hidden plant mismatches", () => {
  const legacy = createLegacyState();
  const supabaseState = mapSupabaseRowsToLegacyStateShape({
    careRecords: [],
    diagnostics: [],
    household,
    plants: [createPlant({ legacyId: flowers[0].id, isRemoved: false })],
    reportSettings: null,
  });
  const comparison = compareLegacyAndSupabaseHouseholdState(legacy, supabaseState);

  assert.equal(comparison.plantCountMismatch, true);
  assert.equal(comparison.careRecordCountMismatch, true);
  assert.equal(comparison.diagnosisCountMismatch, true);
  assert.equal(comparison.hiddenRemovedPlantMismatch, true);
  assert.deepEqual(comparison.missingLegacyIds, [flowers[1].id]);
});
