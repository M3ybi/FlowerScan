import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Plantie-Deprecated-Backend": "Supabase Edge Function revenuecat-webhook is primary; Netlify is compatibility fallback.",
};

const premiumEntitlementId = "premium";

const productToPlan = {
  plantie_premium_monthly: { billingPeriod: "monthly", planKey: "premium_monthly" },
  plantie_premium_yearly: { billingPeriod: "yearly", planKey: "premium_yearly" },
} as const;

const activeEventTypes = new Set(["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE"]);
const inactiveEventTypes = new Set(["EXPIRATION", "REFUND"]);
const supportedEventTypes = new Set([...activeEventTypes, "BILLING_ISSUE", "CANCELLATION", ...inactiveEventTypes]);

export type RevenueCatSubscriptionStatus = "active" | "cancelled" | "expired" | "grace_period" | "refunded";
export type RevenueCatSubscriptionPlatform = "ios" | "android" | "web" | "manual";

export type RevenueCatWebhookEvent = {
  appUserId: string;
  currency: string | null;
  entitlementId: string;
  eventId: string;
  expirationAtMs: number | null;
  originalTransactionId: string;
  periodType: string;
  price: number | null;
  productId: string;
  purchasedAtMs: number | null;
  store: string;
  transactionId: string;
  type: string;
};

