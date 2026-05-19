export type HouseholdSession = {
  name: string;
  publicToken: string;
};

export const householdSessionStorageKey = "flowscan-active-household-v1";

const householdTokenPattern = /^[A-Za-z0-9_-]{18,80}$/;

export const isValidHouseholdToken = (value: unknown): value is string =>
  typeof value === "string" && householdTokenPattern.test(value);

export const getHouseholdTokenFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("householdId") ?? params.get("household");
  return isValidHouseholdToken(token) ? token : "";
};

export const getStoredHouseholdSession = (): HouseholdSession | null => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(householdSessionStorageKey) ?? "null") as Partial<HouseholdSession> | null;
    if (parsed && typeof parsed.name === "string" && isValidHouseholdToken(parsed.publicToken)) {
      return { name: parsed.name, publicToken: parsed.publicToken };
    }
  } catch {
    return null;
  }

  return null;
};

export const storeHouseholdSession = (household: HouseholdSession) => {
  window.localStorage.setItem(householdSessionStorageKey, JSON.stringify(household));
};

export const clearHouseholdSession = () => {
  window.localStorage.removeItem(householdSessionStorageKey);
};

export const createHouseholdUrl = (householdToken: string, hash = window.location.hash || "#/") => {
  const url = new URL(window.location.href);
  url.searchParams.set("householdId", householdToken);
  url.hash = hash;
  return url.toString();
};

export const createHouseholdApiUrl = (path: string, householdToken: string) =>
  `${path}?householdId=${encodeURIComponent(householdToken)}`;

export const removeHouseholdFromCurrentUrl = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete("householdId");
  url.searchParams.delete("household");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash || "#/"}`);
};
