import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

// Explicit opt-in: this contacts the linked database, with all changes rolled
// back. Do not add to the offline unit-test runner.
const imagesOnly = process.argv.includes("--images");
const files = imagesOnly ? [
  "supabase/migrations/20261016130000_normalized_image_bucket_limits.sql",
  "supabase/tests/normalized_image_bucket_limits.sql",
] : [
  "supabase/migrations/20261016120000_plant_creation_and_quota_integrity.sql",
  "supabase/migrations/20261016123000_provider_revocation_ordering.sql",
  "supabase/tests/plant_creation_and_quota_integrity.sql",
  "supabase/tests/provider_revocation_ordering.sql",
  "supabase/tests/household_billing_binding.sql",
  "supabase/tests/household_subscription_history.sql",
  "supabase/tests/household_invitation_lifecycle.sql",
];
const directory = mkdtempSync(join(tmpdir(), "plantie-db-audit-"));
const sqlPath = join(directory, "fixtures.sql");
try {
  writeFileSync(sqlPath, "begin;\n" + files.map((file) => readFileSync(file, "utf8")).join("\n") +
    `\nrollback;\nselect 'PASS: ${imagesOnly ? "image bucket fixture" : "five audit fixtures"} rolled back' as result;\n`);
  const cliPath = createRequire(import.meta.url).resolve("supabase/dist/supabase.js");
  const result = spawnSync(process.execPath, [cliPath, "db", "query", "--linked", "--file", sqlPath], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} finally {
  unlinkSync(sqlPath);
  rmdirSync(directory);
}
