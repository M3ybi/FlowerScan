import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PricingPage } from "../src/components/PricingPage.js";
import type { SubscriptionSnapshot } from "../src/lib/subscriptionState.js";
import {
  canCancelSubscription,
  canPurchaseHouseholdPlan,
  canSwitchToYearly,
  createCancellationHandoff,
  formatSubscriptionDate,
  getSubscriptionPresentation,
  safeBillingManagementUrl,
} from "../src/lib/subscriptionUiRules.js";
import { translate } from "../src/lib/i18n.js";
import { householdSubscriptionCopy } from "../src/lib/householdSubscriptionCopy.js";

const activeSubscription = (view: SubscriptionSnapshot["view"], willRenew: boolean | null): SubscriptionSnapshot => ({
  status: "ready",
  view,
  userId: "user-1",
  householdId: "household-1",
  householdPlanUsage: null,
  householdEntitlement: {
    planKey: view === "free" || view === "expired" ? "free" : view.startsWith("monthly") ? "premium_monthly" : "premium_yearly",
    isPremium: view !== "free" && view !== "expired",
    status: view.includes("cancelled") ? "cancelled" : "active",
    validUntil: view === "free" || view === "expired" ? null : "2026-11-01T00:00:00Z",
    maxMembers: view === "free" || view === "expired" ? 1 : 3,
    invitationsEnabled: view !== "free" && view !== "expired",
    activeMemberCount: 1,
    pendingInviteCount: 0,
    suspendedMemberCount: 0,
    role: "owner",
    billingBoundHere: true,
  },
  customerInfo: {
    activeEntitlements: ["premium"],
    activePlan: view.startsWith("monthly") ? "monthly" : "yearly",
    appUserId: "user-1",
    expiresAt: "2026-11-01T00:00:00Z",
    hasRevenueCatPremium: true,
    managementUrl: "https://billing.example.com/manage",
    productId: view.startsWith("yearly") ? "plantie_premium_yearly" : "plantie_premium_monthly",
    willRenew,
  },
  error: null,
});

const renderSubscription = (subscription: SubscriptionSnapshot) => renderToStaticMarkup(createElement(PricingPage, {
  subscription,
  language: "en",
  onSubscriptionChanged: async () => subscription,
}));

test("Free, Monthly, Yearly, cancelled, expired, and unknown states render a distinct current subscription", () => {
  const free = { ...activeSubscription("free", null), customerInfo: null };
  const freeHtml = renderSubscription(free);
  assert.match(freeHtml, /Free Plan/);
  assert.match(freeHtml, /do not have an active subscription/);
  assert.doesNotMatch(freeHtml, /Cancel subscription/);

  for (const [view, plan] of [["monthly_active", "Monthly"], ["yearly_active", "Yearly"]] as const) {
    const html = renderSubscription(activeSubscription(view, true));
    assert.match(html, new RegExp(plan));
    assert.match(html, /Current period ends/);
    assert.match(html, /Billing period/);
    assert.match(html, /Cancel subscription/);
    assert.match(html, new RegExp(formatSubscriptionDate("2026-11-01T00:00:00Z", "en")!));
  }

  const cancelled = renderSubscription(activeSubscription("yearly_cancelled_active", false));
  assert.match(cancelled, /Household Premium/);
  assert.match(cancelled, /Cancelled/);
  assert.match(cancelled, /Active until/);
  assert.doesNotMatch(cancelled, /Renews on|Cancel subscription/);

  const expired = renderSubscription({ ...free, view: "expired", customerInfo: {
    ...activeSubscription("monthly_active", true).customerInfo!, hasRevenueCatPremium: false,
    activePlan: null, expiresAt: null, lastExpiredPlan: "monthly", lastExpiredAt: "2026-09-01T10:00:00Z", willRenew: null,
  } });
  assert.match(expired, /Free Plan/);
  assert.match(expired, /Previous subscription/);
  assert.match(expired, /Monthly Plan/);
  assert.match(expired, /Expired/);
  assert.match(expired, /Ended on/);
  assert.doesNotMatch(expired, /Renews on|Cancel subscription/);

  for (const view of ["loading", "error"] as const) {
    const html = renderSubscription({ ...free, status: view, view });
    assert.doesNotMatch(html, /Free Plan|do not have an active subscription/);
  }
});

