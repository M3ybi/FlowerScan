import assert from "node:assert/strict";
import test from "node:test";
import {
  mapRevenueCatStatus,
  parseRevenueCatPayload,
  processRevenueCatWebhookEvent,
  verifyWebhookSecret,
} from "../netlify/functions/revenuecat-webhook.js";
import type { RevenueCatWebhookEvent, SupabaseAdminClient } from "../netlify/functions/revenuecat-webhook.js";

const userId = "11111111-1111-4111-8111-111111111111";

const baseEvent = (patch: Partial<RevenueCatWebhookEvent> = {}): RevenueCatWebhookEvent => ({
  appUserId: userId,
  currency: "EUR",
  entitlementId: "premium",
  eventId: "event-1",
  expirationAtMs: Date.parse("2026-07-01T00:00:00.000Z"),
  originalTransactionId: "original-transaction",
  periodType: "NORMAL",
  price: 4.99,
  productId: "plantie_premium_monthly",
  purchasedAtMs: Date.parse("2026-06-01T00:00:00.000Z"),
  store: "APP_STORE",
  transactionId: "transaction-1",
  type: "INITIAL_PURCHASE",
  ...patch,
});

const createMockSupabase = (knownUsers = new Set([userId])) => {
  const state = {
    entitlements: new Map<string, Record<string, unknown>>(),
    events: new Map<string, Record<string, unknown>>(),
    subscriptions: new Map<string, Record<string, unknown>>(),
    usageCounters: new Map<string, Record<string, unknown>>(),
  };

  const plans = new Map<string, Record<string, unknown>>([
    [
      "free",
      {
        ai_diagnosis_enabled: false,
        ai_scans_monthly_limit: 10,
        cloud_backup_enabled: false,
        household_sharing_enabled: false,
        plants_limit: 10,
        qr_labels_limit: 10,
      },
    ],
    [
      "premium_monthly",
      {
        ai_diagnosis_enabled: true,
        ai_scans_monthly_limit: null,
        cloud_backup_enabled: true,
        household_sharing_enabled: true,
        plants_limit: null,
        qr_labels_limit: null,
      },
    ],
    [
      "premium_yearly",
      {
        ai_diagnosis_enabled: true,
        ai_scans_monthly_limit: null,
        cloud_backup_enabled: true,
        household_sharing_enabled: true,
        plants_limit: null,
        qr_labels_limit: null,
      },
    ],
  ]);

  const makeQuery = (table: string) => {
    const filters: [string, unknown][] = [];
    const query = {
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return query;
      },
      async maybeSingle<T>() {
        if (table === "subscription_plans") {
          const planKey = filters.find(([column]) => column === "plan_key")?.[1] as string;
          return { data: (plans.get(planKey) ?? null) as T | null, error: null };
        }

        if (table === "user_subscriptions") {
          const rows = [...state.subscriptions.values()];
          const found = rows.find((row) => filters.every(([column, value]) => row[column] === value));
          return { data: found ? ({ id: found.id } as T) : null, error: null };
        }

        return { data: null, error: null };
      },
    };
    return query;
  };

  const client = {
    auth: {
      admin: {
        async getUserById(id: string) {
          return { data: { user: knownUsers.has(id) ? { id } : null }, error: null };
        },
      },
    },
    from(table: string) {
      return {
        insert(value: Record<string, unknown>) {
          return {
            select() {
              return {
                async maybeSingle<T>() {
                  if (table === "subscription_events") {
                    const eventId = String(value.event_id);
                    if (state.events.has(eventId)) {
                      return { data: null, error: { code: "23505" } };
                    }
                    const row = { ...value, id: `event-row-${state.events.size + 1}` };
                    state.events.set(eventId, row);
                    return { data: { id: row.id } as T, error: null };
                  }
                  return { data: null, error: null };
                },
              };
            },
          };
        },
        select() {
          return makeQuery(table);
        },
        upsert(value: Record<string, unknown>) {
          return {
            select() {
              return {
                async single<T>() {
                  if (table === "user_subscriptions") {
                    const id = String(value.id ?? `subscription-${state.subscriptions.size + 1}`);
                    const row = { ...value, id };
                    state.subscriptions.set(id, row);
                    return { data: { id } as T, error: null };
                  }
                  return { data: value as T, error: null };
                },
              };
            },
            async single<T>() {
              if (table === "user_entitlements") {
                state.entitlements.set(String(value.user_id), value);
              }
              if (table === "usage_counters") {
                state.usageCounters.set(`${value.user_id}:${value.counter_type}:${value.period_start}`, value);
              }
              return { data: value as T, error: null };
            },
          };
        },
      };
    },
  } as unknown as SupabaseAdminClient;

  return { client, state };
};

