import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const loadEnvFile = (filePath) => {
  if (!existsSync(filePath)) {
    return;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
};

loadEnvFile(resolve(".env"));
loadEnvFile(resolve(".env.local"));

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL or VITE_SUPABASE_URL is required.");
}

if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for catalog seeding. Do not expose it as a VITE_* variable.");
}

const normalizeIdentification = (value) => {
  if (value === "needs-confirmation") {
    return "needs_confirmation";
  }

  if (value === "confident" || value === "likely") {
    return value;
  }

  throw new Error(`Unsupported identification value: ${value}`);
};

const loadFlowers = () => {
  const sourcePath = resolve("src/data/flowers.ts");
  const source = readFileSync(sourcePath, "utf8").replace(
    /const image = \(fileName: string\) =>\s*new URL\(`\.\.\/\.\.\/FlowersImg\/\$\{fileName\}`, import\.meta\.url\)\.href;/,
    'const image = (fileName: string) => `FlowersImg/${fileName}`;',
  );

  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: sourcePath,
  }).outputText;
  const context = {
    exports: {},
    module: { exports: {} },
    URL,
  };

  vm.runInNewContext(transpiled, context, { filename: sourcePath });

  const flowers = context.exports.flowers ?? context.module.exports.flowers;
  if (!Array.isArray(flowers)) {
    throw new Error("Could not load flowers from src/data/flowers.ts.");
  }

  return flowers;
};

const flowers = loadFlowers();
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
  },
});

const catalogRows = flowers.map((flower) => ({
  display_name: flower.displayName,
  identification: normalizeIdentification(flower.identification),
  identification_note: flower.identificationNote,
  image_path: flower.image,
  is_active: true,
  legacy_id: flower.id,
  light: flower.light,
  likely_name: flower.likelyName,
  short_care: flower.shortCare,
  soil: flower.soil,
  watering: flower.watering,
  watering_interval_days: flower.wateringIntervalDays ?? null,
}));

const { error: upsertError } = await supabase
  .from("plant_catalog")
  .upsert(catalogRows, { onConflict: "legacy_id" });

if (upsertError) {
  throw upsertError;
}

const legacyIds = flowers.map((flower) => flower.id);
const { data: catalogPlants, error: selectError } = await supabase
  .from("plant_catalog")
  .select("id, legacy_id")
  .in("legacy_id", legacyIds);

if (selectError) {
  throw selectError;
}

const catalogIdByLegacyId = new Map(catalogPlants.map((plant) => [plant.legacy_id, plant.id]));
const catalogIds = [...catalogIdByLegacyId.values()];

if (catalogIds.length !== flowers.length) {
  throw new Error(`Expected ${flowers.length} catalog rows, found ${catalogIds.length}.`);
}

const { error: deletePillsError } = await supabase
  .from("plant_care_pills")
  .delete()
  .in("catalog_plant_id", catalogIds);

if (deletePillsError) {
  throw deletePillsError;
}

const { error: deleteTipsError } = await supabase
  .from("plant_care_tips")
  .delete()
  .in("catalog_plant_id", catalogIds);

if (deleteTipsError) {
  throw deleteTipsError;
}

const carePillRows = flowers.flatMap((flower) => {
  const catalogPlantId = catalogIdByLegacyId.get(flower.id);
  return flower.carePills.map((pill, index) => ({
    catalog_plant_id: catalogPlantId,
    label: pill.label,
    position: index,
    tone: pill.tone,
    value: pill.value,
  }));
});

const careTipRows = flowers.flatMap((flower) => {
  const catalogPlantId = catalogIdByLegacyId.get(flower.id);
  return flower.careTips.map((tip, index) => ({
    catalog_plant_id: catalogPlantId,
    position: index,
    tip,
  }));
});

const { error: insertPillsError } = await supabase.from("plant_care_pills").insert(carePillRows);
if (insertPillsError) {
  throw insertPillsError;
}

const { error: insertTipsError } = await supabase.from("plant_care_tips").insert(careTipRows);
if (insertTipsError) {
  throw insertTipsError;
}

console.log(`Seeded ${flowers.length} catalog plants, ${carePillRows.length} care pills, and ${careTipRows.length} care tips.`);

