import { escapeHtml, parseSender } from "./householdInviteEmail.ts";

export type AuthEmail = { to: string; subject: string; html: string; text: string };
export type AuthEmailPayload = {
  user: { id?: string; email: string; new_email?: string; user_metadata?: Record<string, unknown> };
  email_data: {
    email_action_type: string; token?: string; token_hash?: string; token_new?: string; token_hash_new?: string;
    redirect_to?: string; site_url?: string; old_email?: string; provider?: string;
  };
};

const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const normalizeEmail = (email: unknown) => {
  if (typeof email !== "string" || email.length > 320 || !emailPattern.test(email.trim())) throw new Error("Invalid authentication recipient.");
  return email.trim().toLowerCase();
};
const tokenHash = (hash: unknown) => {
  if (typeof hash !== "string" || !/^[A-Za-z0-9_-]{16,256}$/.test(hash)) throw new Error("Invalid authentication token.");
  return hash;
};
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export const parseAuthEmailPayload = (value: unknown): AuthEmailPayload => {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.email_data) ||
    typeof value.email_data.email_action_type !== "string") throw new Error("Invalid authentication email event.");
  normalizeEmail(value.user.email);
  return value as AuthEmailPayload;
};

const safeSignedRedirect = (redirect: unknown) => {
  if (typeof redirect !== "string" || redirect.length > 4096 || /[\u0000-\u001f\u007f]/.test(redirect)) throw new Error("Invalid authentication redirect.");
  const url = new URL(redirect);
  if (url.username || url.password) throw new Error("Invalid authentication redirect.");
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const ipv4 = url.hostname.split(".");
  const privateLan = ipv4.length === 4 && ipv4.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255) &&
    (Number(ipv4[0]) === 10 || Number(ipv4[0]) === 192 && Number(ipv4[1]) === 168 ||
      Number(ipv4[0]) === 172 && Number(ipv4[1]) >= 16 && Number(ipv4[1]) <= 31);
  // Supabase has already checked its redirect allowlist before signing this payload.
  // Reverse-DNS custom schemes keep the existing native callback flow operational.
  const native = /^(?:[a-z][a-z0-9-]*\.)+[a-z][a-z0-9-]*:$/.test(url.protocol) && url.hostname === "auth";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && (loopback || privateLan)) && !native) throw new Error("Invalid authentication redirect.");
  return url.href;
};

export const buildAuthVerificationUrl = (supabaseUrl: string | undefined, hash: string, action: string, redirect: string) => {
  if (!supabaseUrl) throw new Error("Authentication mail is not configured.");
  const base = new URL(supabaseUrl);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (base.username || base.password || (base.protocol !== "https:" && !(base.protocol === "http:" && loopback))) throw new Error("Authentication mail is not configured.");
  const url = new URL("/auth/v1/verify", base.origin);
  url.searchParams.set("token", tokenHash(hash));
  url.searchParams.set("type", action);
  url.searchParams.set("redirect_to", safeSignedRedirect(redirect));
  return url.href;
};

const actionCopy: Record<string, { subject: string; title: string; body: string; button: string }> = {
  signup: { subject: "Confirm your Plantie email", title: "Confirm your email address", body: "Confirm this email address to finish creating your Plantie account. You will return to Plantie to review any pending household invitation.", button: "Confirm email" },
  invite: { subject: "Your Plantie account invitation", title: "Join Plantie", body: "Accept this account invitation to continue to Plantie.", button: "Accept account invitation" },
  magiclink: { subject: "Sign in to Plantie", title: "Your secure sign-in link", body: "Use this link to sign in to your Plantie account.", button: "Sign in" },
  email: { subject: "Sign in to Plantie", title: "Your secure sign-in link", body: "Use this link to sign in to your Plantie account.", button: "Sign in" },
  recovery: { subject: "Reset your Plantie password", title: "Reset your password", body: "Use this secure link to choose a new password for your Plantie account.", button: "Reset password" },
  email_change: { subject: "Confirm your Plantie email change", title: "Confirm your email change", body: "Confirm the requested email change for your Plantie account. When secure email change is enabled, both addresses must be confirmed.", button: "Confirm email change" },
};

const renderAuthEmail = (to: string, copy: { subject: string; title: string; body: string; button: string }, url: string): AuthEmail => ({
  to,
  subject: copy.subject,
  html: `<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#173f35;max-width:560px;margin:0 auto;padding:24px"><h1 style="font-size:24px">${escapeHtml(copy.title)}</h1><p>${escapeHtml(copy.body)}</p><a href="${escapeHtml(url)}" style="display:inline-block;background:#0f4a3a;color:#fff;text-decoration:none;border-radius:8px;padding:12px 18px;font-weight:700">${escapeHtml(copy.button)}</a><p>If you did not request this, you can ignore this email.</p><p style="font-size:13px;overflow-wrap:anywhere">If the button does not work, copy this link into your browser:<br>${escapeHtml(url)}</p></div>`,
  text: `${copy.title}\n\n${copy.body}\n\n${copy.button}: ${url}\n\nIf you did not request this, you can ignore this email.`,
});

