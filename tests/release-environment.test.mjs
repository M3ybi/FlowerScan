import assert from "node:assert/strict";
import test from "node:test";
import { resolveConfig } from "vite";
import { build } from "esbuild";
const compiled = await build({ entryPoints: ["scripts/lib/releaseEnvironment.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { validateReleaseEnvironment, releaseEndpoint } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
const staging = { CONTEXT: "deploy-preview", VITE_SUPABASE_URL: "https://test.example.invalid", VITE_SUPABASE_ANON_KEY: "synthetic-public-key",
  PLANTIE_TEST_SUPABASE_URL: "https://test.example.invalid/", PLANTIE_PRODUCTION_SUPABASE_URL: "https://production.example.invalid",
  VITE_REVENUECAT_API_KEY_TEST_STORE: "test_synthetic_fixture" };

test("approved staging builds and platform-specific production keys pass", () => {
  assert.equal(validateReleaseEnvironment(staging, "test"), "preview");
  for (const [platform, key, value] of [["web", "WEB", "rcb_fixture"], ["ios", "IOS", "appl_fixture"], ["android", "ANDROID", "goog_fixture"]]) {
    assert.equal(validateReleaseEnvironment({ ...staging, CONTEXT: "production", VITE_SUPABASE_URL: staging.PLANTIE_PRODUCTION_SUPABASE_URL,
      PLANTIE_RELEASE_PLATFORM: platform, [`VITE_REVENUECAT_API_KEY_${key}`]: value }, "production"), "production");
  }
});

test("missing targets, environment overrides, legacy paths and wrong billing fail closed", () => {
  for (const changes of [{ PLANTIE_RELEASE_ENV: "local" }, { VITE_SUPABASE_URL: "https://unapproved.example.invalid" },
    { PLANTIE_PRODUCTION_SUPABASE_URL: "" }, { VITE_SUPABASE_ANON_KEY: "" }, { VITE_REVENUECAT_API_KEY_TEST_STORE: "rcb_live" },
    { VITE_BACKEND_PROVIDER: "netlify" }, { VITE_ENABLE_NETLIFY_LEGACY_BACKEND: "true" }]) {
    assert.throws(() => validateReleaseEnvironment({ ...staging, ...changes }, "test"), /RELEASE_/);
  }
  assert.throws(() => validateReleaseEnvironment(staging, "production"), /RELEASE_TEST_BILLING_REQUIRED/);
  assert.throws(() => validateReleaseEnvironment({ ...staging, CONTEXT: "production", VITE_SUPABASE_URL: staging.PLANTIE_PRODUCTION_SUPABASE_URL,
    VITE_REVENUECAT_API_KEY_WEB: "rcb_sb_test" }, "production"), /RELEASE_PRODUCTION_BILLING_REQUIRED/);
  for (const value of ["https://user:password@example.invalid", "https://example.invalid?token=secret", "https://example.invalid/path", "http://example.invalid", "invalid"])
    assert.equal(releaseEndpoint(value), "");
  assert.equal(releaseEndpoint("http://127.0.0.1:54321"), "http://127.0.0.1:54321");
});

test("the live web release can explicitly use Test Store without relaxing its database target", () => {
  const live = { ...staging, CONTEXT: "production", VITE_SUPABASE_URL: staging.PLANTIE_PRODUCTION_SUPABASE_URL,
    VITE_REVENUECAT_BILLING_MODE: "test_store" };
  assert.equal(validateReleaseEnvironment(live, "production"), "production");
  for (const key of ["", "test_", "rcb_sb_fixture", "goog_fixture"]) {
    assert.throws(() => validateReleaseEnvironment({ ...live, VITE_REVENUECAT_API_KEY_TEST_STORE: key }, "production"), /RELEASE_TEST_BILLING_REQUIRED/);
  }
  assert.throws(() => validateReleaseEnvironment({ ...live, VITE_SUPABASE_URL: staging.VITE_SUPABASE_URL }, "production"), /RELEASE_PRODUCTION_TARGET_MISMATCH/);
  assert.throws(() => validateReleaseEnvironment({ ...live, VITE_REVENUECAT_BILLING_MODE: "unknown" }, "production"), /RELEASE_BILLING_MODE_INVALID/);
  for (const platform of ["android", "ios"]) assert.throws(() => validateReleaseEnvironment({ ...live, PLANTIE_RELEASE_PLATFORM: platform }, "production"), /RELEASE_TEST_STORE_NATIVE_DEBUG_REQUIRED/);
  assert.throws(() => validateReleaseEnvironment({ ...staging, VITE_REVENUECAT_BILLING_MODE: "production" }, "test"), /RELEASE_TEST_BILLING_REQUIRED/);
});

test("a preview build cannot select the same approved test and production database", async () => {
  const values = { CONTEXT: "deploy-preview", PLANTIE_TEST_SUPABASE_URL: "https://production.example.invalid",
    PLANTIE_PRODUCTION_SUPABASE_URL: "https://production.example.invalid", VITE_SUPABASE_URL: "https://production.example.invalid",
    VITE_SUPABASE_ANON_KEY: "synthetic-public-key", VITE_REVENUECAT_API_KEY_TEST_STORE: "test_synthetic_fixture" };
  const original = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { await assert.rejects(resolveConfig({ mode: "test", logLevel: "silent" }, "build"), /RELEASE_DATABASE_ISOLATION_REQUIRED/); }
  finally { for (const [key,value] of Object.entries(original)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