test("valid initial purchase activates premium", async () => {
  const { client, state } = createMockSupabase();
  const result = await processRevenueCatWebhookEvent(client, baseEvent());

  assert.equal(result.entitlementUpdated, true);
  assert.equal(state.entitlements.get(userId)?.is_premium, true);
  assert.equal(state.entitlements.get(userId)?.plan_key, "premium_monthly");
});

test("renewal keeps premium active", async () => {
  const { client, state } = createMockSupabase();
  await processRevenueCatWebhookEvent(client, baseEvent({ eventId: "event-renewal", type: "RENEWAL" }));

  assert.equal(state.entitlements.get(userId)?.is_premium, true);
});

test("cancellation does not incorrectly delete history", async () => {
  const { client, state } = createMockSupabase();
  await processRevenueCatWebhookEvent(client, baseEvent({ eventId: "event-cancel", type: "CANCELLATION" }));

  assert.equal(state.entitlements.get(userId)?.is_premium, true);
  assert.equal([...state.subscriptions.values()][0].status, "cancelled");
  assert.equal(state.events.has("event-cancel"), true);
});

test("expiration deactivates premium", async () => {
  const { client, state } = createMockSupabase();
  await processRevenueCatWebhookEvent(client, baseEvent({ eventId: "event-expire", type: "EXPIRATION" }));

  assert.equal(state.entitlements.get(userId)?.is_premium, false);
  assert.equal(state.entitlements.get(userId)?.plan_key, "free");
});

test("refund deactivates premium", async () => {
  const { client, state } = createMockSupabase();
  await processRevenueCatWebhookEvent(client, baseEvent({ eventId: "event-refund", type: "REFUND" }));

  assert.equal(state.entitlements.get(userId)?.is_premium, false);
});

test("duplicate event id is idempotent", async () => {
  const { client, state } = createMockSupabase();
  const first = await processRevenueCatWebhookEvent(client, baseEvent({ eventId: "dupe" }));
  const second = await processRevenueCatWebhookEvent(client, baseEvent({ eventId: "dupe", transactionId: "transaction-2" }));

  assert.equal(first.entitlementUpdated, true);
  assert.equal(second.duplicate, true);
  assert.equal(state.events.size, 1);
});

test("invalid webhook secret rejected", () => {
  const previousSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
  process.env.REVENUECAT_WEBHOOK_SECRET = "expected";

  assert.deepEqual(verifyWebhookSecret({ authorization: "Bearer wrong" }), { isConfigured: true, isValid: false });

  process.env.REVENUECAT_WEBHOOK_SECRET = previousSecret;
});

test("unknown user does not grant premium", async () => {
  const { client, state } = createMockSupabase(new Set());
  const result = await processRevenueCatWebhookEvent(client, baseEvent());

  assert.equal(result.entitlementUpdated, false);
  assert.equal(state.events.size, 1);
  assert.equal(state.entitlements.size, 0);
});

test("unknown product does not grant premium", async () => {
  const { client, state } = createMockSupabase();
  const result = await processRevenueCatWebhookEvent(client, baseEvent({ productId: "unknown_product" }));

  assert.equal(result.entitlementUpdated, false);
  assert.equal(state.events.size, 1);
  assert.equal(state.entitlements.size, 0);
});

test("payload parser extracts RevenueCat fields safely", () => {
  const event = parseRevenueCatPayload(
    JSON.stringify({
      event: {
        app_user_id: userId,
        currency: "EUR",
        entitlement_ids: ["premium"],
        expiration_at_ms: 123,
        id: "event-id",
        original_transaction_id: "original",
        period_type: "NORMAL",
        price: 4.99,
        product_id: "plantie_premium_monthly",
        purchased_at_ms: 100,
        store: "APP_STORE",
        transaction_id: "transaction",
        type: "INITIAL_PURCHASE",
      },
    }),
  );

  assert.equal(event?.eventId, "event-id");
  assert.equal(event?.entitlementId, "premium");
  assert.equal(event?.price, 4.99);
});

test("status mapping handles supported RevenueCat lifecycle events", () => {
  assert.equal(mapRevenueCatStatus(baseEvent({ type: "INITIAL_PURCHASE" })), "active");
  assert.equal(mapRevenueCatStatus(baseEvent({ type: "BILLING_ISSUE" })), "grace_period");
  assert.equal(mapRevenueCatStatus(baseEvent({ type: "CANCELLATION" })), "cancelled");
  assert.equal(mapRevenueCatStatus(baseEvent({ type: "EXPIRATION" })), "expired");
  assert.equal(mapRevenueCatStatus(baseEvent({ type: "REFUND" })), "refunded");
});
