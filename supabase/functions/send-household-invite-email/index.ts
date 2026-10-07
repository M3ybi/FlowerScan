import { Resend } from "npm:resend";
import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { buildInviteUrl, classifyEmailError, parseSender, renderHouseholdInvitationEmail } from "../_shared/householdInviteEmail.ts";

const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type InviteDelivery = {
  invite_id: string;
  household_id: string;
  household_name: string;
  invitee_email: string;
  token: string;
  expires_at: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 204 });
  if (request.method !== "POST") return json(405, { message: "Use POST to send a household invite email." });

  const auth = await requireUser(request.headers.get("authorization") ?? "");
  if (!auth) return json(401, { message: "Sign in before sending an invite email." });

  let body: { inviteId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { message: "Invalid invite email request." });
  }
  if (!body || typeof body.inviteId !== "string" || !uuidLike.test(body.inviteId)) {
    return json(400, { message: "Invalid invitation identifier." });
  }

  // The database checks Owner, Premium, active state and token integrity. No
  // recipient, household name, link or token is trusted from the browser.
  const { data, error: accessError } = await auth.client.rpc("get_household_invite_delivery", {
    target_invite_id: body.inviteId,
  }).single<InviteDelivery>();
  if (accessError || !data) {
    const unavailable = accessError?.message?.includes("Invite link cannot be recovered");
    return json(unavailable ? 200 : 403, {
      invitationCreated: true,
      emailSent: false,
      errorCode: unavailable ? "INVITE_LINK_UNAVAILABLE" : "INVITE_NOT_ACTIONABLE",
    });
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL");
  const sender = parseSender(from);
  const inviteUrl = buildInviteUrl(Deno.env.get("APP_PUBLIC_URL"), data.token);
  if (!apiKey || !sender || !inviteUrl) {
    console.error("Household invite delivery configuration invalid", {
      invitationId: data.invite_id,
      householdId: data.household_id,
      missingApiKey: !apiKey,
      invalidSender: !sender,
      invalidPublicUrl: !inviteUrl,
      timestamp: new Date().toISOString(),
    });
    return json(200, { invitationCreated: true, emailSent: false, errorCode: "EMAIL_CONFIGURATION_ERROR" });
  }

  const senderEmail = auth.user.email ?? "A Plantie household owner";
  try {
    const message = renderHouseholdInvitationEmail({
      householdName: data.household_name,
      senderEmail,
      invitedEmail: data.invitee_email,
      inviteUrl,
      expiresAt: data.expires_at,
    });
    const resend = new Resend(apiKey);
    const { data: sent, error } = await resend.emails.send({
      from: from!,
      to: data.invitee_email,
      ...message,
    });
    if (error) {
      const failure = classifyEmailError(error);
      console.error("Household invite provider rejected email", {
        invitationId: data.invite_id,
        householdId: data.household_id,
        recipientDomain: data.invitee_email.split("@")[1],
        providerStatus: failure.providerStatus,
        providerCategory: failure.providerCategory,
        errorCode: failure.errorCode,
        timestamp: new Date().toISOString(),
      });
      return json(200, { invitationCreated: true, emailSent: false, errorCode: failure.errorCode });
    }
    return json(200, { invitationCreated: true, emailSent: true, providerMessageId: sent?.id ?? null });
  } catch {
    console.error("Household invite provider request failed", {
      invitationId: data.invite_id,
      householdId: data.household_id,
      errorCode: "EMAIL_PROVIDER_UNAVAILABLE",
      timestamp: new Date().toISOString(),
    });
    return json(200, { invitationCreated: true, emailSent: false, errorCode: "EMAIL_PROVIDER_UNAVAILABLE" });
  }
});
