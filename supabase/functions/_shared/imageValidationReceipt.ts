const encoder = new TextEncoder();
const lifetimeSeconds = 300;
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");
const hash = async (bytes: Uint8Array) => hex(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
const key = (secret: string) => crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

// This capability proves only safety of these exact bytes. Upload authorization,
// household membership and normalized JPEG validation are checked independently.
export const issueImageValidationReceipt = async (bytes: Uint8Array, userId: string, secret?: string, now = Date.now()) => {
  if (!secret || secret.length < 32) return undefined;
  const issuedAt = Math.floor(now / 1000);
  const expiresAt = issuedAt + lifetimeSeconds;
  const claims = btoa(JSON.stringify({ version: 1, action: "upload", userId, hash: await hash(bytes), issuedAt, expiresAt }));
  const signature = hex(await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(claims)));
  return { token: `${claims}.${signature}`, expiresAt: expiresAt * 1000 };
};

export const verifyImageValidationReceipt = async (token: unknown, bytes: Uint8Array, userId: string, secret?: string, now = Date.now()) => {
  if (!secret || secret.length < 32 || typeof token !== "string" || token.length > 2048) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 2 || !/^[0-9a-f]{64}$/.test(parts[1])) return false;
    const signature = Uint8Array.from(parts[1].match(/../g)!, value => parseInt(value, 16));
    if (!await crypto.subtle.verify("HMAC", await key(secret), signature, encoder.encode(parts[0]))) return false;
    const claims = JSON.parse(atob(parts[0]));
    const seconds = Math.floor(now / 1000);
    return claims.version === 1 && claims.action === "upload" && claims.userId === userId
      && Number.isSafeInteger(claims.issuedAt) && Number.isSafeInteger(claims.expiresAt)
      && claims.issuedAt <= seconds && claims.expiresAt > seconds
      && claims.expiresAt - claims.issuedAt === lifetimeSeconds && claims.hash === await hash(bytes);
  } catch { return false; }
};
