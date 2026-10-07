import type { Household } from "./plantieRepository";

const selectedHouseholdStorageKey = "plantie-selected-households-v1";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const readSelectedHouseholdId = (storage: Pick<Storage, "getItem">, userId: string): string | null => {
  try {
    const stored: unknown = JSON.parse(storage.getItem(selectedHouseholdStorageKey) ?? "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return null;
    const id = (stored as Record<string, unknown>)[userId];
    return typeof id === "string" && uuidPattern.test(id) ? id : null;
  } catch {
    return null;
  }
};

export const writeSelectedHouseholdId = (storage: Pick<Storage, "getItem" | "setItem">, userId: string, householdId: string) => {
  if (!uuidPattern.test(userId) || !uuidPattern.test(householdId)) return;
  try {
    const parsed: unknown = JSON.parse(storage.getItem(selectedHouseholdStorageKey) ?? "{}");
    const stored = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    storage.setItem(selectedHouseholdStorageKey, JSON.stringify({ ...stored, [userId]: householdId }));
  } catch {
    // The current session still works when browser storage is unavailable.
  }
};

export const resolveHouseholdSelection = (households: Household[], preferredId: string | null) =>
  households.find((household) => household.id === preferredId || household.legacyPublicToken === preferredId) ?? households[0] ?? null;

export const householdAfterInviteAcceptance = (current: Household | null, joined: Household) => current ?? joined;
