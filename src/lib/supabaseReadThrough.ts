import type { Flower } from "../data/flowers.js";
import { flowers as builtInFlowers } from "../data/flowers.js";
import type { PlantDiagnosticEntry } from "../utils/diagnostics.js";
import type { HouseholdSession } from "../utils/household.js";
import { recordHasLegacyValue } from "./legacyMigrationRules.js";
import type { LegacyFlowerRecords, LegacyHouseholdState, LegacyReportSettings } from "./legacyMigrationRules.js";
import {
  getHouseholdCareRecords,
  getHouseholdDiagnostics,
  getHouseholdPlantsIncludingRemoved,
  getHouseholdReportSettings,
  getDiagnosticImageSignedUrl,
  getPlantImageSignedUrl,
  getUserHouseholds,
} from "./plantieRepository.js";
import type {
  Household,
  HouseholdPlant,
  HouseholdReportSettings,
  PlantCareRecord,
  SupabasePlantDiagnostic,
} from "./plantieRepository.js";

export type DataSourceMode = "legacy" | "supabase-readonly" | "supabase-readwrite" | "fallback" | "error";

export type SupabaseReadThroughState = {
  allFlowers: Flower[];
  customFlowers: Flower[];
  diagnostics: PlantDiagnosticEntry[];
  household: Household;
  records: LegacyFlowerRecords;
  removedFlowerIds: string[];
  reportSettings: LegacyReportSettings;
  supabasePlantIdsByLegacyId: Record<string, string>;
};

export type SupabaseReadThroughOptions = {
  force?: boolean;
};

export type DataSourceDetectionInput = {
  featureEnabled: boolean;
  hasAuthenticatedUser: boolean;
  hasMigratedHousehold: boolean;
  readError?: boolean;
  writesEnabled?: boolean;
};

export type LegacySupabaseComparison = {
  careRecordCountMismatch: boolean;
  diagnosisCountMismatch: boolean;
  hiddenRemovedPlantMismatch: boolean;
  missingLegacyIds: string[];
  plantCountMismatch: boolean;
  summary: {
    legacyCareRecords: number;
    legacyDiagnostics: number;
    legacyHiddenOrRemovedPlants: number;
    legacyPlants: number;
    supabaseCareRecords: number;
    supabaseDiagnostics: number;
    supabaseHiddenOrRemovedPlants: number;
    supabasePlants: number;
  };
};

type SupabaseReadRows = {
  careRecords: PlantCareRecord[];
  diagnosticImageUrls?: Record<string, string>;
  diagnostics: SupabasePlantDiagnostic[];
  household: Household;
  plantImageUrls?: Record<string, string>;
  plants: HouseholdPlant[];
  reportSettings: HouseholdReportSettings | null;
};

const builtInFlowerById = new Map(builtInFlowers.map((flower) => [flower.id, flower]));
const readThroughCacheTtlMs = 60_000;
const readThroughCache = new Map<string, { loadedAt: number; state: SupabaseReadThroughState | null }>();
const readThroughRequests = new Map<string, Promise<SupabaseReadThroughState | null>>();

const readThroughCacheKey = (activeHousehold: HouseholdSession | null) => activeHousehold?.publicToken ?? "__default_household__";

export const invalidateSupabaseReadThroughCache = (activeHousehold?: HouseholdSession | null) => {
  if (activeHousehold === undefined) {
    readThroughCache.clear();
    readThroughRequests.clear();
    return;
  }

  const key = readThroughCacheKey(activeHousehold);
  readThroughCache.delete(key);
  readThroughRequests.delete(key);
};

const fromSupabaseIdentification = (value: HouseholdPlant["identification"]): Flower["identification"] =>
  value === "needs_confirmation" ? "needs-confirmation" : value;

const getLegacyStatePlantId = (plant: HouseholdPlant) => plant.legacyId ?? `supabase-${plant.id}`;

