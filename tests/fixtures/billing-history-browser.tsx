import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BillingHistoryTimeline } from "../../src/components/BillingHistoryTimeline";
import { MobileBottomNav } from "../../src/components/AppNavigation";
import { useHouseholdSubscriptionHistory } from "../../src/hooks/useHouseholdSubscriptionHistory";
import { createTranslator } from "../../src/lib/i18n";
import { formatSubscriptionDate } from "../../src/lib/subscriptionUiRules";
import type { RawSubscriptionHistoryEvent } from "../../src/lib/subscriptionHistoryModel";
import type { HouseholdSubscriptionHistoryCursor, HouseholdSubscriptionHistoryPage } from "../../src/lib/householdSubscriptionHistory";

const householdA = "11111111-1111-4111-8111-111111111111";
const householdB = "22222222-2222-4222-8222-222222222222";
const uuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const rawEvent = (index: number, changes: Partial<RawSubscriptionHistoryEvent> = {}): RawSubscriptionHistoryEvent => ({
  id: uuid(index), householdId: householdA, eventType: "renewed", planKey: "premium_yearly",
  createdAt: new Date(Date.UTC(2026, 9, 6, 20, 15) - index * 86400000).toISOString(),
  provider: "web", providerEventId: `private-delivery-${index}`, ...changes,
});
const largeHistory = Array.from({ length: 50 }, (_, index) => rawEvent(index + 1, { eventType: index % 3 === 0 ? "payment_failed" : index % 3 === 1 ? "plan_changed" : "renewed" }));
const referenceHistory = [
  rawEvent(1, { createdAt: "2026-10-06T20:15:00Z", periodStart: "2026-10-06T20:15:00Z", periodEnd: "2027-10-06T20:15:00Z" }),
  rawEvent(2, { createdAt: "2026-10-06T20:05:00Z", eventType: "PRODUCT_CHANGE", previousPlanKey: "premium_monthly", newPlanKey: "premium_yearly" }),
  rawEvent(3, { createdAt: "2026-10-06T20:00:00Z", eventType: "BILLING_ISSUE" }),
  rawEvent(4, { createdAt: "2026-09-20T15:56:00Z", eventType: "cancelled" }),
  rawEvent(5, { createdAt: "2026-09-01T15:56:00Z", eventType: "expired" }),
  rawEvent(6, { createdAt: "2025-10-05T15:56:00Z", eventType: "INITIAL_PURCHASE" }),
];
const makePage = (events: RawSubscriptionHistoryEvent[], hasMore = false): HouseholdSubscriptionHistoryPage => ({ events, hasMore,
  nextCursor: hasMore ? { id: events[events.length - 1].id, occurredAt: events[events.length - 1].createdAt } : null });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
};
const initial = deferred<HouseholdSubscriptionHistoryPage>();
const heldResponses = new Map<string, Promise<HouseholdSubscriptionHistoryPage>>([[householdA, initial.promise]]);
const repositoryPages = new Map<string, HouseholdSubscriptionHistoryPage>([[householdA, makePage(largeHistory, true)], [householdB, makePage([rawEvent(80, { householdId: householdB, eventType: "payment_succeeded" })])]]);
const olderPage = makePage(Array.from({ length: 4 }, (_, index) => rawEvent(index + 51)));
let failInitial = false;
let failOlder = false;
const requests: Array<{ householdId: string; cursor: HouseholdSubscriptionHistoryCursor | null }> = [];
// Only the household history repository and authenticated identity are replaced.
// The actual hook, normalization, timeline, navigation, events and CSS are used.
const lookup = async (householdId: string, cursor: HouseholdSubscriptionHistoryCursor | null = null) => {
  requests.push({ householdId, cursor });
  if (heldResponses.has(householdId)) return heldResponses.get(householdId)!;
  if (!cursor && failInitial) { failInitial = false; throw new Error("Fixture repository unavailable"); }
  if (cursor && failOlder) { failOlder = false; throw new Error("Fixture older page unavailable"); }
  return cursor ? olderPage : repositoryPages.get(householdId) ?? makePage([]);
};
let controls: { setHousehold: (householdId: string) => void; setUser: (userId: string) => void; setRevision: (revision: string) => void; refresh: () => Promise<void> } | null = null;
const Fixture = () => {
  const [householdId, setHousehold] = useState(householdA);
  const [userId, setUser] = useState("viewer-fixture");
  const [revision, setRevision] = useState("active");
  const history = useHouseholdSubscriptionHistory({ userId, householdId, revision }, lookup);
  controls = { setHousehold, setUser, setRevision, refresh: history.refresh };
  return <main className="fixture-shell"><section className="pricing-page">
    <BillingHistoryTimeline householdId={householdId} items={history.items} loading={history.loading} error={history.error}
      language="en" hasMore={history.hasMore} loadingMore={history.loadingMore} loadMoreError={history.loadMoreError}
      onRetry={() => { void history.refresh(); }} onLoadMore={() => { void history.loadMore(); }} />
  </section><MobileBottomNav currentPage="menu" onAddPlant={() => undefined} t={createTranslator("en")} /></main>;
};

