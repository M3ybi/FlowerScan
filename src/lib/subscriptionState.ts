import type { BillingCustomerInfo } from "./billingService.js";
import type { HouseholdEntitlement, HouseholdPlanUsage } from "./householdPlanService.js";

export type SubscriptionView =
  | "loading" | "error" | "free" | "expired" | "monthly_active" | "yearly_active"
  | "monthly_cancelled_active" | "yearly_cancelled_active" | "shared_premium" | "syncing";

export type SubscriptionSnapshot = {
  status: "loading" | "ready" | "error";
  view: SubscriptionView;
  userId: string | null;
  householdId: string | null;
  householdPlanUsage: HouseholdPlanUsage | null;
  householdEntitlement: HouseholdEntitlement | null;
  customerInfo: BillingCustomerInfo | null;
  error: string | null;
};

export const emptySubscriptionSnapshot = (userId: string | null = null, householdId: string | null = null): SubscriptionSnapshot => ({
  status: "loading",
  view: "loading",
  userId,
  householdId,
  householdPlanUsage: null,
  householdEntitlement: null,
  customerInfo: null,
  error: null,
});

export const resolveSubscriptionView = (usage: HouseholdPlanUsage, customerInfo: BillingCustomerInfo, entitlement?: HouseholdEntitlement): SubscriptionView => {
  if (entitlement && entitlement.isPremium !== usage.isPremium) return "syncing";
  if (entitlement && !entitlement.isPremium) {
    if (entitlement.role === "owner" && entitlement.billingBoundHere && customerInfo.hasRevenueCatPremium) return "syncing";
    return customerInfo.lastExpiredPlan ? "expired" : "free";
  }
  if (customerInfo.hasRevenueCatPremium && (!entitlement || entitlement.role === "owner") &&
    (!entitlement || entitlement.planKey === `premium_${customerInfo.activePlan}`)) {
    if (!customerInfo.activePlan || typeof customerInfo.willRenew !== "boolean" || !customerInfo.expiresAt || !Number.isFinite(Date.parse(customerInfo.expiresAt)) ||
      Date.parse(customerInfo.expiresAt) <= Date.now()) return "error";
    if (!usage.isPremium) return "syncing";
    if (customerInfo.activePlan === "monthly") {
      return customerInfo.willRenew === false ? "monthly_cancelled_active" : "monthly_active";
    }
    return customerInfo.willRenew === false ? "yearly_cancelled_active" : "yearly_active";
  }
  if (usage.isPremium) return "shared_premium";
  if (customerInfo.lastExpiredPlan && customerInfo.lastExpiredAt) {
    const expiredAt = Date.parse(customerInfo.lastExpiredAt);
    if (!Number.isFinite(expiredAt)) return "error";
    if (expiredAt <= Date.now()) return "expired";
  }
  return "free";
};

type SubscriptionDependencies = {
  getCustomerInfo: (forceProviderRefresh: boolean) => Promise<BillingCustomerInfo>;
  getHouseholdPlanUsage: (householdId: string) => Promise<HouseholdPlanUsage>;
  getHouseholdEntitlement?: (householdId: string) => Promise<HouseholdEntitlement>;
  onChange: (snapshot: SubscriptionSnapshot) => void;
  timeoutMs?: number;
};

const withTimeout = <T>(operation: Promise<T>, timeoutMs: number): Promise<T> => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Subscription refresh timed out.")), timeoutMs);
  operation.then(resolve, reject).finally(() => clearTimeout(timeout));
});

export const createSubscriptionStateController = (deps: SubscriptionDependencies) => {
  let snapshot = emptySubscriptionSnapshot();
  let requestId = 0;
  let inFlight: Promise<SubscriptionSnapshot> | null = null;
  const timeoutMs = deps.timeoutMs ?? 15000;

  const publish = (nextSnapshot: SubscriptionSnapshot) => {
    snapshot = nextSnapshot;
    deps.onChange(nextSnapshot);
    return nextSnapshot;
  };

  const refresh = (force = false): Promise<SubscriptionSnapshot> => {
    const { userId, householdId } = snapshot;
    if (!userId || !householdId) return Promise.resolve(snapshot);
    if (inFlight && !force) return inFlight;

    const currentRequestId = ++requestId;
    if (snapshot.status !== "ready") publish({ ...snapshot, status: "loading", view: "loading", error: null });
    const nextRequest = Promise.allSettled([
      withTimeout(Promise.resolve().then(() => deps.getCustomerInfo(force)), timeoutMs),
      withTimeout(Promise.resolve().then(() => deps.getHouseholdPlanUsage(householdId)), timeoutMs),
      deps.getHouseholdEntitlement
        ? withTimeout(Promise.resolve().then(() => deps.getHouseholdEntitlement!(householdId)), timeoutMs)
        : Promise.resolve(null),
    ]).then(([customerResult, usageResult, entitlementResult]) => {
      if (currentRequestId !== requestId || snapshot.userId !== userId || snapshot.householdId !== householdId) return snapshot;
      if (customerResult.status === "fulfilled" && usageResult.status === "fulfilled" && entitlementResult.status === "fulfilled") {
        const view = resolveSubscriptionView(usageResult.value, customerResult.value, entitlementResult.value ?? undefined);
        if (view !== "error") {
          return publish({ status: "ready", view, userId, householdId, householdPlanUsage: usageResult.value,
            customerInfo: customerResult.value, householdEntitlement: entitlementResult.value, error: null });
        }
      }
      return publish({
        status: "error",
        view: "error",
        userId,
        householdId,
        householdPlanUsage: usageResult.status === "fulfilled" ? usageResult.value : snapshot.householdPlanUsage,
        householdEntitlement: entitlementResult.status === "fulfilled" ? entitlementResult.value : snapshot.householdEntitlement,
        customerInfo: customerResult.status === "fulfilled" ? customerResult.value : snapshot.customerInfo,
        error: "Subscription status could not be confirmed. Check your connection and refresh.",
      });
    }).finally(() => {
      if (inFlight === nextRequest) inFlight = null;
    });
    inFlight = nextRequest;
    return nextRequest;
  };

  const bind = (userId: string | null, householdId: string | null) => {
    if (snapshot.userId === userId && snapshot.householdId === householdId) return;
    requestId += 1;
    inFlight = null;
    publish(emptySubscriptionSnapshot(userId, householdId));
    if (userId && householdId) void refresh(true);
  };

  return { bind, getSnapshot: () => snapshot, refresh };
};
