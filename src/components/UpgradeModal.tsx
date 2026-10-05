import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BillingConfirmationPendingError, getBillingService, revenueCatProductIds } from "../lib/billingService";
import type { BillingProduct } from "../lib/billingService";
import { createTranslator } from "../lib/i18n";
import type { PlantieLanguage } from "../lib/onboarding";
import type { SubscriptionSnapshot } from "../lib/subscriptionState";
import { canSwitchToYearly, isOwnPaidSubscription, safeBillingManagementUrl } from "../lib/subscriptionUiRules";
import { LoadingButton } from "./LoadingButton";
import { beginHouseholdPurchase } from "../lib/householdPlanService";

type UpgradeModalProps = {
  limitReason?: string;
  onClose: () => void;
  onSubscriptionChanged: () => Promise<SubscriptionSnapshot>;
  subscription: SubscriptionSnapshot;
  language?: PlantieLanguage | null;
};

const billing = getBillingService();

export const UpgradeModal = ({ limitReason, onClose, onSubscriptionChanged, subscription, language = null }: UpgradeModalProps) => {
  const t = createTranslator(language);
  const [statusMessage, setStatusMessage] = useState("");
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isAwaitingConfirmation, setIsAwaitingConfirmation] = useState(false);
  const [products, setProducts] = useState<BillingProduct[]>([]);
  const purchaseInProgress = useRef(false);
  const pendingPlanRef = useRef<"monthly" | "yearly" | null>(null);
  const billingStatus = billing.getStatus();
  const billingDisabled = !billingStatus.configured;
  const isResolving = subscription.status === "loading" || subscription.view === "loading" || subscription.view === "syncing";
  const hasSubscriptionError = subscription.status === "error" || subscription.view === "error";
  const isFree = subscription.status === "ready" && !subscription.customerInfo?.hasRevenueCatPremium &&
    (subscription.view === "free" || subscription.view === "expired") &&
    (!subscription.householdEntitlement || subscription.householdEntitlement.role === "owner");
  const isPremium = isOwnPaidSubscription(subscription) || subscription.view === "shared_premium";
  const canUpgradeYearly = canSwitchToYearly(subscription);
  const managementUrl = safeBillingManagementUrl(subscription.customerInfo?.managementUrl);

  useEffect(() => {
    setProducts([]);
    setStatusMessage("");
    setIsAwaitingConfirmation(false);
    pendingPlanRef.current = null;
    if (billingDisabled || !subscription.userId) {
      if (billingDisabled) setStatusMessage(t("pricing.notConfigured"));
      return;
    }
    let cancelled = false;
    void billing.getAvailableProducts().then((availableProducts) => {
      if (!cancelled) setProducts(availableProducts);
    }).catch((error) => {
      if (!cancelled) setStatusMessage(error instanceof Error ? error.message : t("pricing.productsUnavailable"));
    });
    return () => { cancelled = true; };
  }, [billingDisabled, subscription.userId, language]);

  useEffect(() => {
    if (pendingPlanRef.current && subscription.status === "ready" &&
      (pendingPlanRef.current === "monthly"
        ? subscription.view === "monthly_active" || subscription.view === "monthly_cancelled_active"
        : subscription.view === "yearly_active" || subscription.view === "yearly_cancelled_active")) {
      pendingPlanRef.current = null;
      setIsAwaitingConfirmation(false);
    }
  }, [subscription.status, subscription.view]);

  const purchase = async (period: "monthly" | "yearly") => {
    if (purchaseInProgress.current || isAwaitingConfirmation || (!isFree && !(period === "yearly" && canUpgradeYearly))) return;
    purchaseInProgress.current = true;
    setIsPurchasing(true);
    setStatusMessage(t("pricing.openingPurchase"));
    let providerPurchaseCompleted = false;
    try {
      if (!subscription.householdId) throw new Error(t("household.inviteStatusNoHousehold"));
      await beginHouseholdPurchase(subscription.householdId);
      const info = period === "monthly" ? await billing.purchasePremiumMonthly()
        : canUpgradeYearly ? await billing.changePlan("yearly")
        : await billing.purchasePremiumYearly();
      providerPurchaseCompleted = true;
      pendingPlanRef.current = period;
      const refreshed = await onSubscriptionChanged();
      const confirmed = info.hasRevenueCatPremium && refreshed.status === "ready" &&
        (period === "monthly"
          ? refreshed.view === "monthly_active" || refreshed.view === "monthly_cancelled_active"
          : refreshed.view === "yearly_active" || refreshed.view === "yearly_cancelled_active");
      if (confirmed) pendingPlanRef.current = null;
      setIsAwaitingConfirmation(!confirmed);
      setStatusMessage(confirmed ? t("pricing.currentServerPremium") : t("pricing.purchaseSubmitted"));
    } catch (error) {
      const pending = providerPurchaseCompleted || error instanceof BillingConfirmationPendingError;
      pendingPlanRef.current = pending ? period : null;
      setIsAwaitingConfirmation(pending);
      setStatusMessage(pending ? t("pricing.purchaseSubmitted") : error instanceof Error ? error.message : t("pricing.purchaseFailed"));
    } finally {
      purchaseInProgress.current = false;
      setIsPurchasing(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="upgrade-modal" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
        <button className="modal-close" type="button" onClick={onClose} disabled={isPurchasing} aria-label={t("pricing.closeUpgrade")}>
          <X size={20} aria-hidden="true" />
        </button>
        <div className="section-title"><h2 id="upgrade-title">{t("pricing.upgradeTitle")}</h2></div>
        <p>{limitReason || t("account.subscriptionServer")}</p>
        <ul>
          <li>{t("pricing.premiumFeatureScans")}</li>
          <li>{t("pricing.premiumFeaturePlants")} / {t("pricing.premiumFeatureQr")}</li>
          <li>{t("pricing.premiumFeatureDiagnosis")}</li>
          <li>{t("pricing.premiumFeatureBackup")} / {t("pricing.premiumFeatureSharing")}</li>
        </ul>
        {isResolving ? <p className="report-status" role="status">{subscription.view === "syncing" ? t("pricing.syncing") : t("pricing.resolving")}</p> : null}
        {hasSubscriptionError ? <p className="report-status" role="alert">{t("pricing.refreshFailed")}</p> : null}
        {statusMessage ? <p className="report-status" role="status">{statusMessage}</p> : null}
        {isPremium ? <p className="report-status" role="status">{t("pricing.currentServerPremium")}</p> : null}
        <div className="upgrade-actions">
          {isFree ? (
            <LoadingButton className="primary-action" type="button" disabled={billingDisabled || isPurchasing || isAwaitingConfirmation || !subscription.userId || !products.some((item) => item.id === revenueCatProductIds.premiumMonthly)} isLoading={isPurchasing} onClick={() => void purchase("monthly")}>
              {billingDisabled ? t("pricing.notConfigured") : isAwaitingConfirmation ? t("pricing.awaitingConfirmation") : isPurchasing ? t("pricing.processing") : t("pricing.buyMonthly")}
            </LoadingButton>
          ) : null}
          {canUpgradeYearly && billingStatus.runtime === "web"
            ? managementUrl
              ? <a className="pricing-provider-action" href={managementUrl} rel="noopener noreferrer" target="_blank" aria-disabled={isPurchasing || isAwaitingConfirmation} onClick={(event) => { if (isPurchasing || isAwaitingConfirmation) event.preventDefault(); else setStatusMessage(t("pricing.manageHint")); }}>{t("pricing.switchYearly")}</a>
              : <p className="report-status" role="alert">{t("pricing.manageUnavailable")}</p>
            : isFree || canUpgradeYearly ? (
              <LoadingButton className="pricing-secondary-action" type="button" disabled={billingDisabled || isPurchasing || isAwaitingConfirmation || !subscription.userId || !products.some((item) => item.id === revenueCatProductIds.premiumYearly)} isLoading={isPurchasing} onClick={() => void purchase("yearly")}>
                {billingDisabled ? t("pricing.notConfigured") : isAwaitingConfirmation ? t("pricing.awaitingConfirmation") : isPurchasing ? t("pricing.processing") : canUpgradeYearly ? t("pricing.switchYearly") : t("pricing.buyYearly")}
              </LoadingButton>
            ) : null}
        </div>
      </section>
    </div>
  );
};
