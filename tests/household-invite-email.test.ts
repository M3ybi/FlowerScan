import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildInviteUrl, classifyEmailError, escapeHtml, parseSender } from "../supabase/functions/_shared/householdInviteEmail";

const token = "A".repeat(43);

test("invite link uses configured production or loopback origin only", () => {
  assert.equal(buildInviteUrl("https://flowerscann.netlify.app", token), `https://flowerscann.netlify.app/#/join?invite=${token}`);
  assert.equal(buildInviteUrl("http://localhost:5173", token), `http://localhost:5173/#/join?invite=${token}`);
  assert.equal(buildInviteUrl("http://flowerscann.netlify.app", token), null);
  assert.equal(buildInviteUrl("https://example.com/#/menu", token), null);
  assert.equal(buildInviteUrl("https://user:pass@example.com", token), null);
  assert.equal(buildInviteUrl("https://example.com", "short"), null);
});

test("sender must be configured with a non-test domain", () => {
  assert.equal(parseSender("Plantie <invites@example.com>"), "invites@example.com");
  assert.equal(parseSender("invites@example.com"), "invites@example.com");
  assert.equal(parseSender("Plantie <onboarding@resend.dev>"), null);
  assert.equal(parseSender("Plantie <invites@example.com>\r\nBcc: other@example.com"), null);
  assert.equal(parseSender(undefined), null);
});

test("provider failures become safe codes and HTML content is escaped", () => {
  assert.equal(classifyEmailError({ statusCode: 403, name: "validation_error", message: "Domain is not verified" }).errorCode, "EMAIL_SENDER_NOT_VERIFIED");
  assert.equal(classifyEmailError({ statusCode: 429 }).errorCode, "EMAIL_RATE_LIMITED");
  assert.equal(classifyEmailError({ statusCode: 422 }).errorCode, "EMAIL_INVALID_RECIPIENT");
  assert.equal(classifyEmailError({ statusCode: 503 }).errorCode, "EMAIL_PROVIDER_UNAVAILABLE");
  assert.equal(escapeHtml("<script>&'\""), "&lt;script&gt;&amp;&#39;&quot;");
});

test("retry loads the existing invite, and database enforces Owner, Premium and active state", () => {
  const sql = readFileSync("supabase/migrations/20261006113000_recoverable_household_invites.sql", "utf8");
  const edge = readFileSync("supabase/functions/send-household-invite-email/index.ts", "utf8");
  assert.match(sql, /vault\.create_secret\(raw_token\)/);
  assert.match(sql, /public\.is_household_owner\(active_invite\.household_id\)/);
  assert.match(sql, /active_invite\.used_at is not null or active_invite\.revoked_at is not null/);
  assert.match(sql, /public\.is_household_premium_at\(active_invite\.household_id, now\(\)\)/);
  assert.match(sql, /active_invite\.token_hash <> encode\(extensions\.digest\(recovered_token, 'sha256'\), 'hex'\)/);
  assert.match(edge, /target_invite_id: body\.inviteId/);
  assert.doesNotMatch(edge, /create_household_invite/);
  assert.doesNotMatch(edge, /body\.inviteUrl|body\.recipientEmail|body\.householdName/);
});
