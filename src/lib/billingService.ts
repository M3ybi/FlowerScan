import { Capacitor } from "@capacitor/core";
import type { CustomerInfo, PurchasesPlugin, PurchasesStoreProduct } from "@revenuecat/purchases-capacitor";
import type { CustomerInfo as WebCustomerInfo, Package as WebPackage, Purchases as WebPurchases } from "@revenuecat/purchases-js";
import { getRevenueCatPlan, revenueCatProductIds } from "./revenueCatProducts.js";
import { supabase } from "./supabase.js";

export const revenueCatEntitlementId = "premium";

export { revenueCatProductIds } from "./revenueCatProducts.js";

export type BillingProductId = (typeof revenueCatProductIds)[keyof typeof revenueCatProductIds];
export type BillingRuntime = "web" | "ios" | "android";

export type BillingProduct = {
  description: string;
  id: BillingProductId;
  period: "monthly" | "yearly";
  price: string;
  title: string;
};

export type BillingCustomerInfo = {
  activeEntitlements: string[];
  activePlan: "monthly" | "yearly" | null;
  appUserId: string | null;
  expiresAt: string | null;
  hasRevenueCatPremium: boolean;
  lastExpiredAt?: string | null;
  lastExpiredPlan?: "monthly" | "yearly" | null;
  managementUrl: string | null;
  productId: string | null;
  willRenew: boolean | null;
};

export type BillingStatus = {
  configured: boolean;
  disabledReason: "missing_config" | null;
  runtime: BillingRuntime;
};

export interface BillingService {
  getStatus(): BillingStatus;
  getAvailableProducts(): Promise<BillingProduct[]>;
  purchasePremiumMonthly(): Promise<BillingCustomerInfo>;
  purchasePremiumYearly(): Promise<BillingCustomerInfo>;
  changePlan(targetPlan: "monthly" | "yearly"): Promise<BillingCustomerInfo>;
  restorePurchases(): Promise<BillingCustomerInfo>;
  getCustomerInfo(forceRefresh?: boolean): Promise<BillingCustomerInfo>;
  syncEntitlements(): Promise<void>;
}

export class BillingNotConfiguredError extends Error {
  constructor(message = "Billing is not configured for this runtime.") {
    super(message);
    this.name = "BillingNotConfiguredError";
  }
}

export class BillingAuthRequiredError extends Error {
  constructor() {
    super("Sign in before starting a purchase.");
    this.name = "BillingAuthRequiredError";
  }
}

export class BillingProductUnavailableError extends Error {
  constructor(message = "No monthly or yearly subscriptions were found in the current RevenueCat offering.") {
    super(message);
    this.name = "BillingProductUnavailableError";
  }
}

export class BillingPurchaseCancelledError extends Error {
  constructor() {
    super("Purchase cancelled.");
    this.name = "BillingPurchaseCancelledError";
  }
}

export class BillingConfirmationPendingError extends Error {
  constructor() {
    super("Purchase completed, but confirmation is pending. Refresh your subscription shortly.");
    this.name = "BillingConfirmationPendingError";
  }
}

export class BillingUnavailableError extends Error {
  constructor(message = "Billing is unavailable. Try again later.") {
    super(message);
    this.name = "BillingUnavailableError";
  }
}

type BillingDependencies = {
  getApiKey: (runtime: BillingRuntime) => string;
  getCurrentUserId: () => Promise<string | null>;
  getRuntime: () => BillingRuntime;
  purchases: Pick<PurchasesPlugin, "configure" | "getCustomerInfo" | "getOfferings" | "logIn" | "purchasePackage" | "restorePurchases"> &
    Partial<Pick<PurchasesPlugin, "getAppUserID" | "invalidateCustomerInfoCache" | "isConfigured">>;
  refreshServerEntitlement: () => Promise<unknown>;
};

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const revenueCatErrorCodes = {
  configuration: "23",
  network: "10",
  offlineConnection: "35",
  productNotAvailable: "5",
  productRequestTimedOut: "32",
  purchaseCancelled: "1",
  purchaseNotAllowed: "3",
  storeProblem: "2",
} as const;

