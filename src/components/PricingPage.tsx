import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { CalendarDays, ChevronDown, Clock, Crown, Leaf, Sprout, Users } from "lucide-react";
import { LoadingButton } from "./LoadingButton";
import { BillingConfirmationPendingError, getBillingService, revenueCatProductIds } from "../lib/billingService";
import type { BillingProduct, BillingStatus } from "../lib/billingService";
import { createTranslator } from "../lib/i18n";
import type { PlantieLanguage } from "../lib/onboarding";
import type { SubscriptionSnapshot } from "../lib/subscriptionState";
import { useHouseholdSubscriptionHistory } from "../hooks/useHouseholdSubscriptionHistory";
import { BillingHistoryTimeline } from "./BillingHistoryTimeline";
import { householdSubscriptionCopy } from "../lib/householdSubscriptionCopy";
import { beginHouseholdPurchase } from "../lib/householdPlanService";
import { resolveHouseholdPermissions } from "../lib/householdPermissions";
import { usedHouseholdSlots } from "../lib/householdMembershipRules";
import {
  canCancelSubscription,
  canPurchaseHouseholdPlan,
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
  householdMemberCount?: number;
  onSubscriptionChanged: () => Promise<SubscriptionSnapshot>;
}) => {
  const t = useMemo(() => createTranslator(language), [language]);
  const copy = householdSubscriptionCopy(language);
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
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const actionInProgress = useRef(false);
  const pendingPlanRef = useRef<"monthly" | "yearly" | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const keepButtonRef = useRef<HTMLButtonElement>(null);
  const cancelDialogRef = useRef<HTMLElement>(null);
  const managementListenerRef = useRef<{ remove(): Promise<void> } | null>(null);
  const onSubscriptionChangedRef = useRef(onSubscriptionChanged);
  onSubscriptionChangedRef.current = onSubscriptionChanged;
  const subscriptionScopeRef = useRef("");
  subscriptionScopeRef.current = `${subscription.userId ?? ""}:${subscription.householdId ?? ""}`;
  const fallbackPlans = useMemo(() => createFallbackPlans(t), [t]);
  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const presentation = getSubscriptionPresentation(subscription);
  const entitlement = subscription.householdEntitlement;
  const history = useHouseholdSubscriptionHistory({
    userId: subscription.userId,
    householdId: subscription.householdId,
    revision: `${entitlement?.status ?? ""}:${entitlement?.planKey ?? ""}:${entitlement?.validUntil ?? ""}:${entitlement?.cancelAtPeriodEnd ?? false}`,
  });
  const isOwner = resolveHouseholdPermissions(entitlement?.role ?? null).canManageSubscription;
  const isPremium = entitlement?.isPremium === true;
  const householdPeriod = entitlement?.planKey === "premium_monthly" ? "monthly"
    : entitlement?.planKey === "premium_yearly" ? "yearly" : null;
  const hasSubscriptionError = presentation.status === "error";
  const billingDetailsUnavailable = subscription.status === "ready" && isOwner && !subscription.customerInfo;
  const canPurchasePlan = canPurchaseHouseholdPlan(subscription);
  const billingDisabled = !billingStatus.configured;
  const managementUrl = isOwnPaidSubscription(subscription) ? safeBillingManagementUrl(subscription.customerInfo?.managementUrl) : null;
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
  }, [billingStatus.configured, subscription.userId, subscription.householdId, t]);

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
    if (actionInProgress.current || !isOwner || !(canPurchasePlan || isOwnPaidSubscription(subscription))) return;
    actionInProgress.current = true;
    const purchaseScope = subscriptionScopeRef.current;
    setIsPurchasing(true);
    setBillingMessage(t("pricing.openingPurchase"));
    let providerPurchaseCompleted = false;
    try {
      const changingPlan = isOwnPaidSubscription(subscription) && subscription.customerInfo?.activePlan !== period;
      if (changingPlan && billingStatus.runtime === "web") {
        if (!managementUrl) throw new Error(t("pricing.manageUnavailable"));
        await openManagementPage(managementUrl);
        setBillingMessage(t("pricing.manageHint"));
        return;
      }
      if (!subscription.householdId) throw new Error(t("household.inviteStatusNoHousehold"));
      await beginHouseholdPurchase(subscription.householdId);
      if (subscriptionScopeRef.current !== purchaseScope) return;
      const info = changingPlan
        ? await billing.changePlan(period, subscription.householdId)
        : period === "monthly" ? await billing.purchasePremiumMonthly(subscription.householdId) : await billing.purchasePremiumYearly(subscription.householdId);
      providerPurchaseCompleted = true;
      if (subscriptionScopeRef.current !== purchaseScope) return;
      pendingPlanRef.current = period;
      const refreshed = await onSubscriptionChanged();
      if (subscriptionScopeRef.current !== purchaseScope) return;
      const confirmed = info.hasRevenueCatPremium && refreshed.householdId === subscription.householdId && matchesPurchasedPlan(refreshed, period);
      if (confirmed) pendingPlanRef.current = null;
      setIsAwaitingConfirmation(!confirmed);
      setBillingMessage(confirmed ? t("pricing.currentServerPremium") : t("pricing.purchaseSubmitted"));
    } catch (error) {
      if (subscriptionScopeRef.current !== purchaseScope) return;
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

  const retrySubscription = async () => {
    if (actionInProgress.current || !subscription.userId) return;
    actionInProgress.current = true;
    setIsRefreshing(true);
    try {
      const refreshed = await onSubscriptionChanged();
      if (refreshed.status === "error") throw new Error(t("pricing.refreshFailed"));
      setBillingMessage(refreshed.customerInfo ? t("pricing.refreshComplete") : copy.billingDetailsUnavailable);
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
      <p className="pricing-intro">{copy.subtitle}</p>
      {billingMessage ? <p className="report-status" role="status">{billingMessage}</p> : null}
      {subscription.status === "loading" ? <div className="pricing-loading" role="status">{t("pricing.resolving")}</div> : null}
      {subscription.status !== "loading" ? <>
      <section className={`pricing-subscription-summary status-${presentation.status}`} aria-label={t("pricing.currentSubscription")} role={hasSubscriptionError ? "alert" : "status"}>
        <div className="pricing-summary-heading">
          <span className={`pricing-summary-icon ${isPremium ? "is-premium" : ""}`} aria-hidden="true">{isPremium ? <Crown size={26} /> : <Leaf size={26} />}</span>
          <div className="pricing-summary-heading-copy">
            <span className="pricing-summary-eyebrow">{copy.currentPlan}</span>
            <h3>{isPremium ? copy.householdPremium : planName ?? statusName}</h3>
            {isPremium ? <span className="pricing-included-badge">{copy.included}</span> : null}
          </div>
          {planName ? <span className="pricing-status-badge">{statusName}</span> : null}
        </div>
        {isPremium ? <p>{copy.premiumBody}</p> : null}
        {entitlement ? <div className="pricing-summary-detail"><span><Users size={16} aria-hidden="true" />{copy.slotsLabel}</span><strong>{copy.members(usedHouseholdSlots(entitlement), entitlement.maxMembers)}</strong></div> : null}
        {householdPeriod || presentation.period ? <div className="pricing-summary-detail"><span><CalendarDays size={16} aria-hidden="true" />{t("pricing.billingPeriod")}</span><strong>{householdPeriod === "monthly" || !householdPeriod && presentation.period === "monthly" ? t("pricing.periodMonthly") : t("pricing.periodYearly")}{householdPeriod && productsById.has(householdPeriod === "monthly" ? revenueCatProductIds.premiumMonthly : revenueCatProductIds.premiumYearly) ? ` · ${productsById.get(householdPeriod === "monthly" ? revenueCatProductIds.premiumMonthly : revenueCatProductIds.premiumYearly)!.price}` : ""}</strong></div> : null}
        {presentation.previousPlan ? <div className="pricing-summary-detail"><span>{t("pricing.previousPlan")}</span><strong>{presentation.previousPlan === "monthly" ? t("pricing.monthlyPlan") : t("pricing.yearlyPlan")}</strong></div> : null}
        {entitlement?.validUntil ? <div className="pricing-summary-detail"><span><Clock size={16} aria-hidden="true" />{entitlement.cancelAtPeriodEnd || entitlement.status === "cancelled" ? copy.activeUntil : copy.periodEnds}</span><strong><time dateTime={entitlement.validUntil}>{formatSubscriptionDate(entitlement.validUntil, language)}</time></strong></div> : dateLabel && formattedDate && presentation.date ? <div className="pricing-summary-detail"><span><Clock size={16} aria-hidden="true" />{dateLabel}</span><strong><time dateTime={presentation.date}>{formattedDate}</time></strong></div> : null}
        {presentation.status === "free" ? <p>{t("pricing.noActiveSubscription")}</p> : null}
        {presentation.status === "free" && isOwner && subscription.customerInfo?.hasRevenueCatPremium && !entitlement?.billingBoundHere ? <p>{copy.purchaseLinkedElsewhere}</p> : null}
        {presentation.status === "expired" ? <p>{t("pricing.expiredNotice")}</p> : null}
        {isPremium && (entitlement?.cancelAtPeriodEnd || entitlement?.status === "cancelled") ? <p>{copy.cancelledNotice}</p> : null}
        {!isPremium && entitlement?.suspendedMemberCount ? <p>{copy.suspended(entitlement.suspendedMemberCount)}</p> : null}
        {billingDetailsUnavailable ? <p>{copy.billingDetailsUnavailable}</p> : null}
        {isOwner && isPremium && householdPeriod && !entitlement?.billingBoundHere ? <p>{copy.managementAccountRequired}</p> : null}
        {entitlement?.role === "viewer" ? <p className="pricing-action-note">{copy.ownerOnly}</p> : null}
        {hasSubscriptionError ? <p>{t("pricing.refreshFailed")}</p> : null}
        <div className="pricing-summary-actions">
          {isOwner && isOwnPaidSubscription(subscription) ? <a className="pricing-provider-action" href="#pricing-plans">{copy.changePlan}</a> : null}
          {isOwner && (presentation.status === "cancelled" || presentation.plan === "yearly" && presentation.status === "active") && managementUrl
            ? <a className="pricing-provider-action" href={managementUrl} rel="noopener noreferrer" target="_blank" aria-disabled={isBusy} onClick={(event) => { if (isBusy) event.preventDefault(); else setBillingMessage(t("pricing.manageHint")); }}>{presentation.status === "cancelled" ? copy.resumeSubscription : t("pricing.manage")}</a>
            : null}
          {isOwner && canCancelSubscription(subscription) ? <button ref={cancelButtonRef} className="pricing-cancel-action" type="button" disabled={isBusy} onClick={() => { if (cancellationHandoff.openDialog(subscription)) { setCancelError(""); setIsCancelModalOpen(true); } }}>{t("pricing.cancelSubscription")}</button> : null}
          {hasSubscriptionError || billingDetailsUnavailable ? <LoadingButton className="pricing-secondary-action" type="button" disabled={isBusy || !subscription.userId} isLoading={isRefreshing} onClick={() => void retrySubscription()}>{t("pricing.retry")}</LoadingButton> : null}
        </div>
      </section>
      <div className="pricing-section-heading"><h3>{copy.availablePlans}</h3><p>{copy.plansApply}</p></div>
      <div className="pricing-grid" id="pricing-plans">
        {fallbackPlans.map((plan) => {
          const productId = "productId" in plan ? plan.productId : null;
          const product = productId ? productsById.get(productId) : null;
          const isPremiumPlan = productId !== null;
          const period = productId === revenueCatProductIds.premiumYearly ? "yearly" : "monthly";
          const isCurrentPlan = isPremiumPlan && isPremium && entitlement?.planKey === `premium_${period}`;
          const isChangingPlan = isOwnPaidSubscription(subscription) && !isCurrentPlan;
          const isExpanded = expandedPlan === plan.name;
          const detailsId = `pricing-plan-${productId ?? "free"}`;
          return (
            <article className={`pricing-card ${isCurrentPlan ? "is-current" : ""} ${isExpanded ? "is-expanded" : ""}`} key={plan.name}>
              <div className="pricing-card-heading">
                <span className={`pricing-plan-icon ${isPremiumPlan ? "is-premium" : ""}`} aria-hidden="true">{!isPremiumPlan ? <Leaf size={22} /> : period === "monthly" ? <Sprout size={22} /> : <Crown size={22} />}</span>
                <div className="pricing-card-heading-copy">
                  <h3>{plan.name}</h3>
                  <strong>{product?.price ?? plan.price}</strong>
                  <p>{product?.description || plan.description}</p>
                </div>
                {(isCurrentPlan || !isPremiumPlan && entitlement && !isPremium) ? <span className="pricing-plan-current-badge">{t("pricing.currentPlan")}</span> : null}
                <button className="pricing-card-expand" type="button" aria-label={isExpanded ? copy.collapseDetails : copy.planDetails} aria-expanded={isExpanded} aria-controls={detailsId} onClick={() => setExpandedPlan(isExpanded ? null : plan.name)}><ChevronDown size={18} aria-hidden="true" /></button>
              </div>
              <div className="pricing-plan-content" id={detailsId}>
              <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}<li>{isPremiumPlan ? copy.premiumMembers : copy.freeMembers}</li></ul>
              {isPremiumPlan ? (
                isOwner && (canPurchasePlan || isChangingPlan) ? (
                  <LoadingButton type="button" disabled={billingDisabled || isBusy || isAwaitingConfirmation || !subscription.userId || !product && !(billingStatus.runtime === "web" && isOwnPaidSubscription(subscription))} isLoading={isPurchasing} onClick={() => void runPurchase(period)}>
                    {billingDisabled ? billingDisabledLabel(billingStatus, t)
                      : !subscription.userId ? t("pricing.signInRequired")
                      : isChangingPlan && billingStatus.runtime === "web" ? copy.changePlan
                      : !product ? isLoadingProducts ? t("pricing.processing") : t("pricing.productsUnavailable")
                      : isAwaitingConfirmation ? t("pricing.awaitingConfirmation")
                      : isPurchasing ? t("pricing.processing")
                      : period === "monthly" ? t("pricing.buyMonthly") : t("pricing.buyYearly")}
                  </LoadingButton>
                ) : isCurrentPlan ? <p className="pricing-current-status" role="status">{t("pricing.currentPlan")}</p> : null
              ) : entitlement && !isPremium ? <p className="pricing-current-status" role="status">{t("pricing.currentPlan")}</p> : null}
              </div>
            </article>
          );
        })}
      </div>
      {subscription.userId && subscription.householdId ? <BillingHistoryTimeline
        householdId={subscription.householdId} items={history.items} loading={history.loading} error={history.error}
        hasMore={history.hasMore} loadingMore={history.loadingMore} loadMoreError={history.loadMoreError}
        onRetry={() => void history.refresh()} onLoadMore={() => void history.loadMore()} language={language}
      /> : null}
      {isCancelModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section ref={cancelDialogRef} className="confirm-modal subscription-cancel-modal" role="dialog" aria-modal="true" aria-labelledby="subscription-cancel-title" aria-describedby="subscription-cancel-description" tabIndex={-1} onKeyDown={handleCancelDialogKeyDown}>
            <div className="section-title danger-title"><h2 id="subscription-cancel-title">{t("pricing.cancelTitle")}</h2></div>
            <p id="subscription-cancel-description">{t("pricing.cancelBody")}</p>
            <p>{t("pricing.cancelProviderHint")}</p>
            {formattedDate ? <p>{t("pricing.cancelPaidUntil", { date: formattedDate })}</p> : null}
            <p>{copy.cancelImpact}</p>
            {!managementUrl ? <p className="report-status" role="alert">{t("pricing.cancelUnavailable")}</p> : null}
            {cancelError ? <p className="report-status" role="alert">{cancelError}</p> : null}
            <div className="modal-actions">
              <button ref={keepButtonRef} className="pricing-keep-action" type="button" disabled={isOpeningManagement} onClick={closeCancelModal}>{t("pricing.keepSubscription")}</button>
              <LoadingButton className="danger-action" type="button" disabled={isOpeningManagement || !managementUrl} isLoading={isOpeningManagement} loadingLabel={t("pricing.processing")} onClick={() => void confirmCancellation()}>{t("pricing.cancelSubscription")}</LoadingButton>
            </div>
          </section>
        </div>
      ) : null}
      </> : null}
    </section>
  );
};
