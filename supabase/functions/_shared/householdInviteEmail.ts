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

type ProviderError = { statusCode?: number; name?: string; message?: string };

export const classifyEmailError = (error: ProviderError) => {
  const providerStatus = Number.isInteger(error.statusCode) ? error.statusCode! : null;
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
