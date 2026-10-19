import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { executeVerification, npmCommand, verificationExitCode } from "./lib/releaseVerification.mjs";

const localOnly = process.argv.includes("--local-only");
const results = [];
const steps = [
  ["install", ["ci"]], ["application", ["run", "check"]],
  ["image-chromium", ["run", "test:image-browser"]], ["image-webkit", ["run", "test:image-webkit"]],
  ["application-chromium", ["run", "test:application-browser"]], ["application-webkit", ["run", "test:application-webkit"]],
  ["auth-browser", ["run", "test:auth-flow-browser"]], ["audit-all", ["audit"]], ["audit-production", ["audit", "--omit=dev"]],
  ["edge-types", ["exec", "--yes", "--package=deno@2.9.6", "--", "npm", "run", "check:edge-types"]],
  ["auth-signature", ["exec", "--yes", "--package=deno@2.9.6", "--", "npm", "run", "test:auth-signature"]],
  ["source-graph", ["run", "check:source-graph"]], ["bundle-secrets", ["run", "check:client-secrets"]],
];
for (const [index, [name, args]] of steps.entries()) {
  console.log(`Verifying ${name}...`);
  const result = await executeVerification({ ...npmCommand(args), log: `.tmp-v4-release-${name}.log` });
  results.push({ name, command: `npm ${args.join(" ")}`, ...result });
  console.log(`${name}: ${result.status} (${result.exitCode})`);
  // Dependent checks must not run with a failed installation or stale build.
  if (result.status !== "PASS" && ["install", "application"].includes(name)) {
    results.push(...steps.slice(index + 1).map(([name]) => ({ name, status: "NOT_RUN", reason: "Installation or application prerequisite failed" })));
    break;
  }
}
if (process.env.PLANTIE_TEST_POSTGRES_URL) {
  for (const script of ["test:postgres", "test:postgres-migrations"]) {
    const result = await executeVerification({ ...npmCommand(["run", script]), log: `.tmp-v4-release-${script.replaceAll(":", "-")}.log` });
    results.push({ name: script, command: `npm run ${script}`, ...result });
  }
} else results.push({ name: "postgres", status: "BLOCKED", reason: "Disposable loopback PLANTIE_TEST_POSTGRES_URL not supplied" });
const supabase = await executeVerification({ ...npmCommand(["run", "test:supabase-local"]), log: ".tmp-v4-release-supabase.log", blockedExitCodes: [2] });
results.push({ name: "full-supabase", ...supabase });
if (process.env.JAVA_HOME) {
  results.push({ name: "android-debug", ...await executeVerification({ ...npmCommand(["run", "android:build"]), log: ".tmp-v4-release-android.log" }) });
} else results.push({ name: "android-debug", status: "BLOCKED", reason: "JAVA_HOME/Android SDK not supplied" });
results.push({ name: "diff-format", ...await executeVerification({ command: "git", args: ["diff", "--check"], log: ".tmp-v4-release-diff.log" }) });
for (const [name, reason] of [
  ["hosted-config-auth-storage", "No authorized staging or production verification"],
  ["real-email-billing", "Authorized test environment and provider acceptance evidence required"],
  ["physical-image-path", "Ten repeated Add Plant/Diagnosis selections on each intended physical platform required"],
  ["signed-native-releases", "Store signing, Xcode and device evidence required"],
]) results.push({ name, status: "BLOCKED", reason });
const report = { schemaVersion: 1, revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  dirty: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()),
  generatedAtUtc: new Date().toISOString(), localOnly, results, releaseVerdict: "NOT READY" };
await mkdir(".tmp-tests", { recursive: true });
await writeFile(".tmp-tests/v4-release-verification.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ results: results.map(({ name, status }) => ({ name, status })), releaseVerdict: report.releaseVerdict }));
process.exitCode = verificationExitCode(results, localOnly);