const mapSupabasePlantToFlower = (plant: HouseholdPlant, signedImageUrl?: string): Flower => {
  const builtInFallback = plant.legacyId ? builtInFlowerById.get(plant.legacyId) : undefined;

  return {
    carePills: plant.carePills.map((pill) => ({
      label: pill.label,
      tone: pill.tone,
      value: pill.value,
    })),
    careTips: plant.careTips.map((tip) => tip.tip),
    displayName: plant.displayName,
    id: getLegacyStatePlantId(plant),
    identification: fromSupabaseIdentification(plant.identification),
    identificationNote: plant.identificationNote,
    image: signedImageUrl ?? builtInFallback?.image ?? "",
    light: plant.light,
    likelyName: plant.likelyName,
    notificationsEnabled: plant.notificationsEnabled,
    shortCare: plant.shortCare,
    soil: plant.soil,
    source: plant.source === "custom" ? "custom" : "built-in",
    watering: plant.watering,
    ...(plant.wateringIntervalDays ? { wateringIntervalDays: plant.wateringIntervalDays } : {}),
  };
};

export const detectDataSourceMode = ({
  featureEnabled,
  hasAuthenticatedUser,
  hasMigratedHousehold,
  readError = false,
  writesEnabled = false,
}: DataSourceDetectionInput): DataSourceMode => {
  if (!featureEnabled) {
    return "legacy";
  }

  if (!hasAuthenticatedUser || !hasMigratedHousehold) {
    if (hasAuthenticatedUser && readError) {
      return "error";
    }

    return "fallback";
  }

  if (readError) {
    return "error";
  }

  return writesEnabled ? "supabase-readwrite" : "supabase-readonly";
};

