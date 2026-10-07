import { createServiceClient } from "../_shared/auth.ts";
import { json } from "../_shared/cors.ts";
const premiumEntitlementId = "premium";
type RevenueCatPlan = { billingPeriod: "monthly" | "yearly"; planKey: "premium_monthly" | "premium_yearly" };
const productToPlan = new Map<string, RevenueCatPlan>([
  ["plantie_premium_monthly", { billingPeriod: "monthly", planKey: "premium_monthly" }],
  ["plantie_premium_yearly", { billingPeriod: "yearly", planKey: "premium_yearly" }],
  ["plantie_premium_monthly:monthly", { billingPeriod: "monthly", planKey: "premium_monthly" }],
  ["plantie_premium_yearly:yearly", { billingPeriod: "yearly", planKey: "premium_yearly" }],
]);
const getRevenueCatPlan = (productId: string) => productToPlan.get(productId) ?? null;
const activeEventTypes = new Set(["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION"]);
const inactiveEventTypes = new Set(["EXPIRATION", "REFUND"]);
const stateChangingEventTypes = new Set([...activeEventTypes, "BILLING_ISSUE", "CANCELLATION", ...inactiveEventTypes]);

type RevenueCatEvent = {
  appUserId: string;
  currency: string | null;
  entitlementId: string;
  eventId: string;
  eventOccurredAtMs: number | null;
  expirationAtMs: number | null;
  originalTransactionId: string;
  periodType: string;
  price: number | null;
  productId: string;
  newProductId: string;
  purchasedAtMs: number | null;
  store: string;
  transactionId: string;
  type: string;
};

const getHeader = (request: Request, name: string) => request.headers.get(name) ?? "";
const parseBearerToken = (value: string) => value.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
const stringValue = (value: unknown) => (typeof value === "string" ? value : "");
const nullableNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const nullableTimestamp = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 8_640_000_000_000_000 ? value : null;
const msToIso = (value: number | null) => (value ? new Date(value).toISOString() : null);
const safeUserPrefix = (appUserId: string) => (appUserId ? `${appUserId.slice(0, 8)}...` : "missing");

const verifySecret = (request: Request) => {
  const configuredSecret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
  if (!configuredSecret) return { isConfigured: false, isValid: false };
  const receivedSecret = parseBearerToken(getHeader(request, "authorization")) || getHeader(request, "x-revenuecat-webhook-secret");
  return { isConfigured: true, isValid: receivedSecret === configuredSecret };
};

const firstEntitlementId = (event: Record<string, unknown>) => {
  if (Array.isArray(event.entitlement_ids)) {
    if (event.entitlement_ids.includes(premiumEntitlementId)) return premiumEntitlementId;
    const first = stringValue(event.entitlement_ids[0]);
    if (first) return first;
  }
  return stringValue(event.entitlement_id);
};

const parsePayload = async (request: Request): Promise<RevenueCatEvent | null> => {
  try {
    const parsed = await request.json() as { event?: unknown };
    if (!parsed.event || typeof parsed.event !== "object") return null;
    const event = parsed.event as Record<string, unknown>;
    const webhookEvent = {
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

const mapPlatform = (store: string) => {
  const normalized = store.toUpperCase();
  if (normalized.includes("APP_STORE") || normalized === "MAC_APP_STORE") return "ios";
  if (normalized.includes("PLAY_STORE")) return "android";
  if (normalized === "RC_BILLING" || normalized === "STRIPE" || normalized === "PADDLE") return "web";
  return "manual";
};

const mapStatus = (event: RevenueCatEvent) => {
  if (activeEventTypes.has(event.type)) return "active";
  if (event.type === "BILLING_ISSUE") return "grace_period";
  if (event.type === "CANCELLATION") return "cancelled";
  if (event.type === "EXPIRATION") return "expired";
  if (event.type === "REFUND") return "refunded";
  return null;
};

const createSanitizedPayload = (event: RevenueCatEvent) => ({
  currency: event.currency,
  entitlement_id: event.entitlementId,
  expiration_at_ms: event.expirationAtMs,
  period_type: event.periodType,
  price: event.price,
  product_id: event.productId,
  new_product_id: event.newProductId || null,
  purchased_at_ms: event.purchasedAtMs,
  store: event.store,
});

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  const secret = verifySecret(request);
  if (!secret.isConfigured) return json(503, { error: "RevenueCat webhook is not configured." });
  if (!secret.isValid) return json(401, { error: "Unauthorized." });

  const event = await parsePayload(request);
  if (!event) return json(400, { error: "Invalid RevenueCat webhook payload." });

  console.info("RevenueCat webhook received", {
    appUserIdPrefix: safeUserPrefix(event.appUserId),
    eventId: event.eventId,
    productId: event.productId || "missing",
    type: event.type,
  });

  try {
    const client = createServiceClient();
    const { data: existingEvent, error: existingEventError } = await client.from("subscription_events")
      .select("id")
      .eq("event_id", event.eventId)
      .maybeSingle();
    if (existingEventError) throw existingEventError;
    if (existingEvent) return json(200, { duplicate: true, status: "accepted", updatesApplied: false });

    const isHouseholdCustomer = /^hh_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.appUserId);
    const hasUserId = !isHouseholdCustomer && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.appUserId);
    const { data: userData, error: userError } = hasUserId
      ? await client.auth.admin.getUserById(event.appUserId)
      : { data: { user: null }, error: null };
    if (userError && userError.status !== 404) throw userError;
    const isKnownLegacyUser = Boolean(userData.user);
    const status = mapStatus(event);
    const plan = getRevenueCatPlan(event.productId);
    if (!status || !plan || !stateChangingEventTypes.has(event.type) ||
        (!isHouseholdCustomer && !isKnownLegacyUser) || event.entitlementId !== premiumEntitlementId ||
        (!event.originalTransactionId && !event.transactionId) ||
        (status !== "expired" && status !== "refunded" && !event.expirationAtMs)) {
      // PRODUCT_CHANGE records the pending change; an effective purchase/renewal updates access.
      const { error } = await client.from("subscription_events").insert({
        event_id: event.eventId, event_type: event.type, platform: mapPlatform(event.store),
        payload: createSanitizedPayload(event), user_id: isKnownLegacyUser ? event.appUserId : null, subscription_id: null,
      });
      if (error && error.code !== "23505") throw error;
      return json(200, { duplicate: error?.code === "23505", status: "accepted", updatesApplied: false });
    }
    const { data, error } = await client.rpc("apply_household_provider_event", {
      customer_id: event.appUserId, provider_event_id: event.eventId, provider_event_type: event.type,
      event_plan_key: plan.planKey, event_status: status, event_billing_period: plan.billingPeriod,
      event_provider: mapPlatform(event.store), original_transaction_id: event.originalTransactionId || event.transactionId,
      period_start: msToIso(event.purchasedAtMs), period_end: msToIso(event.expirationAtMs),
      event_occurred_at: msToIso(event.eventOccurredAtMs ?? Date.now()), event_metadata: createSanitizedPayload(event),
      event_transaction_id: event.transactionId || null,
    });
    if (error) throw error;
    return json(200, { status: "accepted", updatesApplied: data === true });
  } catch {
    return json(500, { error: "RevenueCat webhook processing failed." });
  }
});

