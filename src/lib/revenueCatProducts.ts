export const revenueCatProductIds = {
  premiumMonthly: "plantie_premium_monthly",
  premiumYearly: "plantie_premium_yearly",
} as const;

export const revenueCatGooglePlayProductIds = {
  premiumMonthly: "plantie_premium_monthly:monthly",
  premiumYearly: "plantie_premium_yearly:yearly",
} as const;

type RevenueCatPlan = {
  billingPeriod: "monthly" | "yearly";
  planKey: "premium_monthly" | "premium_yearly";
  productId: (typeof revenueCatProductIds)[keyof typeof revenueCatProductIds];
};

const monthlyPlan: RevenueCatPlan = {
  billingPeriod: "monthly",
  planKey: "premium_monthly",
  productId: revenueCatProductIds.premiumMonthly,
};
const yearlyPlan: RevenueCatPlan = {
  billingPeriod: "yearly",
  planKey: "premium_yearly",
  productId: revenueCatProductIds.premiumYearly,
};

const plansByStoreProductId = new Map<string, RevenueCatPlan>([
  [revenueCatProductIds.premiumMonthly, monthlyPlan],
  [revenueCatProductIds.premiumYearly, yearlyPlan],
  [revenueCatGooglePlayProductIds.premiumMonthly, monthlyPlan],
  [revenueCatGooglePlayProductIds.premiumYearly, yearlyPlan],
]);

export const getRevenueCatPlan = (storeProductId: string): RevenueCatPlan | null =>
  plansByStoreProductId.get(storeProductId) ?? null;
