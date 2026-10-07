import { StrictMode, useState } from "react";
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
const generateHistory = (count: number) => Array.from({ length: count }, (_, index) => rawEvent(index + 1, {
  eventType: index % 3 === 0 ? "payment_failed" : index % 3 === 1 ? "plan_changed" : "renewed",
}));
const largeHistory = generateHistory(54);
// A duplicate delivery on another bounded page must not inflate the exact total.
const pagedHistory = [...largeHistory, rawEvent(999, { providerEventId: "private-delivery-1" })];
const referenceHistory = [
  rawEvent(1, { createdAt: "2026-10-06T20:15:00Z", periodStart: "2026-10-06T20:15:00Z", periodEnd: "2027-10-06T20:15:00Z" }),
  rawEvent(2, { createdAt: "2026-10-06T20:05:00Z", eventType: "PRODUCT_CHANGE", previousPlanKey: "premium_monthly", newPlanKey: "premium_yearly" }),
  rawEvent(3, { createdAt: "2026-10-06T20:00:00Z", eventType: "BILLING_ISSUE" }),
  rawEvent(4, { createdAt: "2026-09-20T15:56:00Z", eventType: "cancelled" }),
  rawEvent(5, { createdAt: "2026-09-01T15:56:00Z", eventType: "expired" }),
  rawEvent(6, { createdAt: "2026-08-20T15:56:00Z", eventType: "INITIAL_PURCHASE" }),
  rawEvent(7, { createdAt: "2026-08-19T15:56:00Z", eventType: "resumed" }),
  rawEvent(8, { createdAt: "2026-08-18T15:56:00Z" }),
  rawEvent(9, { createdAt: "2026-08-17T15:56:00Z", eventType: "payment_succeeded" }),
  rawEvent(10, { createdAt: "2026-07-01T15:56:00Z" }),
  rawEvent(11, { createdAt: "2026-06-01T15:56:00Z", eventType: "plan_changed" }),
];
const makePage = (events: RawSubscriptionHistoryEvent[], hasMore = false): HouseholdSubscriptionHistoryPage => ({ events, hasMore,
  nextCursor: hasMore ? { id: events[events.length - 1].id, occurredAt: events[events.length - 1].createdAt } : null });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
};
const initial = deferred<HouseholdSubscriptionHistoryPage>();
const initialOlder = deferred<HouseholdSubscriptionHistoryPage>();
const heldInitial = new Map<string, Promise<HouseholdSubscriptionHistoryPage>>([[householdA, initial.promise]]);
const heldOlder = new Map<string, Promise<HouseholdSubscriptionHistoryPage>>([[householdA, initialOlder.promise]]);
const repositoryRows = new Map<string, RawSubscriptionHistoryEvent[]>([
  [householdA, pagedHistory], [householdB, [rawEvent(80, { householdId: householdB, eventType: "payment_succeeded" })]],
]);
let failInitial = false;
let failOlder = false;
const requests: Array<{ householdId: string; cursor: HouseholdSubscriptionHistoryCursor | null }> = [];
const repositoryPage = (householdId: string, cursor: HouseholdSubscriptionHistoryCursor | null) => {
  const rows = repositoryRows.get(householdId) ?? [];
  const start = cursor ? rows.findIndex((row) => row.id === cursor.id) + 1 : 0;
  return makePage(rows.slice(start, start + 50), rows.length > start + 50);
};
// Only the history repository and authenticated identity are substituted. The
// production hook, normalization, timeline, navigation and stylesheet are used.
const lookup = async (householdId: string, cursor: HouseholdSubscriptionHistoryCursor | null = null) => {
  requests.push({ householdId, cursor });
  const held = cursor ? heldOlder.get(householdId) : heldInitial.get(householdId);
  if (held) return held;
  if (!cursor && failInitial) { failInitial = false; throw new Error("Fixture repository unavailable"); }
  if (cursor && failOlder) { failOlder = false; throw new Error("Fixture older page unavailable"); }
  return repositoryPage(householdId, cursor);
};
let controls: { setHousehold: (householdId: string) => void; setUser: (userId: string) => void; setRevision: (revision: string) => void; refresh: () => Promise<void> } | null = null;
const Fixture = () => {
  const [householdId, setHousehold] = useState(householdA);
  const [userId, setUser] = useState("viewer-fixture");
  const [revision, setRevision] = useState("active");
  const history = useHouseholdSubscriptionHistory({ userId, householdId, revision }, lookup);
  controls = { setHousehold, setUser, setRevision, refresh: history.refresh };
  return <main className="fixture-shell"><div className="fixture-before-history" aria-hidden="true" /><section className="pricing-page">
    <BillingHistoryTimeline householdId={householdId} items={history.items} loading={history.loading} error={history.error}
      language="en" hasMore={history.hasMore} loadingMore={history.loadingMore} loadMoreError={history.loadMoreError}
      onRetry={() => { void history.refresh(); }} onLoadMore={() => { void history.loadMore(); }} />
  </section><MobileBottomNav currentPage="menu" onAddPlant={() => undefined} t={createTranslator("en")} /></main>;
};

