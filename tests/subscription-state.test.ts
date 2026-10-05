import assert from "node:assert/strict";
import test from "node:test";
import type { BillingCustomerInfo } from "../src/lib/billingService.js";
import type { HouseholdPlanUsage } from "../src/lib/householdPlanService.js";
import { createSubscriptionStateController } from "../src/lib/subscriptionState.js";

const usage = (isPremium: boolean): HouseholdPlanUsage => ({
  aiAnalyzesMonthlyLimit: isPremium ? null : 10,
  aiAnalyzesRemaining: isPremium ? null : 10,
  aiAnalyzesUsed: 0,
  isPremium,
  periodEnd: null,
  periodStart: null,
  plantsLimit: isPremium ? null : 10,
  plantsRemaining: isPremium ? null : 10,
  plantsUsed: 0,
});

const customer = (plan: "monthly" | "yearly" | null, willRenew: boolean | null = true): BillingCustomerInfo => ({
  activeEntitlements: plan ? ["premium"] : [],
  activePlan: plan,
  appUserId: "user-a",
  expiresAt: plan ? "2026-11-01T00:00:00Z" : null,
  hasRevenueCatPremium: Boolean(plan),
  managementUrl: plan ? "https://billing.example/manage" : null,
  productId: plan ? `plantie_premium_${plan}` : null,
  willRenew: plan ? willRenew : null,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

test("login automatically resolves free, monthly, yearly, and cancelled paid state before publishing a tier", async () => {
  for (const [plan, renews, expected] of [
    [null, null, "free"],
    ["monthly", true, "monthly_active"],
    ["yearly", true, "yearly_active"],
    ["monthly", false, "monthly_cancelled_active"],
    ["yearly", false, "yearly_cancelled_active"],
  ] as const) {
    const views: string[] = [];
    const controller = createSubscriptionStateController({
      getCustomerInfo: async () => customer(plan, renews),
      getHouseholdPlanUsage: async () => usage(Boolean(plan)),
      onChange: (snapshot) => views.push(snapshot.view),
    });
    controller.bind("user-a", "household-a");
    assert.equal(controller.getSnapshot().view, "loading");
    assert.equal((await controller.refresh()).view, expected);
    assert.deepEqual(views, ["loading", "loading", expected]);
  }
});

test("login bypasses the native provider cache before resolving the subscription", async () => {
  const forceFlags: boolean[] = [];
  const controller = createSubscriptionStateController({
    getCustomerInfo: async (forceProviderRefresh) => {
      forceFlags.push(forceProviderRefresh);
      return customer(null);
    },
    getHouseholdPlanUsage: async () => usage(false),
    onChange: () => undefined,
  });
  controller.bind("user-a", "household-a");
  assert.equal((await controller.refresh()).view, "free");
  assert.deepEqual(forceFlags, [true]);
});

test("expired provider entitlement becomes free only after a fresh trusted server read", async () => {
  let currentCustomer = customer("monthly", false);
  let currentUsage = usage(true);
  const controller = createSubscriptionStateController({
    getCustomerInfo: async () => currentCustomer,
    getHouseholdPlanUsage: async () => currentUsage,
    onChange: () => undefined,
  });
  controller.bind("user-a", "household-a");
  assert.equal((await controller.refresh()).view, "monthly_cancelled_active");
  currentCustomer = customer(null);
  currentUsage = usage(false);
  assert.equal((await controller.refresh(true)).view, "free");
});

test("an inactive previous RevenueCat entitlement is shown as expired only after its real end date", async () => {
  const expiredCustomer = { ...customer(null), lastExpiredPlan: "yearly" as const, lastExpiredAt: "2026-09-01T10:00:00Z" };
  const controller = createSubscriptionStateController({
    getCustomerInfo: async () => expiredCustomer,
    getHouseholdPlanUsage: async () => usage(false),
    onChange: () => undefined,
  });
  controller.bind("user-a", "household-a");
  assert.equal((await controller.refresh()).view, "expired");

  const sharedController = createSubscriptionStateController({
    getCustomerInfo: async () => expiredCustomer,
    getHouseholdPlanUsage: async () => usage(true),
    onChange: () => undefined,
  });
  sharedController.bind("user-a", "household-b");
  assert.equal((await sharedController.refresh()).view, "shared_premium");
});

test("an active paid plan without a verified renewal state or expiry is unknown, not Active", async () => {
  for (const malformed of [
    { ...customer("monthly"), expiresAt: null },
    { ...customer("yearly"), willRenew: null },
  ]) {
    const controller = createSubscriptionStateController({
      getCustomerInfo: async () => malformed,
      getHouseholdPlanUsage: async () => usage(true),
      onChange: () => undefined,
    });
    controller.bind("user-a", "household-a");
    assert.equal((await controller.refresh()).view, "error");
  }
});

test("provider/server disagreement and lookup failures never display a false free tier", async () => {
  let serverUsage = usage(false);
  let providerFails = false;
  const controller = createSubscriptionStateController({
    getCustomerInfo: async () => {
      if (providerFails) throw new Error("Network unavailable");
      return customer("yearly");
    },
    getHouseholdPlanUsage: async () => serverUsage,
    onChange: () => undefined,
  });
  controller.bind("user-a", "household-a");
  assert.equal((await controller.refresh()).view, "syncing");
  serverUsage = usage(true);
  assert.equal((await controller.refresh(true)).view, "yearly_active");
  providerFails = true;
  const failed = await controller.refresh(true);
  assert.equal(failed.view, "error");
  assert.equal(failed.householdPlanUsage?.isPremium, true);
});

test("an old account response cannot overwrite a new account or survive logout", async () => {
  const first = deferred<BillingCustomerInfo>();
  let requestedUser = "user-a";
  const controller = createSubscriptionStateController({
    getCustomerInfo: () => requestedUser === "user-a" ? first.promise : Promise.resolve(customer(null)),
    getHouseholdPlanUsage: async () => usage(requestedUser === "user-a"),
    onChange: () => undefined,
  });
  controller.bind("user-a", "household-a");
  const oldRequest = controller.refresh();
  await Promise.resolve();
  requestedUser = "user-b";
  controller.bind("user-b", "household-b");
  assert.equal((await controller.refresh()).view, "free");
  first.resolve(customer("yearly"));
  await oldRequest;
  assert.equal(controller.getSnapshot().userId, "user-b");
  assert.equal(controller.getSnapshot().view, "free");
  controller.bind(null, null);
  assert.equal(controller.getSnapshot().customerInfo, null);
  assert.equal(controller.getSnapshot().householdPlanUsage, null);
});

test("a forced refresh supersedes an older response and concurrent ordinary refreshes are deduplicated", async () => {
  const first = deferred<BillingCustomerInfo>();
  let calls = 0;
  const controller = createSubscriptionStateController({
    getCustomerInfo: () => ++calls === 1 ? first.promise : Promise.resolve(customer("monthly")),
    getHouseholdPlanUsage: async () => usage(true),
    onChange: () => undefined,
  });
  controller.bind("user-a", "household-a");
  const oldRequest = controller.refresh();
  assert.equal(controller.refresh(), oldRequest);
  await Promise.resolve();
  assert.equal((await controller.refresh(true)).view, "monthly_active");
  first.resolve(customer(null));
  await oldRequest;
  assert.equal(controller.getSnapshot().view, "monthly_active");
  assert.equal(calls, 2);
});

test("malformed provider plan data is an error, not a free entitlement", async () => {
  const malformed = { ...customer("monthly"), expiresAt: "invalid-date" };
  const controller = createSubscriptionStateController({
    getCustomerInfo: async () => malformed,
    getHouseholdPlanUsage: async () => usage(true),
    onChange: () => undefined,
  });
  controller.bind("user-a", "household-a");
  const result = await controller.refresh();
  assert.equal(result.view, "error");
  assert.equal(result.householdPlanUsage?.isPremium, true);
});
