import assert from "node:assert/strict";
import test from "node:test";
import type { BillingCustomerInfo } from "../src/lib/billingService.js";
import type { HouseholdEntitlement, HouseholdPlanUsage } from "../src/lib/householdPlanService.js";
import { createSubscriptionStateController, resolveSubscriptionView } from "../src/lib/subscriptionState.js";

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

const householdEntitlement = (isPremium: boolean, role: "owner" | "viewer" = "owner"): HouseholdEntitlement => ({
  planKey: isPremium ? "premium_monthly" : "free", isPremium,
  status: isPremium ? "active" : "free", validUntil: isPremium ? "2026-11-01T00:00:00Z" : null,
  maxMembers: isPremium ? 3 : 1, invitationsEnabled: isPremium,
  activeMemberCount: 1, pendingInviteCount: 0, suspendedMemberCount: 0, role, billingBoundHere: role === "owner",
});

test("household tier is authoritative for Viewers and provider/server disagreement stays unresolved", async () => {
  const viewer = createSubscriptionStateController({
    getCustomerInfo: async () => customer("monthly"),
    getHouseholdPlanUsage: async () => usage(true),
    getHouseholdEntitlement: async () => householdEntitlement(true, "viewer"),
    onChange: () => undefined,
  });
  viewer.bind("user-a", "shared-home");
  assert.equal((await viewer.refresh()).view, "monthly_active");

  const owner = createSubscriptionStateController({
    getCustomerInfo: async () => customer("monthly"),
    getHouseholdPlanUsage: async () => usage(false),
    getHouseholdEntitlement: async () => householdEntitlement(false),
    onChange: () => undefined,
  });
  owner.bind("user-a", "new-home");
  assert.equal((await owner.refresh()).view, "syncing");

  const otherHousehold = createSubscriptionStateController({
    getCustomerInfo: async () => customer("monthly"),
    getHouseholdPlanUsage: async () => usage(false),
    getHouseholdEntitlement: async () => ({ ...householdEntitlement(false), billingBoundHere: false }),
    onChange: () => undefined,
  });
  otherHousehold.bind("user-a", "other-home");
  assert.equal((await otherHousehold.refresh()).view, "free");
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

test("a verified household plan remains usable when the personal billing SDK is unavailable", async () => {
  const premium = createSubscriptionStateController({
    getCustomerInfo: async () => { throw new Error("Provider unavailable"); },
    getHouseholdPlanUsage: async () => usage(true),
    getHouseholdEntitlement: async () => householdEntitlement(true),
    onChange: () => undefined,
  });
  premium.bind("user-a", "household-a");
  const premiumSnapshot = await premium.refresh();
  assert.equal(premiumSnapshot.status, "ready");
  assert.equal(premiumSnapshot.view, "monthly_active");
  assert.equal(premiumSnapshot.householdEntitlement?.invitationsEnabled, true);
  assert.equal(premiumSnapshot.customerInfo, null);

  const free = createSubscriptionStateController({
    getCustomerInfo: async () => { throw new Error("Provider unavailable"); },
    getHouseholdPlanUsage: async () => usage(false),
    getHouseholdEntitlement: async () => householdEntitlement(false),
    onChange: () => undefined,
  });
  free.bind("user-b", "household-b");
  const freeSnapshot = await free.refresh();
  assert.equal(freeSnapshot.status, "ready");
  assert.equal(freeSnapshot.view, "free");
  assert.equal(freeSnapshot.householdEntitlement?.invitationsEnabled, false);
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

test("selected household supplies the same paid lifecycle for Owner, coowner, and Viewer", () => {
  const now = Date.parse("2026-10-07T12:00:00Z");
  for (const role of ["owner", "viewer"] as const) {
    for (const billingBoundHere of [true, false]) {
      const monthly = { ...householdEntitlement(true, role), billingBoundHere };
      assert.equal(resolveSubscriptionView(usage(true), customer("yearly"), monthly, now), "monthly_active");
      const cancelled = { ...monthly, status: "cancelled", cancelAtPeriodEnd: true };
      assert.equal(resolveSubscriptionView(usage(true), null, cancelled, now), "monthly_cancelled_active");
      const yearly = { ...cancelled, planKey: "premium_yearly" as const, billingInterval: "yearly" as const };
      assert.equal(resolveSubscriptionView(usage(true), customer(null), yearly, now), "yearly_cancelled_active");
    }
  }
});

test("Viewer snapshot does not require or expose the household owner's billing customer", async () => {
  let providerReads = 0;
  const controller = createSubscriptionStateController({
    getCustomerInfo: async () => { providerReads += 1; return customer("yearly"); },
    getHouseholdPlanUsage: async () => usage(true),
    getHouseholdEntitlement: async () => householdEntitlement(true, "viewer"),
    onChange: () => undefined,
    now: () => Date.parse("2026-10-07T12:00:00Z"),
  });
  controller.bind("user-a", "shared-home");
  const snapshot = await controller.refresh();
  assert.equal(providerReads, 0);
  assert.equal(snapshot.customerInfo, null);
  assert.equal(snapshot.view, "monthly_active");
});

test("personal expired subscriptions do not leak into an unrelated household", () => {
  const now = Date.parse("2026-10-07T12:00:00Z");
  const personal = { ...customer(null), lastExpiredPlan: "yearly" as const, lastExpiredAt: "2026-09-01T00:00:00Z" };
  const unrelated = { ...householdEntitlement(false), billingBoundHere: false };
  assert.equal(resolveSubscriptionView(usage(false), personal, unrelated, now), "free");
  const householdExpired = { ...unrelated, previousPlanKey: "premium_monthly" as const, previousValidUntil: "2026-09-20T00:00:00Z" };
  assert.equal(resolveSubscriptionView(usage(false), null, householdExpired, now), "expired");
});

test("household switch discards outstanding entitlement reads for the previous household", async () => {
  const oldEntitlement = deferred<HouseholdEntitlement>();
  const controller = createSubscriptionStateController({
    getCustomerInfo: async () => customer("monthly"),
    getHouseholdPlanUsage: async (householdId) => usage(householdId === "paid-home"),
    getHouseholdEntitlement: async (householdId) => householdId === "paid-home" ? oldEntitlement.promise
      : { ...householdEntitlement(false), billingBoundHere: false },
    onChange: () => undefined,
    now: () => Date.parse("2026-10-07T12:00:00Z"),
  });
  controller.bind("user-a", "paid-home");
  const previous = controller.refresh();
  await Promise.resolve();
  controller.bind("user-a", "free-home");
  assert.equal((await controller.refresh()).view, "free");
  oldEntitlement.resolve(householdEntitlement(true));
  await previous;
  assert.equal(controller.getSnapshot().householdId, "free-home");
  assert.equal(controller.getSnapshot().householdEntitlement?.isPremium, false);
});
