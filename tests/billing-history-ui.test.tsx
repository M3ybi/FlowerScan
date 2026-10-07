import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BillingHistoryTimeline, billingHistorySwipeDirection, groupBillingHistoryByMonth, selectBillingHistory } from "../src/components/BillingHistoryTimeline";
import { billingHistoryCopy, billingHistoryEventCopy } from "../src/lib/billingHistoryCopy";
import type { SubscriptionHistoryItem } from "../src/lib/subscriptionHistoryModel";
import { formatSubscriptionDate } from "../src/lib/subscriptionUiRules";

const event = (changes: Partial<SubscriptionHistoryItem> = {}): SubscriptionHistoryItem => ({
  id: "history-row", householdId: "home", category: "renewal", type: "renewed", occurredAt: "2026-10-06T20:15:00.000000Z",
  planKey: "premium_yearly", previousPlanKey: null, status: "success", periodStart: null, periodEnd: null, renewalInterval: null, ...changes,
});
const renderHistory = (changes: Partial<Parameters<typeof BillingHistoryTimeline>[0]> = {}) => renderToStaticMarkup(createElement(BillingHistoryTimeline, {
  householdId: "home", items: [event()], loading: false, error: false, language: "en", onRetry: () => undefined, ...changes,
}));

test("billing history navigation renders at most four events instead of an expanding list", () => {
  const items = Array.from({ length: 11 }, (_, index) => event({ id: String(index) }));
  const html = renderHistory({ items });
  assert.equal((html.match(/class="billing-history-card"/g) ?? []).length, 4);
});

test("history cards render newest first and group each month only once", () => {
  const items = [
    event({ id: "old", type: "subscription_started", category: "plan_change", occurredAt: "2025-10-05T15:56:00.000000Z" }),
    event({ id: "middle", occurredAt: "2026-10-06T20:15:00.000000Z" }),
    event({ id: "new", type: "payment_failed", category: "billing", status: "failed", occurredAt: "2026-10-06T20:20:00.000000Z" }),
  ];
  const selection = selectBillingHistory(items, "home");
  assert.deepEqual(selection.items.map((item) => item.id), ["new", "middle", "old"]);
  assert.deepEqual(items.map((item) => item.id), ["old", "middle", "new"], "sorting never mutates repository data");
  const groups = groupBillingHistoryByMonth(selection.items, "en");
  assert.deepEqual(groups.map((group) => [group.label, group.items.length]), [["October 2026", 2], ["October 2025", 1]]);
  const html = renderHistory({ items });
  assert.ok(html.indexOf("Payment issue") < html.indexOf("Subscription renewed"));
  assert.ok(html.indexOf("Subscription renewed") < html.indexOf("Subscription started"));
  assert.equal((html.match(/>October 2026<\/h4>/g) ?? []).length, 1);
  assert.equal((html.match(/>October 2025<\/h4>/g) ?? []).length, 1);
});

test("All and the three category filters select only their normalized events", () => {
  const items = [event({ id: "renewal" }), event({ id: "billing", category: "billing", type: "payment_failed", status: "failed" }), event({ id: "plan", category: "plan_change", type: "plan_changed", status: "info" })];
  assert.equal(selectBillingHistory(items, "home", "all").totalCount, 3);
  for (const [filter, id] of [["billing", "billing"], ["plan_change", "plan"], ["renewal", "renewal"]] as const) {
    assert.deepEqual(selectBillingHistory(items, "home", filter).items.map((item) => item.id), [id]);
  }
  const html = renderHistory({ items });
  assert.equal((html.match(/class="billing-history-filter"/g) ?? []).length, 4);
  assert.match(html, /aria-pressed="true"[^>]*>All<\/button>/);
  assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 3);
  assert.match(html, /aria-label="Filter billing history"/);
});

