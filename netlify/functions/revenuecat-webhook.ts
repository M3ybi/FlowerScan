import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { getRevenueCatPlan } from "../../src/lib/revenueCatProducts.js";

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Plantie-Deprecated-Backend": "Supabase Edge Function revenuecat-webhook is primary; Netlify is compatibility fallback.",
};

const premiumEntitlementId = "premium";

const activeEventTypes = new Set(["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION"]);
const inactiveEventTypes = new Set(["EXPIRATION", "REFUND"]);
const stateChangingEventTypes = new Set([...activeEventTypes, "BILLING_ISSUE", "CANCELLATION", ...inactiveEventTypes]);

export type RevenueCatSubscriptionStatus = "active" | "cancelled" | "expired" | "grace_period" | "refunded";
export type RevenueCatSubscriptionPlatform = "ios" | "android" | "web" | "manual";

export type RevenueCatWebhookEvent = {
  appUserId: string;
  currency: string | null;
  entitlementId: string;
  eventId: string;
  eventOccurredAtMs?: number | null;
  expirationAtMs: number | null;
  originalTransactionId: string;
  periodType: string;
  price: number | null;
  productId: string;
  newProductId?: string;
  purchasedAtMs: number | null;
  store: string;
  transactionId: string;
  type: string;
};

export type SupabaseAdminClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: SupabaseError | null }>;
  auth: {
    admin: {
      getUserById(userId: string): Promise<{ data: { user: unknown | null }; error: unknown | null }>;
    };
  };
  from(table: string): {
    insert(value: unknown): {
      select(columns?: string): { maybeSingle<T>(): Promise<{ data: T | null; error: SupabaseError | null }> };
    };
    select(columns?: string): SupabaseSelectQuery;
    upsert(value: unknown, options?: unknown): {
      select(columns?: string): { single<T>(): Promise<{ data: T; error: SupabaseError | null }> };
      single<T>(): Promise<{ data: T; error: SupabaseError | null }>;
    };
  };
};

type SupabaseSelectQuery = {
  eq(column: string, value: unknown): SupabaseSelectQuery;
  maybeSingle<T>(): Promise<{ data: T | null; error: SupabaseError | null }>;
};

type SupabaseError = {
  code?: string;
  message?: string;
};

const safeLog = (message: string, metadata: Record<string, unknown>) => {
  console.info(message, metadata);
};

const safeUserPrefix = (appUserId: string) => (appUserId ? `${appUserId.slice(0, 8)}...` : "missing");

const getHeader = (headersInput: Record<string, string | undefined>, name: string) => {
  const lowerName = name.toLowerCase();
  const entry = Object.entries(headersInput).find(([key]) => key.toLowerCase() === lowerName);
  return entry?.[1] ?? "";
};

const parseBearerToken = (value: string) => {
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? "";
};

export const verifyWebhookSecret = (headersInput: Record<string, string | undefined>) => {
  const configuredSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!configuredSecret) {
    return { isConfigured: false, isValid: false };
  }

  const authorizationSecret = parseBearerToken(getHeader(headersInput, "authorization"));
  const explicitSecret = getHeader(headersInput, "x-revenuecat-webhook-secret");
  const receivedSecret = authorizationSecret || explicitSecret;

  return {
    isConfigured: true,
    isValid: receivedSecret === configuredSecret,
  };
};

const stringValue = (value: unknown) => (typeof value === "string" ? value : "");
const nullableNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const nullableTimestamp = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 8_640_000_000_000_000 ? value : null;

const firstEntitlementId = (event: Record<string, unknown>) => {
  const entitlementIds = event.entitlement_ids;
  if (Array.isArray(entitlementIds)) {
    if (entitlementIds.includes(premiumEntitlementId)) return premiumEntitlementId;
    const first = stringValue(entitlementIds[0]);
    if (first) return first;
  }
  return stringValue(event.entitlement_id);
};

