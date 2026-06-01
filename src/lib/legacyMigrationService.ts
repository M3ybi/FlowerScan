import type { Flower } from "../data/flowers";
import { flowers as builtInFlowers } from "../data/flowers";
import type { FlowerRecords } from "../hooks/useFlowerRecords";
import { sanitizeDiagnosticNote } from "../utils/diagnostics";
import type { PlantDiagnosticEntry } from "../utils/diagnostics";
import type { HouseholdSession } from "../utils/household";
import {
  builtInLegacyIds,
  createLegacyMigrationPlantPlan,
  detectLegacyHouseholdState,
  isLegacyDataImage,
  mergeMigrationPlantPlans,
  previewLegacyMigration,
  recordHasLegacyValue,
  shouldFallbackLegacyImage,
  validateMigrationResult,
} from "./legacyMigrationRules";
import type {
  LegacyHouseholdState,
  LegacyMigrationPlantPlan,
  LegacyMigrationPreview,
  LegacyMigrationResult,
  LegacyReportSettings,
} from "./legacyMigrationRules";
import {
  createHousehold,
  createHouseholdPlant,
  createPlantDiagnostic,
  getHouseholdPlantByLegacyId,
  getPlantCatalogByLegacyId,
  getUserHouseholds,
  updateHouseholdLegacyToken,
  updateHouseholdPlant,
  updateHouseholdReportSettings,
  updatePlantCareRecord,
  updatePlantDiagnostic,
  uploadDiagnosticImage,
  uploadPlantImage,
} from "./plantieRepository";
import type { Household, HouseholdPlant, PlantCatalogItem } from "./plantieRepository";

export {
  createLegacyMigrationPlantPlan,
  detectLegacyHouseholdState,
  mergeMigrationPlantPlans,
  previewLegacyMigration,
  shouldFallbackLegacyImage,
  validateMigrationResult,
};
export type {
  LegacyHouseholdState,
  LegacyMigrationPlantPlan,
  LegacyMigrationPreview,
  LegacyMigrationResult,
  LegacyReportSettings,
};

const dataUrlToBlob = async (dataUrl: string) => {
  const response = await fetch(dataUrl);
  return response.blob();
};

const toIdentificationStatus = (value: Flower["identification"]) =>
  (value === "needs-confirmation" ? "needs_confirmation" : value) as "confident" | "likely" | "needs_confirmation";

const toSource = (flower: Flower) => (builtInLegacyIds.has(flower.id) && flower.source !== "custom" ? "built_in" : "custom");

const createCatalogPlantInput = (flower: Flower, householdId: string, catalogPlant: PlantCatalogItem | null, imagePath: string | null) => ({
  carePills: flower.carePills,
  careTips: flower.careTips,
  catalogPlantId: catalogPlant?.id ?? null,
  displayName: flower.displayName,
  householdId,
  identification: toIdentificationStatus(flower.identification),
  identificationNote: flower.identificationNote,
  imagePath,
  legacyId: flower.id,
  light: flower.light,
  likelyName: flower.likelyName,
  notificationsEnabled: flower.notificationsEnabled !== false,
  shortCare: flower.shortCare,
  soil: flower.soil,
  source: toSource(flower) as "built_in" | "custom",
  watering: flower.watering,
  wateringIntervalDays: flower.wateringIntervalDays ?? null,
});

const resolveHousehold = async (state: LegacyHouseholdState): Promise<Household> => {
  const households = await getUserHouseholds();
  const legacyToken = state.activeHousehold?.publicToken ?? null;
  const existing = legacyToken
    ? households.find((household) => household.legacyPublicToken === legacyToken)
    : households[0];

  if (existing) {
    return existing;
  }

  const household = await createHousehold(state.activeHousehold?.name ?? "Plantie domácnosť");
  return legacyToken ? updateHouseholdLegacyToken(household.id, legacyToken) : household;
};

const maybeUploadPlantImage = async (householdId: string, plantId: string, flower: Flower) => {
  if (!isLegacyDataImage(flower.image)) {
    return { imagePath: null, imageFallback: false };
  }

  try {
    const blob = await dataUrlToBlob(flower.image);
    if (blob.size > 8 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(blob.type)) {
      return { imagePath: null, imageFallback: true };
    }

    return { imagePath: await uploadPlantImage(householdId, plantId, blob), imageFallback: false };
  } catch {
    return { imagePath: null, imageFallback: true };
  }
};

const maybeUploadDiagnosticImage = async (householdId: string, diagnosticId: string, diagnostic: PlantDiagnosticEntry) => {
  if (!diagnostic.imageDataUrl || !isLegacyDataImage(diagnostic.imageDataUrl)) {
    return { imagePath: diagnostic.imagePath ?? null, imageFallback: Boolean(diagnostic.imageDataUrl) };
  }

  try {
    const blob = await dataUrlToBlob(diagnostic.imageDataUrl);
    if (blob.size > 8 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(blob.type)) {
      return { imagePath: null, imageFallback: true };
    }

    return { imagePath: await uploadDiagnosticImage(householdId, diagnosticId, blob), imageFallback: false };
  } catch {
    return { imagePath: null, imageFallback: true };
  }
};

