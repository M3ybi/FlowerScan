import packageInfo from "../../package.json";
import { HOUSEHOLD_LIMITS } from "./householdMembershipRules";
import { freeQrLabelLimit, PLAN_LIMITS } from "./householdPlanRules";
import { supportedLanguages } from "./onboarding";
import { legalPages } from "./releaseReadiness";
import type { LegalPageId } from "./releaseReadiness";

const finiteFreeLimit = (value: number | null) => {
  if (value === null || !Number.isInteger(value) || value < 1) {
    throw new Error("The Free plan needs a finite product limit.");
  }
  return value;
};

const legalRoute = (id: LegalPageId) => {
  const page = legalPages.find((candidate) => candidate.id === id);
  if (!page) throw new Error("A Menu legal destination is not configured.");
  return page.path;
};

/** Public product facts only; this object never represents a signed-out user's account. */
export const menuProductInfo = {
  limits: {
    free: {
      plants: finiteFreeLimit(PLAN_LIMITS.free.maxPlants),
      scans: finiteFreeLimit(PLAN_LIMITS.free.monthlyPlantUnwellAiAnalyzes),
      qr: freeQrLabelLimit,
      careRefreshes: finiteFreeLimit(PLAN_LIMITS.free.careTipRefreshPerPlantPerDay),
      slots: HOUSEHOLD_LIMITS.free.maxMembers,
    },
    premium: { slots: HOUSEHOLD_LIMITS.premium.maxMembers },
  },
  languages: supportedLanguages,
  version: packageInfo.version,
  routes: {
    support: legalRoute("support"),
    privacy: legalRoute("privacy"),
    terms: legalRoute("terms"),
    subscriptionTerms: legalRoute("subscription-terms"),
  },
} as const;
