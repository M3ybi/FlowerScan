import { useEffect, useMemo, useState } from "react";
import { getBillingService, revenueCatProductIds } from "../lib/billingService";
import type { BillingProduct, BillingStatus } from "../lib/billingService";
import { createTranslator } from "../lib/i18n";
import type { PlantieLanguage } from "../lib/onboarding";

const createFallbackPlans = (t: ReturnType<typeof createTranslator>) => [
  {
    description: t("pricing.freeBody"),
    features: [t("pricing.freeFeatureScans"), t("pricing.freeFeaturePlants"), t("pricing.freeFeatureQr")],
    name: t("pricing.free"),
    price: t("pricing.freePrice"),
  },
  {
    description: t("pricing.monthlyBody"),
    features: [t("pricing.premiumFeatureScans"), t("pricing.premiumFeaturePlants"), t("pricing.premiumFeatureDiagnosis"), t("pricing.premiumFeatureBackup"), t("pricing.premiumFeatureSharing")],
    name: t("pricing.monthly"),
    productId: revenueCatProductIds.premiumMonthly,
    price: t("pricing.mobileOnly"),
  },
  {
    description: t("pricing.yearlyBody"),
    features: [t("pricing.premiumFeatureQr"), t("pricing.premiumFeatureDiagnosis"), t("pricing.premiumFeatureBackup"), t("pricing.premiumFeatureSharing")],
    name: t("pricing.yearly"),
    productId: revenueCatProductIds.premiumYearly,
    price: t("pricing.mobileOnly"),
  },
];

const billing = getBillingService();

const billingDisabledLabel = (status: BillingStatus, t: ReturnType<typeof createTranslator>) => {
  if (status.disabledReason === "web") {
    return t("pricing.mobileOnly");
  }

  if (status.disabledReason === "missing_config") {
    return t("pricing.notConfigured");
  }

  return "";
};

export const PricingPage = ({ language = null }: { language?: PlantieLanguage | null }) => {
  const t = useMemo(() => createTranslator(language), [language]);
  const [billingStatus] = useState(() => billing.getStatus());
  const [products, setProducts] = useState<BillingProduct[]>([]);
  const [billingMessage, setBillingMessage] = useState("");
  const [isPurchasing, setIsPurchasing] = useState(false);
  const fallbackPlans = useMemo(() => createFallbackPlans(t), [t]);
  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const billingDisabled = !billingStatus.configured;

  useEffect(() => {
    if (!billingStatus.configured) {
      setBillingMessage(billingDisabledLabel(billingStatus, t));
      return;
    }

    let cancelled = false;
    void billing
      .getAvailableProducts()
      .then((availableProducts) => {
        if (!cancelled) {
          setProducts(availableProducts);
          setBillingMessage("");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setBillingMessage(error instanceof Error ? error.message : t("pricing.productsUnavailable"));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [billingStatus, t]);

  const runPurchase = async (period: "monthly" | "yearly") => {
    try {
      setIsPurchasing(true);
      setBillingMessage(t("pricing.openingPurchase"));
      if (period === "monthly") {
        await billing.purchasePremiumMonthly();
      } else {
        await billing.purchasePremiumYearly();
      }
      await billing.syncEntitlements();
      setBillingMessage(t("pricing.purchaseSubmitted"));
    } catch (error) {
      setBillingMessage(error instanceof Error ? error.message : t("pricing.purchaseFailed"));
    } finally {
      setIsPurchasing(false);
    }
  };

  const restorePurchases = async () => {
    try {
      setIsPurchasing(true);
      setBillingMessage(t("pricing.restoring"));
      await billing.restorePurchases();
      await billing.syncEntitlements();
      setBillingMessage(t("pricing.restoreSubmitted"));
    } catch (error) {
      setBillingMessage(error instanceof Error ? error.message : t("pricing.restoreFailed"));
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <section className="pricing-page" aria-labelledby="pricing-title">
      <div className="section-title">
        <h2 id="pricing-title">{t("pricing.title")}</h2>
      </div>
      <p>{t("pricing.body")}</p>
      {billingMessage ? <p className="report-status">{billingMessage}</p> : null}
      <div className="pricing-grid">
        {fallbackPlans.map((plan) => {
          const productId = "productId" in plan ? plan.productId : null;
          const product = productId ? productsById.get(productId) : null;
          const isPremiumPlan = productId !== null;
          const period = productId === revenueCatProductIds.premiumYearly ? "yearly" : "monthly";
          return (
            <article className="pricing-card" key={plan.name}>
              <div>
                <h3>{plan.name}</h3>
                <strong>{product?.price ?? plan.price}</strong>
                {productId ? <small>{productId}</small> : null}
                <p>{product?.description || plan.description}</p>
              </div>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              {isPremiumPlan ? (
                <button type="button" disabled={billingDisabled || isPurchasing} onClick={() => void runPurchase(period)}>
                  {billingDisabled ? billingDisabledLabel(billingStatus, t) : isPurchasing ? t("pricing.processing") : t("pricing.choose", { plan: plan.name })}
                </button>
              ) : (
                <button type="button" disabled>
                  {t("pricing.currentDefault")}
                </button>
              )}
            </article>
          );
        })}
      </div>
      <button className="neutral-action" type="button" disabled={billingDisabled || isPurchasing} onClick={() => void restorePurchases()}>
        {t("pricing.restore")}
      </button>
    </section>
  );
};
