import type { HouseholdEntitlement } from "./householdPlanService.js";

export const HOUSEHOLD_LIMITS = {
  free: { maxMembers: 1, invitationsEnabled: false },
  premium: { maxMembers: 3, invitationsEnabled: true },
} as const;

export const usedHouseholdSlots = (entitlement: HouseholdEntitlement) =>
  entitlement.activeMemberCount + entitlement.pendingInviteCount;

export const canInviteHouseholdMember = (entitlement: HouseholdEntitlement | null) =>
  entitlement?.role === "owner" && entitlement.isPremium && entitlement.invitationsEnabled &&
  usedHouseholdSlots(entitlement) < entitlement.maxMembers;
