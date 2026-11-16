import { supabase } from "./supabase.js";
import { BillingAuthRequiredError, BillingUnavailableError } from "./billingService.js";
import { withRequestTimeout } from "./requestTimeout.js";

const invoke = async (householdId: string, action: "cancel" | "management") => {
  if (!supabase) throw new BillingAuthRequiredError();
  const client = supabase;
  const { data, error } = await withRequestTimeout(signal => client.functions.invoke("manage-subscription", { body: { householdId, action }, signal }), 15_000);
  if (error || !data || typeof data !== "object") throw new BillingUnavailableError("Billing could not be confirmed. Refresh and try again.");
  return data as Record<string, unknown>;
};

export const recoverSubscriptionManagementUrl = async (householdId: string) => {
  const data = await invoke(householdId, "management");
  if (typeof data.managementUrl !== "string") throw new BillingUnavailableError();
  let url: URL;
  try { url = new URL(data.managementUrl); } catch { throw new BillingUnavailableError(); }
  if (url.protocol !== "https:" || url.username || url.password) throw new BillingUnavailableError();
  return url.href;
};

export const cancelWebSubscription = async (householdId: string) => {
  const data = await invoke(householdId, "cancel");
  if (data.status !== "cancelled" || data.cancelAtPeriodEnd !== true) throw new BillingUnavailableError();
};
