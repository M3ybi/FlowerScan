import { flowers as builtInFlowers } from "../data/flowers.js";
import type { Flower } from "../data/flowers.js";
import type { PlantDiagnosticEntry } from "../utils/diagnostics.js";

export type LegacyFlowerRecord = {
  lastFertilized: string;
  lastTransplanted: string;
  lastWatered: string;
  note: string;
};

export type LegacyFlowerRecords = Record<string, LegacyFlowerRecord>;

export type LegacyHouseholdSession = {
  name: string;
  publicToken: string;
};

export type LegacyReportSettings = {
  lastPushNotificationDate?: string;
  lastSentDate?: string;
  recipientEmail?: string;
};

export type LegacyHouseholdState = {
  activeHousehold: LegacyHouseholdSession | null;
  allFlowers: Flower[];
  customFlowers: Flower[];
  diagnostics: PlantDiagnosticEntry[];
  records: LegacyFlowerRecords;
  removedFlowerIds: string[];
  reportSettings: LegacyReportSettings;
};

export type LegacyMigrationPreview = {
  builtInPlants: number;
  careRecords: number;
  customPlants: number;
  diagnostics: number;
  hasActiveHouseholdToken: boolean;
  hiddenPlants: number;
  reportSettings: {
    hasLastPushNotificationDate: boolean;
    hasLastSentDate: boolean;
    hasRecipientEmail: boolean;
  };
  unsupportedItems: string[];
};

export type LegacyMigrationResult = LegacyMigrationPreview & {
  createdPlants: number;
  diagnosticsMigrated: number;
  householdId: string;
  imageFallbacks: number;
  reusedPlants: number;
  updatedRecords: number;
};

export type LegacyMigrationPlantPlan = {
  isRemoved: boolean;
  legacyId: string;
  source: "built_in" | "custom";
};

export const builtInLegacyIds = new Set(builtInFlowers.map((flower) => flower.id));

export const recordHasLegacyValue = (record: LegacyFlowerRecords[string] | undefined) =>
  Boolean(record?.lastFertilized || record?.lastTransplanted || record?.lastWatered || record?.note);

export const isLegacyDataImage = (value: string) => /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value);

export const detectLegacyHouseholdState = (state: LegacyHouseholdState) => state;

export const createLegacyMigrationPlantPlan = (state: LegacyHouseholdState): LegacyMigrationPlantPlan[] => [
  ...builtInFlowers.map((flower) => ({
    isRemoved: state.removedFlowerIds.includes(flower.id),
    legacyId: flower.id,
    source: "built_in" as const,
  })),
  ...state.customFlowers
    .filter((flower) => !builtInLegacyIds.has(flower.id))
    .map((flower) => ({
      isRemoved: state.removedFlowerIds.includes(flower.id),
      legacyId: flower.id,
      source: "custom" as const,
    })),
];

export const mergeMigrationPlantPlans = (plans: LegacyMigrationPlantPlan[]) =>
  [...new Map(plans.map((plan) => [plan.legacyId, plan])).values()];

export const shouldFallbackLegacyImage = (imageValue: string) => Boolean(imageValue && !isLegacyDataImage(imageValue));

export const previewLegacyMigration = (state: LegacyHouseholdState): LegacyMigrationPreview => {
  const customIds = new Set(state.customFlowers.map((flower) => flower.id));
  const careRecords = Object.values(state.records).filter(recordHasLegacyValue).length;
  const unsupportedItems: string[] = [];

  if (!state.activeHousehold?.publicToken) {
    unsupportedItems.push("No active legacy household token is available to preserve.");
  }

  const unknownRecords = Object.keys(state.records).filter((plantId) => !customIds.has(plantId) && !builtInLegacyIds.has(plantId));
  if (unknownRecords.length > 0) {
    unsupportedItems.push(`${unknownRecords.length} care records reference unknown legacy plant IDs.`);
  }

  return {
    builtInPlants: builtInFlowers.length,
    careRecords,
    customPlants: state.customFlowers.length,
    diagnostics: state.diagnostics.length,
    hasActiveHouseholdToken: Boolean(state.activeHousehold?.publicToken),
    hiddenPlants: state.removedFlowerIds.length,
    reportSettings: {
      hasLastPushNotificationDate: Boolean(state.reportSettings.lastPushNotificationDate),
      hasLastSentDate: Boolean(state.reportSettings.lastSentDate),
      hasRecipientEmail: Boolean(state.reportSettings.recipientEmail),
    },
    unsupportedItems,
  };
};

export const validateMigrationResult = (result: LegacyMigrationResult) => ({
  isValid: Boolean(result.householdId) && result.createdPlants + result.reusedPlants > 0,
  warnings: [
    ...(result.imageFallbacks > 0 ? [`${result.imageFallbacks} image payloads stayed in legacy fallback storage.`] : []),
    ...result.unsupportedItems,
  ],
});