export type SupabaseAdminClient = {
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

type SubscriptionRow = {
  id: string;
};

type PlanRow = {
  ai_diagnosis_enabled: boolean;
  ai_scans_monthly_limit: number | null;
  cloud_backup_enabled: boolean;
  household_sharing_enabled: boolean;
  plants_limit: number | null;
  qr_labels_limit: number | null;
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

const firstEntitlementId = (event: Record<string, unknown>) => {
  const entitlementId = stringValue(event.entitlement_id);
  if (entitlementId) {
    return entitlementId;
  }

  const entitlementIds = event.entitlement_ids;
  return Array.isArray(entitlementIds) ? stringValue(entitlementIds[0]) : "";
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
      expirationAtMs: nullableNumber(event.expiration_at_ms),
      originalTransactionId: stringValue(event.original_transaction_id),
      periodType: stringValue(event.period_type),
      price: nullableNumber(event.price),
      productId: stringValue(event.product_id),
      purchasedAtMs: nullableNumber(event.purchased_at_ms),
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
  if (!userId) {
    return false;
  }

  const { data, error } = await client.auth.admin.getUserById(userId);
  if (error) {
    return false;
  }

  return Boolean(data.user);
};

const findExistingSubscription = async (client: SupabaseAdminClient, event: RevenueCatWebhookEvent, userId: string) => {
  const originalTransactionId = event.originalTransactionId || event.transactionId;
  if (originalTransactionId) {
    const { data, error } = await client
      .from("user_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("platform_original_transaction_id", originalTransactionId)
      .maybeSingle<SubscriptionRow>();
    if (error) {
      throw new Error("Existing subscription lookup failed.");
    }

    if (data) {
      return data.id;
    }
  }

  const { data, error } = await client
    .from("user_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("platform_customer_id", event.appUserId)
    .maybeSingle<SubscriptionRow>();
  if (error) {
    throw new Error("Existing subscription lookup failed.");
  }

  return data?.id ?? null;
};

const upsertSubscription = async (
  client: SupabaseAdminClient,
  event: RevenueCatWebhookEvent,
  userId: string,
  status: RevenueCatSubscriptionStatus,
) => {
  const plan = productToPlan[event.productId as keyof typeof productToPlan];
  if (!plan) {
    return null;
  }

  const existingId = await findExistingSubscription(client, event, userId);
  const subscriptionPatch = {
    ...(existingId ? { id: existingId } : {}),
    billing_period: plan.billingPeriod,
    cancelled_at: status === "cancelled" ? new Date().toISOString() : null,
    current_period_end: msToIso(event.expirationAtMs),
    current_period_start: msToIso(event.purchasedAtMs),
    expires_at: msToIso(event.expirationAtMs),
    metadata: {
      entitlement_id: event.entitlementId,
      period_type: event.periodType,
      price: event.price,
      currency: event.currency,
    },
    plan_key: plan.planKey,
    platform: mapRevenueCatStoreToPlatform(event.store),
    platform_customer_id: event.appUserId,
    platform_original_transaction_id: event.originalTransactionId || event.transactionId || null,
    platform_transaction_id: event.transactionId || null,
    status,
    user_id: userId,
  };

  const { data, error } = await client
    .from("user_subscriptions")
    .upsert(subscriptionPatch)
    .select("id")
    .single<SubscriptionRow>();

  if (error) {
    throw new Error("Subscription state could not be updated.");
  }

  return data.id;
};

const getPlan = async (client: SupabaseAdminClient, planKey: string) => {
  const { data, error } = await client
    .from("subscription_plans")
    .select("ai_scans_monthly_limit, plants_limit, qr_labels_limit, ai_diagnosis_enabled, cloud_backup_enabled, household_sharing_enabled")
    .eq("plan_key", planKey)
    .maybeSingle<PlanRow>();

  if (error || !data) {
    throw new Error("Subscription plan could not be loaded.");
  }

  return data;
};

const upsertEntitlement = async (
  client: SupabaseAdminClient,
  event: RevenueCatWebhookEvent,
  userId: string,
  subscriptionId: string | null,
  status: RevenueCatSubscriptionStatus,
) => {
  const productPlan = productToPlan[event.productId as keyof typeof productToPlan];
  const activatesPremium =
    Boolean(productPlan) &&
    event.entitlementId === premiumEntitlementId &&
    status !== "expired" &&
    status !== "refunded";
  const planKey = activatesPremium ? productPlan.planKey : "free";
  const plan = await getPlan(client, planKey);

  const { error } = await client
    .from("user_entitlements")
    .upsert(
      {
        ai_diagnosis_enabled: plan.ai_diagnosis_enabled,
        ai_scans_monthly_limit: plan.ai_scans_monthly_limit,
        cloud_backup_enabled: plan.cloud_backup_enabled,
        household_sharing_enabled: plan.household_sharing_enabled,
        is_premium: activatesPremium,
        plan_key: planKey,
        plants_limit: plan.plants_limit,
        qr_labels_limit: plan.qr_labels_limit,
        source_subscription_id: activatesPremium ? subscriptionId : null,
        user_id: userId,
        valid_until: activatesPremium ? msToIso(event.expirationAtMs) : null,
      },
      { onConflict: "user_id" },
    )
    .single();

  if (error) {
    throw new Error("User entitlement could not be updated.");
  }
};

const currentUsagePeriod = (now = new Date()) => {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return {
    periodEnd: end.toISOString().slice(0, 10),
    periodStart: start.toISOString().slice(0, 10),
  };
};

const ensureUsageCounter = async (client: SupabaseAdminClient, userId: string) => {
  const { periodEnd, periodStart } = currentUsagePeriod();
  const { error } = await client
    .from("usage_counters")
    .upsert(
      {
        counter_type: "ai_scan",
        period_end: periodEnd,
        period_start: periodStart,
        user_id: userId,
        value: 0,
      },
      { onConflict: "user_id,counter_type,period_start", ignoreDuplicates: true },
    )
    .single();

  if (error && !isDuplicateError(error)) {
    throw new Error("Usage counter could not be ensured.");
  }
};

export const processRevenueCatWebhookEvent = async (
  client: SupabaseAdminClient,
  event: RevenueCatWebhookEvent,
) => {
  const status = mapRevenueCatStatus(event);
  const productPlan = productToPlan[event.productId as keyof typeof productToPlan];
  const isSupportedEvent = supportedEventTypes.has(event.type);
  const isKnownUser = await findUser(client, event.appUserId);

  const initialEventInsert = await insertEvent(client, event, isKnownUser ? event.appUserId : null, null);
  if (initialEventInsert.duplicate) {
    return { duplicate: true, entitlementUpdated: false, eventStored: true, subscriptionUpdated: false };
  }

  if (!isSupportedEvent || !status || !productPlan || !isKnownUser) {
    return {
      duplicate: false,
      entitlementUpdated: false,
      eventStored: true,
      subscriptionUpdated: false,
    };
  }

  const subscriptionId = await upsertSubscription(client, event, event.appUserId, status);
  await upsertEntitlement(client, event, event.appUserId, subscriptionId, status);
  await ensureUsageCounter(client, event.appUserId);

  return {
    duplicate: false,
    entitlementUpdated: true,
    eventStored: true,
    subscriptionUpdated: Boolean(subscriptionId),
  };
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
      statusCode: 202,
    };
  } catch {
    return {
      body: JSON.stringify({ error: "RevenueCat webhook processing failed." }),
      headers,
      statusCode: 500,
    };
  }
};
