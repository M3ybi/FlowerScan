import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { TouchEvent } from "react";
import { AlertCircle, ArrowRightLeft, ChevronLeft, ChevronRight, Clock, CreditCard, History, Leaf, PauseCircle, PlayCircle, ReceiptText, RotateCw, Undo2 } from "lucide-react";
import type { PlantieLanguage } from "../lib/onboarding";
import type { SubscriptionHistoryCategory, SubscriptionHistoryItem, SubscriptionHistoryType } from "../lib/subscriptionHistoryModel";
import { billingHistoryCopy, billingHistoryEventCopy } from "../lib/billingHistoryCopy";
import { formatSubscriptionDate } from "../lib/subscriptionUiRules";

export type BillingHistoryFilter = "all" | SubscriptionHistoryCategory;
export const billingHistoryPageSize = 4;
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

export const selectBillingHistory = (items: readonly SubscriptionHistoryItem[], householdId: string | null, filter: BillingHistoryFilter = "all", requestedPage = 1) => {
  const matching = items.filter((item) => item.householdId === householdId && Number.isFinite(Date.parse(item.occurredAt)) && (filter === "all" || item.category === filter))
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt) || right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id));
  const totalPages = Math.max(1, Math.ceil(matching.length / billingHistoryPageSize));
  const page = Math.min(totalPages, Math.max(1, Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1));
  const startIndex = (page - 1) * billingHistoryPageSize;
  return { items: matching.slice(startIndex, startIndex + billingHistoryPageSize), totalCount: matching.length, totalPages, page };
};

