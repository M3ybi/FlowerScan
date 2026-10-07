// This tab-local marker remembers a verified recovery flow, never a credential.
// The provider session still authorizes every password update.
export const passwordRecoveryStorageKey = "plantie-password-recovery-v1";

export type PasswordRecoveryMarker = { userId: string; expiresAt: number };
export type RecoverySession = { user: { id: string }; expires_at?: number } | null;
type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;

export const createPasswordRecoveryMarker = (session: RecoverySession, now = Date.now()): PasswordRecoveryMarker | null => {
  if (!session?.user.id || !Number.isFinite(session.expires_at) || session.expires_at! * 1000 <= now) return null;
  return { userId: session.user.id, expiresAt: session.expires_at! * 1000 };
};

export const readPasswordRecoveryMarker = (storage: RecoveryStorage): PasswordRecoveryMarker | null => {
  try {
    const value: unknown = JSON.parse(storage?.getItem(passwordRecoveryStorageKey) ?? "null");
    if (!value || typeof value !== "object") return null;
    const marker = value as Partial<PasswordRecoveryMarker>;
    if (typeof marker.userId !== "string" || !marker.userId || marker.userId.length > 128 ||
        typeof marker.expiresAt !== "number" || !Number.isFinite(marker.expiresAt)) return null;
    return { userId: marker.userId, expiresAt: marker.expiresAt };
  } catch { return null; }
};

export const writePasswordRecoveryMarker = (storage: RecoveryStorage, marker: PasswordRecoveryMarker | null) => {
  try {
    if (marker) storage?.setItem(passwordRecoveryStorageKey, JSON.stringify(marker));
    else storage?.removeItem(passwordRecoveryStorageKey);
  } catch { /* Recovery still works when browser storage is unavailable. */ }
};

export const isPasswordRecoverySessionValid = (marker: PasswordRecoveryMarker | null, session: RecoverySession, now = Date.now()) =>
  Boolean(marker && session?.user.id === marker.userId && marker.expiresAt > now &&
    Number.isFinite(session.expires_at) && session.expires_at! * 1000 > now);
