import assert from "node:assert/strict";
import test from "node:test";
import { resolveHouseholdPermissions } from "../src/lib/householdPermissions.js";

const contentCapabilities = [
  "canViewPlants", "canCreatePlants", "canEditPlants", "canDeletePlants",
  "canManageCare", "canUseDiagnostics", "canUseQrFeatures",
] as const;
const administrativeCapabilities = [
  "canEditHousehold", "canInviteMembers", "canRemoveMembers", "canManageSubscription",
] as const;

test("Owner and Viewer have identical plant/content capabilities", () => {
  const owner = resolveHouseholdPermissions("owner");
  const viewer = resolveHouseholdPermissions("viewer");
  for (const capability of contentCapabilities) {
    assert.equal(owner[capability], true, capability);
    assert.equal(viewer[capability], true, capability);
  }
  for (const capability of administrativeCapabilities) {
    assert.equal(owner[capability], true, capability);
    assert.equal(viewer[capability], false, capability);
  }
});

test("suspended or missing membership has no content or administrative rights", () => {
  for (const permissions of [
    resolveHouseholdPermissions(null),
    resolveHouseholdPermissions("viewer", "suspended_plan_limit"),
  ]) {
    for (const capability of [...contentCapabilities, ...administrativeCapabilities]) {
      assert.equal(permissions[capability], false, capability);
    }
  }
});
