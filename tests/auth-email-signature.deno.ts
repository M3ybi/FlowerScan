import { Webhook } from "npm:standardwebhooks@1.0.0";

// Exercise the actual entrypoint and production signature adapter. Only the
// outbound Resend boundary is substituted; no network permission is granted.
const secret = btoa("synthetic-test-only-signing-key-32-bytes");
const values: Record<string, string> = { SEND_EMAIL_HOOK_SECRET: `v1,whsec_${secret}`, RESEND_API_KEY: "synthetic-test-only",
  RESEND_AUTH_FROM_EMAIL: "Plantie <auth@example.invalid>", SUPABASE_URL: "https://database.example.invalid", APP_PUBLIC_URL: "https://app.example.invalid" };
const previous = Object.fromEntries(Object.keys(values).map(key => [key, Deno.env.get(key)]));
for (const [key, value] of Object.entries(values)) Deno.env.set(key, value);
let handler: (request: Request) => Promise<Response>;
const originalServe = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, value: (callback: typeof handler) => { handler = callback; } });
try { await import("../supabase/functions/send-auth-email/index.ts"); }
finally {
  Object.defineProperty(Deno, "serve", { configurable: true, value: originalServe });
  for (const [key, value] of Object.entries(previous)) if (value === undefined) Deno.env.delete(key); else Deno.env.set(key, value);
}
const equal = (value: unknown, expected: unknown) => { if (JSON.stringify(value) !== JSON.stringify(expected)) throw new Error("Unexpected signed-hook result"); };
const payload = JSON.stringify({ user: { id: "fixture", email: "recipient@example.invalid" },
  email_data: { email_action_type: "recovery", token_hash: "a".repeat(64), redirect_to: "https://app.example.invalid/auth/recovery" } });
const signed = (date = new Date(), body = payload, key = secret) => new Request("https://database.example.invalid/functions/v1/send-auth-email", {
  method: "POST", body, headers: { "webhook-id": "signed-fixture", "webhook-timestamp": String(Math.floor(date.getTime() / 1000)),
    "webhook-signature": new Webhook(key).sign("signed-fixture", date, payload), "Content-Type": "application/json" },
});

Deno.test("real signatures, timestamps, tampering and sender idempotency at the deployed adapter", async () => {
  const originalFetch = globalThis.fetch;
  const originalInfo = console.info;
  const calls: RequestInit[] = [];
  const logs: unknown[][] = [];
  console.info = (...args) => { logs.push(args); };
  globalThis.fetch = (input, init) => {
    equal(input, "https://api.resend.com/emails");
    calls.push(init!);
    return Promise.resolve(Response.json({ id: "provider-fixture-id" }));
  };
  try {
    for (const request of [signed(new Date(Date.now() - 600_000)), signed(new Date(Date.now() + 600_000)),
      signed(new Date(), payload.replace("recovery", "signup")), signed(new Date(), payload, btoa("different-test-key"))]) {
      equal((await handler(request)).status, 401);
    }
    equal(calls.length, 0);
    for (let i = 0; i < 2; i++) equal((await handler(signed())).status, 200);
    equal(calls.map(call => new Headers(call.headers).get("Idempotency-Key")), ["auth-email/signed-fixture/0", "auth-email/signed-fixture/0"]);
    equal(calls.every(call => call.signal instanceof AbortSignal), true);
    const body = JSON.parse(String(calls[0].body));
    equal(body.to, "recipient@example.invalid");
    equal(body.text.includes("/auth/v1/verify?"), true);
    const wireLogs = JSON.stringify(logs);
    equal(/recipient@example|aaaaaaaa|synthetic-test-only|webhook-signature/.test(wireLogs), false);
    globalThis.fetch = () => Promise.resolve(new Response("private-provider-response", { status: 429 }));
    const denied = await handler(signed());
    equal(denied.status, 502);
    equal((await denied.text()).includes("private-provider-response"), false);
    globalThis.fetch = () => Promise.reject(new DOMException("secret-provider-timeout", "TimeoutError"));
    const timedOut = await handler(signed());
    equal(timedOut.status, 502);
    equal((await timedOut.text()).includes("secret-provider-timeout"), false);
  } finally { globalThis.fetch = originalFetch; console.info = originalInfo; }
});