export const detectBillingRuntime = (): BillingRuntime => {
  const platform = Capacitor.getPlatform();
  return platform === "ios" || platform === "android" ? platform : "web";
};

const getApiKeyFromEnv = (runtime: BillingRuntime) => {
  if (env?.MODE !== "production") {
    return env?.VITE_REVENUECAT_API_KEY_TEST_STORE ?? "";
  }

  if (runtime === "web") {
    const webKey = env?.VITE_REVENUECAT_API_KEY_WEB ?? "";
    return webKey.startsWith("rcb_") && !webKey.startsWith("rcb_sb_") ? webKey : "";
  }

  if (runtime === "ios") {
    return env?.VITE_REVENUECAT_API_KEY_IOS ?? "";
  }

  if (runtime === "android") {
    return env?.VITE_REVENUECAT_API_KEY_ANDROID ?? "";
  }

  return "";
};

const getCurrentSupabaseUserId = async () => {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error("Session could not be loaded.");
  }

  return data.session?.user.id ?? null;
};

const refreshSupabaseEntitlement = async () => {
  if (!supabase) {
    throw new Error("Supabase is not configured. Entitlement checks require an authenticated Supabase session.");
  }

  const { data, error } = await supabase.rpc("get_my_entitlement").single();
  if (error) {
    throw error;
  }

  return data;
};

const importPurchases = () => import("@revenuecat/purchases-capacitor");

const lazyPurchases: BillingDependencies["purchases"] = {
  async configure(configuration) {
    const module = await importPurchases();
    return module.Purchases.configure(configuration);
  },
  async getCustomerInfo() {
    const module = await importPurchases();
    return module.Purchases.getCustomerInfo();
  },
  async getAppUserID() {
    const module = await importPurchases();
    return module.Purchases.getAppUserID();
  },
  async invalidateCustomerInfoCache() {
    const module = await importPurchases();
    return module.Purchases.invalidateCustomerInfoCache();
  },
  async getOfferings() {
    const module = await importPurchases();
    return module.Purchases.getOfferings();
  },
  async isConfigured() {
    const module = await importPurchases();
    return module.Purchases.isConfigured();
  },
  async logIn(options) {
    const module = await importPurchases();
    return module.Purchases.logIn(options);
  },
  async purchasePackage(options) {
    const module = await importPurchases();
    return module.Purchases.purchasePackage(options);
  },
  async restorePurchases() {
    const module = await importPurchases();
    return module.Purchases.restorePurchases();
  },
};

const mapCustomerInfo = (customerInfo: CustomerInfo): BillingCustomerInfo => {
  const activeEntitlements = Object.keys(customerInfo.entitlements.active);
  const premium = customerInfo.entitlements.active[revenueCatEntitlementId];
  const previousEntitlement = !premium?.isActive ? customerInfo.entitlements.all?.[revenueCatEntitlementId] : null;
  const previousPremium = previousEntitlement?.isActive === false ? previousEntitlement : null;
  const rawProductId = premium?.isActive ? premium.productIdentifier : null;
  const productId = rawProductId && premium.productPlanIdentifier && !rawProductId.includes(":")
    ? `${rawProductId}:${premium.productPlanIdentifier}`
    : rawProductId;
  const plan = productId ? getRevenueCatPlan(productId) : null;
  const previousProductId = previousPremium?.productIdentifier && previousPremium.productPlanIdentifier && !previousPremium.productIdentifier.includes(":")
    ? `${previousPremium.productIdentifier}:${previousPremium.productPlanIdentifier}`
    : previousPremium?.productIdentifier;
  const previousPlan = previousProductId ? getRevenueCatPlan(previousProductId) : null;

  return {
    activeEntitlements,
    activePlan: plan?.billingPeriod ?? null,
    appUserId: customerInfo.originalAppUserId || null,
    expiresAt: premium?.isActive ? premium.expirationDate : null,
    hasRevenueCatPremium: Boolean(premium?.isActive),
    lastExpiredAt: previousPremium?.expirationDate ?? null,
    lastExpiredPlan: previousPlan?.billingPeriod ?? null,
    managementUrl: safeManagementUrl(customerInfo.managementURL),
    productId,
    willRenew: premium?.isActive ? premium.willRenew : null,
  };
};