test("empty, loading, and error states remain distinct and loading never flashes empty text", () => {
  const empty = renderHistory({ items: [] });
  assert.match(empty, /No billing history yet/);
  assert.match(empty, /Subscription changes and billing events for this household will appear here/);
  const loading = renderHistory({ items: [], loading: true });
  assert.equal((loading.match(/class="billing-history-skeleton-row"/g) ?? []).length, 3);
  assert.match(loading, /role="status" aria-label="Loading billing history/);
  assert.doesNotMatch(loading, /No billing history yet/);
  const failed = renderHistory({ error: true });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Couldn't load billing history\.|Couldn&#x27;t load billing history\./);
  assert.match(failed, />Try again<\/button>/);
  assert.doesNotMatch(failed, /No billing history yet|Subscription renewed/);
});

test("five and eleven matching events create two and three four-event pages", () => {
  for (const [count, pages] of [[5, 2], [11, 3]] as const) {
    const items = Array.from({ length: count }, (_, index) => event({ id: String(index).padStart(2, "0") }));
    const selection = selectBillingHistory(items, "home");
    assert.equal(selection.totalPages, pages);
    assert.equal(selection.items.length, 4);
    assert.equal(selection.totalCount, count);
    const html = renderHistory({ items });
    assert.match(html, new RegExp(`Page 1 of ${pages}`));
    assert.match(html, new RegExp(`4 of ${count} events`));
    assert.doesNotMatch(html, /Show older activity/);
  }
});

test("complete totals are required before cards or pagination appear and remaining-read failures stay retryable", () => {
  const items = Array.from({ length: 50 }, (_, index) => event({ id: String(index) }));
  const pending = renderHistory({ items, hasMore: true, onLoadMore: () => undefined });
  assert.equal((pending.match(/class="billing-history-skeleton-row"/g) ?? []).length, 3);
  assert.doesNotMatch(pending, /billing-history-card"|billing-history-pagination|Page 1|of 50 events/);
  const html = renderHistory({ items, hasMore: true, onLoadMore: () => undefined, loadMoreError: true });
  assert.match(html, /Couldn't load billing history\.|Couldn&#x27;t load billing history\./);
  assert.match(html, />Try again<\/button>/);
  assert.doesNotMatch(html, /billing-history-card"|billing-history-pagination|Page 1/);
  const loading = renderHistory({ items, hasMore: true, onLoadMore: () => undefined, loadingMore: true });
  assert.match(loading, /aria-busy="true"/);
  assert.doesNotMatch(loading, /billing-history-pagination|Page 1/);
});

test("filtered pagination preserves chronology and each page groups only its visible months", () => {
  const items = Array.from({ length: 11 }, (_, index) => event({ id: String(index), occurredAt: new Date(Date.UTC(2026, 9, 6 - index)).toISOString() }));
  const first = selectBillingHistory(items, "home", "all", 1);
  const second = selectBillingHistory(items, "home", "all", 2);
  const last = selectBillingHistory(items, "home", "all", 3);
  assert.deepEqual(first.items.map((item) => item.id), ["0", "1", "2", "3"]);
  assert.deepEqual(second.items.map((item) => item.id), ["4", "5", "6", "7"]);
  assert.deepEqual(last.items.map((item) => item.id), ["8", "9", "10"]);
  assert.deepEqual(groupBillingHistoryByMonth(second.items, "en").map((group) => group.label), ["October 2026", "September 2026"]);
  assert.deepEqual(groupBillingHistoryByMonth(last.items, "en").map((group) => group.label), ["September 2026"]);
  const billing = items.map((item, index) => index % 2 === 0 ? { ...item, category: "billing" as const, type: "payment_failed" as const } : item);
  const filtered = selectBillingHistory(billing, "home", "billing", 2);
  assert.equal(filtered.totalCount, 6);
  assert.equal(filtered.totalPages, 2);
  assert.deepEqual(filtered.items.map((item) => item.id), ["8", "10"]);
  assert.deepEqual(selectBillingHistory(billing, "home", "billing").items.map((item) => item.id), ["0", "2", "4", "6"]);
});

test("page selection safely clamps empty, shrinking and malformed page requests", () => {
  const items = Array.from({ length: 5 }, (_, index) => event({ id: String(index) }));
  for (const requested of [3, 50, 2.9]) assert.equal(selectBillingHistory(items, "home", "all", requested).page, 2);
  for (const requested of [-1, 0, NaN, Infinity]) assert.equal(selectBillingHistory(items, "home", "all", requested).page, 1);
  assert.equal(selectBillingHistory([], "home", "all", 3).page, 1);
  assert.equal(selectBillingHistory(items.slice(0, 4), "home", "all", 3).page, 1);
});

test("semantic pager controls have clear accessible labels and disable the first previous button", () => {
  const html = renderHistory({ items: Array.from({ length: 11 }, (_, index) => event({ id: String(index) })) });
  assert.match(html, /<nav class="billing-history-pagination menu-invite-pagination" aria-label="Billing history pages"/);
  assert.match(html, /<button type="button" aria-label="Previous billing history page" disabled=""/);
  assert.match(html, /<button type="button" aria-label="Next billing history page">/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /<span class="sr-only">Page 1 of 3<\/span>/);
});

test("single-page, empty, loading and error history omit unnecessary pagination", () => {
  for (const count of [0, 1, 4]) assert.doesNotMatch(renderHistory({ items: Array.from({ length: count }, (_, index) => event({ id: String(index) })) }), /billing-history-pagination/);
  const items = Array.from({ length: 11 }, (_, index) => event({ id: String(index) }));
  assert.doesNotMatch(renderHistory({ items, loading: true }), /billing-history-pagination|Page 1/);
  assert.doesNotMatch(renderHistory({ items, error: true }), /billing-history-pagination|Page 1/);
});

test("touch navigation requires intentional horizontal movement and rejects vertical, small or malformed gestures", () => {
  assert.equal(billingHistorySwipeDirection(-100, 8), 1);
  assert.equal(billingHistorySwipeDirection(100, -8), -1);
  for (const [x, y] of [[-63, 0], [0, 100], [45, 60], [64, 50], [NaN, 0], [100, Infinity]]) assert.equal(billingHistorySwipeDirection(x, y), 0);
});

test("history is household scoped, including during a switch with old rows still in memory", () => {
  const unrelated = event({ householdId: "other", id: "private-other-row", type: "payment_failed", category: "billing", status: "failed" });
  assert.equal(selectBillingHistory([event(), unrelated], "home").items.length, 1);
  assert.equal(selectBillingHistory([event()], "other").items.length, 0);
  assert.doesNotMatch(renderHistory({ householdId: "other", items: [event()] }), /Subscription renewed/);
  assert.doesNotMatch(renderHistory({ items: [unrelated] }), /Payment issue|private-other-row/);
  assert.equal(selectBillingHistory([event({ occurredAt: "invalid" })], "home").items.length, 0);
});

test("plan changes use recorded previous and new plans, with honest fallbacks for missing facts", () => {
  const changed = event({ type: "upgraded", category: "plan_change", status: "info", previousPlanKey: "premium_monthly" });
  const text = billingHistoryEventCopy(changed, "en");
  assert.equal(text.title, "Changed to Yearly");
  assert.equal(text.description, "Switched from Household Premium (Monthly) to Household Premium (Yearly).");
  const legacy = billingHistoryEventCopy({ ...changed, previousPlanKey: null }, "en");
  assert.equal(legacy.description, "Your household changed to Household Premium (Yearly).");
  assert.doesNotMatch(legacy.description, /Monthly|from/);
  assert.equal(billingHistoryEventCopy({ ...changed, planKey: null, previousPlanKey: null }, "en").description, "The subscription plan for your household changed.");
});

test("renewal descriptions only claim a month or year when recorded period facts support it", () => {
  assert.equal(billingHistoryEventCopy(event(), "en").description, "Your household subscription renewed.");
  assert.match(billingHistoryEventCopy(event({ renewalInterval: "yearly" }), "en").description, /another year/);
  assert.match(billingHistoryEventCopy(event({ renewalInterval: "monthly", planKey: "premium_monthly" }), "en").description, /another month/);
  assert.doesNotMatch(renderHistory(), /another year|another month/);
});

test("cards show readable semantic badges and contain no fake detail actions or sensitive identifiers", () => {
  const items = [event(), event({ id: "plan", type: "plan_changed", category: "plan_change", status: "info" }), event({ id: "failed", type: "payment_failed", category: "billing", status: "failed" }), event({ id: "cancelled", type: "cancelled", status: "warning" }), event({ id: "expired", type: "expired", status: "expired" })];
  const html = items.map((item) => renderHistory({ items: [{ ...item, providerEventId: "sensitive-provider-event", providerCustomerId: "sensitive-customer", rawPayload: "raw-secret" } as SubscriptionHistoryItem] })).join("");
  for (const badge of ["Successful", "Plan change", "Failed", "Cancelled", "Expired"]) assert.match(html, new RegExp(`>${badge}<`));
  assert.doesNotMatch(html, /sensitive-provider-event|sensitive-customer|raw-secret|providerEventId|RENEWAL|PRODUCT_CHANGE|payment_failed/);
  assert.doesNotMatch(html, /role="button"|lucide-chevron|<article[^>]*tabindex/);
});

test("dates and month labels follow the selected language and retain the semantic timestamp", () => {
  const item = event();
  const html = renderHistory({ language: "sk" });
  assert.match(html, /Platby a história/);
  assert.match(html, /október 2026/);
  assert.ok(html.includes(formatSubscriptionDate(item.occurredAt, "sk")!));
  assert.match(html, /datetime="2026-10-06T20:15:00.000000Z"/i);
  for (const language of ["en", "sk", "de", "fr", "es"] as const) {
    assert.ok(billingHistoryCopy(language).showOlder.length > 0);
    assert.ok(billingHistoryEventCopy(item, language).title.length > 0);
  }
});

test("concurrent history sections have independent accessible heading and month IDs", () => {
  const props = { householdId: "home", items: [event()], loading: false, error: false, language: "en" as const, onRetry: () => undefined };
  const html = renderToStaticMarkup(createElement("div", null, createElement(BillingHistoryTimeline, { ...props, key: "first" }), createElement(BillingHistoryTimeline, { ...props, key: "second" })));
  const ids = Array.from(html.matchAll(/ id="([^"]+)"/g), (match) => match[1]);
  const labels = Array.from(html.matchAll(/aria-labelledby="([^"]+)"/g), (match) => match[1]);
  assert.equal(ids.length, 4);
  assert.equal(new Set(ids).size, 4);
  assert.deepEqual(ids, labels);
});

test("newest-first ordering preserves distinct microsecond timestamps", () => {
  const items = [event({ id: "zzz", occurredAt: "2026-10-06T20:15:00.000001Z" }), event({ id: "aaa", occurredAt: "2026-10-06T20:15:00.000002Z" })];
  assert.deepEqual(selectBillingHistory(items, "home").items.map((item) => item.id), ["aaa", "zzz"]);
});