export const migrateLegacyHouseholdToSupabase = async (state: LegacyHouseholdState): Promise<LegacyMigrationResult> => {
  const preview = previewLegacyMigration(state);
  const household = await resolveHousehold(state);
  const plantByLegacyId = new Map<string, HouseholdPlant>();
  let createdPlants = 0;
  let imageFallbacks = 0;
  let reusedPlants = 0;
  let updatedRecords = 0;
  let diagnosticsMigrated = 0;

  const plantPlanByLegacyId = new Map(createLegacyMigrationPlantPlan(state).map((plan) => [plan.legacyId, plan]));
  const flowersToMigrate = [
    ...builtInFlowers,
    ...state.customFlowers.filter((flower) => !builtInLegacyIds.has(flower.id)),
  ];

  for (const flower of flowersToMigrate) {
    const existing = await getHouseholdPlantByLegacyId(household.id, flower.id);
    if (existing) {
      plantByLegacyId.set(flower.id, existing);
      reusedPlants += 1;
      await updateHouseholdPlant(existing.id, {
        isRemoved: plantPlanByLegacyId.get(flower.id)?.isRemoved ?? false,
        notificationsEnabled: flower.notificationsEnabled !== false,
        wateringIntervalDays: flower.wateringIntervalDays ?? null,
      });
      continue;
    }

    const catalogPlant = builtInLegacyIds.has(flower.id) ? await getPlantCatalogByLegacyId(flower.id) : null;
    if (builtInLegacyIds.has(flower.id) && !catalogPlant) {
      continue;
    }

    let created = await createHouseholdPlant(createCatalogPlantInput(flower, household.id, catalogPlant, null));
    const upload = await maybeUploadPlantImage(household.id, created.id, flower);
    imageFallbacks += upload.imageFallback ? 1 : 0;
    if (upload.imagePath) {
      created = await updateHouseholdPlant(created.id, { imagePath: upload.imagePath });
    }
    if (plantPlanByLegacyId.get(flower.id)?.isRemoved) {
      await updateHouseholdPlant(created.id, { isRemoved: true });
    }
    plantByLegacyId.set(flower.id, created);
    createdPlants += 1;
  }

  for (const [legacyId, record] of Object.entries(state.records)) {
    const plant = plantByLegacyId.get(legacyId);
    if (!plant || !recordHasLegacyValue(record)) {
      continue;
    }

    await updatePlantCareRecord(plant.id, {
      lastFertilized: record.lastFertilized || null,
      lastTransplanted: record.lastTransplanted || null,
      lastWatered: record.lastWatered || null,
      note: sanitizeDiagnosticNote(record.note),
    });
    updatedRecords += 1;
  }

  for (const diagnostic of state.diagnostics) {
    const plant = plantByLegacyId.get(diagnostic.plantId);
    if (!plant) {
      continue;
    }

    try {
      const createdDiagnostic = await createPlantDiagnostic({
        confidence: diagnostic.confidence,
        confidenceLabel: diagnostic.confidenceLabel,
        diagnosisTitle: diagnostic.diagnosisTitle,
        disclaimer: diagnostic.disclaimer,
        imagePath: null,
        legacyId: diagnostic.id,
        observedSymptoms: diagnostic.observedSymptoms,
        plantId: plant.id,
        reasoningSummary: diagnostic.reasoningSummary,
        recommendedSteps: diagnostic.recommendedSteps,
        riskLevel: diagnostic.riskLevel,
        userConfirmation: diagnostic.userConfirmation,
        userNote: sanitizeDiagnosticNote(diagnostic.userNote),
      });
      const upload = await maybeUploadDiagnosticImage(household.id, createdDiagnostic.id, diagnostic);
      imageFallbacks += upload.imageFallback ? 1 : 0;
      if (upload.imagePath) {
        await updatePlantDiagnostic(createdDiagnostic.id, { imagePath: upload.imagePath });
      }
      diagnosticsMigrated += 1;
    } catch {
      // Existing unique legacy_id or RLS race: keep import idempotent and continue.
    }
  }

  if (state.reportSettings.recipientEmail || state.reportSettings.lastSentDate || state.reportSettings.lastPushNotificationDate) {
    await updateHouseholdReportSettings(household.id, {
      lastPushNotificationDate: state.reportSettings.lastPushNotificationDate || null,
      lastSentDate: state.reportSettings.lastSentDate || null,
      recipientEmail: state.reportSettings.recipientEmail || null,
    });
  }

  return {
    ...preview,
    createdPlants,
    diagnosticsMigrated,
    householdId: household.id,
    imageFallbacks,
    reusedPlants,
    updatedRecords,
  };
};