const safeManagementUrl = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
};

const mapWebCustomerInfo = (customerInfo: WebCustomerInfo): BillingCustomerInfo => {
  const entitlement = customerInfo.entitlements.active[revenueCatEntitlementId];
  const premium = entitlement?.isActive ? entitlement : null;
  const previousEntitlement = !premium ? customerInfo.entitlements.all?.[revenueCatEntitlementId] : null;
  const previousPremium = previousEntitlement?.isActive === false ? previousEntitlement : null;
  const rawProductId = premium?.productIdentifier ?? null;
  const productId = rawProductId && premium?.productPlanIdentifier && !rawProductId.includes(":")
    ? `${rawProductId}:${premium.productPlanIdentifier}`
    : rawProductId;
  const plan = productId ? getRevenueCatPlan(productId) : null;
  const previousProductId = previousPremium?.productIdentifier && previousPremium.productPlanIdentifier && !previousPremium.productIdentifier.includes(":")
    ? `${previousPremium.productIdentifier}:${previousPremium.productPlanIdentifier}`
    : previousPremium?.productIdentifier;
  const previousPlan = previousProductId ? getRevenueCatPlan(previousProductId) : null;
  return {
    activeEntitlements: Object.keys(customerInfo.entitlements.active),
    activePlan: plan?.billingPeriod ?? null,
    appUserId: customerInfo.originalAppUserId || null,
    expiresAt: premium?.expirationDate?.toISOString() ?? null,
    hasRevenueCatPremium: Boolean(premium),
    lastExpiredAt: previousPremium?.expirationDate?.toISOString() ?? null,
    lastExpiredPlan: previousPlan?.billingPeriod ?? null,
    managementUrl: safeManagementUrl(customerInfo.managementURL),
    productId,
    willRenew: premium?.willRenew ?? null,
  };
};

const isBillingError = (error: unknown): error is { code?: unknown; errorCode?: unknown; message?: unknown; userCancelled?: unknown } =>
  Boolean(error && typeof error === "object");

export const normalizeBillingError = (error: unknown) => {
  if (
    error instanceof BillingNotConfiguredError ||
    error instanceof BillingAuthRequiredError ||
    error instanceof BillingProductUnavailableError ||
    error instanceof BillingPurchaseCancelledError ||
    error instanceof BillingConfirmationPendingError ||
    error instanceof BillingUnavailableError
  ) {
    return error;
  }

  if (!isBillingError(error)) {
    return new BillingUnavailableError();
  }

  const code = error.errorCode ?? error.code;
  if (error.userCancelled === true || code === revenueCatErrorCodes.purchaseCancelled || code === 1) {
    return new BillingPurchaseCancelledError();
  }

  if (code === revenueCatErrorCodes.configuration || code === 23) {
    return new BillingProductUnavailableError(
      `RevenueCat has no current offering with Plantie products. Check the configured store packages for "${revenueCatProductIds.premiumMonthly}" and "${revenueCatProductIds.premiumYearly}".`,
    );
  }

  if (code === revenueCatErrorCodes.productNotAvailable || code === 5) {
    return new BillingProductUnavailableError();
  }

  if (code === 42) {
    return new BillingUnavailableError("The test purchase failed. Your subscription was not changed.");
  }

  if (
    code === revenueCatErrorCodes.network || code === 10 ||
    code === revenueCatErrorCodes.offlineConnection ||
    code === revenueCatErrorCodes.productRequestTimedOut
  ) {
    return new BillingUnavailableError("Billing network request failed. Check your connection and try again.");
  }

  if (code === revenueCatErrorCodes.purchaseNotAllowed || code === 3 || code === revenueCatErrorCodes.storeProblem || code === 2) {
    return new BillingUnavailableError("Store billing is unavailable on this device.");
  }

  return new BillingUnavailableError();
};

const mapProduct = (product: PurchasesStoreProduct): BillingProduct | null => {
  const plan = getRevenueCatPlan(product.identifier);
  if (!plan) {
    return null;
  }

  return {
    description: product.description,
    id: plan.productId,
    period: plan.billingPeriod,
    price: product.priceString,
    title: product.title,
  };
};

