import { Resend } from "npm:resend";
import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/cors.ts";

const defaultFromEmail = "Plantie <onboarding@resend.dev>";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sanitizeText = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 204 });
  if (request.method !== "POST") return json(405, { message: "Use POST to send a household invite email." });

  const auth = await requireUser(request.headers.get("authorization") ?? "");
  if (!auth) {
    return json(401, { message: "Sign in before sending an invite email." });
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return json(500, { message: "Invite email service is not configured." });
  }

  let body: { householdId?: string; householdName?: string; inviteUrl?: string; recipientEmail?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return json(400, { message: "Invalid invite email request." });
  }

  const householdId = sanitizeText(body.householdId, 80);
  const householdName = sanitizeText(body.householdName, 120) || "Plantie household";
  const recipientEmail = sanitizeText(body.recipientEmail, 240).toLowerCase();
  const role = body.role === "owner" || body.role === "viewer" ? body.role : "editor";
  const inviteUrl = typeof body.inviteUrl === "string" ? body.inviteUrl.trim() : "";

  let parsedInviteUrl: URL;
  try {
    parsedInviteUrl = new URL(inviteUrl);
  } catch {
    return json(400, { message: "Invite link is not valid." });
  }

  if (!uuidLike.test(householdId) || !emailPattern.test(recipientEmail) || !["http:", "https:"].includes(parsedInviteUrl.protocol)) {
    return json(400, { message: "Invite email request is not valid." });
  }

  const { data: canEdit, error: accessError } = await auth.client.rpc("can_edit_household", { target_household_id: householdId });
  if (accessError || !canEdit) {
    return json(403, { message: "Editor or owner access is required to email invites." });
  }

  const from = Deno.env.get("RESEND_FROM_EMAIL") || defaultFromEmail;
  const senderEmail = auth.user.email ?? "a Plantie household member";
  const safeHouseholdName = escapeHtml(householdName);
  const safeRecipientUrl = escapeHtml(parsedInviteUrl.toString());
  const safeSenderEmail = escapeHtml(senderEmail);
  const safeRole = escapeHtml(role);
  const resend = new Resend(apiKey);

  const { data, error } = await resend.emails.send({
    from,
    to: recipientEmail,
    subject: `Join ${householdName} on Plantie`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#173f35;max-width:560px;margin:0 auto;padding:24px">
        <h1 style="font-size:24px;margin:0 0 12px">You're invited to Plantie</h1>
        <p style="margin:0 0 16px">${safeSenderEmail} invited you to join <strong>${safeHouseholdName}</strong> as ${safeRole}.</p>
        <p style="margin:0 0 24px">Open the secure invite link below to join the household and help care for shared plants.</p>
        <a href="${safeRecipientUrl}" style="display:inline-block;background:#0f4a3a;color:#ffffff;text-decoration:none;border-radius:8px;padding:12px 18px;font-weight:700">Accept invite</a>
        <p style="font-size:13px;color:#587066;margin:24px 0 0">If the button does not work, copy this link into your browser:<br>${safeRecipientUrl}</p>
      </div>
    `,
    text: `${senderEmail} invited you to join ${householdName} on Plantie as ${role}.\n\nAccept invite: ${parsedInviteUrl.toString()}`,
  });

  if (error) {
    console.error("Resend household invite email failed", { userIdPrefix: `${auth.user.id.slice(0, 8)}...` });
    return json(502, { message: "Invite was created, but the email could not be sent." });
  }

  return json(202, { id: data?.id ?? null, message: "Invite email sent." });
});
