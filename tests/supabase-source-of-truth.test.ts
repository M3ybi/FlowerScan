import assert from "node:assert/strict";
import test from "node:test";
import { flowers } from "../src/data/flowers.js";
import {
  createSupabaseDiagnosis,
  detectSupabaseWriteMode,
  runRequiredSupabaseWrite,
  runSupabaseWrite,
  setSupabasePlantRemoved,
  updateSupabaseCareRecord,
  updateSupabaseReportSettings,
  upsertSupabasePlantFromFlower,
} from "../src/lib/supabaseSourceOfTruth.js";
import type { SupabaseWriteDependencies } from "../src/lib/supabaseSourceOfTruth.js";
import { imageUploadValidationToken, uploadPlantImage } from "../src/lib/plantieRepository.js";
import type { HouseholdPlant, PlantCatalogItem } from "../src/lib/plantieRepository.js";

const basePlant: HouseholdPlant = {
  carePills: [],
  careTips: [],
  catalogPlantId: null,
  createdAt: "2026-06-01T08:00:00.000Z",
  createdBy: "user-id",
  displayName: flowers[0].displayName,
  householdId: "household-id",
  id: "plant-id",
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
  updatedAt: "2026-06-01T08:00:00.000Z",
  watering: flowers[0].watering,
  wateringIntervalDays: null,
};

const catalogPlant: PlantCatalogItem = {
  carePills: [],
  careTips: [],
  displayName: flowers[0].displayName,
  id: "catalog-id",
  identification: "confident",
  identificationNote: flowers[0].identificationNote,
  imagePath: null,
  isActive: true,
  legacyId: flowers[0].id,
  light: flowers[0].light,
  likelyName: flowers[0].likelyName,
  shortCare: flowers[0].shortCare,
  soil: flowers[0].soil,
  watering: flowers[0].watering,
  wateringIntervalDays: null,
};

const createDeps = (patch: Partial<SupabaseWriteDependencies> = {}) => {
  const calls: string[] = [];
  const deps: SupabaseWriteDependencies = {
    createHouseholdPlant: async (input) => {
      calls.push(`create:${input.legacyId}`);
      return { ...basePlant, id: `created-${input.legacyId}`, legacyId: input.legacyId ?? null, source: input.source };
    },
    createPlantDiagnostic: async (input) => {
      calls.push(`create-diagnosis:${input.legacyId}`);
      return {
        ...input,
        createdAt: "2026-06-01T08:00:00.000Z",
        householdId: "household-id",
        id: "diagnosis-id",
        imagePath: input.imagePath ?? null,
        legacyId: input.legacyId ?? null,
        updatedAt: "2026-06-01T08:00:00.000Z",
        userNote: input.userNote ?? "",
      };
    },
    getHouseholdPlantById: async (plantId) => ({ ...basePlant, id: plantId }),
    getHouseholdPlantByLegacyId: async (_householdId, legacyId) => {
      calls.push(`find:${legacyId}`);
      return null;
    },
    getPlantCatalogByLegacyId: async () => catalogPlant,
    toBlob: async () => new Blob(["x"], { type: "image/jpeg" }),
    updateHouseholdPlant: async (id, input) => {
      calls.push(`update:${id}`);
      return { ...basePlant, id, isRemoved: input.isRemoved ?? basePlant.isRemoved };
    },
    updateHouseholdReportSettings: async (_householdId, input) => {
      calls.push(`report:${input.recipientEmail ?? ""}`);
      return {};
    },
    updatePlantCareRecord: async (plantId, input) => {
      calls.push(`care:${plantId}:${input.lastWatered ?? ""}:${input.note ?? ""}`);
      return {};
    },
    updatePlantDiagnostic: async (id, input) => {
      calls.push(`update-diagnosis:${id}:${input.userConfirmation ?? ""}:${input.userNote ?? ""}`);
      return {
        confidence: 75,
        confidenceLabel: "stredná",
        createdAt: "2026-06-01T08:00:00.000Z",
        diagnosisTitle: "Test",
        disclaimer: "AI",
        householdId: "household-id",
        id,
        imagePath: input.imagePath ?? null,
        legacyId: id,
        observedSymptoms: ["leaf"],
        plantId: "plant-id",
        reasoningSummary: "reason",
        recommendedSteps: ["step"],
        riskLevel: "medium",
        updatedAt: "2026-06-01T08:00:00.000Z",
        userConfirmation: input.userConfirmation ?? "confirmed",
        userNote: input.userNote ?? "",
      };
    },
    uploadDiagnosticImage: async (_householdId, _diagnosticId, _imageBlob, validation) => {
      assert.equal(validation?.validationToken, imageUploadValidationToken);
      calls.push("upload-diagnosis-image");
      return "diagnostic/path.jpg";
    },
    uploadPlantImage: async (_householdId, _plantId, _imageBlob, validation) => {
      assert.equal(validation?.validationToken, imageUploadValidationToken);
      calls.push("upload-plant-image");
      return "plant/path.jpg";
    },
    ...patch,
  };

  return { calls, deps };
};