export const createRevenueCatBillingService = (deps: BillingDependencies): BillingService => {
  let configuredUserId: string | null = null;
  // The native SDK is process-wide; an account switch must not overtake an in-flight SDK call.
  let operationQueue = Promise.resolve();
  let purchaseInProgress = false;

  const getStatus = (): BillingStatus => {
    const runtime = deps.getRuntime();
    return deps.getApiKey(runtime) ? { configured: true, disabledReason: null, runtime } : { configured: false, disabledReason: "missing_config", runtime };
  };

  const assertCurrentUser = async (userId: string) => {
    if (await deps.getCurrentUserId() !== userId) throw new BillingAuthRequiredError();
  };

  const withConfiguredUser = <T>(operation: (userId: string) => Promise<T>): Promise<T> => {
    const ready = operationQueue.then(async () => {
      const status = getStatus();
      if (!status.configured) {
        throw new BillingNotConfiguredError("RevenueCat API key is missing for this mobile platform.");
      }

      const userId = await deps.getCurrentUserId();
      if (!userId) throw new BillingAuthRequiredError();

      if (configuredUserId === null) {
        // A WebView reload can recreate this service while the native SDK remains configured.
        const existing = deps.purchases.isConfigured && deps.purchases.getAppUserID
          ? await deps.purchases.isConfigured()
          : { isConfigured: false };
        if (existing.isConfigured && deps.purchases.getAppUserID) {
          configuredUserId = (await deps.purchases.getAppUserID()).appUserID;
        } else {
          await deps.purchases.configure({
            apiKey: deps.getApiKey(status.runtime),
            appUserID: userId,
          });
          configuredUserId = userId;
        }
      }

      if (configuredUserId !== userId) {
        await deps.purchases.logIn({ appUserID: userId });
        configuredUserId = userId;
      }

      const result = await operation(userId);
      await assertCurrentUser(userId);
      return result;
    });
    operationQueue = ready.then(() => undefined, () => undefined);
    return ready;
  };

  const getPackages = async () => {
    const offerings = await deps.purchases.getOfferings();
    if (!offerings.current) {
      throw new BillingProductUnavailableError("RevenueCat returned no current offering. Set an offering as Current in Product catalog → Offerings.");
    }

    const packages = offerings.current.availablePackages;
    const matchingPackages = packages.filter((aPackage) => getRevenueCatPlan(aPackage.product.identifier));

    if (matchingPackages.length === 0) {
      const receivedProducts = packages.map((aPackage) => aPackage.product.identifier);
      throw new BillingProductUnavailableError(
        `RevenueCat offering "${offerings.current.identifier}" has no supported products. It returned [${receivedProducts.join(", ") || "no packages"}]; expected "${revenueCatProductIds.premiumMonthly}" and "${revenueCatProductIds.premiumYearly}".`,
      );
    }

    return matchingPackages;
  };

  const getProducts = async () => {
    const packages = await getPackages();
    const mapped = packages.map((aPackage) => mapProduct(aPackage.product)).filter((product): product is BillingProduct => Boolean(product));

    if (mapped.length === 0) {
      throw new BillingProductUnavailableError();
    }

    return mapped;
  };

  const purchase = async (productId: BillingProductId, changingPlan = false) => {
    if (purchaseInProgress) throw new BillingUnavailableError("A purchase is already in progress.");
    purchaseInProgress = true;
    try {
      return await withConfiguredUser(async (userId) => {
        const current = mapCustomerInfo((await deps.purchases.getCustomerInfo()).customerInfo);
        if (changingPlan
          ? !current.hasRevenueCatPremium || getRevenueCatPlan(current.productId ?? "")?.productId === productId
          : current.hasRevenueCatPremium) {
          throw new BillingUnavailableError("The current subscription must be refreshed before changing plans.");
        }
        const packages = await getPackages();
        const aPackage = packages.find((item) => getRevenueCatPlan(item.product.identifier)?.productId === productId);
        if (!aPackage) throw new BillingProductUnavailableError();
        const runtime = deps.getRuntime();
        const result = await deps.purchases.purchasePackage({
          aPackage,
          ...(changingPlan && runtime === "android" && current.productId
            ? { storeProductChangeInfo: { oldProductIdentifier: current.productId } }
            : {}),
        });
        await assertCurrentUser(userId);
        await deps.refreshServerEntitlement();
        return mapCustomerInfo(result.customerInfo);
      });
    } catch (error) {
      throw normalizeBillingError(error);
    } finally {
      purchaseInProgress = false;
    }
  };

  return {
    getStatus,
    async getAvailableProducts() {
      try {
        return await withConfiguredUser(() => getProducts());
      } catch (error) {
        throw normalizeBillingError(error);
      }
    },
    purchasePremiumMonthly() {
      return purchase(revenueCatProductIds.premiumMonthly);
    },
    purchasePremiumYearly() {
      return purchase(revenueCatProductIds.premiumYearly);
    },
    changePlan(targetPlan) {
      return purchase(revenueCatProductIds[targetPlan === "yearly" ? "premiumYearly" : "premiumMonthly"], true);
    },
    async restorePurchases() {
      try {
        return await withConfiguredUser(async (userId) => {
          const { customerInfo } = await deps.purchases.restorePurchases();
          await assertCurrentUser(userId);
          await deps.refreshServerEntitlement();
          return mapCustomerInfo(customerInfo);
        });
      } catch (error) {
        throw normalizeBillingError(error);
      }
    },
    async getCustomerInfo(forceRefresh = false) {
      try {
        return await withConfiguredUser(async () => {
          if (forceRefresh) await deps.purchases.invalidateCustomerInfoCache?.();
          const { customerInfo } = await deps.purchases.getCustomerInfo();
          return mapCustomerInfo(customerInfo);
        });
      } catch (error) {
        throw normalizeBillingError(error);
      }
    },
    async syncEntitlements() {
      await withConfiguredUser(async (userId) => {
        await assertCurrentUser(userId);
        await deps.refreshServerEntitlement();
      });
    },
  };
};

