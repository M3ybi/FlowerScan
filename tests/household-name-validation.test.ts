import assert from "node:assert/strict";
import test from "node:test";
import { validateHouseholdName } from "../src/lib/householdNameValidation.js";

test("household name validation trims and accepts ordinary names", () => {
  assert.deepEqual(validateHouseholdName("  Petzvalova plants  "), {
    name: "Petzvalova plants",
    valid: true,
  });
});

test("household name validation rejects empty long and vulgar names", () => {
  assert.deepEqual(validateHouseholdName("   "), {
    name: "",
    reason: "required",
    valid: false,
  });
  assert.equal(validateHouseholdName("a".repeat(81)).reason, "too_long");
  assert.equal(validateHouseholdName("kurva plants").reason, "unsafe");
  assert.equal(validateHouseholdName("f.u.c.k plants").reason, "unsafe");
});