export const mapSupabaseRowsToLegacyStateShape = ({
  careRecords,
  diagnosticImageUrls = {},
  diagnostics,
  household,
  plantImageUrls = {},
  plants,
  reportSettings,
}: SupabaseReadRows): SupabaseReadThroughState => {
  const flowers = plants.map((plant) => mapSupabasePlantToFlower(plant, plant.imagePath ? plantImageUrls[plant.imagePath] : undefined));
  const supabasePlantIdsByLegacyId = Object.fromEntries(
    plants.map((plant) => [getLegacyStatePlantId(plant), plant.id] as const),
  );
  const legacyIdBySupabasePlantId = new Map(plants.map((plant) => [plant.id, getLegacyStatePlantId(plant)]));

  const records = Object.fromEntries(
    careRecords.flatMap((record) => {
      const legacyId = legacyIdBySupabasePlantId.get(record.plantId);
      return legacyId
        ? [
            [
              legacyId,
              {
                lastFertilized: record.lastFertilized,
                lastTransplanted: record.lastTransplanted,
                lastWatered: record.lastWatered,
                note: record.note,
              },
            ] as const,
          ]
        : [];
    }),
  );

  return {
    allFlowers: flowers,
    customFlowers: flowers,
    diagnostics: diagnostics
      .flatMap((diagnostic) => {
        const legacyPlantId = legacyIdBySupabasePlantId.get(diagnostic.plantId);
        return legacyPlantId
          ? [
              {
                ...diagnostic,
                id: diagnostic.legacyId ?? diagnostic.id,
                imageDataUrl: diagnostic.imagePath ? diagnosticImageUrls[diagnostic.imagePath] ?? "" : "",
                imagePath: diagnostic.imagePath ?? undefined,
                plantId: legacyPlantId,
                storageMode: "supabase" as const,
                supabaseId: diagnostic.id,
              },
            ]
          : [];
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    household,
    records,
    removedFlowerIds: plants.flatMap((plant) => (plant.isRemoved ? [getLegacyStatePlantId(plant)] : [])),
    reportSettings: {
      lastPushNotificationDate: reportSettings?.lastPushNotificationDate,
      lastSentDate: reportSettings?.lastSentDate,
      recipientEmail: reportSettings?.recipientEmail,
    },
    supabasePlantIdsByLegacyId,
  };
};

const loadRowsForHousehold = async (household: Household) => {
  const plants = await getHouseholdPlantsIncludingRemoved(household.id);
  const [careRecords, diagnostics, reportSettings] = await Promise.all([
    getHouseholdCareRecords(household.id),
    getHouseholdDiagnostics(household.id),
    getHouseholdReportSettings(household.id),
  ]);
  const plantImageUrls = Object.fromEntries(
    await Promise.all(
      plants
        .filter((plant) => plant.imagePath)
        .map(async (plant) => {
          const path = plant.imagePath as string;
          return [path, await getPlantImageSignedUrl(path)] as const;
        }),
    ),
  );
  const diagnosticImageUrls = Object.fromEntries(
    await Promise.all(
      diagnostics
        .filter((diagnostic) => diagnostic.imagePath)
        .map(async (diagnostic) => {
          const path = diagnostic.imagePath as string;
          return [path, await getDiagnosticImageSignedUrl(path)] as const;
        }),
    ),
  );

  return { careRecords, diagnosticImageUrls, diagnostics, household, plantImageUrls, plants, reportSettings };
};

export const loadSupabaseReadThroughState = async (
  activeHousehold: HouseholdSession | null,
  options: SupabaseReadThroughOptions = {},
): Promise<SupabaseReadThroughState | null> => {
  const cacheKey = readThroughCacheKey(activeHousehold);
  const cached = readThroughCache.get(cacheKey);
  if (!options.force && cached && Date.now() - cached.loadedAt < readThroughCacheTtlMs) {
    return cached.state;
  }

  const inFlight = readThroughRequests.get(cacheKey);
  if (!options.force && inFlight) {
    return inFlight;
  }

  const request = loadSupabaseReadThroughStateUncached(activeHousehold)
    .then((state) => {
      readThroughCache.set(cacheKey, { loadedAt: Date.now(), state });
      return state;
    })
    .finally(() => {
      readThroughRequests.delete(cacheKey);
    });

  readThroughRequests.set(cacheKey, request);
  return request;
};

const loadSupabaseReadThroughStateUncached = async (
  activeHousehold: HouseholdSession | null,
): Promise<SupabaseReadThroughState | null> => {
  const households = await getUserHouseholds();
  const preferredHousehold = activeHousehold?.publicToken
    ? households.find((household) => household.id === activeHousehold.publicToken || household.legacyPublicToken === activeHousehold.publicToken)
    : null;
  const candidates = [
    ...(preferredHousehold ? [preferredHousehold] : []),
    ...households.filter((household) => household.id !== preferredHousehold?.id && household.legacyPublicToken),
    ...households.filter((household) => household.id !== preferredHousehold?.id && !household.legacyPublicToken),
  ];

  for (const household of candidates) {
    const rows = await loadRowsForHousehold(household);
    if (rows) {
      return mapSupabaseRowsToLegacyStateShape(rows);
    }
  }

  return null;
};

const countCareRecords = (records: LegacyFlowerRecords) => Object.values(records).filter(recordHasLegacyValue).length;

const sortedUnique = (values: string[]) => [...new Set(values)].sort();

const hasSameSet = (left: string[], right: string[]) => {
  const leftValues = sortedUnique(left);
  const rightValues = sortedUnique(right);
  return leftValues.length === rightValues.length && leftValues.every((value, index) => value === rightValues[index]);
};

export const compareLegacyAndSupabaseHouseholdState = (
  legacy: LegacyHouseholdState,
  supabaseState: SupabaseReadThroughState,
): LegacySupabaseComparison => {
  const legacyPlantIds = new Set(legacy.allFlowers.map((flower) => flower.id));
  const supabasePlantIds = supabaseState.allFlowers.map((flower) => flower.id);
  const missingLegacyIds = sortedUnique([
    ...supabaseState.allFlowers.filter((flower) => !legacyPlantIds.has(flower.id)).map((flower) => flower.id),
    ...legacy.allFlowers.filter((flower) => !supabasePlantIds.includes(flower.id)).map((flower) => flower.id),
  ]);
  const summary = {
    legacyCareRecords: countCareRecords(legacy.records),
    legacyDiagnostics: legacy.diagnostics.length,
    legacyHiddenOrRemovedPlants: legacy.removedFlowerIds.length,
    legacyPlants: legacy.allFlowers.length,
    supabaseCareRecords: countCareRecords(supabaseState.records),
    supabaseDiagnostics: supabaseState.diagnostics.length,
    supabaseHiddenOrRemovedPlants: supabaseState.removedFlowerIds.length,
    supabasePlants: supabaseState.allFlowers.length,
  };

  return {
    careRecordCountMismatch: summary.legacyCareRecords !== summary.supabaseCareRecords,
    diagnosisCountMismatch: summary.legacyDiagnostics !== summary.supabaseDiagnostics,
    hiddenRemovedPlantMismatch: !hasSameSet(legacy.removedFlowerIds, supabaseState.removedFlowerIds),
    missingLegacyIds,
    plantCountMismatch: summary.legacyPlants !== summary.supabasePlants,
    summary,
  };
};
