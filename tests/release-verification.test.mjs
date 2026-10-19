import assert from "node:assert/strict";
import test from "node:test";
import { executeVerification, verificationExitCode } from "../scripts/lib/releaseVerification.mjs";
import { supabaseFailureSummary } from "../scripts/lib/supabaseDiagnostics.mjs";

test("Supabase startup diagnostics identify failures without echoing CLI credentials", () => {
  assert.equal(supabaseFailureSummary({ stderr: "entrypoint path does not exist: /private/functions/mail/index.ts" }), "MISSING_FUNCTION_ENTRYPOINT");
  assert.equal(supabaseFailureSummary({ stderr: "failed to pull image from registry: unauthorized token=private-token" }), "CONTAINER_IMAGE_PULL_FAILED");
  assert.equal(supabaseFailureSummary({ stdout: "ANON_KEY=private-value", stderr: "secret=private-value", error: { code: "ENOENT" } }), "EXECUTABLE_UNAVAILABLE");
  assert.equal(supabaseFailureSummary({ stdout: "postgresql://private-user:private-password@host/db", stderr: "eyJ-private-token" }), "UNCLASSIFIED_CLI_FAILURE");
  assert.equal(supabaseFailureSummary({ stderr: "container unhealthy\nno space left on device" }), "CONTAINER_HEALTH_FAILED,DISK_CAPACITY");
  assert.equal(supabaseFailureSummary({ error: { code: "ENOBUFS" } }), "OUTPUT_BUFFER_LIMIT");
});

test("release runner retains child failures, blocked infrastructure and missing executables", async () => {
  for (const code of [0, 1, 2, 17]) {
    const result = await executeVerification({ command: process.execPath, args: ["-e", `process.exit(${code})`] });
    assert.equal(result.exitCode, code);
    assert.equal(result.status, code === 0 ? "PASS" : "FAIL");
  }
  assert.equal((await executeVerification({ command: "plantie-nonexistent-fixture-binary", args: [] })).status, "FAIL");
  assert.equal((await executeVerification({ command: process.execPath, args: ["-e", "process.exit(2)"], blockedExitCodes: [2] })).status, "BLOCKED");
  assert.equal(verificationExitCode([{ status: "PASS" }, { status: "BLOCKED" }]), 2);
  assert.equal(verificationExitCode([{ status: "FAIL" }, { status: "BLOCKED" }], true), 1);
  assert.equal(verificationExitCode([{ status: "PASS" }, { status: "BLOCKED" }], true), 0);
});
