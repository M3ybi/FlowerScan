import assert from "node:assert/strict";
import test from "node:test";
import type { HandlerResponse } from "@netlify/functions";
import {
  BillingNotConfiguredError,
  BillingProductUnavailableError,
  BillingPurchaseCancelledError,
  BillingWebDisabledError,
  createRevenueCatBillingService,
  normalizeBillingError,
  revenueCatEntitlementId,
  revenueCatProductIds,
} from "../src/lib/billingService.js";
import { handler } from "../netlify/functions/revenuecat-webhook.js";

test("RevenueCat product identifiers are stable", () => {
  assert.equal(revenueCatEntitlementId, "premium");
  assert.equal(revenueCatProductIds.premiumMonthly, "plantie_premium_monthly");
  assert.equal(revenueCatProductIds.premiumYearly, "plantie_premium_yearly");
});

const customerInfo = {
  entitlements: {
    active: {
      premium: { isActive: true },
    },
  },
  originalAppUserId: "user-id",
};

const product = {
  description: "Monthly premium",
  identifier: revenueCatProductIds.premiumMonthly,
  priceString: "4.99 EUR",
  title: "Plantie Premium Monthly",
};

const createMockBilling = (patch: Partial<Parameters<typeof createRevenueCatBillingService>[0]> = {}) => {
  const calls: string[] = [];
  const service = createRevenueCatBillingService({
    getApiKey: () => "public-mobile-key",
    getCurrentUserId: async () => "user-id",
    getRuntime: () => "ios",
    purchases: {
      configure: async (config) => {
        calls.push(`configure:${config.appUserID}`);
      },
      getCustomerInfo: async () => ({ customerInfo } as never),
      getProducts: async () => ({ products: [product] } as never),
      purchaseStoreProduct: async ({ product: purchaseProduct }) => {
        calls.push(`purchase:${purchaseProduct.identifier}`);
        return { customerInfo, productIdentifier: purchaseProduct.identifier } as never;
      },
      restorePurchases: async () => {
        calls.push("restore");
        return { customerInfo } as never;
      },
    },
    refreshServerEntitlement: async () => {
      calls.push("refresh-entitlement");
      return {};
    },
    ...patch,
  });

  return { calls, service };
};

test("web runtime keeps billing disabled", async () => {
  const { service } = createMockBilling({ getRuntime: () => "web" });

  assert.deepEqual(service.getStatus(), { configured: false, disabledReason: "web", runtime: "web" });
  await assert.rejects(() => service.getAvailableProducts(), BillingWebDisabledError);
});

test("native runtime without API key is not configured", async () => {
  const { service } = createMockBilling({ getApiKey: () => "" });

  assert.deepEqual(service.getStatus(), { configured: false, disabledReason: "missing_config", runtime: "ios" });
  await assert.rejects(() => service.purchasePremiumMonthly(), BillingNotConfiguredError);
});

test("native configured runtime fetches mobile products", async () => {
  const { service } = createMockBilling();
  const products = await service.getAvailableProducts();

  assert.equal(products.length, 1);
  assert.equal(products[0].id, revenueCatProductIds.premiumMonthly);
  assert.equal(products[0].price, "4.99 EUR");
});

test("purchase syncs server entitlements but does not grant premium locally", async () => {
  const { calls, service } = createMockBilling();
  const info = await service.purchasePremiumMonthly();

  assert.equal(info.hasRevenueCatPremium, true);
  assert.deepEqual(calls, ["configure:user-id", "purchase:plantie_premium_monthly", "refresh-entitlement"]);
});

test("restore purchases syncs server entitlements", async () => {
  const { calls, service } = createMockBilling();
  await service.restorePurchases();

  assert.deepEqual(calls, ["configure:user-id", "restore", "refresh-entitlement"]);
});

test("missing store products fail safely", async () => {
  const { service } = createMockBilling({
    purchases: {
      configure: async () => undefined,
      getCustomerInfo: async () => ({ customerInfo } as never),
      getProducts: async () => ({ products: [] } as never),
      purchaseStoreProduct: async () => ({ customerInfo } as never),
      restorePurchases: async () => ({ customerInfo } as never),
    },
  });

  await assert.rejects(() => service.purchasePremiumMonthly(), BillingProductUnavailableError);
});

test("RevenueCat cancellation errors are safe and explicit", () => {
  assert.ok(normalizeBillingError({ userCancelled: true }) instanceof BillingPurchaseCancelledError);
});

test("RevenueCat webhook rejects missing secret configuration", async () => {
  const previousSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
  delete process.env.REVENUECAT_WEBHOOK_SECRET;

  const response = (await handler({
    body: JSON.stringify({ event: { type: "INITIAL_PURCHASE" } }),
    headers: {},
    httpMethod: "POST",
  } as never, {} as never, undefined as never)) as HandlerResponse;

  process.env.REVENUECAT_WEBHOOK_SECRET = previousSecret;
  assert.equal(response.statusCode, 503);
});

test("RevenueCat webhook rejects invalid secret", async () => {
  const previousSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
  process.env.REVENUECAT_WEBHOOK_SECRET = "expected-secret";

  const response = (await handler({
    body: JSON.stringify({ event: { type: "INITIAL_PURCHASE" } }),
    headers: { authorization: "Bearer wrong-secret" },
    httpMethod: "POST",
  } as never, {} as never, undefined as never)) as HandlerResponse;

  process.env.REVENUECAT_WEBHOOK_SECRET = previousSecret;
  assert.equal(response.statusCode, 401);
});

test("RevenueCat webhook fails closed when Supabase admin env is missing", async () => {
  const previousSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
  process.env.REVENUECAT_WEBHOOK_SECRET = "expected-secret";

  const response = (await handler({
    body: JSON.stringify({
      event: {
        app_user_id: "user-id",
        id: "event-id",
        product_id: revenueCatProductIds.premiumMonthly,
        type: "INITIAL_PURCHASE",
      },
    }),
    headers: { authorization: "Bearer expected-secret" },
    httpMethod: "POST",
  } as never, {} as never, undefined as never)) as HandlerResponse;

  process.env.REVENUECAT_WEBHOOK_SECRET = previousSecret;
  assert.equal(response.statusCode, 500);
  assert.deepEqual(JSON.parse(response.body ?? "{}"), { error: "RevenueCat webhook processing failed." });
});
