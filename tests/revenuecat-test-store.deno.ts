// Actual deployed entrypoint; only the outbound Supabase HTTP boundary is fake.
// No network permission is granted and no provider/business record is written.
let handler: (request: Request) => Promise<Response>;
const originalServe = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: (callback: typeof handler) => { handler = callback; } });
try { await import("../supabase/functions/revenuecat-webhook/index.ts"); }
finally { Object.defineProperty(Deno, "serve", { configurable: true, value: originalServe }); }

const equal = (value: unknown, expected: unknown) => {
  if (JSON.stringify(value) !== JSON.stringify(expected)) throw new Error("Unexpected Test Store webhook result");
};

Deno.test("Test Store mode retains authentication and rejects other stores before privileged I/O", async () => {
  const values = { REVENUECAT_WEBHOOK_SECRET: "synthetic-webhook-secret", REVENUECAT_BILLING_MODE: "test_store",
    REVENUECAT_ALLOW_SANDBOX_EVENTS: "true", REVENUECAT_ALLOW_WEB_BILLING_SANDBOX_EVENTS: "false",
    SUPABASE_URL: "https://database.example.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key" };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, Deno.env.get(key)]));
  for (const [key, value] of Object.entries(values)) Deno.env.set(key, value);
  const originalFetch = globalThis.fetch, originalInfo = console.info;
  let reads = 0;
  globalThis.fetch = (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    equal(new URL(request.url).pathname, "/rest/v1/subscription_events");
    equal(request.method, "GET");
    reads++;
    return Promise.resolve(Response.json({ id: "synthetic-existing-event" }));
  };
  console.info = () => undefined;
  const request = (store: string, environment: string, secret = values.REVENUECAT_WEBHOOK_SECRET) => new Request("https://database.example.invalid/functions/v1/revenuecat-webhook", {
    method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ event: { id: "synthetic-event", app_user_id: "hh_11111111-1111-4111-8111-111111111111",
      type: "INITIAL_PURCHASE", store, environment, entitlement_ids: ["premium"], product_id: "plantie_premium_monthly" } }),
  });
  try {
    equal((await handler(request("TEST_STORE", "SANDBOX", "wrong-secret"))).status, 401);
    for (const [store, environment] of [["APP_STORE", "SANDBOX"], ["PLAY_STORE", "PRODUCTION"], ["TEST_STORE", "PRODUCTION"], ["TEST_STORE", ""], ["TEST_STORE", "unknown"]]) {
      const response = await handler(request(store, environment));
      equal(response.status, 200);
      equal((await response.json()).reason, "environment_not_allowed");
    }
    equal(reads, 0);
    const accepted = await handler(request("TEST_STORE", "SANDBOX"));
    equal(accepted.status, 200);
    equal((await accepted.json()).duplicate, true);
    equal(reads, 1);
    Deno.env.set("REVENUECAT_BILLING_MODE", "unknown");
    equal((await handler(request("TEST_STORE", "SANDBOX"))).status, 503);
    equal(reads, 1);
  } finally {
    globalThis.fetch = originalFetch; console.info = originalInfo;
    for (const [key, value] of Object.entries(previous)) if (value === undefined) Deno.env.delete(key); else Deno.env.set(key, value);
  }
});

Deno.test("Web Billing sandbox purchase, cancellation and expiration reach the household transaction", async () => {
  const values = { REVENUECAT_WEBHOOK_SECRET: "synthetic-webhook-secret", REVENUECAT_BILLING_MODE: "test_store",
    REVENUECAT_ALLOW_SANDBOX_EVENTS: "false", REVENUECAT_ALLOW_WEB_BILLING_SANDBOX_EVENTS: "true",
    SUPABASE_URL: "https://database.example.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key" };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, Deno.env.get(key)]));
  for (const [key, value] of Object.entries(values)) Deno.env.set(key, value);
  const originalFetch = globalThis.fetch, originalInfo = console.info;
  const writes: Record<string, unknown>[] = [];
  let reads = 0;
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const pathname = new URL(request.url).pathname;
    if (pathname === "/rest/v1/subscription_events" && request.method === "GET") {
      reads++;
      return Response.json(null);
    }
    equal(pathname, "/rest/v1/rpc/apply_household_provider_event");
    equal(request.method, "POST");
    writes.push(await request.json());
    return Response.json(true);
  };
  console.info = () => undefined;
  const periodEnd = Date.parse("2026-11-01T00:00:00Z");
  const request = (type: string, store = "RC_BILLING", environment = "SANDBOX", secret = values.REVENUECAT_WEBHOOK_SECRET) =>
    new Request("https://database.example.invalid/functions/v1/revenuecat-webhook", {
      method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ event: { id: `synthetic-${type}`, app_user_id: "hh_11111111-1111-4111-8111-111111111111",
        type, store, environment, entitlement_ids: ["premium"], product_id: "plantie_premium_monthly",
        original_transaction_id: "synthetic-receipt", transaction_id: "synthetic-transaction",
        purchased_at_ms: Date.parse("2026-10-01T00:00:00Z"), expiration_at_ms: periodEnd,
        event_timestamp_ms: type === "EXPIRATION" ? periodEnd : Date.parse("2026-10-25T00:00:00Z") } }),
    });
  try {
    equal((await handler(request("INITIAL_PURCHASE", "RC_BILLING", "SANDBOX", "wrong-secret"))).status, 401);
    for (const [store, environment] of [["APP_STORE", "SANDBOX"], ["STRIPE", "SANDBOX"], ["PADDLE", "SANDBOX"],
      ["PLAY_STORE", "SANDBOX"], ["RC_BILLING", "PRODUCTION"], ["RC_BILLING", ""]]) {
      equal((await (await handler(request("INITIAL_PURCHASE", store, environment))).json()).reason, "environment_not_allowed");
    }
    equal(reads, 0);
    for (const type of ["INITIAL_PURCHASE", "CANCELLATION", "EXPIRATION"]) {
      const response = await handler(request(type));
      equal(response.status, 200);
      equal((await response.json()).updatesApplied, true);
    }
    equal(reads, 3);
    equal(writes.map(write => write.event_status), ["active", "cancelled", "expired"]);
    for (const write of writes) {
      equal(write.customer_id, "hh_11111111-1111-4111-8111-111111111111");
      equal(write.event_provider, "web");
      equal(write.period_end, "2026-11-01T00:00:00.000Z");
      equal(write.event_plan_key, "premium_monthly");
    }
    Deno.env.set("REVENUECAT_ALLOW_WEB_BILLING_SANDBOX_EVENTS", "false");
    equal((await (await handler(request("INITIAL_PURCHASE"))).json()).reason, "environment_not_allowed");
    equal(reads, 3);
  } finally {
    globalThis.fetch = originalFetch; console.info = originalInfo;
    for (const [key, value] of Object.entries(previous)) if (value === undefined) Deno.env.delete(key); else Deno.env.set(key, value);
  }
});
