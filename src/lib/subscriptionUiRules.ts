import type { SubscriptionSnapshot } from "./subscriptionState.js";

export type SubscriptionPresentation = {
  plan: "free" | "monthly" | "yearly" | "household" | null;
  status: "free" | "active" | "cancelled" | "expired" | "shared" | "loading" | "error" | "syncing";
  period: "monthly" | "yearly" | null;
  previousPlan: "monthly" | "yearly" | null;
  date: string | null;
  dateMeaning: "renews" | "accessUntil" | "ended" | null;
};

export const getSubscriptionPresentation = (subscription: SubscriptionSnapshot): SubscriptionPresentation => {
  const entitlement = subscription.householdEntitlement;
  switch (subscription.view) {
    case "monthly_active":
    case "yearly_active": {
      const period = subscription.view === "monthly_active" ? "monthly" : "yearly";
      return { plan: period, status: "active", period, previousPlan: null,
        date: entitlement?.renewalDate ?? entitlement?.validUntil ?? subscription.customerInfo?.expiresAt ?? null,
        dateMeaning: entitlement && !entitlement.renewalDate ? "accessUntil" : "renews" };
    }
    case "monthly_cancelled_active":
    case "yearly_cancelled_active": {
      const period = subscription.view === "monthly_cancelled_active" ? "monthly" : "yearly";
      return { plan: period, status: "cancelled", period, previousPlan: null,
        date: entitlement?.validUntil ?? subscription.customerInfo?.expiresAt ?? null, dateMeaning: "accessUntil" };
    }
    case "expired":
      return { plan: "free", status: "expired", period: null,
        previousPlan: entitlement?.previousPlanKey === "premium_monthly" ? "monthly"
          : entitlement?.previousPlanKey === "premium_yearly" ? "yearly"
          : !entitlement || entitlement.billingBoundHere ? subscription.customerInfo?.lastExpiredPlan ?? null : null,
        date: entitlement?.previousValidUntil ?? (!entitlement || entitlement.billingBoundHere ? subscription.customerInfo?.lastExpiredAt ?? null : null),
        dateMeaning: "ended" };
    case "free":
      return { plan: "free", status: "free", period: null, previousPlan: null, date: null, dateMeaning: null };
    case "shared_premium":
      return { plan: "household", status: "shared", period: null, previousPlan: null,
        date: entitlement?.validUntil ?? null, dateMeaning: entitlement?.validUntil ? "accessUntil" : null };
    case "syncing":
      return { plan: null, status: "syncing", period: null, previousPlan: null, date: null, dateMeaning: null };
    case "error":
      return { plan: null, status: "error", period: null, previousPlan: null, date: null, dateMeaning: null };
    case "loading":
      return { plan: null, status: "loading", period: null, previousPlan: null, date: null, dateMeaning: null };
  }
};

const ownPaidViews = new Set<SubscriptionSnapshot["view"]>([
  "monthly_active",
  "yearly_active",
  "monthly_cancelled_active",
  "yearly_cancelled_active",
]);

export const isOwnPaidSubscription = (subscription: SubscriptionSnapshot) =>
  subscription.status === "ready" &&
  subscription.householdEntitlement?.role === "owner" &&
  subscription.householdEntitlement.billingBoundHere &&
  Boolean(subscription.userId && subscription.householdId) &&
  ownPaidViews.has(subscription.view) &&
  subscription.customerInfo?.hasRevenueCatPremium === true &&
  subscription.householdEntitlement.planKey === `premium_${subscription.customerInfo.activePlan}`;

export const canPurchaseHouseholdPlan = (subscription: SubscriptionSnapshot) =>
  subscription.status === "ready" &&
  Boolean(subscription.userId && subscription.householdId) &&
  subscription.householdEntitlement?.role === "owner" &&
  subscription.householdEntitlement.isPremium === false &&
  subscription.customerInfo?.hasRevenueCatPremium === false &&
  (subscription.view === "free" || subscription.view === "expired");

export const canCancelSubscription = (subscription: SubscriptionSnapshot) =>
  isOwnPaidSubscription(subscription) &&
  (subscription.view === "monthly_active" || subscription.view === "yearly_active") &&
  subscription.customerInfo?.willRenew === true;

export const canSwitchToYearly = (subscription: SubscriptionSnapshot) =>
  isOwnPaidSubscription(subscription) &&
  subscription.view === "monthly_active" &&
  subscription.customerInfo?.activePlan === "monthly";

export const safeBillingManagementUrl = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
};

export const createCancellationHandoff = (openManagementPage: (url: string) => Promise<void>) => {
  let dialogFor: { userId: string; householdId: string | null; productId: string | null } | null = null;
  let inFlight = false;

  return {
    openDialog(subscription: SubscriptionSnapshot) {
      if (inFlight || !canCancelSubscription(subscription)) return false;
      dialogFor = {
        userId: subscription.userId ?? "",
        householdId: subscription.householdId,
        productId: subscription.customerInfo?.productId ?? null,
      };
      return true;
    },
    dismiss() {
      if (inFlight) return false;
      dialogFor = null;
      return true;
    },
    async confirm(subscription: SubscriptionSnapshot): Promise<"opened" | "busy" | "not_open" | "not_applicable" | "unavailable" | "failed"> {
      if (inFlight) return "busy";
      if (!dialogFor) return "not_open";
      if (!canCancelSubscription(subscription) ||
        subscription.userId !== dialogFor.userId ||
        subscription.householdId !== dialogFor.householdId ||
        subscription.customerInfo?.productId !== dialogFor.productId) return "not_applicable";
      const managementUrl = safeBillingManagementUrl(subscription.customerInfo?.managementUrl);
      if (!managementUrl) return "unavailable";

      inFlight = true;
      try {
        await openManagementPage(managementUrl);
        dialogFor = null;
        return "opened";
      } catch {
        return "failed";
      } finally {
        inFlight = false;
      }
    },
  };
};

export const formatSubscriptionDate = (value: string | null | undefined, language: string | null | undefined, timeZone?: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(language ?? undefined, { dateStyle: "long", timeStyle: "short", timeZone }).format(date);
};
