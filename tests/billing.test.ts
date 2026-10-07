import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { HandlerResponse } from "@netlify/functions";
import {
  BillingAuthRequiredError,
  BillingNotConfiguredError,
  BillingConfirmationPendingError,
  BillingProductUnavailableError,
  BillingPurchaseCancelledError,
  createRevenueCatBillingService,
  createRevenueCatWebBillingService,
  normalizeBillingError,
  revenueCatEntitlementId,
  revenueCatProductIds,
  selectRevenueCatApiKey,
} from "../src/lib/billingService.js";
import { handler } from "../netlify/functions/revenuecat-webhook.js";

test("RevenueCat product identifiers are stable", () => {
  assert.equal(revenueCatEntitlementId, "premium");
  assert.equal(revenueCatProductIds.premiumMonthly, "plantie_premium_monthly");
  assert.equal(revenueCatProductIds.premiumYearly, "plantie_premium_yearly");
});

test("local web uses the Web Billing sandbox without changing mobile or preview keys", () => {
  const keys = {
    testStore: "test_public",
    webSandbox: "rcb_sb_public",
    web: "rcb_live_public",
    android: "goog_public",
  };

  assert.equal(selectRevenueCatApiKey("web", "development", keys), "rcb_sb_public");
  assert.equal(selectRevenueCatApiKey("web", "development", { ...keys, webSandbox: "" }), "test_public");
  assert.equal(selectRevenueCatApiKey("android", "development", keys), "test_public");
  assert.equal(selectRevenueCatApiKey("web", "test", keys), "test_public");
  assert.equal(selectRevenueCatApiKey("web", "production", keys), "rcb_live_public");
  assert.equal(selectRevenueCatApiKey("android", "production", keys), "goog_public");
  assert.equal(selectRevenueCatApiKey("web", "development", { ...keys, webSandbox: "invalid" }), "");
  assert.equal(selectRevenueCatApiKey("web", "production", { ...keys, web: "rcb_sb_public" }), "");
});

const customerInfo = {
  entitlements: {
    active: {
      premium: { isActive: true, productIdentifier: revenueCatProductIds.premiumMonthly, willRenew: true, expirationDate: "2026-11-01T00:00:00Z" },
    },
  },
  originalAppUserId: "user-id",
};
const freeCustomerInfo = { entitlements: { active: {} }, originalAppUserId: "user-id" };

const product = {
  description: "Monthly premium",
  identifier: revenueCatProductIds.premiumMonthly,
  priceString: "4.99 EUR",
  title: "Plantie Premium Monthly",
};
const yearlyProduct = {
  description: "Yearly premium",
  identifier: revenueCatProductIds.premiumYearly,
  priceString: "39.99 EUR",
  title: "Plantie Premium Yearly",
};
const monthlyPackage = { identifier: "$rc_monthly", product };
const yearlyPackage = { identifier: "$rc_annual", product: yearlyProduct };

