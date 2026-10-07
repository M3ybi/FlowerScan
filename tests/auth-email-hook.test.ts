import assert from "node:assert/strict";
import test from "node:test";
import { buildAuthEmails, buildAuthVerificationUrl, createAuthEmailHookHandler } from "../supabase/functions/_shared/authEmail";
import type { AuthEmail, AuthEmailDiagnostic, AuthEmailPayload } from "../supabase/functions/_shared/authEmail";

const hash = "a".repeat(64);
const oldHash = "b".repeat(64);
const callback = "https://plantie.example/auth/callback?invitation=11111111-1111-4111-8111-111111111111";
const payload = (changes: Partial<AuthEmailPayload["email_data"]> = {}, userChanges: Partial<AuthEmailPayload["user"]> = {}): AuthEmailPayload => ({
  user: { id: "user", email: "new@example.com", ...userChanges },
  email_data: { email_action_type: "signup", token_hash: hash, token: "12345678", redirect_to: callback, ...changes },
});
const verificationUrl = (email: AuthEmail) => new URL(email.text.match(/https:\/\/project\.supabase\.co[^\s]+/)![0]);
const request = (value: unknown = payload(), id = "hook-event") => new Request("https://project.supabase.co/functions/v1/send-auth-email", { method: "POST", headers: { "webhook-id": id, "Content-Type": "application/json" }, body: JSON.stringify(value) });
const setup = ({ rejectSignature = false, sendFailure = false, sendThrows = false }: { rejectSignature?: boolean; sendFailure?: boolean; sendThrows?: boolean } = {}) => {
  const sent: Array<{ email: AuthEmail; key: string }> = [];
  const diagnostics: AuthEmailDiagnostic[] = [];
  let verifiedRequests = 0;
  const handler = createAuthEmailHookHandler({
    configured: true, sender: "Plantie <accounts@example.com>", publicUrl: "https://plantie.example", supabaseUrl: "https://project.supabase.co",
    verify: (body, headers) => {
      verifiedRequests += 1;
      if (rejectSignature || !headers["webhook-id"]) throw new Error("Invalid signature containing internal details");
      return JSON.parse(body) as unknown;
    },
    send: async (email, key) => {
      sent.push({ email, key });
      if (sendThrows) throw new Error(`provider error: ${hash}`);
      return { ok: !sendFailure, status: sendFailure ? 403 : 200, providerMessageId: "provider-message" };
    },
    diagnostic: (event) => diagnostics.push(event),
  });
  return { handler, sent, diagnostics, verifiedRequests: () => verifiedRequests };
};

test("signup sends hash verification link that preserves invitation return context", async () => {
  const testHook = setup();
  const response = await testHook.handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {});
  assert.equal(testHook.sent.length, 1);
  assert.equal(testHook.sent[0].email.to, "new@example.com");
  const url = verificationUrl(testHook.sent[0].email);
  assert.equal(url.pathname, "/auth/v1/verify");
  assert.equal(url.searchParams.get("token"), hash);
  assert.equal(url.searchParams.get("type"), "signup");
  assert.equal(url.searchParams.get("redirect_to"), callback);
  assert.match(testHook.sent[0].email.html, /&amp;type=signup/);
  assert.doesNotMatch(testHook.sent[0].email.text, /12345678/);
});

test("signature verification precedes email lookup and unsigned messages cannot send", async () => {
  const testHook = setup({ rejectSignature: true });
  const response = await testHook.handler(request());
  assert.equal(response.status, 401);
  assert.equal(testHook.sent.length, 0);
  assert.equal(testHook.verifiedRequests(), 1);
  assert.doesNotMatch(await response.text(), /internal details|new@example.com/);
});

test("secure email change maps token_hash_new to current address and token_hash to new address", () => {
  const emails = buildAuthEmails(payload({ email_action_type: "email_change", token_hash: hash, token_hash_new: oldHash, token_new: "87654321" }, { email: "old@example.com", new_email: "new@example.com" }), "https://project.supabase.co", "https://plantie.example");
  assert.equal(emails.length, 2);
  assert.equal(emails[0].to, "old@example.com");
  assert.equal(verificationUrl(emails[0]).searchParams.get("token"), oldHash);
  assert.equal(emails[1].to, "new@example.com");
  assert.equal(verificationUrl(emails[1]).searchParams.get("token"), hash);
  assert.equal(verificationUrl(emails[1]).searchParams.get("type"), "email_change");
});

