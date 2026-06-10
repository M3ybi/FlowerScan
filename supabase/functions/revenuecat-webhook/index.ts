import { createServiceClient } from "../_shared/auth.ts";
import { json } from "../_shared/cors.ts";

const premiumEntitlementId = "premium";
const productToPlan = {
  plantie_premium_monthly: { billingPeriod: "monthly", planKey: "premium_monthly" },
  plantie_premium_yearly: { billingPeriod: "yearly", planKey: "premium_yearly" },
} as const;
const activeEventTypes = new Set(["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE"]);
const inactiveEventTypes = new Set(["EXPIRATION", "REFUND"]);
const supportedEventTypes = new Set([...activeEventTypes, "BILLING_ISSUE", "CANCELLATION", ...inactiveEventTypes]);

type RevenueCatEvent = {
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

const getHeader = (request: Request, name: string) => request.headers.get(name) ?? "";
const parseBearerToken = (value: string) => value.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
const stringValue = (value: unknown) => (typeof value === "string" ? value : "");
const nullableNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const msToIso = (value: number | null) => (value ? new Date(value).toISOString() : null);
const safeUserPrefix = (appUserId: string) => (appUserId ? `${appUserId.slice(0, 8)}...` : "missing");

const verifySecret = (request: Request) => {
  const configuredSecret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
  if (!configuredSecret) return { isConfigured: false, isValid: false };
  const receivedSecret = parseBearerToken(getHeader(request, "authorization")) || getHeader(request, "x-revenuecat-webhook-secret");
  return { isConfigured: true, isValid: receivedSecret === configuredSecret };
};

const firstEntitlementId = (event: Record<string, unknown>) => {
  const entitlementId = stringValue(event.entitlement_id);
  if (entitlementId) return entitlementId;
  return Array.isArray(event.entitlement_ids) ? stringValue(event.entitlement_ids[0]) : "";
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

const mapPlatform = (store: string) => {
  const normalized = store.toUpperCase();
  if (normalized.includes("APP_STORE") || normalized === "MAC_APP_STORE") return "ios";
  if (normalized.includes("PLAY_STORE")) return "android";
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
    const { data: userData } = await client.auth.admin.getUserById(event.appUserId);
    const isKnownUser = Boolean(userData.user);
    const { error: eventError } = await client.from("subscription_events").insert({
      event_id: event.eventId,
      event_type: event.type,
      platform: mapPlatform(event.store),
      payload: createSanitizedPayload(event),
      subscription_id: null,
      user_id: isKnownUser ? event.appUserId : null,
    });
    if (eventError?.code === "23505") return json(202, { duplicate: true, status: "accepted", updatesApplied: false });
    if (eventError) throw eventError;

    const status = mapStatus(event);
    const plan = productToPlan[event.productId as keyof typeof productToPlan];
    if (!supportedEventTypes.has(event.type) || !status || !plan || !isKnownUser) {
      return json(202, { duplicate: false, status: "accepted", updatesApplied: false });
    }

    const originalTransactionId = event.originalTransactionId || event.transactionId;
    const { data: existing } = originalTransactionId
      ? await client.from("user_subscriptions").select("id").eq("user_id", event.appUserId).eq("platform_original_transaction_id", originalTransactionId).maybeSingle()
      : { data: null };
    const { data: subscription, error: subscriptionError } = await client.from("user_subscriptions").upsert({
      ...(existing?.id ? { id: existing.id } : {}),
      billing_period: plan.billingPeriod,
      cancelled_at: status === "cancelled" ? new Date().toISOString() : null,
      current_period_end: msToIso(event.expirationAtMs),
      current_period_start: msToIso(event.purchasedAtMs),
      expires_at: msToIso(event.expirationAtMs),
      metadata: { currency: event.currency, entitlement_id: event.entitlementId, period_type: event.periodType, price: event.price },
      plan_key: plan.planKey,
      platform: mapPlatform(event.store),
      platform_customer_id: event.appUserId,
      platform_original_transaction_id: originalTransactionId || null,
      platform_transaction_id: event.transactionId || null,
      status,
      user_id: event.appUserId,
    }).select("id").single();
    if (subscriptionError) throw subscriptionError;

    const activatesPremium = event.entitlementId === premiumEntitlementId && status !== "expired" && status !== "refunded";
    const entitlementPlanKey = activatesPremium ? plan.planKey : "free";
    const { data: planRow, error: planError } = await client
      .from("subscription_plans")
      .select("ai_scans_monthly_limit, plants_limit, qr_labels_limit, ai_diagnosis_enabled, cloud_backup_enabled, household_sharing_enabled")
      .eq("plan_key", entitlementPlanKey)
      .maybeSingle();
    if (planError || !planRow) throw planError ?? new Error("Plan not found");

    const { error: entitlementError } = await client.from("user_entitlements").upsert({
      ai_diagnosis_enabled: planRow.ai_diagnosis_enabled,
      ai_scans_monthly_limit: planRow.ai_scans_monthly_limit,
      cloud_backup_enabled: planRow.cloud_backup_enabled,
      household_sharing_enabled: planRow.household_sharing_enabled,
      is_premium: activatesPremium,
      plan_key: entitlementPlanKey,
      plants_limit: planRow.plants_limit,
      qr_labels_limit: planRow.qr_labels_limit,
      source_subscription_id: activatesPremium ? subscription.id : null,
      user_id: event.appUserId,
      valid_until: activatesPremium ? msToIso(event.expirationAtMs) : null,
    }, { onConflict: "user_id" });
    if (entitlementError) throw entitlementError;

    return json(202, { duplicate: false, status: "accepted", updatesApplied: true });
  } catch {
    return json(500, { error: "RevenueCat webhook processing failed." });
  }
});