export const parseRevenueCatPayload = (body: string | null): RevenueCatWebhookEvent | null => {
  if (!body) {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as { event?: unknown };
    if (!parsed.event || typeof parsed.event !== "object") {
      return null;
    }

    const event = parsed.event as Record<string, unknown>;
    const webhookEvent: RevenueCatWebhookEvent = {
      appUserId: stringValue(event.app_user_id),
      currency: stringValue(event.currency) || null,
      entitlementId: firstEntitlementId(event),
      eventId: stringValue(event.id),
      eventOccurredAtMs: nullableTimestamp(event.event_timestamp_ms),
      expirationAtMs: nullableTimestamp(event.expiration_at_ms),
      originalTransactionId: stringValue(event.original_transaction_id),
      periodType: stringValue(event.period_type),
      price: nullableNumber(event.price),
      productId: stringValue(event.product_id),
      newProductId: stringValue(event.new_product_id),
      purchasedAtMs: nullableTimestamp(event.purchased_at_ms),
      store: stringValue(event.store),
      transactionId: stringValue(event.transaction_id),
      type: stringValue(event.type),
    };

    return webhookEvent.type && webhookEvent.eventId ? webhookEvent : null;
  } catch {
    return null;
  }
};

const msToIso = (value: number | null) => (value ? new Date(value).toISOString() : null);

export const mapRevenueCatStoreToPlatform = (store: string): RevenueCatSubscriptionPlatform => {
  const normalized = store.toUpperCase();
  if (normalized.includes("APP_STORE") || normalized === "MAC_APP_STORE") {
    return "ios";
  }

  if (normalized.includes("PLAY_STORE")) {
    return "android";
  }

  if (normalized === "RC_BILLING" || normalized === "STRIPE" || normalized === "PADDLE") {
    return "web";
  }

  return "manual";
};

export const mapRevenueCatStatus = (event: RevenueCatWebhookEvent): RevenueCatSubscriptionStatus | null => {
  if (activeEventTypes.has(event.type)) {
    return "active";
  }

  if (event.type === "BILLING_ISSUE") {
    return "grace_period";
  }

  if (event.type === "CANCELLATION") {
    return "cancelled";
  }

  if (event.type === "EXPIRATION") {
    return "expired";
  }

  if (event.type === "REFUND") {
    return "refunded";
  }

  return null;
};

const createSanitizedPayload = (event: RevenueCatWebhookEvent) => ({
  currency: event.currency,
  entitlement_id: event.entitlementId,
  expiration_at_ms: event.expirationAtMs,
  period_type: event.periodType,
  price: event.price,
  product_id: event.productId,
  new_product_id: event.newProductId ?? null,
  purchased_at_ms: event.purchasedAtMs,
  store: event.store,
});

export const createSupabaseAdminClient = () => {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin client is not configured.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  }) as unknown as SupabaseAdminClient;
};

const isDuplicateError = (error: SupabaseError | null) => error?.code === "23505";

