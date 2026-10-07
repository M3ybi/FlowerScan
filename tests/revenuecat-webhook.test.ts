import assert from "node:assert/strict";
import test from "node:test";
import {
  mapRevenueCatStoreToPlatform,
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
    failEntitlementWrites: 0,
    failUserLookups: 0,
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

        if (table === "user_entitlements") {
          const id = filters.find(([column]) => column === "user_id")?.[1] as string;
          return { data: (state.entitlements.get(id) ?? null) as T | null, error: null };
        }

        if (table === "subscription_events") {
          const eventId = filters.find(([column]) => column === "event_id")?.[1] as string;
          const found = state.events.get(eventId);
          return { data: found ? ({ id: found.id } as T) : null, error: null };
        }

        return { data: null, error: null };
      },
    };
    return query;
  };

  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      assert.equal(name, "apply_household_provider_event");
      const eventId = String(args.provider_event_id);
      if (state.events.has(eventId)) return { data: false, error: null };
      if (state.failEntitlementWrites > 0) {
        state.failEntitlementWrites -= 1;
        return { data: null, error: { message: "temporary outage" } };
      }
      const id = String(args.customer_id);
      const current = [...state.subscriptions.values()].find((row) => row.platform_customer_id === id);
      state.events.set(eventId, { id: `event-row-${state.events.size + 1}`, event_id: eventId });
      if (current?.current_period_end && args.period_end &&
          Date.parse(String(current.current_period_end)) > Date.parse(String(args.period_end))) {
        return { data: false, error: null };
      }
      const subscriptionId = String(current?.id ?? `subscription-${state.subscriptions.size + 1}`);
      state.subscriptions.set(subscriptionId, {
        id: subscriptionId, user_id: id, platform_customer_id: id,
        platform_original_transaction_id: args.original_transaction_id,
        platform_transaction_id: args.event_transaction_id, plan_key: args.event_plan_key,
        status: args.event_status, current_period_end: args.period_end,
      });
      const premium = args.event_status !== "expired" && args.event_status !== "refunded";
      state.entitlements.set(id, { user_id: id, is_premium: premium,
        plan_key: premium ? args.event_plan_key : "free", source_subscription_id: subscriptionId,
        valid_until: premium ? args.period_end : null });
      state.usageCounters.set(id, { value: 0 });
      return { data: true, error: null };
    },
    auth: {
      admin: {
        async getUserById(id: string) {
          if (state.failUserLookups > 0) {
            state.failUserLookups -= 1;
            return { data: { user: null }, error: { message: "temporary outage" } };
          }
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
                if (state.failEntitlementWrites > 0) {
                  state.failEntitlementWrites -= 1;
                  return { data: null as T, error: { message: "temporary outage" } };
                }
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

test("Google Play base-plan purchase activates the matching premium plan", async () => {
  const { client, state } = createMockSupabase();
  const result = await processRevenueCatWebhookEvent(client, baseEvent({
    productId: "plantie_premium_yearly:yearly",
    store: "PLAY_STORE",
  }));

  assert.equal(result.entitlementUpdated, true);
  assert.equal(state.entitlements.get(userId)?.is_premium, true);
  assert.equal(state.entitlements.get(userId)?.plan_key, "premium_yearly");
});

test("renewal keeps premium active", async () => {
  const { client, state } = createMockSupabase();
  await processRevenueCatWebhookEvent(client, baseEvent({ eventId: "event-renewal", type: "RENEWAL" }));

  assert.equal(state.entitlements.get(userId)?.is_premium, true);
});

test("deferred product change preserves monthly until a yearly renewal, then stale expiration cannot revoke yearly", async () => {
  const { client, state } = createMockSupabase();
  await processRevenueCatWebhookEvent(client, baseEvent());
  const scheduled = await processRevenueCatWebhookEvent(client, baseEvent({
    eventId: "change-yearly",
    type: "PRODUCT_CHANGE",
    newProductId: "plantie_premium_yearly",
    expirationAtMs: Date.parse("2027-07-01T00:00:00.000Z"),
  }));
  assert.equal(scheduled.entitlementUpdated, false);
  assert.equal(state.events.has("change-yearly"), true);
  assert.equal(state.entitlements.get(userId)?.plan_key, "premium_monthly");
  await processRevenueCatWebhookEvent(client, baseEvent({
    eventId: "yearly-renewal",
    type: "RENEWAL",
    productId: "plantie_premium_yearly",
    expirationAtMs: Date.parse("2027-07-01T00:00:00.000Z"),
  }));
  assert.equal(state.entitlements.get(userId)?.plan_key, "premium_yearly");
  const stale = await processRevenueCatWebhookEvent(client, baseEvent({
    eventId: "old-monthly-expiration",
    type: "EXPIRATION",
  }));
  assert.equal(stale.entitlementUpdated, false);
  assert.equal(state.entitlements.get(userId)?.plan_key, "premium_yearly");
  const oldRenewal = await processRevenueCatWebhookEvent(client, baseEvent({
    eventId: "late-monthly-renewal",
    type: "RENEWAL",
  }));
  assert.equal(oldRenewal.entitlementUpdated, false);
  assert.equal(state.entitlements.get(userId)?.plan_key, "premium_yearly");
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
  assert.equal(state.entitlements.get(userId)?.source_subscription_id, [...state.subscriptions.values()][0].id);
});

test("household provider identities route to the atomic trusted RPC without modifying personal entitlements", async () => {
  const { client, state } = createMockSupabase();
  const calls: Array<Record<string, unknown>> = [];
  client.rpc = async (name, args) => {
    assert.equal(name, "apply_household_provider_event");
    calls.push(args);
    return { data: true, error: null };
  };
  const householdCustomer = "hh_22222222-2222-4222-8222-222222222222";
  const result = await processRevenueCatWebhookEvent(client, baseEvent({
    appUserId: householdCustomer, eventOccurredAtMs: Date.parse("2026-06-01T00:00:01Z"),
  }));
  assert.equal(result.subscriptionUpdated, true);
  assert.equal(calls[0].customer_id, householdCustomer);
  assert.equal(calls[0].original_transaction_id, "original-transaction");
  assert.equal(calls[0].event_occurred_at, "2026-06-01T00:00:01.000Z");
  assert.equal(state.entitlements.size, 0);
  assert.equal(state.subscriptions.size, 0);
  client.rpc = async () => ({ data: null, error: { message: "temporary outage" } });
  await assert.rejects(() => processRevenueCatWebhookEvent(client, baseEvent({ appUserId: householdCustomer })), /Household subscription/);
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

test("a failed atomic RPC remains retryable without partially committing subscription or event state", async () => {
  const { client, state } = createMockSupabase();
  state.failEntitlementWrites = 1;

  await assert.rejects(processRevenueCatWebhookEvent(client, baseEvent()), /Household subscription state could not be updated/);
  assert.equal(state.events.has("event-1"), false);
  assert.equal(state.entitlements.has(userId), false);
  assert.equal(state.subscriptions.size, 0);

  const retry = await processRevenueCatWebhookEvent(client, baseEvent());
  assert.equal(retry.entitlementUpdated, true);
  assert.equal(state.entitlements.get(userId)?.is_premium, true);
  assert.equal(state.events.has("event-1"), true);
});

test("temporary auth-admin failure is retried instead of acknowledging an unknown user", async () => {
  const { client, state } = createMockSupabase();
  state.failUserLookups = 1;

  await assert.rejects(processRevenueCatWebhookEvent(client, baseEvent()), /RevenueCat user lookup failed/);
  assert.equal(state.events.has("event-1"), false);

  const retry = await processRevenueCatWebhookEvent(client, baseEvent());
  assert.equal(retry.entitlementUpdated, true);
  assert.equal(state.entitlements.get(userId)?.is_premium, true);
});

test("deleted users are logged without repeatedly retrying a missing Auth account", async () => {
  const { client, state } = createMockSupabase();
  client.auth.admin.getUserById = async () => ({ data: { user: null }, error: { status: 404 } });

  const result = await processRevenueCatWebhookEvent(client, baseEvent());
  assert.equal(result.entitlementUpdated, false);
  assert.equal(state.events.has("event-1"), true);
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

test("an unrelated entitlement event cannot revoke an existing premium subscription", async () => {
  const { client, state } = createMockSupabase();
  await processRevenueCatWebhookEvent(client, baseEvent());

  const unrelated = await processRevenueCatWebhookEvent(client, baseEvent({
    entitlementId: "other",
    eventId: "unrelated-expiration",
    type: "EXPIRATION",
  }));

  assert.equal(unrelated.entitlementUpdated, false);
  assert.equal(state.entitlements.get(userId)?.is_premium, true);
});

test("a subscription event with no expiration cannot grant indefinite premium", async () => {
  const { client, state } = createMockSupabase();
  const result = await processRevenueCatWebhookEvent(client, baseEvent({ expirationAtMs: null }));

  assert.equal(result.entitlementUpdated, false);
  assert.equal(state.entitlements.size, 0);
  assert.equal(state.events.has("event-1"), true);
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

test("payload parser recognizes premium anywhere in the entitlement list", () => {
  const event = parseRevenueCatPayload(JSON.stringify({ event: {
    entitlement_id: "other",
    entitlement_ids: ["other", "premium"],
    id: "multi-entitlement",
    type: "RENEWAL",
  } }));
  assert.equal(event?.entitlementId, "premium");
});

test("status mapping handles supported RevenueCat lifecycle events", () => {
  assert.equal(mapRevenueCatStatus(baseEvent({ type: "INITIAL_PURCHASE" })), "active");
  assert.equal(mapRevenueCatStatus(baseEvent({ type: "BILLING_ISSUE" })), "grace_period");
  assert.equal(mapRevenueCatStatus(baseEvent({ type: "CANCELLATION" })), "cancelled");
  assert.equal(mapRevenueCatStatus(baseEvent({ type: "EXPIRATION" })), "expired");
  assert.equal(mapRevenueCatStatus(baseEvent({ type: "REFUND" })), "refunded");
  assert.equal(mapRevenueCatStatus(baseEvent({ type: "PRODUCT_CHANGE" })), null);
});

test("web billing stores are recorded as web subscriptions", () => {
  assert.equal(mapRevenueCatStoreToPlatform("RC_BILLING"), "web");
  assert.equal(mapRevenueCatStoreToPlatform("STRIPE"), "web");
  assert.equal(mapRevenueCatStoreToPlatform("PADDLE"), "web");
});
