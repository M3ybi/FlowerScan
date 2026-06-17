import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveBackendProvider } from "../src/lib/backendConfig.js";

test("Supabase is the default backend provider", () => {
  assert.deepEqual(resolveBackendProvider("supabase", false), {
    isLegacyNetlifyBackendEnabled: false,
    isSupabaseBackend: true,
    provider: "supabase",
  });
});

test("legacy Netlify backend requires explicit provider or fallback flag", () => {
  assert.equal(resolveBackendProvider("netlify", false).isLegacyNetlifyBackendEnabled, true);
  assert.equal(resolveBackendProvider("supabase", true).isLegacyNetlifyBackendEnabled, true);
});

test("Supabase reads are default-on when the browser client is configured", () => {
  const appSource = readFileSync("src/App.tsx", "utf8");

  assert.match(appSource, /import \{ isSupabaseConfigured \} from "\.\/lib\/supabase"/);
  assert.match(appSource, /const isSupabaseReadThroughEnabled = isSupabaseConfigured && import\.meta\.env\.VITE_DISABLE_SUPABASE_READS !== "true"/);
  assert.doesNotMatch(appSource, /VITE_ENABLE_SUPABASE_READS === "true"/);
});

test("Supabase-only data mode uses empty local plant baseline", () => {
  const appSource = readFileSync("src/App.tsx", "utf8");

  assert.match(appSource, /VITE_DISABLE_SUPABASE_WRITES !== "true"/);
  assert.match(appSource, /VITE_ENABLE_SUPABASE_WRITES !== "false"/);
  assert.match(appSource, /const isSupabaseOnlyDataMode = isSupabaseReadThroughEnabled && isSupabaseBackend/);
  assert.match(appSource, /isSupabaseOnlyDataMode\s*\?\s*\[\]/);
});

