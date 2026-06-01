import assert from "node:assert/strict";
import test from "node:test";
import { flowers } from "../src/data/flowers.js";
import {
  createLegacyMigrationPlantPlan,
  mergeMigrationPlantPlans,
  previewLegacyMigration,
  shouldFallbackLegacyImage,
  validateMigrationResult,
} from "../src/lib/legacyMigrationRules.js";
import type { LegacyHouseholdState, LegacyMigrationResult } from "../src/lib/legacyMigrationRules.js";

const customFlower = {
  ...flowers[0],
  displayName: "Moja monstera",
  id: "custom-plant-1",
  image: "data:image/jpeg;base64,abc",
  source: "custom" as const,
};

const baseState: LegacyHouseholdState = {
  activeHousehold: {
    name: "Byt",
    publicToken: "abcdefghijklmnopqrstuvwxyz123456",
  },
  allFlowers: [customFlower, ...flowers],
  customFlowers: [customFlower],
  diagnostics: [
    {
      confidence: 80,
      confidenceLabel: "stredná",
      createdAt: "2026-05-31T10:00:00.000Z",
      diagnosisTitle: "Preliatie",
      disclaimer: "AI diagnostika je iba odhad.",
      id: "legacy-diagnostic-1",
      imageDataUrl: "data:image/jpeg;base64,abc",
      observedSymptoms: ["žltý list"],
      plantId: flowers[0].id,
      reasoningSummary: "Listy žltnú odspodu.",
      recommendedSteps: ["Skontroluj substrát"],
      riskLevel: "medium",
      updatedAt: "2026-05-31T10:00:00.000Z",
      userConfirmation: "confirmed",
      userNote: "overené",
    },
  ],
  records: {
    [flowers[0].id]: {
      lastFertilized: "2026-05-01",
      lastTransplanted: "",
      lastWatered: "2026-05-30",
      note: "legacy note",
    },
    [customFlower.id]: {
      lastFertilized: "",
      lastTransplanted: "",
      lastWatered: "2026-05-29",
      note: "",
    },
  },
  removedFlowerIds: [flowers[1].id],
  reportSettings: {
    recipientEmail: "plantie@example.com",
  },
};

test("migration preview counts legacy household data", () => {
  const preview = previewLegacyMigration(baseState);

  assert.equal(preview.builtInPlants, flowers.length);
  assert.equal(preview.customPlants, 1);
  assert.equal(preview.careRecords, 2);
  assert.equal(preview.diagnostics, 1);
  assert.equal(preview.hiddenPlants, 1);
  assert.equal(preview.reportSettings.hasRecipientEmail, true);
});

test("built-in and custom plant migration plan preserves legacy IDs for QR compatibility", () => {
  const plan = createLegacyMigrationPlantPlan(baseState);

  assert.ok(plan.some((item) => item.legacyId === flowers[0].id && item.source === "built_in"));
  assert.ok(plan.some((item) => item.legacyId === customFlower.id && item.source === "custom"));
  assert.ok(plan.some((item) => item.legacyId === flowers[1].id && item.isRemoved));
});

test("migration plant plan can be deduplicated for idempotent retries", () => {
  const [first] = createLegacyMigrationPlantPlan(baseState);
  const deduped = mergeMigrationPlantPlans([first, first]);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].legacyId, first.legacyId);
});

test("missing catalog references are reported through unsupported preview items", () => {
  const preview = previewLegacyMigration({
    ...baseState,
    records: {
      ...baseState.records,
      "unknown-legacy-id": {
        lastFertilized: "",
        lastTransplanted: "",
        lastWatered: "2026-05-30",
        note: "",
      },
    },
  });

  assert.ok(preview.unsupportedItems.some((item) => item.includes("unknown legacy plant IDs")));
});

test("non-data images stay in legacy fallback instead of database base64", () => {
  assert.equal(shouldFallbackLegacyImage("https://example.com/plant.jpg"), true);
  assert.equal(shouldFallbackLegacyImage("data:image/png;base64,abc"), false);
});

test("migration result validation exposes image fallback warnings", () => {
  const result: LegacyMigrationResult = {
    ...previewLegacyMigration(baseState),
    createdPlants: 2,
    diagnosticsMigrated: 1,
    householdId: "household-id",
    imageFallbacks: 1,
    reusedPlants: 0,
    updatedRecords: 2,
  };

  const validation = validateMigrationResult(result);
  assert.equal(validation.isValid, true);
  assert.ok(validation.warnings.some((warning) => warning.includes("image payloads")));
});
