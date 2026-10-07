import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { canInviteHouseholdMember, HOUSEHOLD_LIMITS, usedHouseholdSlots } from "../src/lib/householdMembershipRules.js";
import type { HouseholdEntitlement } from "../src/lib/householdPlanService.js";
import { isCurrentHouseholdOperationScope } from "../src/lib/householdOperationScope.js";

const entitlement = (changes: Partial<HouseholdEntitlement> = {}): HouseholdEntitlement => ({
  planKey: "premium_monthly", isPremium: true, status: "active", validUntil: "2027-10-05T00:00:00Z",
  maxMembers: HOUSEHOLD_LIMITS.premium.maxMembers, invitationsEnabled: true,
  activeMemberCount: 1, pendingInviteCount: 0, suspendedMemberCount: 0, role: "owner", billingBoundHere: false, ...changes,
});

test("free is owner-only and Premium has three total slots", () => {
  assert.deepEqual(HOUSEHOLD_LIMITS.free, { maxMembers: 1, invitationsEnabled: false });
  assert.deepEqual(HOUSEHOLD_LIMITS.premium, { maxMembers: 3, invitationsEnabled: true });
  assert.equal(canInviteHouseholdMember(entitlement({ planKey: "free", isPremium: false, maxMembers: 1, invitationsEnabled: false })), false);
  assert.equal(canInviteHouseholdMember(entitlement()), true);
});

test("owner, active Viewers, and valid pending invites occupy capacity", () => {
  assert.equal(usedHouseholdSlots(entitlement({ activeMemberCount: 2, pendingInviteCount: 1 })), 3);
  assert.equal(canInviteHouseholdMember(entitlement({ activeMemberCount: 2, pendingInviteCount: 1 })), false);
  assert.equal(canInviteHouseholdMember(entitlement({ activeMemberCount: 3 })), false);
  assert.equal(canInviteHouseholdMember(entitlement({ activeMemberCount: 2 })), true);
});

test("Viewers and unknown entitlement cannot invite", () => {
  assert.equal(canInviteHouseholdMember(entitlement({ role: "viewer" })), false);
  assert.equal(canInviteHouseholdMember(null), false);
});

test("a completed operation cannot commit into another selected household or account", async () => {
  const started = { userId: "alice", householdToken: "home-a", generation: 1 };
  let current = started;
  let generation = 1;
  let complete!: () => void;
  let committed = false;
  const pending = new Promise<void>((resolve) => { complete = resolve; }).then(() => {
    if (isCurrentHouseholdOperationScope(started, current, generation)) committed = true;
  });
  current = { userId: "alice", householdToken: "home-b", generation: 2 };
  generation = 2;
  complete();
  await pending;
  assert.equal(committed, false);
  assert.equal(isCurrentHouseholdOperationScope(started, { ...started, userId: "bob" }, 1), false);
  assert.equal(isCurrentHouseholdOperationScope(started, { ...started, userId: null }, 1), false);
});

test("an old closure cannot refresh after switching away and back, including before the next render", () => {
  const started = { userId: "alice", householdToken: "home-a", generation: 1 };
  assert.equal(isCurrentHouseholdOperationScope(started, started, 1), true);
  assert.equal(isCurrentHouseholdOperationScope(started, started, 2), false);
  assert.equal(isCurrentHouseholdOperationScope(started, { ...started, generation: 3 }, 3), false);
});

test("an unavailable explicit household refreshes the authorized directory after the async scope guard", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const forcedRefresh = app.slice(app.indexOf("const refreshSupabaseReadState"), app.indexOf("const refreshHouseholdPlanUsage"));
  assert.match(forcedRefresh, /if \(generation !== householdDataGenerationRef\.current \|\| !isHouseholdOperationCurrent\(\)\) return null;\s*if \(activeHousehold && !nextState\) void householdDirectory\.refresh\(true\)/);
  const initialLoad = app.slice(app.indexOf("const loadReadThroughState"), app.indexOf("void loadReadThroughState"));
  assert.match(initialLoad, /if \(!cancelled && isHouseholdOperationCurrent\(started\)\) \{\s*if \(activeHousehold && !nextState\) void householdDirectory\.refresh\(true\)/);
});
