import { invitationValidityMs, isInvitationId } from "./householdInvitationRules.js";

export const invitationAuthContextStorageKey = "plantie.auth.invitation-context";
type ContextStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const rememberInvitationAuthContext = (invitationId: string, storage: ContextStorage, now = Date.now()) => {
  if (!isInvitationId(invitationId)) return;
  storage.setItem(invitationAuthContextStorageKey, JSON.stringify({ invitationId, createdAt: now }));
};

export const readInvitationAuthContext = (storage: ContextStorage, now = Date.now()): string | null => {
  try {
    const value = JSON.parse(storage.getItem(invitationAuthContextStorageKey) ?? "null") as unknown;
    if (typeof value === "object" && value !== null) {
      const context = value as { invitationId?: unknown; createdAt?: unknown };
      if (isInvitationId(context.invitationId) && typeof context.createdAt === "number" &&
        Number.isFinite(context.createdAt) && context.createdAt <= now && now - context.createdAt < invitationValidityMs) {
        return context.invitationId;
      }
    }
    storage.removeItem(invitationAuthContextStorageKey);
  } catch {
    // Corrupt or unavailable storage must not prevent authentication.
  }
  return null;
};

export const clearInvitationAuthContext = (storage: Pick<Storage, "removeItem">) => {
  try { storage.removeItem(invitationAuthContextStorageKey); } catch { /* Storage can be restricted. */ }
};

export const invitationReturnLocation = (invitationId: string) =>
  isInvitationId(invitationId) ? `/#/join?invitation=${encodeURIComponent(invitationId)}` : "/#/menu";
