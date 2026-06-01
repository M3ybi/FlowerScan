import { Capacitor } from "@capacitor/core";
import type { CustomerInfo, PurchasesPlugin, PurchasesStoreProduct } from "@revenuecat/purchases-capacitor";

export const revenueCatEntitlementId = "premium";

export const revenueCatProductIds = {
  premiumMonthly: "plantie_premium_monthly",
  premiumYearly: "plantie_premium_yearly",
} as const;

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
  appUserId: string | null;
  hasRevenueCatPremium: boolean;
};

export type BillingStatus = {
  configured: boolean;
  disabledReason: "web" | "missing_config" | null;
  runtime: BillingRuntime;
};

export interface BillingService {
  getStatus(): BillingStatus;
  getAvailableProducts(): Promise<BillingProduct[]>;
  purchasePremiumMonthly(): Promise<BillingCustomerInfo>;
  purchasePremiumYearly(): Promise<BillingCustomerInfo>;
  restorePurchases(): Promise<BillingCustomerInfo>;
  getCustomerInfo(): Promise<BillingCustomerInfo>;
  syncEntitlements(): Promise<void>;
}

export class BillingNotConfiguredError extends Error {
  constructor(message = "Billing is not configured for this runtime.") {
    super(message);
    this.name = "BillingNotConfiguredError";
  }
}

export class BillingWebDisabledError extends Error {
  constructor() {
    super("Purchases are disabled on web. Use the native iOS or Android app.");
    this.name = "BillingWebDisabledError";
  }
}

export class BillingAuthRequiredError extends Error {
  constructor() {
    super("Sign in before starting a mobile purchase.");
    this.name = "BillingAuthRequiredError";
  }
}

export class BillingProductUnavailableError extends Error {
  constructor() {
    super("RevenueCat products are unavailable. Configure App Store Connect / Google Play products first.");
    this.name = "BillingProductUnavailableError";
  }
}

export class BillingPurchaseCancelledError extends Error {
  constructor() {
    super("Purchase cancelled.");
    this.name = "BillingPurchaseCancelledError";
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
  purchases: Pick<PurchasesPlugin, "configure" | "getCustomerInfo" | "getProducts" | "purchaseStoreProduct" | "restorePurchases">;
  refreshServerEntitlement: () => Promise<unknown>;
};

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const revenueCatSubscriptionCategory = "SUBSCRIPTION";
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
  if (runtime === "ios") {
    return env?.VITE_REVENUECAT_API_KEY_IOS ?? "";
  }

  if (runtime === "android") {
    return env?.VITE_REVENUECAT_API_KEY_ANDROID ?? "";
  }

  return "";
};

const importLocalModule = (path: string) => import(/* @vite-ignore */ path) as Promise<Record<string, unknown>>;

const getCurrentSupabaseUserId = async () => {
  const module = await importLocalModule("./authService.js");
  const getCurrentSession = module.getCurrentSession;
  if (typeof getCurrentSession !== "function") {
    return null;
  }

  return ((await getCurrentSession()) as { user?: { id?: string } } | null)?.user?.id ?? null;
};

const refreshSupabaseEntitlement = async () => {
  const module = await importLocalModule("./entitlementService.js");
  const getMyEntitlement = module.getMyEntitlement;
  if (typeof getMyEntitlement !== "function") {
    throw new Error("Supabase entitlement refresh is unavailable.");
  }

  return getMyEntitlement();
};

const importPurchases = async () => {
  const module = await import("@revenuecat/purchases-capacitor");
  return module.Purchases;
};

const lazyPurchases: BillingDependencies["purchases"] = {
  async configure(configuration) {
    return (await importPurchases()).configure(configuration);
  },
  async getCustomerInfo() {
    return (await importPurchases()).getCustomerInfo();
  },
  async getProducts(options) {
    return (await importPurchases()).getProducts(options);
  },
  async purchaseStoreProduct(options) {
    return (await importPurchases()).purchaseStoreProduct(options);
  },
  async restorePurchases() {
    return (await importPurchases()).restorePurchases();
  },
};

const mapCustomerInfo = (customerInfo: CustomerInfo): BillingCustomerInfo => {
  const activeEntitlements = Object.keys(customerInfo.entitlements.active);

  return {
    activeEntitlements,
    appUserId: customerInfo.originalAppUserId || null,
    hasRevenueCatPremium: Boolean(customerInfo.entitlements.active[revenueCatEntitlementId]?.isActive),
  };
};

const isBillingError = (error: unknown): error is { code?: unknown; message?: unknown; userCancelled?: unknown } =>
  Boolean(error && typeof error === "object");