test("Viewer sees household billing lifecycle and capacity without administrative actions", () => {
  const base = activeSubscription("yearly_cancelled_active", null);
  const shared = renderSubscription({ ...base, customerInfo: null,
    householdEntitlement: { ...base.householdEntitlement!, role: "viewer", billingBoundHere: false,
      activeMemberCount: 2, pendingInviteCount: 1 } });
  assert.match(shared, /Household Premium/);
  assert.match(shared, /Cancelled/);
  assert.match(shared, /Billing period.*Yearly/);
  assert.match(shared, /Active until/);
  assert.match(shared, /Occupied household slots/);
  assert.match(shared, /3 \/ 3/);
  assert.match(shared, /Only household owners can manage/);
  assert.match(shared, /billing-history-timeline/);
  assert.match(shared, /Billing &amp; history/);
  assert.match(shared, /billing-history-loading/);
  assert.doesNotMatch(shared, /No billing history yet/);
  assert.doesNotMatch(shared, /Cancel subscription|Change plan|no active personal subscription/);
});

test("verified Premium remains visible without personal billing details or billing actions", () => {
  const snapshot = { ...activeSubscription("shared_premium", null), customerInfo: null };
  const html = renderSubscription(snapshot);
  assert.match(html, /Household Premium/);
  assert.match(html, /Store billing details are unavailable/);
  assert.match(html, /Retry/);
  assert.doesNotMatch(html, /Cancel subscription|no active personal subscription/);
});

test("subscription presentation uses household timestamps rather than another household's provider dates", () => {
  const cancelled = getSubscriptionPresentation(activeSubscription("monthly_cancelled_active", false));
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.dateMeaning, "accessUntil");
  assert.equal(cancelled.date, "2026-11-01T00:00:00Z");
  const selected = activeSubscription("monthly_active", true);
  selected.householdEntitlement!.validUntil = "2026-12-01T00:00:00Z";
  assert.equal(getSubscriptionPresentation(selected).date, "2026-12-01T00:00:00Z");
  const localTime = formatSubscriptionDate("2026-10-15T14:32:00Z", "en", "Europe/Bratislava");
  assert.match(localTime ?? "", /4:32/);
  assert.equal(formatSubscriptionDate("not-a-date", "en"), null);
});

test("only active renewing monthly and yearly subscriptions offer cancellation", () => {
  assert.equal(canCancelSubscription(activeSubscription("monthly_active", true)), true);
  assert.equal(canCancelSubscription(activeSubscription("yearly_active", true)), true);
  assert.equal(canCancelSubscription(activeSubscription("monthly_cancelled_active", false)), false);
  assert.equal(canCancelSubscription(activeSubscription("yearly_cancelled_active", false)), false);
  assert.equal(canCancelSubscription(activeSubscription("monthly_active", null)), false);
  assert.equal(canCancelSubscription({ ...activeSubscription("monthly_active", true), userId: null }), false);
  assert.equal(canCancelSubscription({ ...activeSubscription("monthly_active", true), status: "error" }), false);
  assert.equal(canCancelSubscription({ ...activeSubscription("monthly_active", true), view: "shared_premium" }), false);
  assert.equal(canCancelSubscription({ ...activeSubscription("monthly_active", true), view: "free" }), false);
});

test("yearly switching is only offered to an active monthly subscriber", () => {
  assert.equal(canSwitchToYearly(activeSubscription("monthly_active", true)), true);
  assert.equal(canSwitchToYearly(activeSubscription("monthly_cancelled_active", false)), false);
  assert.equal(canSwitchToYearly(activeSubscription("yearly_active", true)), false);
});

