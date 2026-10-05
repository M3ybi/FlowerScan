import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { LoadingButton } from "./LoadingButton";
import { BillingConfirmationPendingError, getBillingService, revenueCatProductIds } from "../lib/billingService";
import type { BillingProduct, BillingStatus } from "../lib/billingService";
import { createTranslator } from "../lib/i18n";
import type { PlantieLanguage } from "../lib/onboarding";
import type { SubscriptionSnapshot } from "../lib/subscriptionState";
import {
  canCancelSubscription,
  canSwitchToYearly,
  createCancellationHandoff,
  formatSubscriptionDate,
  getSubscriptionPresentation,
  isOwnPaidSubscription,
  safeBillingManagementUrl,
} from "../lib/subscriptionUiRules";

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
    price: t("pricing.productsUnavailable"),
  },
  {
    description: t("pricing.yearlyBody"),
    features: [t("pricing.premiumFeatureQr"), t("pricing.premiumFeatureDiagnosis"), t("pricing.premiumFeatureBackup"), t("pricing.premiumFeatureSharing")],
    name: t("pricing.yearly"),
    productId: revenueCatProductIds.premiumYearly,
    price: t("pricing.productsUnavailable"),
  },
];

const billing = getBillingService();

const billingDisabledLabel = (status: BillingStatus, t: ReturnType<typeof createTranslator>) =>
  status.disabledReason === "missing_config" ? t("pricing.notConfigured") : "";

const matchesPurchasedPlan = (subscription: SubscriptionSnapshot, period: "monthly" | "yearly") =>
  subscription.status === "ready" &&
  (period === "monthly"
    ? subscription.view === "monthly_active" || subscription.view === "monthly_cancelled_active"
    : subscription.view === "yearly_active" || subscription.view === "yearly_cancelled_active");