const scene = new URLSearchParams(location.search).get("scene") ?? "timeline";
const result = { checks: [] as string[], failures: [] as string[], scene, mobile: matchMedia("(max-width: 780px)").matches,
  viewport: { width: innerWidth, height: innerHeight }, limitations: ["Programmatic DOM interactions, not trusted physical input.", "Actual history hook, normalized model, timeline and navigation with repository/auth boundaries replaced; not the full PricingPage or live backend.", "Mobile uses a local 390px CSS iframe, not device emulation or safe-area hardware."] };
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const check = (message: string, run: () => void) => { run(); result.checks.push(message); };
const waitFor = async (condition: () => unknown, label: string) => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (condition()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Timed out waiting for ${label}`);
};
const cards = () => Array.from(document.querySelectorAll<HTMLElement>(".billing-history-card"));
const button = (name: string) => {
  const control = Array.from(document.querySelectorAll<HTMLButtonElement>(".billing-history-timeline button")).find((candidate) => candidate.textContent?.trim() === name);
  assert(control, `Missing button ${name}`); return control!;
};
const refreshRows = async (rows: RawSubscriptionHistoryEvent[], hasMore = false) => {
  repositoryPages.set(householdA, makePage(rows, hasMore));
  await controls!.refresh();
  await waitFor(() => document.querySelector(".billing-history-timeline")?.getAttribute("aria-busy") === "false", "repository refresh render");
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};
const scrollToEnd = async () => {
  const scrolling = document.scrollingElement!;
  scrolling.scrollTop = scrolling.scrollHeight;
  await waitFor(() => scrolling.scrollTop >= scrolling.scrollHeight - scrolling.clientHeight - 1, "end of document");
};

const run = async () => {
  createRoot(document.getElementById("root")!).render(<Fixture />);
  await waitFor(() => controls && document.querySelectorAll(".billing-history-skeleton-row").length === 3, "initial loading skeletons");
  check("initial authenticated Viewer load shows skeletons without an empty flash", () => assert(!document.querySelector(".billing-history-state"), "No empty state before repository completion"));
  heldResponses.delete(householdA); initial.resolve(makePage(largeHistory, true));
  await waitFor(() => cards().length === 15, "initial fifteen history cards");
  check("initial display is bounded to fifteen and Viewer history is readable", () => assert(button("Show older activity") && cards().length === 15, "Initial display must be bounded"));
  const beforeLocal = requests.length;
  button("Show older activity").click(); await waitFor(() => cards().length === 30, "local older expansion");
  check("older loaded activity expands without querying the backend", () => assert(requests.length === beforeLocal, "Local expansion must not fetch"));
  await refreshRows(referenceHistory);
  const beforeFilters = requests.length;
  button("Billing").click(); await waitFor(() => cards().length === 1, "billing filter");
  check("Billing chip selects payment issues and has an accessible selected state", () => assert(cards()[0].textContent?.includes("Payment issue") && button("Billing").getAttribute("aria-pressed") === "true", "Billing filter mismatch"));
  button("Plan changes").click(); await waitFor(() => cards().length === 2, "plan filter");
  check("Plan changes includes the historical transition and subscription start", () => assert(cards()[0].textContent?.includes("Changed to Yearly") && cards()[1].textContent?.includes("Subscription started"), "Plan filter mismatch"));
  button("Renewal").click(); await waitFor(() => cards().length === 3, "renewal filter");
  check("Renewal includes renewed, cancelled and expired lifecycle events", () => {
    const text = cards().map((card) => card.textContent).join(" ");
    assert(text.includes("Subscription renewed") && text.includes("Renewal cancelled") && text.includes("Subscription expired"), "Lifecycle filter mismatch");
  });
  button("All").click(); await waitFor(() => cards().length === 6, "All filter");
  check("All restores every meaningful event without chip network requests", () => assert(requests.length === beforeFilters, "Filter changes must remain local"));
  check("events are grouped once per month and newest first", () => {
    const headings = Array.from(document.querySelectorAll(".billing-history-month > h4"), (heading) => heading.textContent);
    assert(JSON.stringify(headings) === JSON.stringify(["October 2026", "September 2026", "October 2025"]), "Month grouping mismatch");
    assert(cards()[0].querySelector("time")?.textContent === formatSubscriptionDate(referenceHistory[0].createdAt, "en"), "App timestamp formatting must be used");
  });
  check("history cards are informational and do not expose provider data", () => {
    const section = document.querySelector(".billing-history-timeline")!;
    assert(!/private-delivery|INITIAL_PURCHASE|PRODUCT_CHANGE|BILLING_ISSUE/.test(section.innerHTML), "Provider metadata leaked");
    assert(!section.querySelector("article button, article a, article[role='button']"), "No fake detail or management actions");
  });
  check("plan-change text uses only recorded previous and next historical plans", () => assert(document.body.textContent?.includes("Switched from Household Premium (Monthly) to Household Premium (Yearly)."), "Historical facts missing"));

  const stale = deferred<HouseholdSubscriptionHistoryPage>(); heldResponses.set(householdA, stale.promise);
  const obsolete = controls!.refresh();
  await waitFor(() => document.querySelector(".billing-history-loading"), "old household loading");
  controls!.setHousehold(householdB);
  await waitFor(() => cards().length === 1 && cards()[0].textContent?.includes("Payment successful"), "new household history");
  heldResponses.delete(householdA); stale.resolve(makePage(referenceHistory)); await obsolete;
  check("switching households masks old rows and ignores the stale response", () => assert(cards().length === 1 && cards()[0].textContent?.includes("Payment successful"), "Old household response leaked"));
  const otherUser = deferred<HouseholdSubscriptionHistoryPage>(); heldResponses.set(householdB, otherUser.promise);
  controls!.setUser("second-viewer-fixture");
  await waitFor(() => document.querySelector(".billing-history-loading"), "new user scoped loading");
  check("changing account identity masks previously loaded household history immediately", () => assert(cards().length === 0, "New identity must not see old account rows"));
  heldResponses.delete(householdB); otherUser.resolve(makePage([]));
  await waitFor(() => document.body.textContent?.includes("No billing history yet"), "new account empty history");
  controls!.setUser("viewer-fixture"); controls!.setHousehold(householdA);
  await waitFor(() => cards().length === 6, "restored household");
  check("household switching resets filters to All", () => assert(button("All").getAttribute("aria-pressed") === "true", "Filter must reset per household"));

  failInitial = true; await controls!.refresh();
  await waitFor(() => document.querySelector(".billing-history-error"), "history error state");
  check("repository failure shows an announced error rather than an empty history", () => assert(document.querySelector(".billing-history-error")?.getAttribute("role") === "alert" && !document.body.textContent?.includes("No billing history yet"), "Error must remain distinct from empty"));
  button("Try again").click(); await waitFor(() => cards().length === 6 && !document.querySelector(".billing-history-error"), "Retry success");
  check("Retry reaches the real hook repository boundary and recovers", () => assert(cards().length === 6, "Retry did not recover"));
  const beforeRevision = requests.length;
  controls!.setRevision("cancelled"); await waitFor(() => requests.length > beforeRevision && !document.querySelector(".billing-history-loading"), "entitlement revision refresh");
  check("history-related entitlement revision refreshes the selected household", () => assert(requests[requests.length - 1].householdId === householdA, "Wrong household revision scope"));
  await refreshRows([]);
  check("completed empty history explains future household activity", () => assert(document.body.textContent?.includes("No billing history yet") && document.body.textContent.includes("Subscription changes and billing events"), "Empty state copy missing"));
  button("Billing").click(); await waitFor(() => document.body.textContent?.includes("No activity in this category"), "filtered empty");
  check("empty category offers a useful filter correction", () => assert(document.body.textContent?.includes("Choose another filter"), "Filter correction missing"));

  button("All").click(); await refreshRows(largeHistory, true);
  await waitFor(() => cards().length === 15, "pagination reset");
  for (const count of [30, 45, 50]) { button("Show older activity").click(); await waitFor(() => cards().length === count, `local expansion to ${count}`); }
  failOlder = true; button("Show older activity").click();
  await waitFor(() => document.querySelector(".billing-history-older-error"), "older page error");
  check("older page failure preserves already loaded history and offers retry", () => assert(cards().length === 50 && button("Try again"), "Older failure hid loaded history"));
  const failedCursor = requests[requests.length - 1].cursor;
  button("Try again").click(); await waitFor(() => cards().length === 54 && !document.querySelector(".billing-history-pagination"), "older page Retry success");
  check("older activity resumes with the same cursor and appends normalized events", () => assert(JSON.stringify(requests[requests.length - 1].cursor) === JSON.stringify(failedCursor), "Older retry changed cursor"));
  await scrollToEnd();
  check("mobile cards and timestamps do not overflow horizontally", () => {
    assert(document.documentElement.scrollWidth <= innerWidth, "Page overflows horizontally");
    for (const card of cards()) assert(card.getBoundingClientRect().right <= innerWidth + 1 && card.scrollWidth <= card.clientWidth, "Card overflows");
  });
  check("the final rendered card and timestamp scroll fully above the actual fixed navigation", () => {
    const navigation = document.querySelector(".mobile-bottom-nav")!;
    const last = cards()[cards().length - 1].getBoundingClientRect();
    if (result.mobile) {
      assert(getComputedStyle(navigation).position === "fixed" && getComputedStyle(navigation).display !== "none", "Actual mobile navigation must be visible");
      assert(last.bottom + 8 < navigation.getBoundingClientRect().top && last.top >= 0, "Final history card is covered by navigation");
    } else assert(getComputedStyle(navigation).display === "none", "Desktop mobile navigation must remain hidden");
  });

  await refreshRows(referenceHistory);
  if (scene === "empty") await refreshRows([]);
  if (scene === "loading") { heldResponses.set(householdA, new Promise(() => undefined)); void controls!.refresh(); await waitFor(() => document.querySelector(".billing-history-loading"), "loading screenshot"); }
  if (scene === "error") { failInitial = true; await controls!.refresh(); await waitFor(() => document.querySelector(".billing-history-error"), "error screenshot"); }
  if (scene === "bottom") await scrollToEnd(); else document.scrollingElement!.scrollTop = 0;
};

void run().catch((error: unknown) => { result.failures.push(error instanceof Error ? error.message : "Unknown fixture failure"); }).finally(() => {
  document.getElementById("billing-history-browser-results")!.textContent = JSON.stringify(result);
});
