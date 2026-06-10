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
  assert.match(appSource, /isAccessChecking && !isRouteAllowedWithoutHousehold/);
  assert.match(appSource, /!activeHousehold && !supabaseReadState && !isRouteAllowedWithoutHousehold/);
});

test("AI frontend calls use backend provider layer", () => {
  const diagnosisSource = readFileSync("src/utils/diagnostics.ts", "utf8");
  const careSource = readFileSync("src/utils/customFlower.ts", "utf8");

  assert.match(diagnosisSource, /callBackendFunction/);
  assert.match(diagnosisSource, /functionName: "plant-diagnosis-ai"/);
  assert.match(careSource, /callBackendFunction/);
  assert.match(careSource, /functionName: "plant-care-ai"/);
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
  assert.match(diagnosisEdge, /can_use_feature/);
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
