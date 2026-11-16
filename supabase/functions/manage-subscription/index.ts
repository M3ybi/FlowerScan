import { createServiceClient, requireUser } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { BillingManagementError, createRevenueCatBillingClient } from "../_shared/revenueCatBilling.ts";

const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Cache-Control": "no-store" },
});

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return reply(405, { message: "Use POST." });
  try {
    const auth = await requireUser(request.headers.get("authorization") ?? "");
    if (!auth) return reply(401, { message: "Sign in to manage your subscription." });
    const reader = request.body?.getReader();
    if (!reader) return reply(400, { message: "Invalid billing request." });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); return reply(400, { message: "Invalid billing request." }); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let body: Record<string, unknown>;
    try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return reply(400, { message: "Invalid billing request." }); }
    if (!body || Array.isArray(body) || typeof body.householdId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.householdId) ||
      !["cancel", "management"].includes(String(body.action))) return reply(400, { message: "Invalid billing request." });
    const authorize = async () => {
      const { data, error } = await auth.client.rpc("get_household_billing_customer", { target_household_id: body.householdId });
      if (error || typeof data !== "string" || !data) throw new BillingManagementError(403, "BILLING_FORBIDDEN", "Only the authorized purchasing Owner can manage this subscription.");
      return data;
    };
    const customer = await authorize();
    const { data: binding, error } = await createServiceClient().from("household_subscriptions")
      .select("provider_customer_id,provider_original_transaction_id").eq("household_id", body.householdId).maybeSingle();
    if (error || binding?.provider_customer_id !== customer || !binding.provider_original_transaction_id) {
      throw new BillingManagementError(409, "BILLING_SUBSCRIPTION_UNCONFIRMED", "Refresh the subscription or use the existing provider management page.");
    }
    const mode = Deno.env.get("REVENUECAT_BILLING_MODE");
    const sandbox = mode === "web_sandbox" || mode === "test_store" && Deno.env.get("REVENUECAT_ALLOW_WEB_BILLING_SANDBOX_EVENTS") === "true";
    if (mode !== "production" && !sandbox) throw new BillingManagementError(503, "BILLING_UNAVAILABLE", "Billing management is not configured for this environment.");
    const provider = createRevenueCatBillingClient({ apiKey: Deno.env.get("REVENUECAT_SECRET_API_KEY") ?? "", projectId: Deno.env.get("REVENUECAT_PROJECT_ID") ?? "", environment: sandbox ? "sandbox" : "production" });
    if (body.action === "management") return reply(200, { managementUrl: await provider.managementUrl(customer, binding.provider_original_transaction_id) });
    await provider.cancel(customer, binding.provider_original_transaction_id, async () => {
      if (await authorize() !== customer) throw new BillingManagementError(403, "BILLING_FORBIDDEN", "Billing authorization changed. Refresh and try again.");
      const { data: current, error: readError } = await createServiceClient().from("household_subscriptions")
        .select("provider_customer_id,provider_original_transaction_id").eq("household_id", body.householdId).maybeSingle();
      if (readError || current?.provider_customer_id !== customer || current.provider_original_transaction_id !== binding.provider_original_transaction_id) {
        throw new BillingManagementError(409, "BILLING_SUBSCRIPTION_UNCONFIRMED", "The subscription changed. Refresh and try again.");
      }
    });
    // The existing signed webhook remains the only subscription/entitlement writer.
    return reply(200, { status: "cancelled", cancelAtPeriodEnd: true });
  } catch (error) {
    if (error instanceof BillingManagementError) return reply(error.status, { code: error.code, message: error.message });
    return reply(503, { message: "Billing could not be confirmed. Refresh and try again." });
  }
});
