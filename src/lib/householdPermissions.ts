import type { HouseholdRole } from "./plantieRepository.js";

export type HouseholdPermissions = {
  role: HouseholdRole | null;
  canViewPlants: boolean;
  canCreatePlants: boolean;
  canEditPlants: boolean;
  canDeletePlants: boolean;
  canManageCare: boolean;
  canUseDiagnostics: boolean;
  canUseQrFeatures: boolean;
  canEditHousehold: boolean;
  canInviteMembers: boolean;
  canRemoveMembers: boolean;
  canManageSubscription: boolean;
};

// Role comes from the selected household's authenticated membership. Plan
// limits are checked separately against that household's entitlement.
export const resolveHouseholdPermissions = (
  role: HouseholdRole | null,
  status: "active" | "suspended_plan_limit" = "active",
): HouseholdPermissions => {
  const canManageContent = status === "active" && (role === "owner" || role === "viewer");
  const canAdminister = canManageContent && role === "owner";
  return {
    role,
    canViewPlants: canManageContent,
    canCreatePlants: canManageContent,
    canEditPlants: canManageContent,
    canDeletePlants: canManageContent,
    canManageCare: canManageContent,
    canUseDiagnostics: canManageContent,
    canUseQrFeatures: canManageContent,
    canEditHousehold: canAdminister,
    canInviteMembers: canAdminister,
    canRemoveMembers: canAdminister,
    canManageSubscription: canAdminister,
  };
};
