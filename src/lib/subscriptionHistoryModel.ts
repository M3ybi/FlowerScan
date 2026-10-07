export type SubscriptionHistoryCategory = "billing" | "plan_change" | "renewal";
export type SubscriptionHistoryType = "subscription_started" | "renewed" | "upgraded" | "downgraded" | "plan_changed" | "cancelled" | "resumed" | "expired" | "switched_to_free" | "payment_failed" | "payment_succeeded" | "refund";
export type SubscriptionHistoryPlanKey = "free" | "premium_monthly" | "premium_yearly";

export type RawSubscriptionHistoryEvent = {
  id: string;
  eventType: string;
  planKey: string | null;
  createdAt: string;
  householdId?: string;
  previousPlanKey?: string | null;
  newPlanKey?: string | null;
  provider?: string | null;
  providerEventId?: string | null;
  providerReceiptKey?: string | null;
  occurredAt?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
};

// Presentation facts only: provider and transaction identifiers never enter this model.
export type SubscriptionHistoryItem = {
  id: string;
  householdId: string;
  category: SubscriptionHistoryCategory;
  type: SubscriptionHistoryType;
  occurredAt: string;
  planKey: SubscriptionHistoryPlanKey | null;
  previousPlanKey: SubscriptionHistoryPlanKey | null;
  status: "success" | "failed" | "warning" | "info" | "expired";
  periodStart: string | null;
  periodEnd: string | null;
  renewalInterval: "monthly" | "yearly" | null;
};

const eventAliases: Readonly<Record<string, SubscriptionHistoryType>> = {
  subscription_started: "subscription_started", INITIAL_PURCHASE: "subscription_started",
  renewed: "renewed", RENEWAL: "renewed",
  upgraded: "upgraded", downgraded: "downgraded", plan_changed: "plan_changed", PRODUCT_CHANGE: "plan_changed",
  cancelled: "cancelled", CANCELLATION: "cancelled",
  resumed: "resumed", UNCANCELLATION: "resumed",
  expired: "expired", EXPIRATION: "expired",
  switched_to_free: "switched_to_free",
  payment_failed: "payment_failed", BILLING_ISSUE: "payment_failed",
  payment_succeeded: "payment_succeeded", refund: "refund", REFUND: "refund",
};

export const recognizedSubscriptionHistoryEventTypes = Object.keys(eventAliases);

// Preserve PostgreSQL microseconds when serializing paging cursors. Rounding to
// milliseconds can omit another event with the same timestamp on the next page.
export const canonicalHistoryTimestamp = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction = ""] = match;
  const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (calendar.getUTCFullYear() !== Number(year) || calendar.getUTCMonth() !== Number(month) - 1 || calendar.getUTCDate() !== Number(day)
    || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds).toISOString().replace(/\.\d{3}Z$/, `.${fraction.padEnd(6, "0")}Z`);
};

const planKey = (value: unknown): SubscriptionHistoryPlanKey | null =>
  value === "free" || value === "premium_monthly" || value === "premium_yearly" ? value : null;

const categoryFor = (type: SubscriptionHistoryType): SubscriptionHistoryCategory => {
  if (type === "payment_failed" || type === "payment_succeeded" || type === "refund") return "billing";
  if (type === "subscription_started" || type === "upgraded" || type === "downgraded" || type === "plan_changed" || type === "switched_to_free") return "plan_change";
  return "renewal";
};
const statusFor = (type: SubscriptionHistoryType): SubscriptionHistoryItem["status"] => {
  if (type === "subscription_started") return "success";
  if (type === "payment_failed") return "failed";
  if (type === "cancelled") return "warning";
  if (type === "expired") return "expired";
  return categoryFor(type) === "plan_change" ? "info" : "success";
};
const intervalFor = (plan: SubscriptionHistoryPlanKey | null, start: string | null, end: string | null): SubscriptionHistoryItem["renewalInterval"] => {
  if (!start || !end) return null;
  const days = (Date.parse(end) - Date.parse(start)) / 86400000;
  if (plan === "premium_monthly" && days >= 27 && days <= 32) return "monthly";
  if (plan === "premium_yearly" && days >= 364 && days <= 367) return "yearly";
  return null;
};
const identityPart = (value: unknown): string | null => typeof value === "string" && value.trim() && value.length <= 512 ? value.trim() : null;

export const normalizeSubscriptionHistory = (events: readonly RawSubscriptionHistoryEvent[], householdId: string): SubscriptionHistoryItem[] => {
  const candidates = new Map<string, { item: SubscriptionHistoryItem; completeness: number }>();
  for (const event of events) {
    if (!event || typeof event.id !== "string" || !event.id.trim() || (event.householdId && event.householdId !== householdId)) continue;
    const type = typeof event.eventType === "string" && Object.prototype.hasOwnProperty.call(eventAliases, event.eventType) ? eventAliases[event.eventType] : undefined;
    if (!type) continue; // Unknown and internal reconciliation events are not user history.
    const occurredAt = canonicalHistoryTimestamp(event.occurredAt) ?? canonicalHistoryTimestamp(event.createdAt);
    if (!occurredAt) continue;
    const nextPlan = planKey(event.newPlanKey ?? event.planKey);
    const previousPlan = planKey(event.previousPlanKey);
    let periodStart = canonicalHistoryTimestamp(event.periodStart);
    let periodEnd = canonicalHistoryTimestamp(event.periodEnd);
    if (!periodStart || !periodEnd || periodEnd <= periodStart) { periodStart = null; periodEnd = null; }
    const provider = identityPart(event.provider)?.toLowerCase() ?? null;
    const providerEventId = identityPart(event.providerEventId);
    const receiptKey = typeof event.providerReceiptKey === "string" && /^[a-f0-9]{64}$/i.test(event.providerReceiptKey) ? event.providerReceiptKey.toLowerCase() : null;
    // Without a provider identity or a complete recorded period, separate legacy
    // rows stay separate. Similar titles or close timestamps are not dedup evidence.
    const key = provider && providerEventId ? JSON.stringify(["provider", provider, providerEventId])
      : type === "renewed" && provider && receiptKey && periodStart && periodEnd ? JSON.stringify(["period", provider, receiptKey, type, nextPlan, periodStart, periodEnd])
      : JSON.stringify(["row", event.id]);
    const item: SubscriptionHistoryItem = { id: event.id, householdId, type, category: categoryFor(type), occurredAt,
      planKey: nextPlan, previousPlanKey: previousPlan, status: statusFor(type), periodStart, periodEnd,
      renewalInterval: intervalFor(nextPlan, periodStart, periodEnd) };
    const completeness = Number(Boolean(nextPlan)) + Number(Boolean(previousPlan)) + Number(Boolean(periodStart && periodEnd)) * 2;
    const existing = candidates.get(key);
    if (!existing || completeness > existing.completeness || (completeness === existing.completeness && item.id < existing.item.id)) {
      candidates.set(key, { item, completeness });
    }
  }
  return Array.from(candidates.values(), ({ item }) => item)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id));
};