test("nonsecure email change sends one email to the new address", () => {
  const emails = buildAuthEmails(payload({ email_action_type: "email_change", token_hash_new: "" }, { email: "old@example.com", new_email: " NEW@Example.com " }), "https://project.supabase.co", "https://plantie.example");
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, "new@example.com");
  assert.equal(verificationUrl(emails[0]).searchParams.get("token"), hash);
});

test("recovery, magiclink and native confirmation use the signed redirect and action", () => {
  for (const action of ["recovery", "magiclink", "invite", "email"] as const) {
    const emails = buildAuthEmails(payload({ email_action_type: action, redirect_to: "com.plantie.app://auth/confirm" }), "https://project.supabase.co", "https://plantie.example");
    assert.equal(verificationUrl(emails[0]).searchParams.get("type"), action);
    assert.equal(verificationUrl(emails[0]).searchParams.get("redirect_to"), "com.plantie.app://auth/confirm");
  }
  assert.equal(new URL(buildAuthVerificationUrl("http://127.0.0.1:54321", hash, "signup", "http://localhost:5173/auth/callback")).protocol, "http:");
  for (const redirect of ["http://192.168.0.151:5173/auth/callback", "http://10.0.0.8:5173/auth/recovery", "http://172.16.0.2:5173/auth/callback", "http://172.31.255.255:5173/auth/callback"]) {
    assert.equal(verificationUrl(buildAuthEmails(payload({ redirect_to: redirect }), "https://project.supabase.co", "https://plantie.example")[0]).searchParams.get("redirect_to"), redirect);
  }
  for (const redirect of ["javascript:alert(1)", "data:text/html,hello", "https://user:pass@evil.example", "http://evil.example", "http://172.15.0.2:5173", "http://172.32.0.2:5173", "http://192.169.0.151:5173", "http://8.8.8.8:5173", "file:///secret"]) {
    assert.throws(() => buildAuthEmails(payload({ redirect_to: redirect }), "https://project.supabase.co", "https://plantie.example"), /redirect/);
  }
});

test("provider retries use stable per-event per-recipient keys for both email-change messages", async () => {
  const testHook = setup();
  const event = payload({ email_action_type: "email_change", token_hash_new: oldHash }, { email: "old@example.com", new_email: "new@example.com" });
  assert.equal((await testHook.handler(request(event))).status, 200);
  assert.equal((await testHook.handler(request(event))).status, 200);
  assert.deepEqual(testHook.sent.map((item) => item.key), ["auth-email/hook-event/0", "auth-email/hook-event/1", "auth-email/hook-event/0", "auth-email/hook-event/1"]);
});

test("provider rejection and transport failure return actionable generic errors without credentials or tokens", async () => {
  for (const settings of [{ sendFailure: true }, { sendThrows: true }]) {
    const testHook = setup(settings);
    const response = await testHook.handler(request());
    assert.equal(response.status, 502);
    const result = await response.text();
    assert.match(result, /Try again shortly/);
    assert.doesNotMatch(result, /new@example.com|old@example.com|provider error|aaaaaaaa/);
    assert.doesNotMatch(JSON.stringify(testHook.diagnostics), /new@example.com|old@example.com|aaaaaaaa|12345678/);
  }
});

test("invalid recipient, action, token, identifier, configuration and method fail closed", async () => {
  const testHook = setup();
  for (const invalid of [payload({}, { email: "bad\r\nBcc: other@example.com" }), payload({ token_hash: "short" }), payload({ email_action_type: "unknown_action" }), { user: {}, email_data: {} }]) {
    assert.equal((await testHook.handler(request(invalid))).status, 400);
  }
  assert.equal((await testHook.handler(request(payload(), "bad event id"))).status, 401);
  assert.equal(testHook.sent.length, 0);
  const disabled = createAuthEmailHookHandler({ configured: false, verify: () => payload(), send: async () => ({ ok: true, status: 200 }) });
  assert.equal((await disabled(request())).status, 503);
  assert.equal((await testHook.handler(new Request("https://example.com"))).status, 405);
});

test("reauthentication emits an OTP and email-change notifications reach the previous address", () => {
  const otp = buildAuthEmails(payload({ email_action_type: "reauthentication" }), "https://project.supabase.co", "https://plantie.example")[0];
  assert.match(otp.text, /12345678/);
  assert.doesNotMatch(otp.text, /auth\/v1\/verify/);
  const notification = buildAuthEmails(payload({ email_action_type: "email_changed_notification", old_email: "old@example.com", token_hash: "" }), "https://project.supabase.co", "https://plantie.example")[0];
  assert.equal(notification.to, "old@example.com");
  assert.doesNotMatch(notification.text, /aaaaaaaa|12345678/);
});