export const revenueCatBillingAdapter = createRevenueCatBillingService({
  getApiKey: getApiKeyFromEnv,
  getCurrentUserId: getCurrentSupabaseUserId,
  getRuntime: detectBillingRuntime,
  purchases: lazyPurchases,
  refreshServerEntitlement: refreshSupabaseEntitlement,
});

type WebPurchasesClient = Pick<WebPurchases, "changeUser" | "getAppUserId" | "getCustomerInfo" | "getOfferings" | "purchase">;

type WebBillingDependencies = {
  createPurchases: (apiKey: string, appUserId: string) => Promise<WebPurchasesClient>;
  getApiKey: () => string;
  getCurrentUserId: () => Promise<string | null>;
  refreshServerEntitlement: () => Promise<unknown>;
};

const mapWebProduct = (product: WebPackage["product"]): BillingProduct | null => {
  const plan = getRevenueCatPlan(product.identifier);
  return plan ? {
    description: product.description ?? "",
    id: plan.productId,
    period: plan.billingPeriod,
    price: product.price.formattedPrice,
    title: product.title,
  } : null;
};

export const createRevenueCatWebBillingService = (deps: WebBillingDependencies): BillingService => {
  let client: WebPurchasesClient | null = null;
  // RevenueCat's web client is shared across accounts, so identity changes must wait for active operations.
  let operationQueue = Promise.resolve();
  let purchaseInProgress = false;

  const getStatus = (): BillingStatus => deps.getApiKey()
    ? { configured: true, disabledReason: null, runtime: "web" }
    : { configured: false, disabledReason: "missing_config", runtime: "web" };

  const assertCurrentUser = async (userId: string) => {
    if (await deps.getCurrentUserId() !== userId) throw new BillingAuthRequiredError();
  };

  const withConfiguredUser = <T>(operation: (purchases: WebPurchasesClient, userId: string) => Promise<T>): Promise<T> => {
    const ready = operationQueue.then(async () => {
      const apiKey = deps.getApiKey();
      if (!apiKey) throw new BillingNotConfiguredError("RevenueCat web billing is not configured.");
      const userId = await deps.getCurrentUserId();
      if (!userId) throw new BillingAuthRequiredError();
      if (!client) client = await deps.createPurchases(apiKey, userId);
      else if (client.getAppUserId() !== userId) await client.changeUser(userId);
      await assertCurrentUser(userId);
      const result = await operation(client, userId);
      await assertCurrentUser(userId);
      return result;
    });
    operationQueue = ready.then(() => undefined, () => undefined);
    return ready;
  };

  const getPackages = async (purchases: WebPurchasesClient) => {
    const offerings = await purchases.getOfferings();
    if (!offerings.current) throw new BillingProductUnavailableError("RevenueCat returned no current offering.");
    return offerings.current.availablePackages.filter((rcPackage) => getRevenueCatPlan(rcPackage.product.identifier));
  };

  const purchase = async (productId: BillingProductId) => {
    if (purchaseInProgress) throw new BillingUnavailableError("A purchase is already in progress.");
    purchaseInProgress = true;
    try {
      return await withConfiguredUser(async (purchases, userId) => {
        const packages = await getPackages(purchases);
        await assertCurrentUser(userId);
        const rcPackage = packages.find((item) => getRevenueCatPlan(item.product.identifier)?.productId === productId);
        if (!rcPackage) throw new BillingProductUnavailableError();
        const previousInfo = await purchases.getCustomerInfo();
        await assertCurrentUser(userId);
        if (mapWebCustomerInfo(previousInfo).hasRevenueCatPremium) {
          throw new BillingUnavailableError("Manage the existing subscription before buying another plan.");
        }
        await purchases.purchase({ rcPackage });
        await assertCurrentUser(userId);
        try {
          const customerInfo = await purchases.getCustomerInfo();
          await assertCurrentUser(userId);
          await deps.refreshServerEntitlement();
          await assertCurrentUser(userId);
          return mapWebCustomerInfo(customerInfo);
        } catch (error) {
          if (error instanceof BillingAuthRequiredError) throw error;
          throw new BillingConfirmationPendingError();
        }
      });
    } catch (error) {
      throw normalizeBillingError(error);
    } finally {
      purchaseInProgress = false;
    }
  };

  return {
    getStatus,
    async getAvailableProducts() {
      try {
        return await withConfiguredUser(async (purchases) => {
          const packages = await getPackages(purchases);
          if (!packages.length) throw new BillingProductUnavailableError();
          return packages.map((item) => mapWebProduct(item.product)).filter((item): item is BillingProduct => Boolean(item));
        });
      } catch (error) {
        throw normalizeBillingError(error);
      }
    },
    purchasePremiumMonthly: () => purchase(revenueCatProductIds.premiumMonthly),
    purchasePremiumYearly: () => purchase(revenueCatProductIds.premiumYearly),
    async changePlan() {
      throw new BillingUnavailableError("Change your web subscription through the billing provider's management page.");
    },
    async restorePurchases() {
      try {
        return await withConfiguredUser(async (purchases, userId) => {
          const customerInfo = await purchases.getCustomerInfo();
          await assertCurrentUser(userId);
          await deps.refreshServerEntitlement();
          return mapWebCustomerInfo(customerInfo);
        });
      } catch (error) {
        throw normalizeBillingError(error);
      }
    },
    async getCustomerInfo() {
      try {
        return await withConfiguredUser(async (purchases) => mapWebCustomerInfo(await purchases.getCustomerInfo()));
      } catch (error) {
        throw normalizeBillingError(error);
      }
    },
    async syncEntitlements() {
      await withConfiguredUser(async (_purchases, userId) => {
        await assertCurrentUser(userId);
        await deps.refreshServerEntitlement();
      });
    },
  };
};

export const revenueCatWebBillingAdapter = createRevenueCatWebBillingService({
  async createPurchases(apiKey, appUserId) {
    const { Purchases } = await import("@revenuecat/purchases-js");
    return Purchases.isConfigured()
      ? Purchases.getSharedInstance()
      : Purchases.configure({ apiKey, appUserId });
  },
  getApiKey: () => getApiKeyFromEnv("web"),
  getCurrentUserId: getCurrentSupabaseUserId,
  refreshServerEntitlement: refreshSupabaseEntitlement,
});

export const getBillingService = (): BillingService => detectBillingRuntime() === "web" ? revenueCatWebBillingAdapter : revenueCatBillingAdapter;