export const normalizeBillingError = (error: unknown) => {
  if (
    error instanceof BillingWebDisabledError ||
    error instanceof BillingNotConfiguredError ||
    error instanceof BillingAuthRequiredError ||
    error instanceof BillingProductUnavailableError ||
    error instanceof BillingPurchaseCancelledError
  ) {
    return error;
  }

  if (!isBillingError(error)) {
    return new BillingUnavailableError();
  }

  if (error.userCancelled === true || error.code === revenueCatErrorCodes.purchaseCancelled) {
    return new BillingPurchaseCancelledError();
  }

  if (
    error.code === revenueCatErrorCodes.productNotAvailable ||
    error.code === revenueCatErrorCodes.configuration
  ) {
    return new BillingProductUnavailableError();
  }

  if (
    error.code === revenueCatErrorCodes.network ||
    error.code === revenueCatErrorCodes.offlineConnection ||
    error.code === revenueCatErrorCodes.productRequestTimedOut
  ) {
    return new BillingUnavailableError("Billing network request failed. Check your connection and try again.");
  }

  if (error.code === revenueCatErrorCodes.purchaseNotAllowed || error.code === revenueCatErrorCodes.storeProblem) {
    return new BillingUnavailableError("Store billing is unavailable on this device.");
  }

  return new BillingUnavailableError(typeof error.message === "string" ? error.message : undefined);
};

const productPeriod = (id: BillingProductId): BillingProduct["period"] => (id === revenueCatProductIds.premiumMonthly ? "monthly" : "yearly");

const mapProduct = (product: PurchasesStoreProduct): BillingProduct | null => {
  if (product.identifier !== revenueCatProductIds.premiumMonthly && product.identifier !== revenueCatProductIds.premiumYearly) {
    return null;
  }

  return {
    description: product.description,
    id: product.identifier,
    period: productPeriod(product.identifier),
    price: product.priceString,
    title: product.title,
  };
};

export const createRevenueCatBillingService = (deps: BillingDependencies): BillingService => {
  let configuredUserId = "";

  const getStatus = (): BillingStatus => {
    const runtime = deps.getRuntime();
    if (runtime === "web") {
      return { configured: false, disabledReason: "web", runtime };
    }

    return deps.getApiKey(runtime) ? { configured: true, disabledReason: null, runtime } : { configured: false, disabledReason: "missing_config", runtime };
  };

  const ensureConfigured = async () => {
    const status = getStatus();
    if (status.disabledReason === "web") {
      throw new BillingWebDisabledError();
    }

    if (!status.configured) {
      throw new BillingNotConfiguredError("RevenueCat API key is missing for this mobile platform.");
    }

    const userId = await deps.getCurrentUserId();
    if (!userId) {
      throw new BillingAuthRequiredError();
    }

    if (configuredUserId !== userId) {
      await deps.purchases.configure({
        apiKey: deps.getApiKey(status.runtime),
        appUserID: userId,
      });
      configuredUserId = userId;
    }
  };

  const getProducts = async () => {
    await ensureConfigured();
    const { products } = await deps.purchases.getProducts({
      productIdentifiers: [revenueCatProductIds.premiumMonthly, revenueCatProductIds.premiumYearly],
      type: revenueCatSubscriptionCategory as never,
    });
    const mapped = products.map(mapProduct).filter((product): product is BillingProduct => Boolean(product));

    if (mapped.length === 0) {
      throw new BillingProductUnavailableError();
    }

    return mapped;
  };

  const purchase = async (productId: BillingProductId) => {
    await ensureConfigured();
    const { products } = await deps.purchases.getProducts({
      productIdentifiers: [productId],
      type: revenueCatSubscriptionCategory as never,
    });
    const product = products.find((item) => item.identifier === productId);
    if (!product) {
      throw new BillingProductUnavailableError();
    }

    try {
      const result = await deps.purchases.purchaseStoreProduct({ product });
      await deps.refreshServerEntitlement();
      return mapCustomerInfo(result.customerInfo);
    } catch (error) {
      throw normalizeBillingError(error);
    }
  };

  return {
    getStatus,
    async getAvailableProducts() {
      try {
        return await getProducts();
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
    async restorePurchases() {
      await ensureConfigured();
      try {
        const { customerInfo } = await deps.purchases.restorePurchases();
        await deps.refreshServerEntitlement();
        return mapCustomerInfo(customerInfo);
      } catch (error) {
        throw normalizeBillingError(error);
      }
    },
    async getCustomerInfo() {
      await ensureConfigured();
      try {
        const { customerInfo } = await deps.purchases.getCustomerInfo();
        return mapCustomerInfo(customerInfo);
      } catch (error) {
        throw normalizeBillingError(error);
      }
    },
    async syncEntitlements() {
      await ensureConfigured();
      await deps.refreshServerEntitlement();
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

export const getBillingService = (): BillingService => revenueCatBillingAdapter;