test("provider management and purchases fail closed without the selected household's Owner membership", () => {
  const paid = activeSubscription("monthly_active", true);
  for (const entitlement of [null,
    { ...paid.householdEntitlement!, role: "viewer" as const },
    { ...paid.householdEntitlement!, billingBoundHere: false },
    { ...paid.householdEntitlement!, planKey: "premium_yearly" as const },
  ]) {
    const snapshot = { ...paid, householdEntitlement: entitlement };
    assert.equal(canCancelSubscription(snapshot), false);
    assert.equal(canSwitchToYearly(snapshot), false);
  }
  const free = { ...activeSubscription("free", null), customerInfo: { ...paid.customerInfo!, hasRevenueCatPremium: false } };
  assert.equal(canPurchaseHouseholdPlan(free), true);
  assert.equal(canPurchaseHouseholdPlan({ ...free, householdEntitlement: null }), false);
  assert.equal(canPurchaseHouseholdPlan({ ...free, householdEntitlement: { ...free.householdEntitlement!, role: "viewer" } }), false);
  assert.equal(canPurchaseHouseholdPlan({ ...free, customerInfo: null }), false);
  assert.equal(canPurchaseHouseholdPlan({ ...free, customerInfo: paid.customerInfo }), false);
});

test("dismissing the cancellation dialog leaves the provider and subscription unchanged", async () => {
  const subscription = activeSubscription("monthly_active", true);
  let openCalls = 0;
  const handoff = createCancellationHandoff(async () => { openCalls += 1; });
  assert.equal(handoff.openDialog(subscription), true);
  assert.equal(handoff.dismiss(), true);
  assert.equal(await handoff.confirm(subscription), "not_open");
  assert.equal(openCalls, 0);
  assert.equal(subscription.view, "monthly_active");
  assert.equal(subscription.customerInfo?.hasRevenueCatPremium, true);
});

test("cancellation handoff cannot open twice while the first attempt is pending", async () => {
  const subscription = activeSubscription("yearly_active", true);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let openCalls = 0;
  const handoff = createCancellationHandoff(async () => { openCalls += 1; await gate; });
  assert.equal(handoff.openDialog(subscription), true);
  const firstAttempt = handoff.confirm(subscription);
  assert.equal(handoff.dismiss(), false);
  assert.equal(await handoff.confirm(subscription), "busy");
  assert.equal(openCalls, 1);
  release();
  assert.equal(await firstAttempt, "opened");
  assert.equal(await handoff.confirm(subscription), "not_open");
  assert.equal(subscription.view, "yearly_active");
});

test("failed management handoff keeps the dialog open and does not revoke premium", async () => {
  const subscription = activeSubscription("monthly_active", true);
  let shouldFail = true;
  const handoff = createCancellationHandoff(async () => {
    if (shouldFail) throw new Error("Provider unavailable");
  });
  assert.equal(handoff.openDialog(subscription), true);
  assert.equal(await handoff.confirm(subscription), "failed");
  assert.equal(subscription.customerInfo?.hasRevenueCatPremium, true);
  assert.equal(subscription.view, "monthly_active");
  shouldFail = false;
  assert.equal(await handoff.confirm(subscription), "opened");
});

test("missing provider management URL never pretends cancellation succeeded", async () => {
  const subscription = activeSubscription("monthly_active", true);
  subscription.customerInfo!.managementUrl = null;
  const handoff = createCancellationHandoff(async () => { throw new Error("Should not open"); });
  assert.equal(handoff.openDialog(subscription), true);
  assert.equal(await handoff.confirm(subscription), "unavailable");
  assert.equal(subscription.customerInfo?.hasRevenueCatPremium, true);
  assert.equal(handoff.dismiss(), true);
});

test("an open confirmation cannot be reused after an account, household, or plan switch", async () => {
  const subscription = activeSubscription("monthly_active", true);
  let openCalls = 0;
  const handoff = createCancellationHandoff(async () => { openCalls += 1; });
  for (const changed of [
    { ...subscription, userId: "user-2" },
    { ...subscription, householdId: "household-2" },
    { ...subscription, customerInfo: { ...subscription.customerInfo!, productId: "plantie_premium_yearly" } },
  ]) {
    assert.equal(handoff.openDialog(subscription), true);
    assert.equal(await handoff.confirm(changed), "not_applicable");
    assert.equal(handoff.dismiss(), true);
  }
  assert.equal(openCalls, 0);
});