const parameters = new URLSearchParams(location.search);
const scene = parameters.get("scene") ?? "first";
const result = { checks: [] as string[], failures: [] as string[], scene, mobile: matchMedia("(max-width: 780px)").matches,
  reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches, viewport: { width: innerWidth, height: innerHeight },
  pageMeasurements: [] as Array<{ label: string; height: number; minimum: string; page: string | null | undefined }>,
  limitations: ["Programmatic DOM clicks, focus and touch events; not trusted physical keyboard or swipe input.", "Actual history hook, normalization, timeline and navigation with repository/auth boundaries substituted; not the full PricingPage or live backend.", "Mobile uses a local 390px CSS iframe, not device emulation or hardware safe areas. Document scrolling is verified programmatically; native pull-to-refresh and browser edge navigation are not exercised.", "Reduced-motion dump-dom runs can retain stale computed bounds after inline height changes. They verify the committed height reservation and disabled animation; normal-motion runs additionally verify measured frame stability."] };
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const check = (message: string, run: () => void) => { run(); result.checks.push(message); };
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const waitFor = async (condition: () => unknown, label: string) => {
  for (let attempt = 0; attempt < 300; attempt += 1) { if (condition()) return; await tick(); }
  throw new Error(`Timed out waiting for ${label}`);
};
const section = () => document.querySelector<HTMLElement>(".billing-history-timeline")!;
const cards = () => Array.from(document.querySelectorAll<HTMLElement>(".billing-history-card"));
const pager = () => document.querySelector<HTMLElement>(".billing-history-pagination");
const button = (name: string) => {
  const control = Array.from(section().querySelectorAll<HTMLButtonElement>("button")).find((candidate) => candidate.textContent?.trim() === name || candidate.getAttribute("aria-label") === name);
  assert(control, `Missing button ${name}`); return control!;
};
const previous = () => button("Previous billing history page");
const next = () => button("Next billing history page");
const pageLabel = () => document.querySelector(".billing-history-page-indicator .sr-only")?.textContent;
const recordPage = (label: string) => {
  const frame = document.querySelector<HTMLElement>(".billing-history-page");
  if (frame) result.pageMeasurements.push({ label, height: frame.getBoundingClientRect().height, minimum: getComputedStyle(frame).minHeight, page: pageLabel() });
};
const assertPage = (page: number, pages: number, shown: number, total: number) => {
  assert(pageLabel() === `Page ${page} of ${pages}`, `Expected page ${page} of ${pages}; got ${pageLabel()}`);
  assert(pager()?.querySelector(":scope > span")?.textContent === `${shown} of ${total} events`, "Selected count is inaccurate");
  assert(cards().length === shown && shown <= 4, "Visible history must remain bounded to four");
};
const clickPage = async (direction: "next" | "previous", page: number, pages: number) => {
  recordPage(`before ${direction}`);
  (direction === "next" ? next() : previous()).click();
  await waitFor(() => pageLabel() === `Page ${page} of ${pages}`, `${direction} page ${page}`);
  await tick();
  recordPage(`after ${direction}`);
};
const refreshRows = async (rows: RawSubscriptionHistoryEvent[]) => {
  repositoryRows.set(householdA, rows);
  await controls!.refresh(); await tick();
  await waitFor(() => section().getAttribute("aria-busy") === "false", "completed history refresh"); await tick();
};
const scrollToEnd = async () => {
  const scrolling = document.scrollingElement!;
  scrolling.scrollTop = scrolling.scrollHeight;
  await waitFor(() => scrolling.scrollTop >= scrolling.scrollHeight - scrolling.clientHeight - 1, "end of document");
};
const touchGesture = (startX: number, startY: number, endX: number, endY: number, options: { cancelled?: boolean; target?: Element; intermediate?: [number, number] } = {}) => {
  const target = options.target ?? document.querySelector(".billing-history-page")!;
  const touch = (x: number, y: number) => new Touch({ identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y });
  const dispatch = (type: string, x: number, y: number, ended = false) => {
    const point = touch(x, y);
    const event = new TouchEvent(type, { bubbles: true, cancelable: true, touches: ended ? [] : [point], targetTouches: ended ? [] : [point], changedTouches: [point] });
    target.dispatchEvent(event); assert(!event.defaultPrevented, `${type} must leave native scrolling uncancelled`);
  };
  dispatch("touchstart", startX, startY);
  if (options.intermediate) dispatch("touchmove", ...options.intermediate);
  dispatch("touchmove", endX, endY);
  dispatch(options.cancelled ? "touchcancel" : "touchend", endX, endY, true);
};