const createMockBilling = (
  patch: Partial<Parameters<typeof createRevenueCatBillingService>[0]> = {},
  packages: Array<{ identifier: string; product: { description: string; identifier: string; priceString: string; title: string } }> = [
    monthlyPackage,
    yearlyPackage,
  ],
  customerInfoForRead: object = freeCustomerInfo,
) => {
  const calls: string[] = [];
  const service = createRevenueCatBillingService({
    getApiKey: () => "public-mobile-key",
    getCurrentUserId: async () => "user-id",
    getRuntime: () => "ios",
    purchases: {
      configure: async (config) => {
        calls.push(`configure:${config.appUserID}`);
      },
      logIn: async ({ appUserID }) => {
        calls.push(`log-in:${appUserID}`);
        return { customerInfo: freeCustomerInfo, created: false } as never;
      },
      getCustomerInfo: async () => ({ customerInfo: customerInfoForRead } as never),
      getOfferings: async () => ({ current: { availablePackages: packages } } as never),
      purchasePackage: async ({ aPackage }) => {
        calls.push(`purchase:${aPackage.product.identifier}`);
        return { customerInfo, productIdentifier: aPackage.product.identifier } as never;
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

test("native runtime without API key is not configured", async () => {
  const { service } = createMockBilling({ getApiKey: () => "" });

  assert.deepEqual(service.getStatus(), { configured: false, disabledReason: "missing_config", runtime: "ios" });
  await assert.rejects(() => service.purchasePremiumMonthly(), BillingNotConfiguredError);
});

test("native configured runtime fetches mobile products", async () => {
  const { service } = createMockBilling();
  const products = await service.getAvailableProducts();

  assert.equal(products.length, 2);
  assert.equal(products[0].id, revenueCatProductIds.premiumMonthly);
  assert.equal(products[0].price, "4.99 EUR");
});

test("native forced customer refresh invalidates the SDK cache before reading", async () => {
  const calls: string[] = [];
  const { service } = createMockBilling({
    purchases: {
      configure: async () => undefined,
      logIn: async () => ({ customerInfo } as never),
      getCustomerInfo: async () => {
        calls.push("get-customer-info");
        return { customerInfo: freeCustomerInfo } as never;
      },
      invalidateCustomerInfoCache: async () => { calls.push("invalidate-cache"); },
      getOfferings: async () => ({ current: { availablePackages: [monthlyPackage] } } as never),
      purchasePackage: async () => ({ customerInfo } as never),
      restorePurchases: async () => ({ customerInfo } as never),
    },
  });

  await service.getCustomerInfo();
  await service.getCustomerInfo(true);
  assert.deepEqual(calls, ["get-customer-info", "invalidate-cache", "get-customer-info"]);
});

test("native customer info retains the last inactive Premium period without granting access", async () => {
  const { service } = createMockBilling({}, undefined, {
    entitlements: { active: {}, all: { premium: {
      isActive: false,
      productIdentifier: revenueCatProductIds.premiumYearly,
      productPlanIdentifier: null,
      expirationDate: "2026-09-01T10:00:00Z",
    } } },
    originalAppUserId: "user-id",
  });
  const info = await service.getCustomerInfo();
  assert.equal(info.hasRevenueCatPremium, false);
  assert.equal(info.activePlan, null);
  assert.equal(info.lastExpiredPlan, "yearly");
  assert.equal(info.lastExpiredAt, "2026-09-01T10:00:00Z");
});

test("Google Play base-plan products map to monthly and yearly purchases", async () => {
  const playPackages = [
    { ...monthlyPackage, product: { ...product, identifier: "plantie_premium_monthly:monthly" } },
    { ...yearlyPackage, product: { ...yearlyProduct, identifier: "plantie_premium_yearly:yearly" } },
  ];
  const { calls, service } = createMockBilling({}, playPackages);

  assert.deepEqual((await service.getAvailableProducts()).map((item) => item.id), [
    revenueCatProductIds.premiumMonthly,
    revenueCatProductIds.premiumYearly,
  ]);
  await service.purchasePremiumMonthly();
  assert.ok(calls.includes("purchase:plantie_premium_monthly:monthly"));
});

test("purchase syncs server entitlements but does not grant premium locally", async () => {
  const { calls, service } = createMockBilling();
  const info = await service.purchasePremiumMonthly();

  assert.equal(info.hasRevenueCatPremium, true);
  assert.equal(info.activePlan, "monthly");
  assert.equal(info.willRenew, true);
  assert.equal(info.expiresAt, "2026-11-01T00:00:00Z");
  assert.deepEqual(calls, ["configure:user-id", "purchase:plantie_premium_monthly", "refresh-entitlement"]);
});

test("native completed checkout with unavailable server confirmation is pending rather than a failed purchase", async () => {
  const { calls, service } = createMockBilling({ refreshServerEntitlement: async () => { throw new Error("offline"); } });
  await assert.rejects(() => service.purchasePremiumMonthly(), BillingConfirmationPendingError);
  assert.equal(calls.filter((call) => call.startsWith("purchase:")).length, 1);
});

test("Android monthly to yearly passes the old product to the store and reads the confirmed plan", async () => {
  let changeOptions: unknown;
  const yearlyInfo = {
    ...customerInfo,
    entitlements: { active: { premium: {
      isActive: true,
      productIdentifier: revenueCatProductIds.premiumYearly,
      productPlanIdentifier: "yearly",
      willRenew: true,
      expirationDate: "2027-11-01T00:00:00Z",
    } } },
  };
  const androidMonthlyInfo = {
    ...customerInfo,
    entitlements: { active: { premium: {
      ...customerInfo.entitlements.active.premium,
      productPlanIdentifier: "monthly",
    } } },
  };
  const { service } = createMockBilling({
    getRuntime: () => "android",
    purchases: {
      configure: async () => undefined,
      logIn: async () => ({ customerInfo } as never),
      getCustomerInfo: async () => ({ customerInfo: androidMonthlyInfo } as never),
      getOfferings: async () => ({ current: { availablePackages: [monthlyPackage, yearlyPackage] } } as never),
      purchasePackage: async (options) => {
        changeOptions = options;
        return { customerInfo: yearlyInfo } as never;
      },
      restorePurchases: async () => ({ customerInfo } as never),
    },
  });
  const result = await service.changePlan("yearly");
  assert.equal(result.activePlan, "yearly");
  assert.deepEqual((changeOptions as { storeProductChangeInfo: unknown }).storeProductChangeInfo, {
    oldProductIdentifier: "plantie_premium_monthly:monthly",
  });
});

test("Android yearly to monthly replaces the current product", async () => {
  let changeOptions: unknown;
  const yearlyInfo = {
    ...customerInfo,
    entitlements: { active: { premium: {
      isActive: true, productIdentifier: revenueCatProductIds.premiumYearly,
      productPlanIdentifier: "yearly", willRenew: true, expirationDate: "2027-11-01T00:00:00Z",
    } } },
  };
  const { service } = createMockBilling({
    getRuntime: () => "android",
    purchases: {
      configure: async () => undefined,
      logIn: async () => ({ customerInfo: yearlyInfo } as never),
      getCustomerInfo: async () => ({ customerInfo: yearlyInfo } as never),
      getOfferings: async () => ({ current: { availablePackages: [monthlyPackage, yearlyPackage] } } as never),
      purchasePackage: async (options) => {
        changeOptions = options;
        return { customerInfo } as never;
      },
      restorePurchases: async () => ({ customerInfo: yearlyInfo } as never),
    },
  });
  const result = await service.changePlan("monthly");
  assert.equal(result.activePlan, "monthly");
  assert.deepEqual((changeOptions as { storeProductChangeInfo: unknown }).storeProductChangeInfo, {
    oldProductIdentifier: "plantie_premium_yearly:yearly",
  });
});

test("failed plan change preserves the RevenueCat monthly state", async () => {
  const { service } = createMockBilling({
    purchases: {
      configure: async () => undefined,
      logIn: async () => ({ customerInfo } as never),
      getCustomerInfo: async () => ({ customerInfo } as never),
      getOfferings: async () => ({ current: { availablePackages: [monthlyPackage, yearlyPackage] } } as never),
      purchasePackage: async () => { throw { errorCode: 42 }; },
      restorePurchases: async () => ({ customerInfo } as never),
    },
  });
  await assert.rejects(() => service.changePlan("yearly"), /test purchase failed/);
  assert.equal((await service.getCustomerInfo()).activePlan, "monthly");
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
      logIn: async () => ({ customerInfo } as never),
      getCustomerInfo: async () => ({ customerInfo: freeCustomerInfo } as never),
      getOfferings: async () => ({ current: { availablePackages: [] } } as never),
      purchasePackage: async () => ({ customerInfo } as never),
      restorePurchases: async () => ({ customerInfo } as never),
    },
  });

  await assert.rejects(() => service.purchasePremiumMonthly(), BillingProductUnavailableError);
});

test("concurrent native reads configure RevenueCat once before accessing the SDK", async () => {
  let releaseConfigure!: () => void;
  let markConfigureStarted!: () => void;
  const configureStarted = new Promise<void>((resolve) => { markConfigureStarted = resolve; });
  const configureWait = new Promise<void>((resolve) => { releaseConfigure = resolve; });
  const calls: string[] = [];
  const { service } = createMockBilling({
    purchases: {
      configure: async () => {
        calls.push("configure");
        markConfigureStarted();
        await configureWait;
      },
      logIn: async () => { calls.push("log-in"); return { customerInfo } as never; },
      getCustomerInfo: async () => { calls.push("customer-info"); return { customerInfo: freeCustomerInfo } as never; },
      getOfferings: async () => { calls.push("offerings"); return { current: { availablePackages: [monthlyPackage] } } as never; },
      purchasePackage: async () => ({ customerInfo } as never),
      restorePurchases: async () => ({ customerInfo } as never),
    },
  });

  const first = service.getCustomerInfo();
  const second = service.getAvailableProducts();
  await configureStarted;
  assert.deepEqual(calls, ["configure"]);
  releaseConfigure();
  await Promise.all([first, second]);
  assert.deepEqual(calls, ["configure", "customer-info", "offerings"]);
});

test("native account switch logs in the new Supabase user without reconfiguring or anonymous logout", async () => {
  let currentUserId: string | null = "user-one";
  const { calls, service } = createMockBilling({ getCurrentUserId: async () => currentUserId });

  await service.getCustomerInfo();
  currentUserId = "user-two";
  await Promise.all([service.getCustomerInfo(), service.getAvailableProducts()]);
  currentUserId = null;
  await assert.rejects(() => service.getCustomerInfo(), BillingAuthRequiredError);
  currentUserId = "user-three";
  await service.getCustomerInfo();

  assert.deepEqual(calls.filter((call) => call.startsWith("configure:") || call.startsWith("log-in:")), [
    "configure:user-one",
    "log-in:user-two",
    "log-in:user-three",
  ]);
});

test("native checkout never starts if the account changes during SDK configuration or offerings lookup", async () => {
  for (const delayedStep of ["configure", "offerings"] as const) {
    let currentUserId = "original-user";
    let release!: () => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const wait = new Promise<void>((resolve) => { release = resolve; });
    let checkoutCount = 0;
    const { service } = createMockBilling({
      getCurrentUserId: async () => currentUserId,
      purchases: {
        configure: async () => { if (delayedStep === "configure") { markStarted(); await wait; } },
        logIn: async () => ({ customerInfo } as never),
        getCustomerInfo: async () => ({ customerInfo: freeCustomerInfo } as never),
        getOfferings: async () => {
          if (delayedStep === "offerings") { markStarted(); await wait; }
          return { current: { availablePackages: [monthlyPackage] } } as never;
        },
        purchasePackage: async () => { checkoutCount += 1; return { customerInfo } as never; },
        restorePurchases: async () => ({ customerInfo } as never),
      },
    });
    const purchase = service.purchasePremiumMonthly();
    await started;
    currentUserId = "different-user";
    release();
    await assert.rejects(purchase, BillingAuthRequiredError);
    assert.equal(checkoutCount, 0);
  }
});

test("native SDK already configured in the process switches identity without configuring again", async () => {
  const calls: string[] = [];
  const { service } = createMockBilling({
    getCurrentUserId: async () => "current-user",
    purchases: {
      isConfigured: async () => ({ isConfigured: true }),
      getAppUserID: async () => ({ appUserID: "previous-user" }),
      configure: async () => { calls.push("configure"); },
      logIn: async ({ appUserID }) => { calls.push(`log-in:${appUserID}`); return { customerInfo } as never; },
      getCustomerInfo: async () => ({ customerInfo: freeCustomerInfo } as never),
      getOfferings: async () => ({ current: { availablePackages: [monthlyPackage] } } as never),
      purchasePackage: async () => ({ customerInfo } as never),
      restorePurchases: async () => ({ customerInfo } as never),
    },
  });

  await service.getCustomerInfo();
  await service.getAvailableProducts();
  assert.deepEqual(calls, ["log-in:current-user"]);
});

test("failed native account switch retries logIn without reconfiguring", async () => {
  let currentUserId = "user-one";
  let loginAttempts = 0;
  const calls: string[] = [];
  const { service } = createMockBilling({
    getCurrentUserId: async () => currentUserId,
    purchases: {
      configure: async ({ appUserID }) => { calls.push(`configure:${appUserID}`); },
      logIn: async ({ appUserID }) => {
        calls.push(`log-in:${appUserID}`);
        loginAttempts += 1;
        if (loginAttempts === 1) throw new Error("offline");
        return { customerInfo } as never;
      },
      getCustomerInfo: async () => ({ customerInfo: freeCustomerInfo } as never),
      getOfferings: async () => ({ current: { availablePackages: [monthlyPackage] } } as never),
      purchasePackage: async () => ({ customerInfo } as never),
      restorePurchases: async () => ({ customerInfo } as never),
    },
  });

  await service.getCustomerInfo();
  currentUserId = "user-two";
  await assert.rejects(() => service.getCustomerInfo(), /Billing is unavailable/);
  await service.getCustomerInfo();
  assert.deepEqual(calls, ["configure:user-one", "log-in:user-two", "log-in:user-two"]);
});

test("native purchase does not sync the old customer's entitlement after an auth switch", async () => {
  let currentUserId: string | null = "user-one";
  let markPurchaseStarted!: () => void;
  let finishPurchase!: () => void;
  const purchaseStarted = new Promise<void>((resolve) => { markPurchaseStarted = resolve; });
  const purchaseWait = new Promise<void>((resolve) => { finishPurchase = resolve; });
  const { calls, service } = createMockBilling({
    getCurrentUserId: async () => currentUserId,
    purchases: {
      configure: async ({ appUserID }) => { calls.push(`configure:${appUserID}`); },
      logIn: async ({ appUserID }) => { calls.push(`log-in:${appUserID}`); return { customerInfo } as never; },
      getCustomerInfo: async () => ({ customerInfo: freeCustomerInfo } as never),
      getOfferings: async () => ({ current: { availablePackages: [monthlyPackage] } } as never),
      purchasePackage: async () => {
        markPurchaseStarted();
        await purchaseWait;
        return { customerInfo } as never;
      },
      restorePurchases: async () => ({ customerInfo } as never),
    },
  });

  const pendingPurchase = service.purchasePremiumMonthly();
  await purchaseStarted;
  currentUserId = "user-two";
  const nextCustomer = service.getCustomerInfo();
  finishPurchase();
  await assert.rejects(pendingPurchase, BillingAuthRequiredError);
  await nextCustomer;
  assert.deepEqual(calls.filter((call) => call.startsWith("configure:") || call.startsWith("log-in:") || call === "refresh-entitlement"), [
    "configure:user-one",
    "log-in:user-two",
  ]);
});

test("RevenueCat cancellation errors are safe and explicit", () => {
  assert.ok(normalizeBillingError({ userCancelled: true }) instanceof BillingPurchaseCancelledError);
});

test("RevenueCat configuration errors explain missing offering products", () => {
  const error = normalizeBillingError({ code: "23" });

  assert.ok(error instanceof BillingProductUnavailableError);
  assert.match(error.message, /current offering/);
  assert.match(error.message, /plantie_premium_monthly/);
  assert.match(error.message, /plantie_premium_yearly/);
});

const webProduct = { ...product, price: { formattedPrice: "$4.99" } };
const webYearlyProduct = { ...yearlyProduct, price: { formattedPrice: "$39.99" } };

const createMockWebBilling = (options: {
  apiKey?: string;
  activePremium?: boolean;
  activeProductId?: string;
  expiredPremium?: boolean;
  willRenew?: boolean;
  purchaseError?: unknown;
  purchaseWait?: Promise<void>;
  onPurchaseStarted?: () => void;
  customerInfoWait?: Promise<void>;
  onCustomerInfoStarted?: () => void;
  refreshError?: boolean;
  resolveProviderUserId?: Parameters<typeof createRevenueCatWebBillingService>[0]["resolveProviderUserId"];
} = {}) => {
  const calls: string[] = [];
  let userId: string | null = "user-id";
  let sdkUserId = "";
  let premium = options.activePremium ?? false;
  let activeProductId = options.activeProductId ?? revenueCatProductIds.premiumMonthly;
  let customerInfoCalls = 0;
  const client = {
    changeUser: async (nextUserId: string) => { sdkUserId = nextUserId; calls.push(`change-user:${nextUserId}`); },
    getAppUserId: () => sdkUserId,
    getCustomerInfo: async () => {
      calls.push("customer-info");
      const readUserId = sdkUserId;
      customerInfoCalls += 1;
      if (customerInfoCalls === 1 && options.customerInfoWait) {
        options.onCustomerInfoStarted?.();
        await options.customerInfoWait;
      }
      return {
        entitlements: { active: premium ? { premium: {
          isActive: true,
          productIdentifier: activeProductId,
          expirationDate: new Date("2026-11-01T00:00:00Z"),
          willRenew: options.willRenew ?? true,
        } } : {}, all: !premium && options.expiredPremium ? { premium: {
          isActive: false,
          productIdentifier: activeProductId,
          expirationDate: new Date("2026-09-01T10:00:00Z"),
          willRenew: false,
        } } : {} },
        originalAppUserId: readUserId,
        managementURL: premium ? "https://example.com/manage" : null,
      } as never;
    },
    getOfferings: async () => {
      calls.push("offerings");
      return { current: { availablePackages: [
        { ...monthlyPackage, product: webProduct },
        { ...yearlyPackage, product: webYearlyProduct },
      ] } } as never;
    },
    purchase: async ({ rcPackage }: { rcPackage: { product: { identifier: string } } }) => {
      calls.push(`purchase:${rcPackage.product.identifier}`);
      options.onPurchaseStarted?.();
      if (options.purchaseWait) await options.purchaseWait;
      if (options.purchaseError) throw options.purchaseError;
      premium = true;
      activeProductId = rcPackage.product.identifier;
      return {} as never;
    },
  };
  const deps = {
    createPurchases: async (_apiKey: string, appUserId: string) => {
      calls.push(`configure:${appUserId}`);
      sdkUserId = appUserId;
      return client as never;
    },
    getApiKey: () => options.apiKey ?? "test-public-key",
    getCurrentUserId: async () => userId,
    resolveProviderUserId: options.resolveProviderUserId,
    refreshServerEntitlement: async () => {
      calls.push("refresh-entitlement");
      if (options.refreshError) throw new Error("Supabase unavailable");
    },
  };
  return {
    calls,
    createService: () => createRevenueCatWebBillingService(deps),
    setUserId: (nextUserId: string | null) => { userId = nextUserId; },
  };
};

test("web initializes with the Supabase user and loads current offering", async () => {
  const { calls, createService } = createMockWebBilling();
  const service = createService();
  assert.deepEqual(service.getStatus(), { configured: true, disabledReason: null, runtime: "web" });
  assert.deepEqual((await service.getAvailableProducts()).map((item) => [item.id, item.price]), [
    [revenueCatProductIds.premiumMonthly, "$4.99"],
    [revenueCatProductIds.premiumYearly, "$39.99"],
  ]);
  assert.deepEqual(calls, ["configure:user-id", "offerings"]);
});

test("web uses the server-authorized household customer and restores the correct identity after switching", async () => {
  const authorized: string[] = [];
  const { calls, createService } = createMockWebBilling({
    resolveProviderUserId: async (user, household, forPurchase) => {
      assert.equal(user, "user-id");
      if (!household) throw new BillingAuthRequiredError();
      authorized.push(`${household}:${forPurchase}`);
      return `hh_${household}`;
    },
  });
  const service = createService();
  assert.equal((await service.getCustomerInfo(true, "first-home")).appUserId, "hh_first-home");
  assert.equal((await service.getCustomerInfo(true, "second-home")).appUserId, "hh_second-home");
  await service.purchasePremiumMonthly("first-home");
  assert.deepEqual(authorized, ["first-home:false", "second-home:false", "first-home:true"]);
  assert.ok(calls.indexOf("change-user:hh_first-home") < calls.indexOf(`purchase:${revenueCatProductIds.premiumMonthly}`));
  await assert.rejects(() => service.purchasePremiumMonthly(), BillingAuthRequiredError);
});

test("native purchases use authorized household identity independently of the authenticated user", async () => {
  const resolved: string[] = [];
  const { calls, service } = createMockBilling({
    householdNativeBillingEnabled: true,
    resolveProviderUserId: async (user, household, forPurchase) => {
      assert.equal(user, "user-id");
      if (!household) throw new BillingAuthRequiredError();
      resolved.push(`${household}:${forPurchase}`);
      return `hh_${household}`;
    },
  });
  await service.getCustomerInfo(true, "first-home");
  await service.getCustomerInfo(true, "second-home");
  await service.purchasePremiumYearly("first-home");
  assert.deepEqual(resolved, ["first-home:false", "second-home:false", "first-home:true"]);
  assert.deepEqual(calls.slice(0, 3), ["configure:hh_first-home", "log-in:hh_second-home", "log-in:hh_first-home"]);
  assert.ok(calls.includes(`purchase:${revenueCatProductIds.premiumYearly}`));
  await assert.rejects(() => service.restorePurchases(), BillingAuthRequiredError);
});

test("new native household purchases, plan changes and restores fail closed until the receipt policy is confirmed", async () => {
  const { calls, service } = createMockBilling({ resolveProviderUserId: async () => "hh_new-household" });
  await service.getCustomerInfo(true, "household-id");
  const callsBeforeActions = [...calls];
  for (const action of [() => service.purchasePremiumMonthly("household-id"),
    () => service.purchasePremiumYearly("household-id"), () => service.changePlan("yearly", "household-id"),
    () => service.restorePurchases("household-id")]) {
    await assert.rejects(action, (error: unknown) => error instanceof BillingNotConfiguredError && /original customer/.test(error.message));
  }
  assert.deepEqual(calls, callsBeforeActions);
});

test("legacy native purchaser identity remains supported when new household native billing is disabled", async () => {
  const { calls, service } = createMockBilling({ resolveProviderUserId: async () => "legacy-purchaser-id" });
  await service.purchasePremiumMonthly("legacy-household");
  await service.restorePurchases("legacy-household");
  assert.ok(calls.includes(`purchase:${revenueCatProductIds.premiumMonthly}`));
  assert.ok(calls.includes("restore"));
});

test("web successful purchase refreshes RevenueCat and server entitlement", async () => {
  const { calls, createService } = createMockWebBilling();
  const info = await createService().purchasePremiumMonthly();
  assert.equal(info.hasRevenueCatPremium, true);
  assert.equal(info.appUserId, "user-id");
  assert.equal(info.managementUrl, "https://example.com/manage");
  assert.equal(info.activePlan, "monthly");
  assert.deepEqual(calls, ["configure:user-id", "offerings", "customer-info", "purchase:plantie_premium_monthly", "customer-info", "refresh-entitlement"]);
});

test("cancelled yearly renewal keeps Premium and the yearly plan until expiry", async () => {
  const { createService } = createMockWebBilling({
    activePremium: true,
    activeProductId: revenueCatProductIds.premiumYearly,
    willRenew: false,
  });
  const info = await createService().getCustomerInfo();
  assert.equal(info.hasRevenueCatPremium, true);
  assert.equal(info.activePlan, "yearly");
  assert.equal(info.willRenew, false);
  assert.equal(info.expiresAt, "2026-11-01T00:00:00.000Z");
});

test("yearly checkout resolves the yearly plan from refreshed RevenueCat customer info", async () => {
  const { createService } = createMockWebBilling();
  const info = await createService().purchasePremiumYearly();
  assert.equal(info.hasRevenueCatPremium, true);
  assert.equal(info.activePlan, "yearly");
});

test("expired RevenueCat entitlement exposes no active plan even after a previous purchase", async () => {
  const { createService } = createMockWebBilling({ expiredPremium: true });
  const info = await createService().getCustomerInfo();
  assert.equal(info.hasRevenueCatPremium, false);
  assert.equal(info.activePlan, null);
  assert.equal(info.willRenew, null);
  assert.equal(info.lastExpiredPlan, "monthly");
  assert.equal(info.lastExpiredAt, "2026-09-01T10:00:00.000Z");
});

test("web failed and cancelled purchases preserve non-premium state", async () => {
  for (const [error, expected] of [
    [{ errorCode: 42 }, /test purchase failed/],
    [{ errorCode: 1 }, /Purchase cancelled/],
  ] as const) {
    const { calls, createService } = createMockWebBilling({ purchaseError: error });
    const service = createService();
    await assert.rejects(() => service.purchasePremiumMonthly(), expected);
    assert.equal((await service.getCustomerInfo()).hasRevenueCatPremium, false);
    assert.equal(calls.includes("refresh-entitlement"), false);
  }
});

test("web treats a completed purchase with failed confirmation as pending", async () => {
  const { calls, createService } = createMockWebBilling({ refreshError: true });
  const service = createService();
  await assert.rejects(() => service.purchasePremiumMonthly(), BillingConfirmationPendingError);
  assert.equal((await service.getCustomerInfo()).hasRevenueCatPremium, true);
  assert.equal(calls.filter((call) => call.startsWith("purchase:")).length, 1);
});

test("web blocks duplicate purchases while checkout is in progress", async () => {
  let finishPurchase!: () => void;
  const purchaseWait = new Promise<void>((resolve) => { finishPurchase = resolve; });
  const { calls, createService } = createMockWebBilling({ purchaseWait });
  const service = createService();
  const first = service.purchasePremiumYearly();
  await assert.rejects(() => service.purchasePremiumYearly(), /already in progress/);
  finishPurchase();
  await first;
  assert.equal(calls.filter((call) => call.startsWith("purchase:")).length, 1);
});

test("web premium survives service reload and follows the authenticated user", async () => {
  const { calls, createService, setUserId } = createMockWebBilling({ activePremium: true });
  const service = createService();
  assert.equal((await service.getCustomerInfo()).hasRevenueCatPremium, true);
  assert.equal((await createService().restorePurchases()).hasRevenueCatPremium, true);
  setUserId("second-user");
  assert.equal((await service.getCustomerInfo()).appUserId, "second-user");
  assert.ok(calls.includes("change-user:second-user"));
  assert.ok(calls.includes("refresh-entitlement"));
});

test("web rejects a customer read that completes after an account switch", async () => {
  let releaseRead!: () => void;
  let markReadStarted!: () => void;
  const readStarted = new Promise<void>((resolve) => { markReadStarted = resolve; });
  const readWait = new Promise<void>((resolve) => { releaseRead = resolve; });
  const { calls, createService, setUserId } = createMockWebBilling({
    customerInfoWait: readWait,
    onCustomerInfoStarted: markReadStarted,
  });
  const service = createService();

  const oldRead = service.getCustomerInfo();
  await readStarted;
  setUserId("second-user");
  const newRead = service.getCustomerInfo();
  releaseRead();

  await assert.rejects(oldRead, BillingAuthRequiredError);
  assert.equal((await newRead).appUserId, "second-user");
  assert.deepEqual(calls.filter((call) => call.startsWith("change-user:")), ["change-user:second-user"]);
});

test("web restore never refreshes the server after logout", async () => {
  let releaseRead!: () => void;
  let markReadStarted!: () => void;
  const readStarted = new Promise<void>((resolve) => { markReadStarted = resolve; });
  const readWait = new Promise<void>((resolve) => { releaseRead = resolve; });
  const { calls, createService, setUserId } = createMockWebBilling({
    customerInfoWait: readWait,
    onCustomerInfoStarted: markReadStarted,
  });
  const service = createService();

  const oldRestore = service.restorePurchases();
  await readStarted;
  setUserId(null);
  releaseRead();

  await assert.rejects(oldRestore, BillingAuthRequiredError);
  assert.equal(calls.includes("refresh-entitlement"), false);
  await assert.rejects(() => service.getCustomerInfo(), BillingAuthRequiredError);
});

test("web purchase never syncs the previous account after an auth switch", async () => {
  let finishPurchase!: () => void;
  let markPurchaseStarted!: () => void;
  const purchaseStarted = new Promise<void>((resolve) => { markPurchaseStarted = resolve; });
  const purchaseWait = new Promise<void>((resolve) => { finishPurchase = resolve; });
  const { calls, createService, setUserId } = createMockWebBilling({
    purchaseWait,
    onPurchaseStarted: markPurchaseStarted,
  });
  const service = createService();

  const oldPurchase = service.purchasePremiumMonthly();
  await purchaseStarted;
  setUserId("second-user");
  const newRead = service.getCustomerInfo();
  finishPurchase();

  await assert.rejects(oldPurchase, BillingAuthRequiredError);
  assert.equal((await newRead).appUserId, "second-user");
  assert.equal(calls.includes("refresh-entitlement"), false);
});

test("web without a public key fails closed", async () => {
  const { createService } = createMockWebBilling({ apiKey: "" });
  const service = createService();
  assert.deepEqual(service.getStatus(), { configured: false, disabledReason: "missing_config", runtime: "web" });
  await assert.rejects(() => service.getAvailableProducts(), BillingNotConfiguredError);
});

test("subscription screens use guarded loading buttons and no mobile-only wording", () => {
  const pricingPage = readFileSync("src/components/PricingPage.tsx", "utf8");
  const upgradeModal = readFileSync("src/components/UpgradeModal.tsx", "utf8");
  const translations = readFileSync("src/lib/i18n.ts", "utf8");
  for (const source of [pricingPage, upgradeModal, translations]) {
    assert.doesNotMatch(source, /Available in mobile app|pricing\.mobileOnly|only in the native mobile app/);
  }
  assert.match(pricingPage, /actionInProgress\.current/);
  assert.match(pricingPage, /<LoadingButton/);
  assert.match(upgradeModal, /purchaseInProgress\.current/);
  assert.match(upgradeModal, /<LoadingButton/);
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
