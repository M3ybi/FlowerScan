import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessPlantRecord,
  createHouseholdScopedKey,
  getHouseholdScopedValue,
  isValidHouseholdTokenValue,
  migrateLegacyStateToDefaultHousehold,
} from "../netlify/functions/_shared/household-scope.js";

const householdA = "abc123secret_household_A";
const householdB = "xyz987secret_household_B";

test("app blocks access when no household is selected", () => {
  assert.equal(getHouseholdScopedValue({ [householdA]: { plants: 1 } }, ""), null);
  assert.equal(isValidHouseholdTokenValue(""), false);
});

test("valid household link loads only that household plants", () => {
  const states = {
    [householdA]: { plants: ["adenium"] },
    [householdB]: { plants: ["fittonia"] },
  };

  assert.deepEqual(getHouseholdScopedValue(states, householdA), { plants: ["adenium"] });
});

test("invalid household link does not load data", () => {
  assert.equal(getHouseholdScopedValue({ [householdA]: { plants: ["adenium"] } }, "bad"), null);
});

test("short or predictable tokens are rejected", () => {
  assert.equal(isValidHouseholdTokenValue("1234"), false);
});

test("plant creation stores correct householdId key", () => {
  assert.equal(createHouseholdScopedKey(householdA, "plant-state"), `households/${householdA}/plant-state`);
});

test("plant list is filtered by householdId", () => {
  const states = {
    [householdA]: { customFlowers: [{ id: "a" }] },
    [householdB]: { customFlowers: [{ id: "b" }] },
  };

  assert.deepEqual(getHouseholdScopedValue(states, householdB)?.customFlowers, [{ id: "b" }]);
});

test("watering records cannot cross households", () => {
  assert.equal(canAccessPlantRecord(householdA, householdA, "flower-04", new Set(["flower-04"])), true);
  assert.equal(canAccessPlantRecord(householdA, householdB, "flower-04", new Set(["flower-04"])), false);
});

test("diagnostics history cannot cross households", () => {
  assert.equal(canAccessPlantRecord(householdB, householdA, "diag-plant", new Set(["diag-plant"])), false);
});

test("existing data migration assigns default household", () => {
  const migrated = migrateLegacyStateToDefaultHousehold({}, householdA, { records: { "flower-04": { note: "legacy" } } });
  assert.deepEqual(migrated[householdA], { records: { "flower-04": { note: "legacy" } } });
});

test("refresh keeps household session token valid", () => {
  const stored = JSON.stringify({ name: "Domácnosť", publicToken: householdA });
  const parsed = JSON.parse(stored) as { publicToken: string };
  assert.equal(isValidHouseholdTokenValue(parsed.publicToken), true);
});

test("changing URL token changes visible household data only if valid", () => {
  const states = {
    [householdA]: { visible: "A" },
    [householdB]: { visible: "B" },
  };

  assert.equal(getHouseholdScopedValue(states, householdA)?.visible, "A");
  assert.equal(getHouseholdScopedValue(states, householdB)?.visible, "B");
  assert.equal(getHouseholdScopedValue(states, "tampered")?.visible, undefined);
});