const run = async () => {
  createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
  await waitFor(() => controls && document.querySelectorAll(".billing-history-skeleton-row").length === 3, "initial skeletons");
  check("initial Viewer load shows skeletons without empty state or a provisional page count", () => assert(!document.querySelector(".billing-history-state") && !pager(), "Initial load flashed empty or pagination"));
  heldInitial.delete(householdA); initial.resolve(repositoryPage(householdA, null));
  await waitFor(() => requests.some((request) => request.cursor), "bounded older read");
  check("exact counts remain hidden while the remaining bounded history is loading", () => assert(section().getAttribute("aria-busy") === "true" && !pager() && cards().length === 0, "Partial totals must not be presented as complete"));
  heldOlder.delete(householdA); initialOlder.resolve(repositoryPage(householdA, requests[requests.length - 1].cursor));
  await waitFor(() => pageLabel() === "Page 1 of 14", "completed normalized history");
  check("StrictMode effect replay still completes all bounded history reads", () => assert(requests.filter((request) => !request.cursor).length >= 2, "Development StrictMode did not replay the initial effect"));
  check("bounded reads preserve cross-page deduplication and show only four of fifty-four events", () => assertPage(1, 14, 4, 54));
  const beforeNavigation = requests.length;
  await clickPage("next", 2, 14); await clickPage("previous", 1, 14);
  check("local page arrows navigate without further repository requests", () => assert(requests.length === beforeNavigation, "Page arrows must remain local"));

  await refreshRows(referenceHistory);
  check("eleven events create three pages and the first slice contains the newest four", () => {
    assertPage(1, 3, 4, 11); assert(previous().disabled && !next().disabled, "First-page disabled controls are wrong");
    assert(cards().every((card, index) => Date.parse(card.querySelector("time")!.dateTime) === Date.parse(referenceHistory[index].createdAt)), "First slice is not newest first");
  });
  check("month headings are unique within the visible page only", () => {
    const headings = Array.from(document.querySelectorAll(".billing-history-month > h4"), (heading) => heading.textContent);
    assert(JSON.stringify(headings) === JSON.stringify(["October 2026", "September 2026"]), "First-page month grouping mismatch");
    assert(cards()[0].querySelector("time")?.textContent === formatSubscriptionDate(referenceHistory[0].createdAt, "en"), "App date formatting changed");
  });
  check("cards retain semantic icons, badges and historical text without exposing provider metadata", () => {
    assert(section().querySelectorAll(".billing-history-event-icon svg").length === 4 && section().querySelectorAll(".billing-history-badge").length === 4, "Existing card elements changed");
    assert(!/private-delivery|INITIAL_PURCHASE|PRODUCT_CHANGE|BILLING_ISSUE/.test(section().innerHTML), "Provider metadata leaked");
    assert(!section().querySelector("article button, article a, article[role='button']"), "History cards acquired fake actions");
    assert(section().textContent?.includes("Switched from Household Premium (Monthly) to Household Premium (Yearly)."), "Recorded transition facts changed");
  });
  await clickPage("next", 2, 3);
  check("middle-page arrows select the next four chronological events", () => {
    assertPage(2, 3, 4, 11); assert(!previous().disabled && !next().disabled, "Middle-page buttons disabled");
    assert(cards().every((card, index) => Date.parse(card.querySelector("time")!.dateTime) === Date.parse(referenceHistory[index + 4].createdAt)), "Middle slice ordering mismatch");
  });
  const middleHeight = document.querySelector(".billing-history-page")!.getBoundingClientRect().height;
  await clickPage("next", 3, 3);
  check("the final page contains the remaining three and keeps disabled arrows visible", () => { assertPage(3, 3, 3, 11); assert(!previous().disabled && next().disabled && pager()?.querySelectorAll("button").length === 2, "Last-page controls wrong"); });
  check("shorter final slices reserve the measured page height without an inner scrollbar", () => {
    const frame = document.querySelector<HTMLElement>(".billing-history-page")!;
    assert(parseFloat(frame.style.minHeight) >= middleHeight - 1, "Final page did not reserve the preceding frame height");
    if (!result.reducedMotion) assert(frame.getBoundingClientRect().height >= middleHeight - 1, "Final page frame shrank");
  });
  const reservedHeight = document.querySelector<HTMLElement>(".billing-history-page")!.style.minHeight;
  window.dispatchEvent(new Event("resize")); await tick();
  check("a height-only resize notification preserves the current page reservation", () => assert(document.querySelector<HTMLElement>(".billing-history-page")!.style.minHeight === reservedHeight, "Unchanged viewport width reset history height"));
  previous().focus();
  check("the enabled previous arrow is focusable at the final disabled-next boundary", () => {
    assert(document.activeElement === previous(), "Previous arrow cannot receive focus");
    next().focus(); assert(document.activeElement === previous(), "Disabled next arrow accepted focus");
  });
  await clickPage("previous", 2, 3);
  check("previous-page activation retains semantic button focus", () => assert(document.activeElement === previous(), "Previous focus was lost"));
  const beforeFilters = requests.length;
  button("Renewal").click(); await waitFor(() => pageLabel() === "Page 1 of 2", "renewal filter reset");
  check("changing filters resets to page one and counts only six matching renewal events", () => { assertPage(1, 2, 4, 6); assert(button("Renewal").getAttribute("aria-pressed") === "true", "Selected filter is not accessible"); });
  await clickPage("next", 2, 2);
  check("filtered pagination selects older matching events rather than filtering a global slice", () => { assertPage(2, 2, 2, 6); assert(cards().every((card) => card.textContent?.includes("Subscription renewed")), "Filtered older events mismatch"); });
  button("Billing").click(); await waitFor(() => cards().length === 2, "billing filter");
  check("a single filtered page hides unnecessary pagination and filters do not refetch", () => assert(!pager() && requests.length === beforeFilters && cards()[0].textContent?.includes("Payment issue"), "Single-page or local filtering mismatch"));
  button("All").click(); await waitFor(() => pageLabel() === "Page 1 of 3", "All reset");
  await clickPage("next", 2, 3); await clickPage("next", 3, 3);
  await refreshRows(referenceHistory.slice(0, 5));
  check("a completed smaller history safely clamps the current older page", () => assertPage(2, 2, 1, 5));
  await clickPage("previous", 1, 2);
  check("five events create two pages with four newest entries on page one", () => assertPage(1, 2, 4, 5));
  await refreshRows(referenceHistory.slice(0, 4));
  check("four events hide pagination entirely", () => assert(cards().length === 4 && !pager(), "A single page must not show 1 of 1 controls"));
  await refreshRows(referenceHistory); await clickPage("next", 2, 3);
  await refreshRows([rawEvent(90, { createdAt: "2026-10-07T20:15:00Z" }), ...referenceHistory]);
  check("new history preserves a valid older page rather than jumping to the newest page", () => assertPage(2, 3, 4, 12));
  button("Billing").click(); await tick(); button("All").click(); await waitFor(() => pageLabel() === "Page 1 of 3", "return to first page");
  check("new activity is newest first when page one is selected", () => assert(cards()[0].querySelector("time")!.dateTime.startsWith("2026-10-07T20:15:00"), "New event was not first"));

  check("arrows are focusable semantic buttons with announced pages and adequate touch targets", () => {
    const control = next(); control.focus();
    assert(control.tagName === "BUTTON" && control.type === "button" && control.tabIndex === 0 && document.activeElement === control, "Next arrow is not keyboard focusable");
    assert(document.querySelector(".billing-history-page-indicator")?.getAttribute("aria-live") === "polite", "Page changes are not announced");
    for (const arrow of [previous(), next()]) { const bounds = arrow.getBoundingClientRect(); assert(bounds.width >= 44 && bounds.height >= 44, "Arrow touch target below 44px"); }
  });
  next().click(); await waitFor(() => pageLabel() === "Page 2 of 3", "focused button activation");
  check("focused button activation retains focus and navigates without swipe", () => assert(document.activeElement === next(), "Focus was lost when the visible slice changed"));
  await clickPage("previous", 1, 3);
  document.scrollingElement!.scrollTop = 40;
  const scrollBeforePage = document.scrollingElement!.scrollTop;
  await clickPage("next", 2, 3); await tick();
  check("page changes do not scroll the application to the document top", () => assert(document.scrollingElement!.scrollTop >= scrollBeforePage, "Page navigation jumped to the top"));

  await refreshRows(referenceHistory); button("Renewal").click(); await tick(); button("All").click(); await waitFor(() => pageLabel() === "Page 1 of 3", "gesture first page");
  touchGesture(260, 220, 150, 224); await tick();
  if (result.mobile) {
    await waitFor(() => pageLabel() === "Page 2 of 3", "left mobile swipe");
    check("an intentional mobile swipe left advances one page without cancelling touch defaults", () => assertPage(2, 3, 4, 11));
    touchGesture(120, 220, 240, 224); await waitFor(() => pageLabel() === "Page 1 of 3", "right mobile swipe");
    check("an intentional mobile swipe right returns to the previous page", () => assertPage(1, 3, 4, 11));
  } else check("desktop touch gestures do not add drag-to-page navigation", () => assertPage(1, 3, 4, 11));
  for (const [startX, startY, endX, endY, options] of [
    [180, 180, 184, 300, {}], [240, 180, 205, 181, {}], [240, 180, 150, 255, {}],
    [15, 180, 150, 181, {}], [250, 180, 140, 181, { cancelled: true }],
    [250, 180, 130, 183, { intermediate: [252, 220] as [number, number] }],
  ] as const) { touchGesture(startX, startY, endX, endY, options); await tick(); assertPage(1, 3, 4, 11); }
  check("vertical, small, diagonal, edge and cancelled gestures leave the selected page unchanged", () => assertPage(1, 3, 4, 11));
  const slider = document.createElement("input"); slider.type = "range";
  document.querySelector(".billing-history-page")!.append(slider);
  touchGesture(250, 180, 130, 183, { target: slider }); await tick(); slider.remove();
  check("touch gestures originating on an interactive slider do not paginate", () => assertPage(1, 3, 4, 11));
  const scrollStart = document.scrollingElement!.scrollTop;
  document.scrollingElement!.scrollTop = scrollStart + 60;
  check("the document remains vertically scrollable without a nested history scroll pane", () => {
    assert(document.scrollingElement!.scrollTop > scrollStart, "Document cannot scroll vertically");
    for (const element of [section(), ...section().querySelectorAll<HTMLElement>("*")]) assert(!["auto", "scroll"].includes(getComputedStyle(element).overflowY) || element.scrollHeight <= element.clientHeight, "History introduced a nested vertical scrolling area");
    assert(!["none", "pan-x"].includes(getComputedStyle(document.querySelector(".billing-history-page")!).touchAction), "History restricts native touch scrolling");
  });
  check("page animations honor the browser reduced-motion preference", () => {
    const style = getComputedStyle(document.querySelector(".billing-history-groups")!);
    if (result.reducedMotion) assert(style.animationName === "none", "Reduced motion still animates history");
    else assert(style.animationName === "billing-history-page-enter" && style.animationDuration === "0.18s", "Page animation changed from the subtle 180ms fade");
  });

  const stale = deferred<HouseholdSubscriptionHistoryPage>(); heldInitial.set(householdA, stale.promise);
  const obsolete = controls!.refresh(); await waitFor(() => document.querySelector(".billing-history-loading"), "old household loading");
  controls!.setHousehold(householdB);
  await waitFor(() => cards().length === 1 && cards()[0].textContent?.includes("Payment successful"), "new household history");
  heldInitial.delete(householdA); stale.resolve(makePage(referenceHistory)); await obsolete;
  check("household switching masks old rows and ignores stale responses", () => assert(cards().length === 1 && !pager() && cards()[0].textContent?.includes("Payment successful"), "Old household response leaked"));
  const otherUser = deferred<HouseholdSubscriptionHistoryPage>(); heldInitial.set(householdB, otherUser.promise);
  controls!.setUser("second-viewer-fixture"); await waitFor(() => document.querySelector(".billing-history-loading"), "account scoped loading");
  check("account identity changes mask old history and pagination immediately", () => assert(cards().length === 0 && !pager(), "New account saw old rows"));
  heldInitial.delete(householdB); otherUser.resolve(makePage([])); await waitFor(() => section().textContent?.includes("No billing history yet"), "account empty history");
  repositoryRows.set(householdA, referenceHistory); controls!.setUser("viewer-fixture"); controls!.setHousehold(householdA);
  await waitFor(() => pageLabel() === "Page 1 of 3", "restored household");
  check("household changes reset filter and page to the newest All slice", () => { assertPage(1, 3, 4, 11); assert(button("All").getAttribute("aria-pressed") === "true", "Filter did not reset"); });
  failInitial = true; await controls!.refresh(); await waitFor(() => document.querySelector(".billing-history-error"), "initial error");
  check("initial errors announce Retry and hide rows and misleading pagination", () => assert(document.querySelector(".billing-history-error")?.getAttribute("role") === "alert" && !pager() && cards().length === 0, "Error state misrepresented history"));
  button("Try again").click(); await waitFor(() => pageLabel() === "Page 1 of 3", "initial Retry");
  check("initial Retry recovers through the actual history hook", () => assertPage(1, 3, 4, 11));
  const beforeRevision = requests.length;
  controls!.setRevision("cancelled"); await waitFor(() => requests.length > beforeRevision && section().getAttribute("aria-busy") === "false", "revision refresh");
  check("entitlement revisions refresh only the selected household history", () => assert(requests[requests.length - 1].householdId === householdA, "Revision refreshed the wrong household"));

  repositoryRows.set(householdA, pagedHistory); failOlder = true; await controls!.refresh();
  await waitFor(() => document.querySelector(".billing-history-error"), "older error");
  const failedCursor = requests[requests.length - 1].cursor;
  const beforeFailedRetry = requests.length; await tick(); await tick();
  check("older-page failure pauses automatic reads and hides incomplete exact totals", () => assert(failedCursor && requests.length === beforeFailedRetry && cards().length === 0 && !pager(), "Incomplete history did not stop safely"));
  button("Try again").click(); await waitFor(() => pageLabel() === "Page 1 of 14", "older Retry");
  check("older Retry resumes the failed cursor and preserves deduplication", () => { assert(JSON.stringify(requests[requests.length - 1].cursor) === JSON.stringify(failedCursor), "Retry restarted instead of resuming"); assertPage(1, 14, 4, 54); });
  const beforeFourHundred = requests.length;
  await refreshRows(generateHistory(400));
  check("four hundred history events produce truthful totals in eight bounded reads but render four cards", () => { assertPage(1, 100, 4, 400); assert(requests.length - beforeFourHundred === 8, "Bounded full-history collection mismatch"); });
  await refreshRows([]);
  check("completed empty history hides pagination and explains future activity", () => assert(!pager() && section().textContent?.includes("No billing history yet") && section().textContent?.includes("Subscription changes and billing events"), "Empty state mismatch"));
  await refreshRows(referenceHistory.filter((event) => event.eventType === "BILLING_ISSUE"));
  button("Renewal").click(); await waitFor(() => section().textContent?.includes("No activity in this category"), "filtered empty");
  check("empty filters hide pagination and provide useful category guidance", () => assert(!pager() && section().textContent?.includes("Choose another filter"), "Filtered empty state mismatch"));

  button("All").click(); await refreshRows(referenceHistory); await scrollToEnd();
  check("cards and pagination do not overflow the desktop or narrow mobile viewport", () => {
    assert(document.documentElement.scrollWidth <= innerWidth, "Document overflows horizontally");
    for (const element of [...cards(), pager()!]) assert(element.getBoundingClientRect().right <= innerWidth + 1 && element.scrollWidth <= element.clientWidth, "History content overflows horizontally");
  });
  check("pagination and the last timestamp scroll fully above the unchanged production bottom navigation", () => {
    const navigation = document.querySelector(".mobile-bottom-nav")!;
    if (result.mobile) {
      assert(getComputedStyle(navigation).position === "fixed" && getComputedStyle(navigation).display !== "none", "Production mobile navigation is not visible");
      assert(pager()!.getBoundingClientRect().bottom + 8 < navigation.getBoundingClientRect().top && cards()[cards().length - 1].getBoundingClientRect().bottom < navigation.getBoundingClientRect().top, "Navigation covers history pagination or timestamp");
    } else assert(getComputedStyle(navigation).display === "none", "Mobile navigation unexpectedly appears on desktop");
  });

  if (scene === "middle") await clickPage("next", 2, 3);
  if (scene === "last") { await clickPage("next", 2, 3); await clickPage("next", 3, 3); }
  if (scene === "empty") await refreshRows([]);
  if (scene === "loading") { heldInitial.set(householdA, new Promise(() => undefined)); void controls!.refresh(); await waitFor(() => document.querySelector(".billing-history-loading"), "loading scene"); }
  if (scene === "error") { failInitial = true; await controls!.refresh(); await waitFor(() => document.querySelector(".billing-history-error"), "error scene"); }
  if (scene === "bottom") await scrollToEnd();
  else document.scrollingElement!.scrollTop = document.querySelector(".pricing-page")!.getBoundingClientRect().top + document.scrollingElement!.scrollTop - 24;
};

void run().catch((error: unknown) => { result.failures.push(error instanceof Error ? error.message : "Unknown fixture failure"); }).finally(() => {
  document.getElementById("billing-history-browser-results")!.textContent = JSON.stringify(result);
});
