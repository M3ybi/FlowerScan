import { useId, useMemo, useState } from "react";
import { AlertCircle, ArrowRightLeft, Clock, CreditCard, History, Leaf, PauseCircle, PlayCircle, ReceiptText, RotateCw, Undo2 } from "lucide-react";
import type { PlantieLanguage } from "../lib/onboarding";
import type { SubscriptionHistoryCategory, SubscriptionHistoryItem, SubscriptionHistoryType } from "../lib/subscriptionHistoryModel";
import { billingHistoryCopy, billingHistoryEventCopy } from "../lib/billingHistoryCopy";
import { formatSubscriptionDate } from "../lib/subscriptionUiRules";

export type BillingHistoryFilter = "all" | SubscriptionHistoryCategory;
const historyBatchSize = 15;
const filters: readonly BillingHistoryFilter[] = ["all", "billing", "plan_change", "renewal"];
const filterIcons = { billing: CreditCard, plan_change: ArrowRightLeft, renewal: RotateCw };

export type BillingHistoryTimelineProps = {
  householdId: string | null;
  items: readonly SubscriptionHistoryItem[];
  loading: boolean;
  error: boolean;
  language?: PlantieLanguage | null;
  onRetry: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  loadMoreError?: boolean;
  onLoadMore?: () => void;
};

export const shouldLoadOlderBillingHistory = (totalCount: number, visibleCount: number, hasMore: boolean, retryPending: boolean) =>
  hasMore && (retryPending || totalCount <= visibleCount);

export const selectBillingHistory = (items: readonly SubscriptionHistoryItem[], householdId: string | null, filter: BillingHistoryFilter = "all", limit = historyBatchSize) => {
  const matching = items.filter((item) => item.householdId === householdId && Number.isFinite(Date.parse(item.occurredAt)) && (filter === "all" || item.category === filter))
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt) || right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id));
  return { items: matching.slice(0, Math.max(0, limit)), totalCount: matching.length };
};

export const groupBillingHistoryByMonth = (items: readonly SubscriptionHistoryItem[], language: PlantieLanguage | null | undefined) => {
  const groups = new Map<string, { key: string; label: string; items: SubscriptionHistoryItem[] }>();
  const monthFormat = new Intl.DateTimeFormat(language ?? "en", { month: "long", year: "numeric" });
  for (const item of items) {
    const date = new Date(item.occurredAt);
    if (!Number.isFinite(date.getTime())) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const group = groups.get(key) ?? { key, label: monthFormat.format(date), items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return Array.from(groups.values());
};

const eventIcons: Record<SubscriptionHistoryType, typeof History> = {
  subscription_started: Leaf, renewed: RotateCw, upgraded: ArrowRightLeft, downgraded: ArrowRightLeft,
  plan_changed: ArrowRightLeft, cancelled: PauseCircle, resumed: PlayCircle, expired: Clock,
  switched_to_free: Leaf, payment_failed: AlertCircle, payment_succeeded: CreditCard, refund: Undo2,
};

// The keyed content resets filters and pagination synchronously when the selected household changes.
export const BillingHistoryTimeline = (props: BillingHistoryTimelineProps) => <BillingHistoryContent key={props.householdId ?? "no-household"} {...props} />;

const BillingHistoryContent = ({ householdId, items, loading, error, language = "en", onRetry, hasMore = false, loadingMore = false, loadMoreError = false, onLoadMore }: BillingHistoryTimelineProps) => {
  const text = billingHistoryCopy(language);
  const titleId = useId();
  const [filter, setFilter] = useState<BillingHistoryFilter>("all");
  const [visibleCount, setVisibleCount] = useState(historyBatchSize);
  const selection = useMemo(() => selectBillingHistory(items, householdId, filter, visibleCount), [items, householdId, filter, visibleCount]);
  const groups = useMemo(() => groupBillingHistoryByMonth(selection.items, language), [selection.items, language]);
  const canShowOlder = selection.totalCount > visibleCount || (hasMore && Boolean(onLoadMore));
  const showOlder = () => {
    if (loadingMore) return;
    setVisibleCount((count) => count + historyBatchSize);
    if (shouldLoadOlderBillingHistory(selection.totalCount, visibleCount, hasMore, loadMoreError)) onLoadMore?.();
  };

  return <section className="billing-history-timeline" aria-labelledby={titleId} aria-busy={loading}>
    <header className="billing-history-heading"><span className="billing-history-heading-icon"><History size={21} aria-hidden="true" /></span><div><h3 id={titleId}>{text.title}</h3><p>{text.subtitle}</p></div></header>
    <div className="billing-history-filters" role="group" aria-label={text.filterLabel}>
      {filters.map((value) => {
        const Icon = value === "all" ? null : filterIcons[value];
        return <button key={value} className="billing-history-filter" type="button" aria-pressed={filter === value} disabled={loading} onClick={() => { setFilter(value); setVisibleCount(historyBatchSize); }}>{Icon ? <Icon size={14} aria-hidden="true" /> : null}{text.filters[value]}</button>;
      })}
    </div>
    {loading ? <div className="billing-history-loading" role="status" aria-label={text.loading}>
      {[0, 1, 2].map((index) => <div className="billing-history-skeleton-row" key={index} aria-hidden="true"><span className="billing-history-skeleton-icon" /><div className="billing-history-skeleton-card"><span /><span /><span /></div></div>)}
    </div> : error ? <div className="billing-history-state billing-history-error" role="alert"><span><AlertCircle size={28} aria-hidden="true" /></span><p>{text.error}</p><button className="neutral-action" type="button" onClick={onRetry}>{text.retry}</button></div> : <>
      {!selection.items.length ? <div className="billing-history-state" role="status"><span><ReceiptText size={29} aria-hidden="true" /></span><h4>{filter === "all" ? text.emptyTitle : text.filteredEmptyTitle}</h4><p>{filter === "all" ? text.emptyBody : text.filteredEmptyBody}</p></div> : <div className="billing-history-groups">{groups.map((group) => <section className="billing-history-month" aria-labelledby={`${titleId}-${group.key}`} key={group.key}>
        <h4 id={`${titleId}-${group.key}`}>{group.label}</h4>
        <ol className="billing-history-events">{group.items.map((item) => {
          const event = billingHistoryEventCopy(item, language);
          const Icon = eventIcons[item.type];
          return <li className="billing-history-event" key={item.id}>
            <span className="billing-history-event-icon" data-tone={item.status}><Icon size={19} aria-hidden="true" /></span>
            <article className="billing-history-card"><div className="billing-history-card-heading"><h5>{event.title}</h5><span className="billing-history-badge" data-tone={item.status}>{event.badge}</span></div><p>{event.description}</p><time dateTime={item.occurredAt}>{formatSubscriptionDate(item.occurredAt, language ?? "en")}</time></article>
          </li>;
        })}</ol>
      </section>)}</div>}
      {loadMoreError ? <p className="billing-history-older-error" role="alert">{text.olderError}</p> : null}
      {canShowOlder ? <div className="billing-history-pagination" aria-busy={loadingMore}><button className="neutral-action" type="button" disabled={loadingMore} onClick={showOlder}>{loadingMore ? text.loadingOlder : loadMoreError ? text.retry : text.showOlder}</button></div> : null}
    </>}
  </section>;
};