test("Supabase-only writes fail closed instead of saving legacy fallback data", () => {
  const appSource = readFileSync("src/App.tsx", "utf8");

  assert.match(appSource, /runRequiredSupabaseWrite/);
  assert.match(appSource, /if \(isSupabaseOnlyDataMode\) \{\s*try \{\s*await runRequiredSupabaseWrite\(operation\)/);
  assert.match(appSource, /else if \(isSupabaseOnlyDataMode\)/);
});

test("household creation uses Supabase RPC before legacy Netlify fallback", () => {
  const appSource = readFileSync("src/App.tsx", "utf8");
  const createHouseholdSection = appSource.slice(appSource.indexOf("const handleCreateHousehold"), appSource.indexOf("const copyHouseholdLink"));

  assert.match(createHouseholdSection, /createHousehold\(householdNameDraft\)/);
  assert.match(createHouseholdSection, /isLegacyNetlifyBackendEnabled/);
  assert.match(createHouseholdSection, /!auth\.isAuthenticated/);
  assert.doesNotMatch(createHouseholdSection, /localGuestHouseholdToken/);
});

test("legacy Netlify plant-state sync is gated away from Supabase source-of-truth mode", () => {
  const appSource = readFileSync("src/App.tsx", "utf8");
  const plantStateReferences = appSource.match(/plant-state/g) ?? [];

  assert.ok(plantStateReferences.length > 0);
  assert.match(appSource, /!isLegacyNetlifyBackendEnabled \|\| supabaseWriteMode === "supabase-first"/);
});

test("Supabase-first startup preserves existing stored legacy household sessions", () => {
  const appSource = readFileSync("src/App.tsx", "utf8");
  const resolverSection = appSource.slice(appSource.indexOf("const resolveHousehold"), appSource.indexOf("void resolveHousehold"));

  assert.match(resolverSection, /storedHousehold\?\.publicToken === token/);
  assert.match(resolverSection, /isLegacyNetlifyBackendEnabled/);
  assert.match(resolverSection, /createHouseholdApiUrl\("\/\.netlify\/functions\/household-access"/);
});

test("Supabase startup loads authenticated household even without a cached token", () => {
  const appSource = readFileSync("src/App.tsx", "utf8");
  const resolverSection = appSource.slice(appSource.indexOf("const resolveHousehold"), appSource.indexOf("void resolveHousehold"));

  assert.match(resolverSection, /!token && \(!isSupabaseBackend \|\| !auth\.isAuthenticated\)/);
  assert.match(resolverSection, /const households = await getUserHouseholds\(\)/);
  assert.match(resolverSection, /\(token \? households\.find/);
  assert.match(resolverSection, /\?\? households\[0\] \?\? null/);
});

test("Supabase startup without memberships prompts create or join instead of invalid link", () => {
  const appSource = readFileSync("src/App.tsx", "utf8");
  const resolverSection = appSource.slice(appSource.indexOf("const resolveHousehold"), appSource.indexOf("void resolveHousehold"));

  assert.match(resolverSection, /if \(!supabaseHousehold\)/);
  assert.match(resolverSection, /clearHouseholdSession\(\)/);
  assert.match(resolverSection, /setSupabaseReadState\(null\)/);
  assert.match(resolverSection, /setAccessStatus\(""\)/);
});

test("public menu and compliance routes are not blocked by household gate", () => {
  const appSource = readFileSync("src/App.tsx", "utf8");

  assert.match(appSource, /const isRouteAllowedWithoutHousehold/);
  assert.match(appSource, /route\.page === "menu"/);
  assert.match(appSource, /route\.page === "legal"/);
  assert.match(appSource, /\(!shouldUseSupabaseAccountData && isAccessChecking\)\) && !isRouteAllowedWithoutHousehold/);
  assert.match(appSource, /!activeHousehold && !supabaseReadState && !isRouteAllowedWithoutHousehold/);
});

test("AI frontend calls use backend provider layer", () => {
  const diagnosisSource = readFileSync("src/utils/diagnostics.ts", "utf8");
  const careSource = readFileSync("src/utils/customFlower.ts", "utf8");

  assert.match(diagnosisSource, /callBackendFunction/);
  assert.match(diagnosisSource, /functionName: "plant-diagnosis-ai"/);
  assert.match(diagnosisSource, /error instanceof Error && error\.message \? error\.message/);
  assert.match(careSource, /callBackendFunction/);
  assert.match(careSource, /functionName: "plant-care-ai"/);
});

test("subscription UI is driven by household server plan usage", () => {
  const appSource = readFileSync("src/App.tsx", "utf8");
  const pricingSource = readFileSync("src/components/PricingPage.tsx", "utf8");

  assert.match(appSource, /const accountSubscriptionLabel = householdPlanUsage/);
  assert.match(appSource, /<PricingPage householdPlanUsage=\{householdPlanUsage\} language=\{selectedLanguage\} \/>/);
  assert.match(pricingSource, /householdPlanUsage\?: HouseholdPlanUsage \| null/);
  assert.match(pricingSource, /const hasServerPremium = householdPlanUsage\?\.isPremium === true/);
  assert.match(pricingSource, /pricing\.currentServerPremium/);
});

test("Supabase function errors surface safe backend messages to the UI", () => {
  const backendSource = readFileSync("src/lib/backendConfig.ts", "utf8");

  assert.match(backendSource, /const extractResponseErrorMessage = async \(response: Response\)/);
  assert.match(backendSource, /payload\.error === "string"/);
  assert.match(backendSource, /extractSupabaseFunctionErrorMessage/);
});

test("Supabase diagnosis confidence labels are mapped to the database enum", () => {
  const repositorySource = readFileSync("src/lib/plantieRepository.ts", "utf8");

  assert.match(repositorySource, /type DbDiagnosisConfidenceLabel = "nizka" \| "stredna" \| "vysoka"/);
  assert.match(repositorySource, /const toDisplayConfidenceLabel/);
  assert.match(repositorySource, /const toDbConfidenceLabel/);
  assert.match(repositorySource, /confidence_label: toDbConfidenceLabel\(input\.confidenceLabel\)/);
});

test("Supabase startup avoids duplicate per-plant PostgREST reads", () => {
  const appSource = readFileSync("src/App.tsx", "utf8");
  const readThroughSource = readFileSync("src/lib/supabaseReadThrough.ts", "utf8");

  assert.doesNotMatch(appSource, /getPlantDiagnostics/);
  assert.doesNotMatch(appSource, /loadSupabaseLinkedPlants/);
  assert.doesNotMatch(appSource, /loadSupabaseDiagnostics/);
  assert.match(readThroughSource, /const readThroughCacheTtlMs = 60_000/);
  assert.match(readThroughSource, /const readThroughRequests = new Map/);
  assert.match(readThroughSource, /export const invalidateSupabaseReadThroughCache/);
  assert.match(readThroughSource, /household\.id === activeHousehold\.publicToken \|\| household\.legacyPublicToken === activeHousehold\.publicToken/);
});

test("high-frequency Supabase reads use explicit columns and debug logging", () => {
  const repositorySource = readFileSync("src/lib/plantieRepository.ts", "utf8");

  assert.doesNotMatch(repositorySource, /\.select\(\s*["']\*["']\s*\)/);
  assert.match(repositorySource, /const householdSelect = "id,name,legacy_public_token,created_by,created_at,updated_at"/);
  assert.match(repositorySource, /plant_care_pills\(id,label,position,tone,value\)/);
  assert.match(repositorySource, /diagnostic_observed_symptoms\(position,symptom\)/);
  assert.match(repositorySource, /plantie-debug-supabase-reads/);
});

test("PostgREST egress hardening revokes anon private table reads and adds common indexes", () => {
  const migration = readFileSync("supabase/migrations/20260615143000_tighten_postgrest_egress_access.sql", "utf8");

  assert.match(migration, /revoke all on table public\.plants from anon/);
  assert.match(migration, /revoke all on table public\.plant_diagnostics from anon/);
  assert.match(migration, /grant select on table public\.plant_catalog to anon/);
  assert.match(migration, /using \(is_active = true\)/);
  assert.match(migration, /plants_household_legacy_id_idx/);
  assert.match(migration, /plant_diagnostics_household_created_at_idx/);
  assert.match(migration, /plant_care_records_household_plant_idx/);
});

test("frontend does not reference server-only backend secrets", () => {
  const frontendSources = [
    "src/App.tsx",
    "src/lib/backendConfig.ts",
    "src/utils/diagnostics.ts",
    "src/utils/customFlower.ts",
    "src/utils/pushNotifications.ts",
  ].map((path) => readFileSync(path, "utf8")).join("\n");

  assert.doesNotMatch(frontendSources, /OPENAI_API_KEY/);
  assert.doesNotMatch(frontendSources, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(frontendSources, /REVENUECAT_WEBHOOK_SECRET/);
});

test("Supabase Edge Functions declare server-only secret usage", () => {
  const diagnosisEdge = readFileSync("supabase/functions/plant-diagnosis-ai/index.ts", "utf8");
  const revenueCatEdge = readFileSync("supabase/functions/revenuecat-webhook/index.ts", "utf8");

  assert.match(diagnosisEdge, /Deno\.env\.get\("OPENAI_API_KEY"\)/);
  assert.match(diagnosisEdge, /reserve_ai_analyze_usage/);
  assert.match(diagnosisEdge, /commit_ai_analyze_usage/);
  assert.match(revenueCatEdge, /Deno\.env\.get\("REVENUECAT_WEBHOOK_SECRET"\)/);
  assert.match(revenueCatEdge, /createServiceClient/);
});

test("authenticated Supabase role has table grants required before RLS policies apply", () => {
  const grantMigration = readFileSync("supabase/migrations/20260610102000_authenticated_table_grants.sql", "utf8");

  assert.match(grantMigration, /grant usage on schema public to authenticated/i);
  assert.match(grantMigration, /'households'/);
  assert.match(grantMigration, /'household_members'/);
  assert.match(grantMigration, /to_regclass\(format\('public\.\%I', table_name\)\)/);
  assert.match(grantMigration, /grant select, insert, update, delete on table public\.\%I to authenticated/i);
  assert.doesNotMatch(grantMigration, /to anon/i);
});
