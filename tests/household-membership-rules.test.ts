import assert from "node:assert/strict";
import test from "node:test";
import { canInviteHouseholdMember, HOUSEHOLD_LIMITS, usedHouseholdSlots } from "../src/lib/householdMembershipRules.js";
import type { HouseholdEntitlement } from "../src/lib/householdPlanService.js";

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
