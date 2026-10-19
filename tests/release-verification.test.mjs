import assert from "node:assert/strict";
import test from "node:test";
import { executeVerification, verificationExitCode } from "../scripts/lib/releaseVerification.mjs";

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