const insertEvent = async (
  client: SupabaseAdminClient,
  event: RevenueCatWebhookEvent,
  userId: string | null,
  subscriptionId: string | null,
) => {
  const { data, error } = await client
    .from("subscription_events")
    .insert({
      event_id: event.eventId,
      event_type: event.type,
      platform: mapRevenueCatStoreToPlatform(event.store),
      payload: createSanitizedPayload(event),
      subscription_id: subscriptionId,
      user_id: userId,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (isDuplicateError(error)) {
    return { duplicate: true, eventRowId: null };
  }

  if (error) {
    throw new Error("RevenueCat event could not be stored.");
  }

  return { duplicate: false, eventRowId: data?.id ?? null };
};

const findUser = async (client: SupabaseAdminClient, userId: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return false;
  }

  const { data, error } = await client.auth.admin.getUserById(userId);
  if (error) {
    if ((error as { status?: number }).status === 404) return false;
    throw new Error("RevenueCat user lookup failed.");
  }

  return Boolean(data.user);
};

export const processRevenueCatWebhookEvent = async (
  client: SupabaseAdminClient,
  event: RevenueCatWebhookEvent,
) => {
  const { data: existingEvent, error: existingEventError } = await client
    .from("subscription_events")
    .select("id")
    .eq("event_id", event.eventId)
    .maybeSingle<{ id: string }>();
  if (existingEventError) {
    throw new Error("RevenueCat event lookup failed.");
  }
  if (existingEvent) {
    return { duplicate: true, entitlementUpdated: false, eventStored: true, subscriptionUpdated: false };
  }

  const isHouseholdCustomer = /^hh_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.appUserId);
  const isKnownLegacyUser = !isHouseholdCustomer && await findUser(client, event.appUserId);
  if (isHouseholdCustomer || isKnownLegacyUser) {
    const status = mapRevenueCatStatus(event);
    const plan = getRevenueCatPlan(event.productId);
    if (!status || !plan || !stateChangingEventTypes.has(event.type) || event.entitlementId !== premiumEntitlementId ||
        !event.originalTransactionId && !event.transactionId ||
        status !== "expired" && status !== "refunded" && !event.expirationAtMs) {
      // PRODUCT_CHANGE records the pending change; an effective purchase/renewal updates access.
      const inserted = await insertEvent(client, event, isKnownLegacyUser ? event.appUserId : null, null);
      return { duplicate: inserted.duplicate, entitlementUpdated: false, eventStored: true, subscriptionUpdated: false };
    }
    const { data, error } = await client.rpc("apply_household_provider_event", {
      customer_id: event.appUserId,
      provider_event_id: event.eventId,
      provider_event_type: event.type,
      event_plan_key: plan.planKey,
      event_status: status,
      event_billing_period: plan.billingPeriod,
      event_provider: mapRevenueCatStoreToPlatform(event.store),
      original_transaction_id: event.originalTransactionId || event.transactionId,
      period_start: msToIso(event.purchasedAtMs),
      period_end: msToIso(event.expirationAtMs),
      event_occurred_at: msToIso(event.eventOccurredAtMs ?? Date.now()),
      event_metadata: createSanitizedPayload(event),
      event_transaction_id: event.transactionId || null,
    });
    if (error) throw new Error("Household subscription state could not be updated.");
    return { duplicate: false, entitlementUpdated: data === true, eventStored: true, subscriptionUpdated: data === true };
  }

  const inserted = await insertEvent(client, event, null, null);
  return { duplicate: inserted.duplicate, entitlementUpdated: false, eventStored: true, subscriptionUpdated: false };
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      body: JSON.stringify({ error: "Method not allowed" }),
      headers,
      statusCode: 405,
    };
  }

  const secretStatus = verifyWebhookSecret(event.headers);
  if (!secretStatus.isConfigured) {
    return {
      body: JSON.stringify({ error: "RevenueCat webhook is not configured." }),
      headers,
      statusCode: 503,
    };
  }

  if (!secretStatus.isValid) {
    return {
      body: JSON.stringify({ error: "Unauthorized." }),
      headers,
      statusCode: 401,
    };
  }

  const payload = parseRevenueCatPayload(event.body);
  if (!payload) {
    return {
      body: JSON.stringify({ error: "Invalid RevenueCat webhook payload." }),
      headers,
      statusCode: 400,
    };
  }

  safeLog("RevenueCat webhook received", {
    appUserIdPrefix: safeUserPrefix(payload.appUserId),
    eventId: payload.eventId,
    productId: payload.productId || "missing",
    type: payload.type,
  });

  try {
    const result = await processRevenueCatWebhookEvent(createSupabaseAdminClient(), payload);
    return {
      body: JSON.stringify({ status: "accepted", updatesApplied: result.entitlementUpdated, duplicate: result.duplicate }),
      headers,
      statusCode: 200,
    };
  } catch {
    return {
      body: JSON.stringify({ error: "RevenueCat webhook processing failed." }),
      headers,
      statusCode: 500,
    };
  }
};
