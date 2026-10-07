import assert from "node:assert/strict";
import test from "node:test";
import { canonicalHistoryTimestamp, normalizeSubscriptionHistory } from "../src/lib/subscriptionHistoryModel";
import type { RawSubscriptionHistoryEvent } from "../src/lib/subscriptionHistoryModel";
import { createHouseholdSubscriptionHistoryReader } from "../src/lib/householdSubscriptionHistory";
import type { HouseholdSubscriptionHistoryPage } from "../src/lib/householdSubscriptionHistory";
import { createHouseholdSubscriptionHistoryController } from "../src/lib/householdSubscriptionHistoryController";
import type { HouseholdHistoryState } from "../src/lib/householdSubscriptionHistoryController";

const householdA = "11111111-1111-4111-8111-111111111111";
const householdB = "22222222-2222-4222-8222-222222222222";
const uuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const event = (index = 1, changes: Partial<RawSubscriptionHistoryEvent> = {}): RawSubscriptionHistoryEvent => ({
  id: uuid(index), householdId: householdA, eventType: "renewed", planKey: "premium_monthly",
  createdAt: "2026-10-06T19:15:00.123456Z", ...changes,
});
const page = (events: RawSubscriptionHistoryEvent[], hasMore = false): HouseholdSubscriptionHistoryPage => ({
  events, hasMore, nextCursor: hasMore ? { id: events[events.length - 1].id, occurredAt: events[events.length - 1].createdAt } : null,
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

test("history sorts newest first, including PostgreSQL microsecond ties, without mutating input", () => {
  const rows = [event(1, { occurredAt: "2026-10-06T19:15:00.123455Z" }), event(2, { occurredAt: "2026-10-06T19:15:00.123456Z" }), event(3, { occurredAt: "2026-11-01T00:00:00Z" })];
  assert.deepEqual(normalizeSubscriptionHistory(rows, householdA).map((item) => item.id), [uuid(3), uuid(2), uuid(1)]);
  assert.deepEqual(rows.map((item) => item.id), [uuid(1), uuid(2), uuid(3)]);
});

test("every meaningful provider event becomes a safe semantic category and type", () => {
  const cases = [
    ["INITIAL_PURCHASE", "subscription_started", "plan_change"], ["RENEWAL", "renewed", "renewal"],
    ["PRODUCT_CHANGE", "plan_changed", "plan_change"], ["CANCELLATION", "cancelled", "renewal"],
    ["UNCANCELLATION", "resumed", "renewal"], ["EXPIRATION", "expired", "renewal"],
    ["BILLING_ISSUE", "payment_failed", "billing"], ["REFUND", "refund", "billing"],
    ["payment_succeeded", "payment_succeeded", "billing"], ["switched_to_free", "switched_to_free", "plan_change"],
  ];
  for (const [eventType, type, category] of cases) {
    const [item] = normalizeSubscriptionHistory([event(1, { eventType })], householdA);
    assert.equal(item.type, type); assert.equal(item.category, category);
  }
  assert.equal(normalizeSubscriptionHistory([event(1, { eventType: "INITIAL_PURCHASE" })], householdA)[0].status, "success");
});

test("unknown events, reconciliation noise, malformed dates and unrelated households are excluded", () => {
  const rows = ["synced", "entitlement_refreshed", "subscription_sync_completed", "unknown", "toString", "__proto__"].map((eventType, index) => event(index + 1, { eventType }));
  rows.push(event(20, { createdAt: "not-a-date" }), event(21, { createdAt: "2026-02-30T10:00:00Z" }), event(22, { householdId: householdB }));
  assert.deepEqual(normalizeSubscriptionHistory(rows, householdA), []);
  assert.equal(canonicalHistoryTimestamp(null), null);
  assert.equal(canonicalHistoryTimestamp("2026-10-06T25:00:00Z"), null);
  assert.equal(canonicalHistoryTimestamp("2026-10-06T19:15:00Z),id.gt.0"), null);
});

test("provider event identity removes duplicate deliveries while retaining the richer historical snapshot", () => {
  const rows = [event(1, { provider: "web", providerEventId: "delivery-one" }), event(2, {
    provider: "WEB", providerEventId: "delivery-one", previousPlanKey: "premium_monthly", newPlanKey: "premium_yearly",
    periodStart: "2026-10-06T19:00:00Z", periodEnd: "2027-10-06T19:00:00Z",
  })];
  const items = normalizeSubscriptionHistory(rows, householdA);
  assert.equal(items.length, 1); assert.equal(items[0].planKey, "premium_yearly");
  assert.equal(items[0].previousPlanKey, "premium_monthly"); assert.equal(items[0].renewalInterval, "yearly");
  assert.equal("provider" in items[0], false); assert.equal("providerEventId" in items[0], false);
});

test("separate providers, delivery identities and genuine recurring periods stay separate", () => {
  const rows = [event(1, { provider: "ios", providerEventId: "one" }), event(2, { provider: "web", providerEventId: "one" }),
    event(3, { provider: "web", providerEventId: "two", periodStart: "2026-09-01T00:00:00Z", periodEnd: "2026-10-01T00:00:00Z" }),
    event(4, { provider: "web", providerEventId: "three", periodStart: "2026-10-01T00:00:00Z", periodEnd: "2026-11-01T00:00:00Z" })];
  assert.equal(normalizeSubscriptionHistory(rows, householdA).length, 4);
});

test("renewal fallback requires the same immutable receipt and exact period; cancellations never use it", () => {
  const period = { provider: "web", providerReceiptKey: "a".repeat(64), periodStart: "2026-10-01T00:00:00Z", periodEnd: "2026-11-01T00:00:00Z" };
  assert.equal(normalizeSubscriptionHistory([event(1, period), event(2, period)], householdA).length, 1);
  const richer = normalizeSubscriptionHistory([event(1, period), event(2, { ...period, previousPlanKey: "premium_monthly" })], householdA);
  assert.equal(richer.length, 1); assert.equal(richer[0].previousPlanKey, "premium_monthly");
  assert.equal(normalizeSubscriptionHistory([event(1, period), event(2, { ...period, providerReceiptKey: "b".repeat(64) })], householdA).length, 2);
  assert.equal(normalizeSubscriptionHistory([event(1, { ...period, providerReceiptKey: null }), event(2, { ...period, providerReceiptKey: null })], householdA).length, 2);
  assert.equal(normalizeSubscriptionHistory([event(1, { ...period, eventType: "cancelled" }), event(2, { ...period, eventType: "cancelled" })], householdA).length, 2);
  assert.equal(normalizeSubscriptionHistory([event(1, { ...period, eventType: "resumed" }), event(2, { ...period, eventType: "resumed" })], householdA).length, 2);
  assert.equal("providerReceiptKey" in normalizeSubscriptionHistory([event(1, period)], householdA)[0], false);
});

test("legacy renewals and short recorded periods are retained without invented month/year durations", () => {
  const rows = Array.from({ length: 4 }, (_, index) => event(index + 1, { createdAt: `2026-10-06T19:${String(index * 5).padStart(2, "0")}:00Z` }));
  assert.equal(normalizeSubscriptionHistory(rows, householdA).length, 4);
  const [short] = normalizeSubscriptionHistory([event(10, { periodStart: "2026-10-06T19:00:00Z", periodEnd: "2026-10-06T19:05:00Z" })], householdA);
  assert.equal(short.renewalInterval, null);
  assert.equal(normalizeSubscriptionHistory([event(11)], householdA)[0].renewalInterval, null);
});

test("historical plans are taken only from recorded previous/new values and invalid periods are omitted", () => {
  const [change] = normalizeSubscriptionHistory([event(1, { eventType: "PRODUCT_CHANGE", previousPlanKey: "premium_monthly", newPlanKey: "premium_yearly", planKey: "free" })], householdA);
  assert.equal(change.previousPlanKey, "premium_monthly"); assert.equal(change.planKey, "premium_yearly");
  const [legacy] = normalizeSubscriptionHistory([event(2, { eventType: "upgraded", planKey: "unknown", periodStart: "2026-10-06T10:00:00Z", periodEnd: "2026-10-01T10:00:00Z" })], householdA);
  assert.equal(legacy.previousPlanKey, null); assert.equal(legacy.planKey, null); assert.equal(legacy.periodStart, null); assert.equal(legacy.periodEnd, null);
});

const mockReaderClient = (rows: Record<string, unknown>[], error: unknown = null) => {
  const calls: Array<[string, ...unknown[]]> = [];
  const chain = {
    select: (selection: string) => { calls.push(["select", selection]); return chain; },
    eq: (column: string, value: string) => { calls.push(["eq", column, value]); return chain; },
    in: (column: string, values: string[]) => { calls.push(["in", column, values]); return chain; },
    order: (column: string, options: unknown) => { calls.push(["order", column, options]); return chain; },
    or: (filter: string) => { calls.push(["or", filter]); return chain; },
    limit: (count: number) => { calls.push(["limit", count]); return Promise.resolve({ data: rows, error }); },
  };
  const client = { from: (table: string) => { calls.push(["from", table]); return chain; } };
  return { calls, reader: createHouseholdSubscriptionHistoryReader(client as unknown as Parameters<typeof createHouseholdSubscriptionHistoryReader>[0]) };
};
const dbRow = (index: number) => ({ id: uuid(index), household_id: householdA, event_type: "renewed", plan_key: "premium_monthly", occurred_at: "2026-10-06T19:15:00.123456+00:00", created_at: "2026-10-06T19:15:00Z" });

test("history query uses household RLS scope, bounded lookahead, safe columns and a precise keyset cursor", async () => {
  const { reader, calls } = mockReaderClient(Array.from({ length: 51 }, (_, index) => dbRow(index + 1)));
  const result = await reader(householdA, { occurredAt: "2026-10-06T21:15:00.123456+02:00", id: uuid(90) });
  assert.equal(result.events.length, 50); assert.equal(result.hasMore, true);
  assert.deepEqual(result.nextCursor, { id: uuid(50), occurredAt: "2026-10-06T19:15:00.123456Z" });
  assert.ok(calls.some(([operation, column, value]) => operation === "eq" && column === "household_id" && value === householdA));
  assert.ok(calls.some(([operation, value]) => operation === "limit" && value === 51));
  assert.equal(calls.find(([operation]) => operation === "or")?.[1], `occurred_at.lt.2026-10-06T19:15:00.123456Z,and(occurred_at.eq.2026-10-06T19:15:00.123456Z,id.lt.${uuid(90)})`);
  const selection = calls.find(([operation]) => operation === "select")?.[1] as string;
  assert.doesNotMatch(selection, /metadata|payload|customer|transaction/);
  assert.match(selection, /provider_receipt_key/);
});

test("untrusted cursor syntax is rejected before issuing any request; backend errors stay errors", async () => {
  const { reader, calls } = mockReaderClient([]);
  await assert.rejects(reader(householdA, { id: "bad),or(id.gt.0)", occurredAt: "2026-10-06T19:00:00Z" }), /cursor/);
  await assert.rejects(reader(householdA, { id: uuid(1), occurredAt: "2026-10-06T19:00:00Z),id.gt.0" }), /cursor/);
  await assert.rejects(reader("bad-household"), /household/);
  assert.deepEqual(calls, []);
  const failure = new Error("Repository unavailable");
  await assert.rejects(mockReaderClient([], failure).reader(householdA), failure);
  assert.deepEqual(await mockReaderClient([]).reader(householdA), { events: [], hasMore: false, nextCursor: null });
});

test("history loading starts synchronously, failures do not become empty success, and Retry succeeds", async () => {
  const first = deferred<HouseholdSubscriptionHistoryPage>();
  let attempts = 0;
  const states: HouseholdHistoryState[] = [];
  const controller = createHouseholdSubscriptionHistoryController(() => ++attempts === 1 ? first.promise : Promise.resolve(page([event()])), (state) => states.push(state));
  const initial = controller.setScope({ userId: "viewer", householdId: householdA });
  assert.equal(controller.getState().loading, true); assert.equal(controller.getState().error, false);
  first.reject(new Error("Offline")); await initial;
  assert.equal(controller.getState().error, true); assert.equal(controller.getState().loading, false);
  await controller.refresh();
  assert.equal(controller.getState().error, false); assert.equal(controller.getState().items.length, 1);
  assert.equal(states[0].loading, true);
});

test("switching household or user clears scope immediately and ignores pending older responses", async () => {
  const first = deferred<HouseholdSubscriptionHistoryPage>();
  const requests: string[] = [];
  const controller = createHouseholdSubscriptionHistoryController((householdId) => { requests.push(householdId); return householdId === householdA ? first.promise : Promise.resolve(page([event(2, { householdId: householdB })])); }, () => undefined);
  const old = controller.setScope({ userId: "owner", householdId: householdA });
  await Promise.resolve();
  const next = controller.setScope({ userId: "viewer", householdId: householdB });
  assert.deepEqual(controller.getState().items, []); assert.equal(controller.getState().loading, true);
  await next; first.resolve(page([event()])); await old;
  assert.deepEqual(controller.getState().items.map((item) => item.householdId), [householdB]);
  assert.deepEqual(requests, [householdA, householdB]);
  await controller.setScope({ userId: null, householdId: householdB });
  assert.deepEqual(controller.getState().items, []); assert.equal(controller.getState().loading, false);
});

test("entitlement revision supersedes older reads without reloading for an identical scope", async () => {
  const first = deferred<HouseholdSubscriptionHistoryPage>();
  let requests = 0;
  const controller = createHouseholdSubscriptionHistoryController(() => ++requests === 1 ? first.promise : Promise.resolve(page([event(2)])), () => undefined);
  const old = controller.setScope({ userId: "owner", householdId: householdA, revision: "active" });
  await Promise.resolve();
  await controller.setScope({ userId: "owner", householdId: householdA, revision: "cancelled" });
  first.resolve(page([event()])); await old;
  assert.deepEqual(controller.getState().items.map((item) => item.id), [uuid(2)]);
  await controller.setScope({ userId: "owner", householdId: householdA, revision: "cancelled" });
  assert.equal(requests, 2);
});

test("older pages coalesce, normalize across pages, preserve loaded rows on failure, and retry the same cursor", async () => {
  const older = deferred<HouseholdSubscriptionHistoryPage>();
  let requests = 0;
  const cursors: unknown[] = [];
  const controller = createHouseholdSubscriptionHistoryController((_householdId, cursor) => {
    cursors.push(cursor); requests += 1;
    if (requests === 1) return Promise.resolve(page([event(1, { provider: "web", providerEventId: "same" })], true));
    if (requests === 2) return older.promise;
    return Promise.resolve(page([event(2, { provider: "web", providerEventId: "same" }), event(3)]));
  }, () => undefined);
  await controller.setScope({ userId: "owner", householdId: householdA });
  const loading = controller.loadMore(); assert.equal(controller.loadMore(), loading);
  assert.equal(controller.getState().loadingMore, true); assert.equal(controller.getState().items.length, 1);
  older.reject(new Error("Offline")); await loading;
  assert.equal(controller.getState().loadMoreError, true); assert.equal(controller.getState().items.length, 1);
  await controller.loadMore();
  assert.equal(controller.getState().loadMoreError, false); assert.equal(controller.getState().items.length, 2); assert.equal(controller.getState().hasMore, false);
  assert.deepEqual(cursors[1], cursors[2]);
});

test("unmount ignores pending responses and StrictMode effect reactivation starts a fresh request", async () => {
  const obsolete = deferred<HouseholdSubscriptionHistoryPage>();
  let calls = 0; const changes: HouseholdHistoryState[] = [];
  const controller = createHouseholdSubscriptionHistoryController(() => ++calls === 1 ? obsolete.promise : Promise.resolve(page([event(2)])), (state) => changes.push(state));
  const old = controller.setScope({ userId: "owner", householdId: householdA }); await Promise.resolve();
  controller.dispose(); const before = changes.length;
  obsolete.resolve(page([event()])); await old; assert.equal(changes.length, before);
  controller.activate(); await controller.setScope({ userId: "owner", householdId: householdA });
  assert.deepEqual(controller.getState().items.map((item) => item.id), [uuid(2)]); assert.equal(calls, 2);
});