export const buildAuthEmails = (value: unknown, supabaseUrl: string | undefined, publicUrl: string | undefined): AuthEmail[] => {
  const event = parseAuthEmailPayload(value);
  const { user, email_data: data } = event;
  const action = data.email_action_type;
  const redirect = safeSignedRedirect(data.redirect_to || publicUrl || data.site_url);
  const currentEmail = normalizeEmail(user.email);
  if (action === "reauthentication") {
    if (typeof data.token !== "string" || !/^[A-Za-z0-9]{6,64}$/.test(data.token)) throw new Error("Invalid authentication code.");
    return [{ to: currentEmail, subject: "Your Plantie confirmation code", html: `<h1>Confirm this account action</h1><p>Your Plantie confirmation code is <strong>${escapeHtml(data.token)}</strong>.</p><p>If you did not request this, ignore this email.</p>`, text: `Your Plantie confirmation code is ${data.token}. If you did not request this, ignore this email.` }];
  }
  if (action.endsWith("_notification")) {
    const notifications: Record<string, string> = {
      password_changed_notification: "Your Plantie password was changed.", email_changed_notification: "Your Plantie email address was changed.",
      phone_changed_notification: "Your Plantie phone number was changed.", identity_linked_notification: "A sign-in identity was added to your Plantie account.",
      identity_unlinked_notification: "A sign-in identity was removed from your Plantie account.", mfa_factor_enrolled_notification: "A verification factor was added to your Plantie account.",
      mfa_factor_unenrolled_notification: "A verification factor was removed from your Plantie account.",
    };
    const body = notifications[action];
    if (!body) throw new Error("Unsupported authentication email action.");
    const to = action === "email_changed_notification" && data.old_email ? normalizeEmail(data.old_email) : currentEmail;
    return [{ to, subject: "Plantie account security update", html: `<h1>Account security update</h1><p>${escapeHtml(body)}</p><p>If you did not make this change, contact support and secure your account.</p>`, text: `${body}\n\nIf you did not make this change, contact support and secure your account.` }];
  }
  const copy = actionCopy[action];
  if (!copy) throw new Error("Unsupported authentication email action.");
  if (action === "email_change") {
    const newEmail = normalizeEmail(user.new_email);
    // Supabase's field names are intentionally reversed for backward compatibility:
    // token_hash_new verifies the CURRENT address; token_hash verifies the NEW address.
    const newAddressEmail = renderAuthEmail(newEmail, copy, buildAuthVerificationUrl(supabaseUrl, tokenHash(data.token_hash), action, redirect));
    if (data.token_hash_new) return [
      renderAuthEmail(currentEmail, copy, buildAuthVerificationUrl(supabaseUrl, tokenHash(data.token_hash_new), action, redirect)),
      newAddressEmail,
    ];
    return [newAddressEmail];
  }
  return [renderAuthEmail(currentEmail, copy, buildAuthVerificationUrl(supabaseUrl, tokenHash(data.token_hash), action, redirect))];
};

type SendResult = { ok: boolean; status: number; providerMessageId?: string };
export type AuthEmailDiagnostic = { category: string; webhookId?: string; providerStatus?: number; providerMessageId?: string; action?: string; timestamp: string };

export const createAuthEmailHookHandler = (dependencies: {
  verify: (payload: string, headers: Record<string, string>) => unknown;
  send: (email: AuthEmail, idempotencyKey: string) => Promise<SendResult>;
  supabaseUrl?: string;
  publicUrl?: string;
  sender?: string;
  configured: boolean;
  diagnostic?: (event: AuthEmailDiagnostic) => void;
}) => async (request: Request): Promise<Response> => {
  const response = (status: number, message?: string) => new Response(JSON.stringify(message ? { error: { http_code: status, message } } : {}), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  if (request.method !== "POST") return response(405, "Use POST for authentication mail.");
  if (!dependencies.configured || !parseSender(dependencies.sender)) return response(503, "Authentication email is unavailable.");
  let verified: unknown;
  let webhookId: string;
  try {
    const payload = await request.text();
    if (payload.length > 256 * 1024) return response(413, "Authentication email request is too large.");
    verified = dependencies.verify(payload, Object.fromEntries(request.headers));
    webhookId = request.headers.get("webhook-id") ?? "";
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(webhookId)) throw new Error("Invalid webhook identifier.");
  } catch {
    return response(401, "Invalid authentication mail signature.");
  }
  let messages: AuthEmail[];
  let action = "";
  try {
    action = parseAuthEmailPayload(verified).email_data.email_action_type;
    messages = buildAuthEmails(verified, dependencies.supabaseUrl, dependencies.publicUrl);
  } catch {
    dependencies.diagnostic?.({ category: "AUTH_EMAIL_INVALID_PAYLOAD", webhookId, timestamp: new Date().toISOString() });
    return response(400, "Authentication email could not be prepared.");
  }
  try {
    const results = await Promise.all(messages.map((message, index) => dependencies.send(message, `auth-email/${webhookId}/${index}`)));
    results.forEach((result) => dependencies.diagnostic?.({ category: result.ok ? "AUTH_EMAIL_SENT" : "AUTH_EMAIL_PROVIDER_REJECTED", webhookId, action, providerStatus: result.status, providerMessageId: result.providerMessageId, timestamp: new Date().toISOString() }));
    if (results.some((result) => !result.ok)) return response(502, "Authentication email could not be sent. Try again shortly.");
    return response(200);
  } catch {
    dependencies.diagnostic?.({ category: "AUTH_EMAIL_PROVIDER_UNAVAILABLE", webhookId, action, timestamp: new Date().toISOString() });
    return response(502, "Authentication email could not be sent. Try again shortly.");
  }
};
