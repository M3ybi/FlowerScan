import { imageUploadConfig } from "./imageUploadConfig.js";
import { ImageUploadError } from "./imageUploadErrors.js";
import { getRetryImageId } from "./imageStoragePaths.js";
import type { Flower } from "../data/flowers.js";
import { sanitizeDiagnosticNote } from "../utils/diagnostics.js";
import type { DiagnosisConfirmation, PlantDiagnosisDraft } from "../utils/diagnostics.js";
import { builtInLegacyIds } from "./legacyMigrationRules.js";
import type { LegacyFlowerRecord } from "./legacyMigrationRules.js";
import {
  createHouseholdPlant,
  createPlantDiagnostic,
  deleteUploadedImage,
  getHouseholdPlantById,
  getPlantDiagnosticByLegacyId,
  getHouseholdPlantByLegacyId,
  getPlantCatalogByLegacyId,
  imageUploadValidationToken,
  updateHouseholdPlant,
  updateHouseholdReportSettings,
  updatePlantCareRecord,
  updatePlantDiagnostic,
  uploadDiagnosticImage,
  uploadPlantImage,
} from "./plantieRepository.js";
import type {
  HouseholdPlant,
  PlantCatalogItem,
  SupabasePlantDiagnostic,
  UpdateHouseholdReportSettingsPatch,
} from "./plantieRepository.js";

export type SupabaseWriteModeInput = {
  hasAuthenticatedUser: boolean;
  hasMigratedHousehold: boolean;
  readsEnabled: boolean;
  writesEnabled: boolean;
};

export type SupabaseWriteMode = "legacy-only" | "supabase-first";

export type SupabaseWriteResult<T> =
  | { mode: "supabase"; value: T }
  | { error: unknown; mode: "fallback" };

export class PlantImageUploadError extends Error {
  constructor(error: unknown) {
    super(error instanceof Error ? error.message : "Image upload failed.");
    this.name = "PlantImageUploadError";
  }
}

const requirePlantImageUpload = async (operation: () => Promise<string>) => {
  try {
    return await operation();
  } catch (error) {
    throw error instanceof ImageUploadError ? error : new PlantImageUploadError(error);
  }
};

export type SupabaseWriteDependencies = {
  createHouseholdPlant: typeof createHouseholdPlant;
  createPlantDiagnostic: typeof createPlantDiagnostic;
  deleteUploadedImage: typeof deleteUploadedImage;
  getHouseholdPlantById: typeof getHouseholdPlantById;
  getPlantDiagnosticByLegacyId: typeof getPlantDiagnosticByLegacyId;
  getHouseholdPlantByLegacyId: typeof getHouseholdPlantByLegacyId;
  getPlantCatalogByLegacyId: typeof getPlantCatalogByLegacyId;
  toBlob: (dataUrl: string) => Promise<Blob>;
  updateHouseholdPlant: typeof updateHouseholdPlant;
  updateHouseholdReportSettings: typeof updateHouseholdReportSettings;
  updatePlantCareRecord: typeof updatePlantCareRecord;
  updatePlantDiagnostic: typeof updatePlantDiagnostic;
  uploadDiagnosticImage: typeof uploadDiagnosticImage;
  uploadPlantImage: typeof uploadPlantImage;
};

const dataUrlToBlob = async (dataUrl: string) => {
  const response = await fetch(dataUrl);
  return response.blob();
};

export const defaultSupabaseWriteDependencies: SupabaseWriteDependencies = {
  createHouseholdPlant,
  createPlantDiagnostic,
  deleteUploadedImage,
  getHouseholdPlantById,
  getPlantDiagnosticByLegacyId,
  getHouseholdPlantByLegacyId,
  getPlantCatalogByLegacyId,
  toBlob: dataUrlToBlob,
  updateHouseholdPlant,
  updateHouseholdReportSettings,
  updatePlantCareRecord,
  updatePlantDiagnostic,
  uploadDiagnosticImage,
  uploadPlantImage,
};

