import { useEffect, useMemo, useState } from "react";
import { getBillingService, revenueCatProductIds } from "../lib/billingService";
import type { BillingProduct, BillingStatus } from "../lib/billingService";

const fallbackPlans = [
  {
    description: "Pre prve testovanie Plantie bez uctu alebo platby.",
    features: ["10 AI skenov mesacne", "10 rastlin", "10 QR stitkov"],
    name: "Free",
    price: "0 EUR",
  },
  {
    description: "Mesacny plan pre aktivnu domacu starostlivost.",
    features: ["Neobmedzene AI skeny", "Neobmedzene rastliny", "AI diagnostika chorob", "Cloud backup", "Zdielanie domacnosti"],
    name: "Premium Monthly",
    productId: revenueCatProductIds.premiumMonthly,
    price: "Mobile only",
  },
  {
    description: "Rovnake vyhody ako mesacny Premium, uctovane rocne.",
    features: ["Neobmedzene QR stitky", "AI diagnostika chorob", "Cloud backup", "Zdielanie domacnosti"],
    name: "Premium Yearly",
    productId: revenueCatProductIds.premiumYearly,
    price: "Mobile only",
  },
];

const billing = getBillingService();

const billingDisabledLabel = (status: BillingStatus) => {
  if (status.disabledReason === "web") {
    return "Available in mobile app";
  }

  if (status.disabledReason === "missing_config") {
    return "Billing not configured";
  }

  return "";
};

export const PricingPage = () => {
  const [billingStatus] = useState(() => billing.getStatus());
  const [products, setProducts] = useState<BillingProduct[]>([]);
  const [billingMessage, setBillingMessage] = useState("");
  const [isPurchasing, setIsPurchasing] = useState(false);
  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const billingDisabled = !billingStatus.configured;

  useEffect(() => {
    if (!billingStatus.configured) {
      setBillingMessage(billingDisabledLabel(billingStatus));
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
          setBillingMessage(error instanceof Error ? error.message : "Billing products are unavailable.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [billingStatus]);

  const runPurchase = async (period: "monthly" | "yearly") => {
    try {
      setIsPurchasing(true);
      setBillingMessage("Opening secure store purchase...");
      if (period === "monthly") {
        await billing.purchasePremiumMonthly();
      } else {
        await billing.purchasePremiumYearly();
      }
      await billing.syncEntitlements();
      setBillingMessage("Purchase submitted. Premium activates only after server entitlement confirmation.");
    } catch (error) {
      setBillingMessage(error instanceof Error ? error.message : "Purchase failed safely.");
    } finally {
      setIsPurchasing(false);
    }
  };

  const restorePurchases = async () => {
    try {
      setIsPurchasing(true);
      setBillingMessage("Restoring purchases...");
      await billing.restorePurchases();
      await billing.syncEntitlements();
      setBillingMessage("Restore submitted. Premium activates only after server entitlement confirmation.");
    } catch (error) {
      setBillingMessage(error instanceof Error ? error.message : "Restore failed safely.");
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <section className="pricing-page" aria-labelledby="pricing-title">
      <div className="section-title">
        <h2 id="pricing-title">Plantie plans</h2>
      </div>
      <p>
        Purchases are available only in the native mobile app. Premium access is still decided by Supabase server entitlements, not by the
        local RevenueCat SDK result.
      </p>
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
                  {billingDisabled ? billingDisabledLabel(billingStatus) : isPurchasing ? "Processing..." : `Choose ${plan.name}`}
                </button>
              ) : (
                <button type="button" disabled>
                  Current local default
                </button>
              )}
            </article>
          );
        })}
      </div>
      <button className="neutral-action" type="button" disabled={billingDisabled || isPurchasing} onClick={() => void restorePurchases()}>
        Restore purchases
      </button>
    </section>
  );
};
