import { supabase } from "./supabase.js";

export type HouseholdSubscriptionEvent = {
  id: string;
  eventType: string;
  planKey: string;
  createdAt: string;
};

export const listHouseholdSubscriptionHistory = async (householdId: string): Promise<HouseholdSubscriptionEvent[]> => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.from("household_subscription_history")
    .select("id, event_type, plan_key, created_at")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    eventType: row.event_type,
    planKey: row.plan_key,
    createdAt: row.created_at,
  }));
};