export const detectSupabaseWriteMode = ({
  hasAuthenticatedUser,
  hasMigratedHousehold,
  readsEnabled,
  writesEnabled,
}: SupabaseWriteModeInput): SupabaseWriteMode =>
  readsEnabled && writesEnabled && hasAuthenticatedUser && hasMigratedHousehold ? "supabase-first" : "legacy-only";

const toIdentificationStatus = (value: Flower["identification"]) =>
  (value === "needs-confirmation" ? "needs_confirmation" : value) as "confident" | "likely" | "needs_confirmation";

const isDataImage = (value: string) => /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value);

const toPlantInput = (
  flower: Flower,
  householdId: string,
  catalogPlant: PlantCatalogItem | null,
  imagePath: string | null,
) => ({
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
  source: (builtInLegacyIds.has(flower.id) && flower.source !== "custom" ? "built_in" : "custom") as "built_in" | "custom",
  watering: flower.watering,
  wateringIntervalDays: flower.wateringIntervalDays ?? null,
});

const maybeCreatePlantImageBlob = async (flower: Flower, deps: SupabaseWriteDependencies) => {
  if (!isDataImage(flower.image)) {
    return null;
  }

  const blob = await deps.toBlob(flower.image);
  if (blob.size > imageUploadConfig.maxOriginalBytes || !(imageUploadConfig.supportedInputMimeTypes as readonly string[]).includes(blob.type)) {
    throw new Error("Plant image is too large or has an unsupported format.");
  }

  return blob;
};

export const upsertSupabasePlantFromFlower = async (
  householdId: string,
  flower: Flower,
  deps = defaultSupabaseWriteDependencies,
) => {
  const existing = await deps.getHouseholdPlantByLegacyId(householdId, flower.id);
  const catalogPlant = builtInLegacyIds.has(flower.id) ? await deps.getPlantCatalogByLegacyId(flower.id) : null;
  const imageBlob = await maybeCreatePlantImageBlob(flower, deps);
  const input = toPlantInput(flower, householdId, catalogPlant, existing?.imagePath ?? null);
  const uploadValidation = { validationToken: imageUploadValidationToken };

  if (existing) {
    const imageId = imageBlob ? await getRetryImageId(householdId, flower.id, imageBlob) : null;
    const imagePath = imageBlob ? await requirePlantImageUpload(() => deps.uploadPlantImage(householdId, imageId!, imageBlob, uploadValidation)) : existing.imagePath;
    try {
      const saved = await deps.updateHouseholdPlant(existing.id, {
        carePills: input.carePills,
        careTips: input.careTips,
        displayName: input.displayName,
        identification: input.identification,
        identificationNote: input.identificationNote,
        imagePath,
        isRemoved: false,
        light: input.light,
        likelyName: input.likelyName,
        notificationsEnabled: input.notificationsEnabled,
        shortCare: input.shortCare,
        soil: input.soil,
        source: input.source,
        watering: input.watering,
        wateringIntervalDays: input.wateringIntervalDays,
      });
      if (imageBlob && existing.imagePath && existing.imagePath !== imagePath) {
        await deps.deleteUploadedImage("plant", existing.imagePath).catch(() => undefined);
      }
      return saved;
    } catch (error) {
      if (imageBlob && imagePath) {
        const committed = await deps.getHouseholdPlantById(existing.id);
        if (committed.imagePath === imagePath) return committed;
        await deps.deleteUploadedImage("plant", imagePath);
      }
      throw error;
    }
  }

  if (imageBlob) {
    const temporaryPlantId = await getRetryImageId(householdId, flower.id, imageBlob);
    const imagePath = await requirePlantImageUpload(() => deps.uploadPlantImage(householdId, temporaryPlantId, imageBlob, uploadValidation));
    try {
      return await deps.createHouseholdPlant(toPlantInput(flower, householdId, catalogPlant, imagePath));
    } catch (error) {
      // A lost response may hide a committed insert. Retain its image on retry.
      const committed = await deps.getHouseholdPlantByLegacyId(householdId, flower.id);
      if (committed?.imagePath === imagePath) return committed;
      await deps.deleteUploadedImage("plant", imagePath);
      if (committed) return committed;
      throw error;
    }
  }

  const created = await deps.createHouseholdPlant(input);
  return created;
};