test("writes flag disabled uses legacy-only mode", () => {
  assert.equal(
    detectSupabaseWriteMode({
      hasAuthenticatedUser: true,
      hasMigratedHousehold: true,
      readsEnabled: true,
      writesEnabled: false,
    }),
    "legacy-only",
  );
});

test("writes flag enabled without reads uses legacy-only mode", () => {
  assert.equal(
    detectSupabaseWriteMode({
      hasAuthenticatedUser: true,
      hasMigratedHousehold: true,
      readsEnabled: false,
      writesEnabled: true,
    }),
    "legacy-only",
  );
});

test("authenticated migrated user write goes to Supabase first", async () => {
  assert.equal(
    detectSupabaseWriteMode({
      hasAuthenticatedUser: true,
      hasMigratedHousehold: true,
      readsEnabled: true,
      writesEnabled: true,
    }),
    "supabase-first",
  );

  const { calls, deps } = createDeps();
  const result = await runSupabaseWrite(() => updateSupabaseCareRecord("plant-id", { lastWatered: "2026-06-01" }, deps));

  assert.equal(result.mode, "supabase");
  assert.deepEqual(calls, ["care:plant-id:2026-06-01:"]);
});

test("Supabase write failure falls back to legacy", async () => {
  const { deps } = createDeps({
    updatePlantCareRecord: async () => {
      throw new Error("RLS failed");
    },
  });
  const result = await runSupabaseWrite(() => updateSupabaseCareRecord("plant-id", { lastWatered: "2026-06-01" }, deps));

  assert.equal(result.mode, "fallback");
});

test("required Supabase write failures are surfaced without fallback", async () => {
  const { deps } = createDeps({
    updatePlantCareRecord: async () => {
      throw new Error("RLS failed");
    },
  });

  await assert.rejects(
    () => runRequiredSupabaseWrite(() => updateSupabaseCareRecord("plant-id", { lastWatered: "2026-06-01" }, deps)),
    /RLS failed/,
  );
});

test("custom plant upsert avoids duplicate rows by updating existing legacy ID", async () => {
  const { calls, deps } = createDeps({
    getHouseholdPlantByLegacyId: async (_householdId, legacyId) => {
      calls.push(`find:${legacyId}`);
      return { ...basePlant, id: "existing-plant", legacyId, source: "custom" };
    },
  });

  const customPlant = { ...flowers[0], id: "custom-plant", source: "custom" as const };
  const plant = await upsertSupabasePlantFromFlower("household-id", customPlant, deps);

  assert.equal(plant.id, "existing-plant");
  assert.deepEqual(calls.filter((call) => call.startsWith("create:")), []);
  assert.ok(calls.includes("update:existing-plant"));
});

test("removed built-in plant state persists to Supabase", async () => {
  const { calls, deps } = createDeps({
    getHouseholdPlantByLegacyId: async () => basePlant,
  });

  const plant = await setSupabasePlantRemoved("household-id", flowers[0].id, true, deps);

  assert.equal(plant.isRemoved, true);
  assert.deepEqual(calls, ["update:plant-id"]);
});

test("care record updates persist sanitized notes", async () => {
  const { calls, deps } = createDeps();
  await updateSupabaseCareRecord("plant-id", { lastFertilized: "2026-05-31", note: " hi \u0000 there " }, deps);

  assert.deepEqual(calls, ["care:plant-id::hi there"]);
});

test("report settings persist", async () => {
  const { calls, deps } = createDeps();
  await updateSupabaseReportSettings("household-id", { recipientEmail: " plantie@example.com " }, deps);

  assert.deepEqual(calls, ["report:plantie@example.com"]);
});

test("diagnosis create and update use Supabase helpers", async () => {
  const { calls, deps } = createDeps();
  await createSupabaseDiagnosis(
    {
      diagnosis: {
        confidence: 75,
        confidenceLabel: "stredná",
        diagnosisTitle: "Test",
        disclaimer: "AI",
        observedSymptoms: ["leaf"],
        reasoningSummary: "reason",
        recommendedSteps: ["step"],
        riskLevel: "medium",
      },
      imageDataUrl: "data:image/jpeg;base64,abc",
      legacyId: "legacy-diagnosis",
      plantId: "plant-id",
      userConfirmation: "confirmed",
      userNote: " ok ",
    },
    deps,
  );

  assert.deepEqual(calls, ["upload-diagnosis-image", "create-diagnosis:legacy-diagnosis"]);
});

test("rollback mode keeps writes legacy-only when local or env disables Supabase writes", () => {
  assert.equal(
    detectSupabaseWriteMode({
      hasAuthenticatedUser: true,
      hasMigratedHousehold: true,
      readsEnabled: true,
      writesEnabled: false,
    }),
    "legacy-only",
  );
});

test("direct image upload helper rejects missing AI validation", async () => {
  await assert.rejects(
    () => uploadPlantImage("00000000-0000-4000-8000-000000000000", "00000000-0000-4000-8000-000000000001", new Blob(["x"], { type: "image/jpeg" })),
    /requires AI validation/,
  );
});
