import { supabase } from "./supabase.js";
import { canonicalHistoryTimestamp, recognizedSubscriptionHistoryEventTypes } from "./subscriptionHistoryModel.js";
import type { RawSubscriptionHistoryEvent } from "./subscriptionHistoryModel.js";

export type HouseholdSubscriptionEvent = RawSubscriptionHistoryEvent;
export type HouseholdSubscriptionHistoryCursor = { occurredAt: string; id: string };
export type HouseholdSubscriptionHistoryPage = { events: HouseholdSubscriptionEvent[]; hasMore: boolean; nextCursor: HouseholdSubscriptionHistoryCursor | null };
export const householdSubscriptionHistoryPageSize = 50;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const columns = "id, household_id, event_type, plan_key, previous_plan_key, new_plan_key, provider, provider_event_id, provider_receipt_key, occurred_at, period_start, period_end, created_at";

type HistoryQuery = PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }> & {
  eq: (column: string, value: string) => HistoryQuery;
  in: (column: string, values: string[]) => HistoryQuery;
  order: (column: string, options: { ascending: boolean }) => HistoryQuery;
  or: (filter: string) => HistoryQuery;
  limit: (count: number) => HistoryQuery;
};
type HistoryClient = { from: (table: string) => { select: (selection: string) => HistoryQuery } };
const nullableString = (value: unknown) => typeof value === "string" && value ? value : null;

export const createHouseholdSubscriptionHistoryReader = (client: HistoryClient | null) => async (
  householdId: string, cursor: HouseholdSubscriptionHistoryCursor | null = null,
): Promise<HouseholdSubscriptionHistoryPage> => {
  if (!uuidPattern.test(householdId)) throw new Error("A valid household is required.");
  const cursorDate = cursor ? canonicalHistoryTimestamp(cursor.occurredAt) : null;
  if (cursor && (!uuidPattern.test(cursor.id) || !cursorDate)) throw new Error("The history cursor is invalid.");
  if (!client) throw new Error("Supabase is not configured.");
  let query = client.from("household_subscription_history").select(columns).eq("household_id", householdId)
    .in("event_type", recognizedSubscriptionHistoryEventTypes).order("occurred_at", { ascending: false }).order("id", { ascending: false });
  if (cursor && cursorDate) query = query.or(`occurred_at.lt.${cursorDate},and(occurred_at.eq.${cursorDate},id.lt.${cursor.id.toLowerCase()})`);
  const { data, error } = await query.limit(householdSubscriptionHistoryPageSize + 1);
  if (error) throw error;
  const rows = data ?? [];
  const visibleRows = rows.slice(0, householdSubscriptionHistoryPageSize);
  const events = visibleRows.map((row): HouseholdSubscriptionEvent => ({
    id: typeof row.id === "string" ? row.id : "", householdId: typeof row.household_id === "string" ? row.household_id : "",
    eventType: typeof row.event_type === "string" ? row.event_type : "", planKey: nullableString(row.plan_key),
    previousPlanKey: nullableString(row.previous_plan_key), newPlanKey: nullableString(row.new_plan_key),
    provider: nullableString(row.provider), providerEventId: nullableString(row.provider_event_id),
    providerReceiptKey: nullableString(row.provider_receipt_key),
    occurredAt: nullableString(row.occurred_at), periodStart: nullableString(row.period_start), periodEnd: nullableString(row.period_end),
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
  }));
  const hasMore = rows.length > householdSubscriptionHistoryPageSize;
  const last = events[events.length - 1];
  const occurredAt = canonicalHistoryTimestamp(last?.occurredAt);
  if (hasMore && (!last || !uuidPattern.test(last.id) || !occurredAt)) throw new Error("The history page could not be read.");
  return { events, hasMore, nextCursor: hasMore && last && occurredAt ? { id: last.id, occurredAt } : null };
};

export const listHouseholdSubscriptionHistoryPage = createHouseholdSubscriptionHistoryReader(supabase as unknown as HistoryClient | null);
export const listHouseholdSubscriptionHistory = async (householdId: string): Promise<HouseholdSubscriptionEvent[]> =>
  (await listHouseholdSubscriptionHistoryPage(householdId)).events;