export const updateSupabaseCareRecord = async (
  plantId: string,
  patch: Partial<LegacyFlowerRecord>,
  deps = defaultSupabaseWriteDependencies,
) =>
  deps.updatePlantCareRecord(plantId, {
    ...(patch.lastFertilized !== undefined ? { lastFertilized: patch.lastFertilized || null } : {}),
    ...(patch.lastTransplanted !== undefined ? { lastTransplanted: patch.lastTransplanted || null } : {}),
    ...(patch.lastWatered !== undefined ? { lastWatered: patch.lastWatered || null } : {}),
    ...(patch.note !== undefined ? { note: sanitizeDiagnosticNote(patch.note) } : {}),
  });

export const setSupabasePlantRemoved = async (
  householdId: string,
  legacyId: string,
  isRemoved: boolean,
  deps = defaultSupabaseWriteDependencies,
) => {
  const plant = await deps.getHouseholdPlantByLegacyId(householdId, legacyId);
  if (!plant) {
    throw new Error("Supabase plant is not available for this legacy ID.");
  }

  return deps.updateHouseholdPlant(plant.id, { isRemoved });
};

export const updateSupabaseReportSettings = async (
  householdId: string,
  patch: UpdateHouseholdReportSettingsPatch,
  deps = defaultSupabaseWriteDependencies,
) =>
  deps.updateHouseholdReportSettings(householdId, {
    ...patch,
    ...(patch.recipientEmail !== undefined ? { recipientEmail: patch.recipientEmail?.trim() || null } : {}),
  });

export const createSupabaseDiagnosis = async (
  input: {
    diagnosis: PlantDiagnosisDraft;
    imageDataUrl: string;
    legacyId: string;
    plantId: string;
    userConfirmation: DiagnosisConfirmation;
    userNote: string;
  },
  deps = defaultSupabaseWriteDependencies,
): Promise<SupabasePlantDiagnostic> => {
  const blob = await deps.toBlob(input.imageDataUrl);
  const plant = await deps.getHouseholdPlantById(input.plantId);
  const diagnosticId = await getRetryImageId(plant.householdId, input.legacyId, blob);
  const imagePath = await deps.uploadDiagnosticImage(plant.householdId, diagnosticId, blob, {
    validationToken: imageUploadValidationToken,
  });
  try {
    const diagnostic = await deps.createPlantDiagnostic({
      ...input.diagnosis,
      imagePath,
      legacyId: input.legacyId,
      plantId: input.plantId,
      userConfirmation: input.userConfirmation,
      userNote: sanitizeDiagnosticNote(input.userNote),
    });
    return diagnostic;
  } catch (error) {
    const committed = await deps.getPlantDiagnosticByLegacyId(input.plantId, input.legacyId);
    if (committed?.imagePath === imagePath) return committed;
    await deps.deleteUploadedImage("diagnostic", imagePath);
    if (committed) return committed;
    throw error;
  }
};

export const updateSupabaseDiagnosis = async (
  diagnosticId: string,
  patch: Partial<{ userConfirmation: DiagnosisConfirmation; userNote: string }>,
  deps = defaultSupabaseWriteDependencies,
) =>
  deps.updatePlantDiagnostic(diagnosticId, {
    ...patch,
    ...(patch.userNote !== undefined ? { userNote: sanitizeDiagnosticNote(patch.userNote) } : {}),
  });

export const runSupabaseWrite = async <T>(operation: () => Promise<T>): Promise<SupabaseWriteResult<T>> => {
  try {
    return { mode: "supabase", value: await operation() };
  } catch (error) {
    return { error, mode: "fallback" };
  }
};

export const runRequiredSupabaseWrite = async <T>(operation: () => Promise<T>): Promise<T> => operation();

export const refreshPlantIdMap = (plants: HouseholdPlant[]) =>
  Object.fromEntries(plants.flatMap((plant) => (plant.legacyId ? [[plant.legacyId, plant.id] as const] : [])));