export const PricingPage = ({
  subscription,
  language = null,
  onSubscriptionChanged,
}: {
  subscription: SubscriptionSnapshot;
  language?: PlantieLanguage | null;
  onSubscriptionChanged: () => Promise<SubscriptionSnapshot>;
}) => {
  const t = useMemo(() => createTranslator(language), [language]);
  const billingStatus = billing.getStatus();
  const [products, setProducts] = useState<BillingProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [billingMessage, setBillingMessage] = useState("");
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOpeningManagement, setIsOpeningManagement] = useState(false);
  const [isAwaitingConfirmation, setIsAwaitingConfirmation] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const actionInProgress = useRef(false);
  const pendingPlanRef = useRef<"monthly" | "yearly" | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const keepButtonRef = useRef<HTMLButtonElement>(null);
  const cancelDialogRef = useRef<HTMLElement>(null);
  const managementListenerRef = useRef<{ remove(): Promise<void> } | null>(null);
  const onSubscriptionChangedRef = useRef(onSubscriptionChanged);
  onSubscriptionChangedRef.current = onSubscriptionChanged;
  const fallbackPlans = useMemo(() => createFallbackPlans(t), [t]);
  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const presentation = getSubscriptionPresentation(subscription);
  const hasSubscriptionError = presentation.status === "error";
  const canPurchasePlan = presentation.status === "free" || presentation.status === "expired";
  const billingDisabled = !billingStatus.configured;
  const managementUrl = safeBillingManagementUrl(subscription.customerInfo?.managementUrl);
  const formattedDate = formatSubscriptionDate(presentation.date, language);
  const isBusy = isPurchasing || isRefreshing || isOpeningManagement;
  const planName = presentation.plan === "monthly" ? t("pricing.monthlyPlan")
    : presentation.plan === "yearly" ? t("pricing.yearlyPlan")
    : presentation.plan === "household" ? t("pricing.householdPlan")
    : presentation.plan === "free" ? t("pricing.freePlan") : null;
  const statusName = presentation.status === "active" ? t("pricing.statusActive")
    : presentation.status === "cancelled" ? t("pricing.statusCancelled")
    : presentation.status === "expired" ? t("pricing.statusExpired")
    : presentation.status === "free" ? t("pricing.statusFree")
    : presentation.status === "shared" ? t("pricing.statusShared")
    : presentation.status === "syncing" ? t("pricing.syncing")
    : presentation.status === "error" ? t("pricing.statusUnavailable") : t("pricing.resolving");
  const dateLabel = presentation.dateMeaning === "renews" ? t("pricing.nextRenewal")
    : presentation.dateMeaning === "accessUntil" ? t("pricing.validUntil")
    : presentation.dateMeaning === "ended" ? t("pricing.endedOn") : null;

  useEffect(() => () => { void managementListenerRef.current?.remove(); }, []);

  useEffect(() => {
    setProducts([]);
    setIsAwaitingConfirmation(false);
    pendingPlanRef.current = null;
    setBillingMessage("");
    if (!billingStatus.configured || !subscription.userId) {
      return;
    }

    let cancelled = false;
    setIsLoadingProducts(true);
    void billing.getAvailableProducts().then((availableProducts) => {
      if (!cancelled) setProducts(availableProducts);
    }).catch((error) => {
      if (!cancelled) setBillingMessage(error instanceof Error ? error.message : t("pricing.productsUnavailable"));
    }).finally(() => {
      if (!cancelled) setIsLoadingProducts(false);
    });
    return () => { cancelled = true; };
  }, [billingStatus.configured, subscription.userId, t]);

  useEffect(() => {
    if (pendingPlanRef.current && matchesPurchasedPlan(subscription, pendingPlanRef.current)) {
      pendingPlanRef.current = null;
      setIsAwaitingConfirmation(false);
    }
  }, [subscription.status, subscription.view]);

  useEffect(() => {
    if (isOpeningManagement) cancelDialogRef.current?.focus();
    else if (isCancelModalOpen) keepButtonRef.current?.focus();
  }, [isOpeningManagement, isCancelModalOpen]);

  const closeCancelModal = () => {
    if (!cancellationHandoff.dismiss()) return;
    setIsCancelModalOpen(false);
    setCancelError("");
    cancelButtonRef.current?.focus();
  };

  const handleCancelDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      closeCancelModal();
      return;
    }
    if (event.key !== "Tab") return;
    const enabledButtons = Array.from(cancelDialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
    if (!enabledButtons.length) {
      event.preventDefault();
      return;
    }
    const first = enabledButtons[0];
    const last = enabledButtons[enabledButtons.length - 1];
    if (event.shiftKey && (document.activeElement === first || !enabledButtons.includes(document.activeElement as HTMLButtonElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !enabledButtons.includes(document.activeElement as HTMLButtonElement))) {
      event.preventDefault();
      first.focus();
    }
  };

  const openManagementPage = async (url: string) => {
    if (billingStatus.runtime === "web") {
      // Open synchronously from the click handler so browser popup protection does not block it.
      const popup = window.open("", "_blank");
      if (!popup) throw new Error(t("pricing.manageOpenFailed"));
      try {
        popup.opener = null;
        popup.location.replace(url);
      } catch {
        popup.close();
        throw new Error(t("pricing.manageOpenFailed"));
      }
      return;
    }
    const { Browser } = await import("@capacitor/browser");
    await managementListenerRef.current?.remove();
    let listener: { remove(): Promise<void> } | null = null;
    listener = await Browser.addListener("browserFinished", () => {
      if (managementListenerRef.current === listener) managementListenerRef.current = null;
      void listener?.remove();
      void onSubscriptionChangedRef.current().catch(() => setBillingMessage(t("pricing.refreshFailed")));
    });
    managementListenerRef.current = listener;
    try {
      await Browser.open({ url });
    } catch (error) {
      managementListenerRef.current = null;
      await listener.remove();
      throw error;
    }
  };

  const cancellationHandoff = useMemo(() => createCancellationHandoff(openManagementPage), [billingStatus.runtime, t]);

  const confirmCancellation = async () => {
    if (actionInProgress.current || isOpeningManagement) return;
    actionInProgress.current = true;
    setIsOpeningManagement(true);
    setCancelError("");
    try {
      const result = await cancellationHandoff.confirm(subscription);
      if (result === "opened") {
        setIsCancelModalOpen(false);
        setBillingMessage(t("pricing.cancelHandoff"));
      } else if (result === "unavailable") {
        setCancelError(t("pricing.cancelUnavailable"));
      } else if (result === "not_applicable") {
        setCancelError(t("pricing.cancelNotAvailable"));
      } else if (result !== "busy") {
        setCancelError(t("pricing.manageOpenFailed"));
      }
    } finally {
      actionInProgress.current = false;
      setIsOpeningManagement(false);
    }
  };

  const runPurchase = async (period: "monthly" | "yearly") => {
    if (actionInProgress.current || !(canPurchasePlan || (period === "yearly" && canSwitchToYearly(subscription)))) return;
    actionInProgress.current = true;
    setIsPurchasing(true);
    setBillingMessage(t("pricing.openingPurchase"));
    let providerPurchaseCompleted = false;
    try {
      const changingPlan = period === "yearly" && canSwitchToYearly(subscription);
      if (changingPlan && billingStatus.runtime === "web") {
        if (!managementUrl) throw new Error(t("pricing.manageUnavailable"));
        await openManagementPage(managementUrl);
        setBillingMessage(t("pricing.manageHint"));
        return;
      }
      const info = changingPlan
        ? await billing.changePlan("yearly")
        : period === "monthly" ? await billing.purchasePremiumMonthly() : await billing.purchasePremiumYearly();
      providerPurchaseCompleted = true;
      pendingPlanRef.current = period;
      const refreshed = await onSubscriptionChanged();
      const confirmed = info.hasRevenueCatPremium && matchesPurchasedPlan(refreshed, period);
      if (confirmed) pendingPlanRef.current = null;
      setIsAwaitingConfirmation(!confirmed);
      setBillingMessage(confirmed ? t("pricing.currentServerPremium") : t("pricing.purchaseSubmitted"));
    } catch (error) {
      const pending = providerPurchaseCompleted || error instanceof BillingConfirmationPendingError;
      if (pending) pendingPlanRef.current = period;
      else pendingPlanRef.current = null;
      setIsAwaitingConfirmation(pending);
      setBillingMessage(pending ? t("pricing.purchaseSubmitted") : error instanceof Error ? error.message : t("pricing.purchaseFailed"));
    } finally {
      actionInProgress.current = false;
      setIsPurchasing(false);
    }
  };

  const refreshOrRestore = async () => {
    if (actionInProgress.current || !subscription.userId) return;
    actionInProgress.current = true;
    setIsRefreshing(true);
    setBillingMessage(t("pricing.restoring"));
    try {
      if (billingStatus.runtime === "web") {
        const refreshed = await onSubscriptionChanged();
        if (refreshed.status === "error") throw new Error(t("pricing.refreshFailed"));
        setBillingMessage(refreshed.view === "syncing" ? t("pricing.purchaseSubmitted") : t("pricing.refreshComplete"));
      } else {
        const info = await billing.restorePurchases();
        const refreshed = await onSubscriptionChanged();
        if (refreshed.status === "error") throw new Error(t("pricing.refreshFailed"));
        const pending = info.hasRevenueCatPremium && !isOwnPaidSubscription(refreshed);
        pendingPlanRef.current = pending ? info.activePlan : null;
        setIsAwaitingConfirmation(pending);
        setBillingMessage(isOwnPaidSubscription(refreshed) ? t("pricing.currentServerPremium")
          : info.hasRevenueCatPremium ? t("pricing.restoreSubmitted") : t("pricing.restoreNoPurchases"));
      }
    } catch (error) {
      setBillingMessage(error instanceof Error ? error.message : t("pricing.restoreFailed"));
    } finally {
      actionInProgress.current = false;
      setIsRefreshing(false);
    }
  };

  const retrySubscription = async () => {
    if (actionInProgress.current || !subscription.userId) return;
    actionInProgress.current = true;
    setIsRefreshing(true);
    try {
      const refreshed = await onSubscriptionChanged();
      if (refreshed.status === "error") throw new Error(t("pricing.refreshFailed"));
      setBillingMessage(t("pricing.refreshComplete"));
    } catch {
      setBillingMessage(t("pricing.refreshFailed"));
    } finally {
      actionInProgress.current = false;
      setIsRefreshing(false);
    }
  };

  return (
    <section className="pricing-page" aria-labelledby="pricing-title">
      <div className="section-title"><h2 id="pricing-title">{t("pricing.title")}</h2></div>
      {canPurchasePlan ? <p>{t("pricing.body")}</p> : null}
      {billingMessage ? <p className="report-status" role="status">{billingMessage}</p> : null}
      <section className={`pricing-subscription-summary status-${presentation.status}`} aria-label={t("pricing.currentSubscription")} role={hasSubscriptionError ? "alert" : "status"}>
        <div className="pricing-summary-heading">
          <div>
            <span className="pricing-summary-eyebrow">{t("pricing.currentSubscription")}</span>
            <h3>{planName ?? statusName}</h3>
          </div>
          {planName ? <span className="pricing-status-badge">{statusName}</span> : null}
        </div>
        {presentation.period ? <div className="pricing-summary-detail"><span>{t("pricing.billingPeriod")}</span><strong>{presentation.period === "monthly" ? t("pricing.periodMonthly") : t("pricing.periodYearly")}</strong></div> : null}
        {presentation.previousPlan ? <div className="pricing-summary-detail"><span>{t("pricing.previousPlan")}</span><strong>{presentation.previousPlan === "monthly" ? t("pricing.monthlyPlan") : t("pricing.yearlyPlan")}</strong></div> : null}
        {dateLabel && formattedDate && presentation.date ? <div className="pricing-summary-detail"><span>{dateLabel}</span><strong><time dateTime={presentation.date}>{formattedDate}</time></strong></div> : null}
        {presentation.status === "free" ? <p>{t("pricing.noActiveSubscription")}</p> : null}
        {presentation.status === "expired" ? <p>{t("pricing.expiredNotice")}</p> : null}
        {presentation.status === "cancelled" ? <p>{t("pricing.cancelledNotice")}</p> : null}
        {presentation.status === "shared" ? <p>{t("pricing.householdAccessBody")}</p> : null}
        {hasSubscriptionError ? <p>{t("pricing.refreshFailed")}</p> : null}
        <div className="pricing-summary-actions">
          {canSwitchToYearly(subscription) ? (
            billingStatus.runtime === "web" ? managementUrl
              ? <a className="pricing-provider-action" href={managementUrl} rel="noopener noreferrer" target="_blank" aria-disabled={isBusy || isAwaitingConfirmation} onClick={(event) => { if (isBusy || isAwaitingConfirmation) event.preventDefault(); else setBillingMessage(t("pricing.manageHint")); }}>{t("pricing.switchYearly")}</a>
              : <span className="pricing-action-note">{t("pricing.manageUnavailable")}</span>
              : <LoadingButton className="pricing-secondary-action" type="button" disabled={billingDisabled || isBusy || isAwaitingConfirmation || !productsById.has(revenueCatProductIds.premiumYearly)} isLoading={isPurchasing} onClick={() => void runPurchase("yearly")}>{t("pricing.switchYearly")}</LoadingButton>
          ) : null}
          {(presentation.status === "cancelled" || presentation.plan === "yearly" && presentation.status === "active") && managementUrl
            ? <a className="pricing-provider-action" href={managementUrl} rel="noopener noreferrer" target="_blank" aria-disabled={isBusy} onClick={(event) => { if (isBusy) event.preventDefault(); else setBillingMessage(t("pricing.manageHint")); }}>{t("pricing.manage")}</a>
            : null}
          {canCancelSubscription(subscription) ? <button ref={cancelButtonRef} className="pricing-cancel-action" type="button" disabled={isBusy} onClick={() => { if (cancellationHandoff.openDialog(subscription)) { setCancelError(""); setIsCancelModalOpen(true); } }}>{t("pricing.cancelSubscription")}</button> : null}
          {hasSubscriptionError ? <LoadingButton className="pricing-secondary-action" type="button" disabled={isBusy || !subscription.userId} isLoading={isRefreshing} onClick={() => void retrySubscription()}>{t("pricing.retry")}</LoadingButton> : null}
        </div>
      </section>
      <div className="pricing-grid" id="pricing-plans">
        {fallbackPlans.map((plan) => {
          const productId = "productId" in plan ? plan.productId : null;
          const product = productId ? productsById.get(productId) : null;
          const isPremiumPlan = productId !== null;
          const period = productId === revenueCatProductIds.premiumYearly ? "yearly" : "monthly";
          const isCurrentPlan = period === "monthly"
            ? subscription.view === "monthly_active" || subscription.view === "monthly_cancelled_active"
            : subscription.view === "yearly_active" || subscription.view === "yearly_cancelled_active";
          return (
            <article className="pricing-card" key={plan.name}>
              <div>
                <h3>{plan.name}</h3>
                <strong>{product?.price ?? plan.price}</strong>
                <p>{product?.description || plan.description}</p>
              </div>
              <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
              {isPremiumPlan ? (
                canPurchasePlan ? (
                  <LoadingButton type="button" disabled={billingDisabled || isBusy || isAwaitingConfirmation || !product || !subscription.userId} isLoading={isPurchasing} onClick={() => void runPurchase(period)}>
                    {billingDisabled ? billingDisabledLabel(billingStatus, t)
                      : !subscription.userId ? t("pricing.signInRequired")
                      : !product ? isLoadingProducts ? t("pricing.processing") : t("pricing.productsUnavailable")
                      : isAwaitingConfirmation ? t("pricing.awaitingConfirmation")
                      : isPurchasing ? t("pricing.processing")
                      : period === "monthly" ? t("pricing.buyMonthly") : t("pricing.buyYearly")}
                  </LoadingButton>
                ) : isCurrentPlan ? <p className="pricing-current-status" role="status">{t("pricing.currentPlan")}</p> : null
              ) : canPurchasePlan ? <p className="pricing-current-status" role="status">{t("pricing.currentPlan")}</p> : null}
            </article>
          );
        })}
      </div>
      <LoadingButton className="pricing-refresh-action" type="button" disabled={isBusy || !subscription.userId || (billingStatus.runtime !== "web" && billingDisabled)} isLoading={isRefreshing} onClick={() => void refreshOrRestore()}>
        {billingStatus.runtime === "web" ? t("pricing.refreshWeb") : t("pricing.restore")}
      </LoadingButton>
      {isCancelModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section ref={cancelDialogRef} className="confirm-modal subscription-cancel-modal" role="dialog" aria-modal="true" aria-labelledby="subscription-cancel-title" aria-describedby="subscription-cancel-description" tabIndex={-1} onKeyDown={handleCancelDialogKeyDown}>
            <div className="section-title danger-title"><h2 id="subscription-cancel-title">{t("pricing.cancelTitle")}</h2></div>
            <p id="subscription-cancel-description">{t("pricing.cancelBody")}</p>
            <p>{t("pricing.cancelProviderHint")}</p>
            {formattedDate ? <p>{t("pricing.cancelPaidUntil", { date: formattedDate })}</p> : null}
            {!managementUrl ? <p className="report-status" role="alert">{t("pricing.cancelUnavailable")}</p> : null}
            {cancelError ? <p className="report-status" role="alert">{cancelError}</p> : null}
            <div className="modal-actions">
              <button ref={keepButtonRef} className="pricing-keep-action" type="button" disabled={isOpeningManagement} onClick={closeCancelModal}>{t("pricing.keepSubscription")}</button>
              <LoadingButton className="danger-action" type="button" disabled={isOpeningManagement || !managementUrl} isLoading={isOpeningManagement} loadingLabel={t("pricing.processing")} onClick={() => void confirmCancellation()}>{t("pricing.cancelSubscription")}</LoadingButton>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
};
