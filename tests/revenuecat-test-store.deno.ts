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
    REVENUECAT_ALLOW_SANDBOX_EVENTS: "true", SUPABASE_URL: "https://database.example.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key" };
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
