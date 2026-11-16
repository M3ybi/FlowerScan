export class BillingManagementError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

type Subscription = {
  id: string;
  customer_id: string;
  original_customer_id: string;
  store: string;
  environment: string;
  auto_renewal_status: string;
};
const unavailable = () => new BillingManagementError(503, "BILLING_UNAVAILABLE", "Billing could not be confirmed. Refresh and try again.");
const bound = (value: unknown, limit = 255): value is string => typeof value === "string" && value.length > 0 && value.length <= limit;

// All identifiers come from the existing authorized household binding, never the browser.
export const createRevenueCatBillingClient = (config: {
  apiKey: string; projectId: string; environment: "sandbox" | "production";
  fetch?: typeof fetch;
}) => {
  if (!config.apiKey || !/^[a-zA-Z0-9_-]{1,128}$/.test(config.projectId)) throw unavailable();
  const api = `https://api.revenuecat.com/v2/projects/${encodeURIComponent(config.projectId)}`;
  const signal = AbortSignal.timeout(12_000);
  const request = async (path: string, method = "GET"): Promise<Record<string, unknown>> => {
    try {
      const response = await (config.fetch ?? fetch)(api + path, {
        method, headers: { Authorization: `Bearer ${config.apiKey}`, Accept: "application/json" },
        redirect: "error", signal,
      });
      if (!response.ok) throw unavailable();
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || Array.isArray(data)) throw unavailable();
      return data as Record<string, unknown>;
    } catch { throw unavailable(); }
  };
  const assertOwned = (data: Record<string, unknown>, customer: string, id?: string): Subscription => {
    if (!bound(data.id) || id && data.id !== id ||
      data.customer_id !== customer ||
      data.store !== "rc_billing" || data.environment !== config.environment ||
      !["will_renew", "will_not_renew"].includes(String(data.auto_renewal_status))) {
      throw new BillingManagementError(409, "BILLING_SUBSCRIPTION_UNCONFIRMED", "This subscription must be reviewed through its billing provider.");
    }
    return data as unknown as Subscription;
  };
  const findSubscription = async (customer: string, transaction: string) => {
    if (!bound(customer, 1500) || !bound(transaction, 1500)) throw unavailable();
    const subscriptions: Record<string, unknown>[] = [];
    const cursors = new Set<string>();
    let cursor = "";
    for (let page = 0; page < 10; page++) {
      const query = new URLSearchParams({ store_subscription_identifier: transaction });
      if (cursor) query.set("starting_after", cursor);
      const data = await request(`/subscriptions?${query}`);
      if (!Array.isArray(data.items) || data.items.some(item => !item || typeof item !== "object" || Array.isArray(item))) throw unavailable();
      subscriptions.push(...data.items as Record<string, unknown>[]);
      if (data.next_page == null) {
        // Ambiguity, including another store/environment, is never resolved by guessing.
        if (subscriptions.length !== 1) throw unavailable();
        const selected = assertOwned(subscriptions[0], customer);
        return assertOwned(await request(`/subscriptions/${encodeURIComponent(selected.id)}`), customer, selected.id);
      }
      const last = data.items.at(-1) as Record<string, unknown> | undefined;
      if (!last || !bound(last.id) || cursors.has(last.id)) throw unavailable();
      // Never follow a provider-supplied URL with a secret Authorization header.
      cursor = last.id; cursors.add(cursor);
    }
    throw unavailable();
  };
  return {
    async managementUrl(customer: string, transaction: string) {
      const sub = await findSubscription(customer, transaction);
      const result = await request(`/subscriptions/${encodeURIComponent(sub.id)}/authenticated_management_url`);
      if (typeof result.management_url !== "string") throw unavailable();
      let url: URL;
      try { url = new URL(result.management_url); } catch { throw unavailable(); }
      if (url.protocol !== "https:" || url.username || url.password) throw unavailable();
      return url.href;
    },
    async cancel(customer: string, transaction: string, reauthorize: () => Promise<void>) {
      const sub = await findSubscription(customer, transaction);
      await reauthorize();
      if (sub.auto_renewal_status === "will_not_renew") return;
      // No refund, entitlement mutation or automatic retry. A lost response is reconciled by the next read.
      await request(`/subscriptions/${encodeURIComponent(sub.id)}/actions/cancel`, "POST");
      const confirmed = assertOwned(await request(`/subscriptions/${encodeURIComponent(sub.id)}`), customer, sub.id);
      if (confirmed.auto_renewal_status !== "will_not_renew") throw unavailable();
    },
  };
};
