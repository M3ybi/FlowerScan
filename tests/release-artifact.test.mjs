import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { build } from "vite";
import { containsClientSecret } from "../scripts/check-client-secrets.mjs";

test("release metadata hashes the final emitted production entry bytes", async () => {
  const values = { PLANTIE_RELEASE_ENV: "production", PLANTIE_RELEASE_PLATFORM: "web", CONTEXT: "production",
    PLANTIE_PRODUCTION_SUPABASE_URL: "https://production.example.invalid", VITE_SUPABASE_URL: "https://production.example.invalid",
    VITE_SUPABASE_ANON_KEY: "synthetic-public-fixture", VITE_REVENUECAT_API_KEY_WEB: "rcb_synthetic_fixture" };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  const directory = path.resolve(".tmp-tests/release-artifact");
  Object.assign(process.env, values);
  try {
    await build({ mode: "production", logLevel: "silent", build: { outDir: directory } });
    const manifest = JSON.parse(await readFile(path.join(directory, "plantie-release.json"), "utf8"));
    assert.equal(manifest.environment, "production");
    assert.ok(manifest.entries.length > 0);
    for (const entry of manifest.entries) assert.equal(createHash("sha256").update(await readFile(path.join(directory, entry.file))).digest("hex"), entry.sha256);
    const visit = async root => {
      for (const entry of await readdir(root, { withFileTypes: true })) {
        const file = path.join(root, entry.name);
        if (entry.isDirectory()) await visit(file);
        else {
          assert.equal(entry.name.endsWith(".map"), false);
          if (/\.(js|css|html|json)$/.test(entry.name)) assert.equal(containsClientSecret(await readFile(file, "utf8")), false);
        }
      }
    };
    await visit(directory);
  } finally { for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
