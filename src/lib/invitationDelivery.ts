import { withRequestTimeout } from "./requestTimeout.js";

export type InvitationDeliveryResult = { invitationCreated: boolean; emailSent: boolean; errorCode?: string; providerMessageId?: string | null };
const publicCodes = new Set(["EMAIL_RATE_LIMITED", "EMAIL_CONFIGURATION_ERROR", "EMAIL_AUTH_ERROR", "EMAIL_SENDER_NOT_VERIFIED",
  "EMAIL_PROVIDER_UNAVAILABLE", "EMAIL_PROVIDER_REJECTED", "EMAIL_INVALID_RECIPIENT", "INVITE_LINK_UNAVAILABLE", "INVITE_NOT_ACTIONABLE"]);
const parseResult = (value: unknown): InvitationDeliveryResult | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.invitationCreated !== true || typeof row.emailSent !== "boolean") return null;
  return { invitationCreated: true, emailSent: row.emailSent,
    ...(typeof row.errorCode === "string" && publicCodes.has(row.errorCode) ? { errorCode: row.errorCode } : {}),
    ...(typeof row.providerMessageId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(row.providerMessageId) ? { providerMessageId: row.providerMessageId } : {}),
  };
};

export const deliverInvitation = (invoke: (signal: AbortSignal) => Promise<{ data: unknown; error: unknown }>) =>
  withRequestTimeout(async signal => {
    const { data, error } = await invoke(signal);
    if (error) {
      const context = (error as { context?: unknown }).context;
      if (context instanceof Response) {
        const failure = parseResult(await context.clone().json().catch(() => null));
        if (failure && !failure.emailSent) return failure;
        if (context.status === 429) return { invitationCreated: true, emailSent: false, errorCode: "EMAIL_RATE_LIMITED" };
      }
      throw new Error("Invitation email delivery is unavailable. Retry from the pending invitation.");
    }
    const result = parseResult(data);
    if (!result) throw new Error("Invite email service returned an invalid response.");
    return result;
  }, 30_000);