test("billing management only accepts safe HTTPS URLs and invalid dates do not crash the UI", () => {
  assert.equal(safeBillingManagementUrl("https://billing.example.com/manage"), "https://billing.example.com/manage");
  assert.equal(safeBillingManagementUrl("javascript:alert(1)"), null);
  assert.equal(safeBillingManagementUrl("http://billing.example.com/manage"), null);
  assert.equal(safeBillingManagementUrl("https://user:pass@billing.example.com/manage"), null);
  assert.equal(formatSubscriptionDate("not-a-date", "en"), null);
  assert.ok(formatSubscriptionDate("2026-11-01T00:00:00Z", "en"));
});

test("subscription screens consume the central snapshot and preserve provider cancellation semantics", () => {
  const pricing = readFileSync("src/components/PricingPage.tsx", "utf8");
  const upgrade = readFileSync("src/components/UpgradeModal.tsx", "utf8");
  const app = readFileSync("src/App.tsx", "utf8");
  const hook = readFileSync("src/hooks/useSubscriptionState.ts", "utf8");
  assert.match(pricing, /subscription: SubscriptionSnapshot/);
  assert.match(upgrade, /subscription: SubscriptionSnapshot/);
  assert.doesNotMatch(pricing + upgrade, /billing\.getCustomerInfo\(|billing\.syncEntitlements\(|className="neutral-action"/);
  assert.match(pricing, /aria-modal="true"/);
  assert.match(pricing, /canCancelSubscription\(subscription\)/);
  assert.match(pricing, /cancellationHandoff\.openDialog\(subscription\)/);
  assert.match(pricing, /cancellationHandoff\.dismiss\(\)/);
  assert.match(pricing, /cancellationHandoff\.confirm\(subscription\)/);
  assert.match(pricing, /actionInProgress\.current/);
  assert.match(pricing, /t\("pricing\.keepSubscription"\)/);
  assert.match(pricing, /t\("pricing\.cancelSubscription"\)/);
  assert.match(pricing, /onSubscriptionChanged\(\)/);
  assert.match(pricing, /Browser\.addListener\("browserFinished"/);
  assert.match(pricing, /onSubscriptionChangedRef\.current\(\)/);
  assert.match(app, /onToggle=\{\(event\) => \{ if \(event\.currentTarget\.open\) void refreshSubscriptionState\(\); \}\}/);
  assert.match(hook, /window\.addEventListener\("focus", refreshWhenVisible\)/);
});

test("subscription loading, errors, cancellation, and provider handoff are translated", () => {
  for (const language of ["en", "sk", "de", "fr", "es"] as const) {
    for (const key of [
      "pricing.statusUnavailable",
      "pricing.refreshFailed",
      "pricing.resolving",
      "pricing.syncing",
      "pricing.cancelTitle",
      "pricing.cancelBody",
      "pricing.cancelProviderHint",
      "pricing.cancelSubscription",
      "pricing.keepSubscription",
      "pricing.cancelHandoff",
      "pricing.cancelUnavailable",
      "pricing.currentSubscription",
      "pricing.freePlan",
      "pricing.monthlyPlan",
      "pricing.yearlyPlan",
      "pricing.householdPlan",
      "pricing.statusActive",
      "pricing.statusCancelled",
      "pricing.statusExpired",
      "pricing.statusFree",
      "pricing.statusShared",
      "pricing.billingPeriod",
      "pricing.previousPlan",
      "pricing.noActiveSubscription",
      "pricing.householdAccessBody",
      "pricing.retry",
    ] as const) {
      assert.notEqual(translate(language, key), key);
    }
  }
});

test("billing history names every supported transition in the selected language", () => {
  for (const language of ["en", "sk", "de", "fr", "es"] as const) {
    const copy = householdSubscriptionCopy(language);
    for (const eventType of ["subscription_started", "upgraded", "downgraded", "renewed", "cancelled",
      "resumed", "expired", "switched_to_free", "payment_failed"]) {
      assert.ok(copy.historyEvents[eventType]);
      assert.notEqual(copy.historyEvents[eventType], eventType);
    }
    assert.ok(copy.historyUpdated);
  }
  assert.equal(householdSubscriptionCopy("sk").historyEvents.cancelled, "Automatické obnovenie zrušené");
});