export const billingHistorySwipeDirection = (horizontal: number, vertical: number): -1 | 0 | 1 => {
  if (!Number.isFinite(horizontal) || !Number.isFinite(vertical) || Math.abs(horizontal) < 64 || Math.abs(horizontal) <= Math.abs(vertical) * 1.75) return 0;
  return horizontal < 0 ? 1 : -1;
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
  const [requestedPage, setRequestedPage] = useState(1);
  const [pageHeight, setPageHeight] = useState(0);
  const pageRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLElement>(null);
  const shouldAlignPage = useRef(false);
  const gesture = useRef<{ identifier: number; x: number; y: number } | null>(null);
  const historyError = error || loadMoreError || (hasMore && !onLoadMore);
  const historyLoading = !historyError && (loading || loadingMore || hasMore);
  const selection = useMemo(() => selectBillingHistory(items, householdId, filter, requestedPage), [items, householdId, filter, requestedPage]);
  const groups = useMemo(() => groupBillingHistoryByMonth(selection.items, language), [selection.items, language]);
  // Exact filtered totals require completing the existing bounded reads. Neither
  // the history reader nor normalization/ingestion changes for UI pagination.
  useEffect(() => {
    if (hasMore && !loading && !error && !loadingMore && !loadMoreError) onLoadMore?.();
  }, [hasMore, loading, error, loadingMore, loadMoreError, onLoadMore]);
  useEffect(() => {
    if (!historyLoading && !historyError && requestedPage !== selection.page) setRequestedPage(selection.page);
  }, [historyLoading, historyError, requestedPage, selection.page]);
  useEffect(() => {
    let measuredWidth = window.innerWidth;
    const resetHeight = () => {
      if (window.innerWidth === measuredWidth) return;
      measuredWidth = window.innerWidth;
      setPageHeight(0);
    };
    window.addEventListener("resize", resetHeight);
    return () => window.removeEventListener("resize", resetHeight);
  }, []);
  useEffect(() => {
    if (!shouldAlignPage.current || historyLoading || historyError) return;
    shouldAlignPage.current = false;
    const frame = requestAnimationFrame(() => {
      const heading = headingRef.current;
      if (heading && heading.getBoundingClientRect().top < 0) {
        heading.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [selection.page, historyLoading, historyError]);
  const changePage = (page: number) => {
    const nextPage = Math.min(selection.totalPages, Math.max(1, page));
    if (historyLoading || historyError || nextPage === selection.page) return;
    const measuredHeight = pageRef.current?.getBoundingClientRect().height ?? 0;
    setPageHeight((height) => Math.max(height, measuredHeight));
    shouldAlignPage.current = true;
    setRequestedPage(nextPage);
  };
  const touchStart = (event: TouchEvent<HTMLDivElement>) => {
    gesture.current = null;
    if (!window.matchMedia("(max-width: 780px)").matches || event.touches.length !== 1 || (event.target instanceof Element && event.target.closest("button, a, input, textarea, select, [contenteditable]"))) return;
    const touch = event.touches[0];
    // Leave browser edge navigation gestures entirely native.
    if (touch.clientX <= 24 || touch.clientX >= window.innerWidth - 24) return;
    gesture.current = { identifier: touch.identifier, x: touch.clientX, y: touch.clientY };
  };
  const touchMove = (event: TouchEvent<HTMLDivElement>) => {
    const start = gesture.current;
    if (!start) return;
    const touch = event.touches[0];
    if (event.touches.length !== 1 || touch.identifier !== start.identifier || (Math.abs(touch.clientY - start.y) > 20 && Math.abs(touch.clientY - start.y) > Math.abs(touch.clientX - start.x))) gesture.current = null;
  };
  const touchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = gesture.current;
    gesture.current = null;
    if (!start || event.touches.length || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    if (touch.identifier !== start.identifier) return;
    const direction = billingHistorySwipeDirection(touch.clientX - start.x, touch.clientY - start.y);
    if (direction) changePage(selection.page + direction);
  };

  return <section className="billing-history-timeline" aria-labelledby={titleId} aria-busy={historyLoading}>
    <header ref={headingRef} className="billing-history-heading"><span className="billing-history-heading-icon"><History size={21} aria-hidden="true" /></span><div><h3 id={titleId}>{text.title}</h3><p>{text.subtitle}</p></div></header>
    <div className="billing-history-filters" role="group" aria-label={text.filterLabel}>
      {filters.map((value) => {
        const Icon = value === "all" ? null : filterIcons[value];
        return <button key={value} className="billing-history-filter" type="button" aria-pressed={filter === value} disabled={historyLoading} onClick={() => { setFilter(value); setRequestedPage(1); setPageHeight(0); }}>{Icon ? <Icon size={14} aria-hidden="true" /> : null}{text.filters[value]}</button>;
      })}
    </div>
    {historyLoading ? <div className="billing-history-loading" role="status" aria-label={text.loading}>
      {[0, 1, 2].map((index) => <div className="billing-history-skeleton-row" key={index} aria-hidden="true"><span className="billing-history-skeleton-icon" /><div className="billing-history-skeleton-card"><span /><span /><span /></div></div>)}
    </div> : historyError ? <div className="billing-history-state billing-history-error" role="alert"><span><AlertCircle size={28} aria-hidden="true" /></span><p>{text.error}</p><button className="neutral-action" type="button" onClick={loadMoreError && onLoadMore ? onLoadMore : onRetry}>{text.retry}</button></div> : <>
      {!selection.items.length ? <div className="billing-history-state" role="status"><span><ReceiptText size={29} aria-hidden="true" /></span><h4>{filter === "all" ? text.emptyTitle : text.filteredEmptyTitle}</h4><p>{filter === "all" ? text.emptyBody : text.filteredEmptyBody}</p></div> : <div className="billing-history-page" ref={pageRef} style={{ minHeight: pageHeight || undefined }} onTouchStart={touchStart} onTouchMove={touchMove} onTouchEnd={touchEnd} onTouchCancel={() => { gesture.current = null; }}><div className="billing-history-groups" key={`${filter}:${selection.page}`}>{groups.map((group) => <section className="billing-history-month" aria-labelledby={`${titleId}-${group.key}`} key={group.key}>
        <h4 id={`${titleId}-${group.key}`}>{group.label}</h4>
        <ol className="billing-history-events">{group.items.map((item) => {
          const event = billingHistoryEventCopy(item, language);
          const Icon = eventIcons[item.type];
          return <li className="billing-history-event" key={item.id}>
            <span className="billing-history-event-icon" data-tone={item.status}><Icon size={19} aria-hidden="true" /></span>
            <article className="billing-history-card"><div className="billing-history-card-heading"><h5>{event.title}</h5><span className="billing-history-badge" data-tone={item.status}>{event.badge}</span></div><p>{event.description}</p><time dateTime={item.occurredAt}>{formatSubscriptionDate(item.occurredAt, language ?? "en")}</time></article>
          </li>;
        })}</ol>
      </section>)}</div></div>}
      {selection.totalPages > 1 ? <nav className="billing-history-pagination menu-invite-pagination" aria-label={text.paginationLabel}>
        <div>
          <button type="button" aria-label={text.previousPage} disabled={selection.page === 1} onClick={() => changePage(selection.page - 1)}><ChevronLeft size={18} aria-hidden="true" /></button>
          <span className="billing-history-page-indicator" role="status" aria-live="polite" aria-atomic="true"><span className="sr-only">{text.pageLabel(selection.page, selection.totalPages)}</span><span aria-hidden="true">{selection.page} / {selection.totalPages}</span></span>
          <button type="button" aria-label={text.nextPage} disabled={selection.page === selection.totalPages} onClick={() => changePage(selection.page + 1)}><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
        <span>{text.eventsShown(selection.items.length, selection.totalCount)}</span>
      </nav> : null}
    </>}
  </section>;
};
