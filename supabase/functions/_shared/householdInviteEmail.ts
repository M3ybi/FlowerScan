const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export const escapeHtml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

export const parseSender = (value: string | undefined) => {
  if (!value || /[\r\n]/.test(value)) return null;
  const email = value.match(/^(?:[^<>]+ <)?([^<>\s]+@[^<>\s]+)>?$/)?.[1];
  return email && emailPattern.test(email) && !email.toLowerCase().endsWith("@resend.dev") ? email : null;
};

export const buildInviteUrl = (publicUrl: string | undefined, token: string) => {
  if (!publicUrl || !/^[A-Za-z0-9_-]{32,}$/.test(token)) return null;
  try {
    const url = new URL(publicUrl);
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== "https:" && !(local && url.protocol === "http:"))) return null;
    if (url.search || url.hash) return null;
    url.hash = `#/join?invite=${encodeURIComponent(token)}`;
    return url.toString();
  } catch {
    return null;
  }
};

export const renderHouseholdInvitationEmail = (input: {
  householdName: string;
  senderEmail: string;
  invitedEmail: string;
  inviteUrl: string;
  expiresAt: string;
}) => {
  const householdName = input.householdName.replace(/\s+/g, " ").trim().slice(0, 120) || "Plantie household";
  const expiry = new Date(input.expiresAt);
  if (!Number.isFinite(expiry.getTime())) throw new Error("Invalid invitation expiry.");
  const expiryLabel = `${expiry.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  const safeHouseholdName = escapeHtml(householdName);
  const safeRecipientUrl = escapeHtml(input.inviteUrl);
  return {
    subject: `Join ${householdName} on Plantie`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#173f35;max-width:560px;margin:0 auto;padding:24px">
        <h1 style="font-size:24px;margin:0 0 12px">You're invited to Plantie</h1>
        <p style="margin:0 0 16px">${escapeHtml(input.senderEmail)} invited you to join <strong>${safeHouseholdName}</strong> as a Viewer.</p>
        <p>If you already have a Plantie account, sign in to review and accept this invitation.</p>
        <p>If you're new to Plantie, create an account using <strong>${escapeHtml(input.invitedEmail)}</strong> and verify your email.</p>
        <p>Joining adds another household to your account. Your existing household and plants will stay unchanged.</p>
        <a href="${safeRecipientUrl}" style="display:inline-block;background:#0f4a3a;color:#ffffff;text-decoration:none;border-radius:8px;padding:12px 18px;font-weight:700">Join ${safeHouseholdName}</a>
        <p>This invitation is valid for 7 days from creation and expires on ${expiryLabel}. Resending does not extend its validity.</p>
        <p style="font-size:13px;color:#587066;margin:24px 0 0">If the button does not work, copy this link into your browser:<br>${safeRecipientUrl}</p>
      </div>`,
    text: `${input.senderEmail} invited you to join ${householdName} on Plantie as a Viewer.\n\nIf you already have an account, sign in to review and accept. If you're new, create an account using ${input.invitedEmail} and verify your email.\n\nYour existing household and plants will stay unchanged.\n\nJoin ${householdName}: ${input.inviteUrl}\n\nThis invitation is valid for 7 days from creation and expires on ${expiryLabel}. Resending does not extend its validity.`,
  };
};

type ProviderError = { statusCode?: number | null; name?: string; message?: string };

export const classifyEmailError = (error: ProviderError) => {
  const providerStatus = typeof error.statusCode === "number" && Number.isInteger(error.statusCode) ? error.statusCode : null;
  const providerCategory = typeof error.name === "string" ? error.name.slice(0, 60) : "unknown";
  const message = String(error.message ?? "").toLowerCase();
  let errorCode = "EMAIL_PROVIDER_REJECTED";
  if (providerStatus === 401) errorCode = "EMAIL_AUTH_ERROR";
  else if (providerStatus === 403 && /domain|sender|testing|verify|verified/.test(message)) errorCode = "EMAIL_SENDER_NOT_VERIFIED";
  else if (providerStatus === 429) errorCode = "EMAIL_RATE_LIMITED";
  else if (providerStatus === 422) errorCode = "EMAIL_INVALID_RECIPIENT";
  else if (providerStatus !== null && providerStatus >= 500) errorCode = "EMAIL_PROVIDER_UNAVAILABLE";
  return { errorCode, providerStatus, providerCategory };
};
