export type HouseholdScopedState<T> = Record<string, T | undefined>;

// Legacy token access has no authenticated membership check. Keep it disabled
// unless an operator explicitly enables the isolated rollback backend.
export const isLegacyNetlifyServerEnabled = (flag = process.env.ENABLE_NETLIFY_LEGACY_BACKEND) => flag === "true";

export const legacyBackendDisabledResponse = (headers: Record<string, string>) =>
  isLegacyNetlifyServerEnabled() ? null : {
    body: JSON.stringify({ error: "Legacy household access is disabled. Sign in to Plantie to access your household." }),
    headers,
    statusCode: 410,
  };

export const householdTokenPattern = /^[A-Za-z0-9_-]{18,80}$/;

export const isValidHouseholdTokenValue = (value: unknown): value is string =>
  typeof value === "string" && householdTokenPattern.test(value);

export const createHouseholdScopedKey = (householdToken: string, key: string) => {
  if (!isValidHouseholdTokenValue(householdToken)) {
    throw new Error("Invalid household token.");
  }

  return `households/${householdToken}/${key}`;
};

export const getHouseholdScopedValue = <T>(states: HouseholdScopedState<T>, householdToken: string) => {
  if (!isValidHouseholdTokenValue(householdToken)) {
    return null;
  }

  return states[householdToken] ?? null;
};

export const canAccessPlantRecord = (
  householdToken: string,
  plantHouseholdToken: string,
  plantId: unknown,
  knownPlantIds: Set<string>,
) =>
  isValidHouseholdTokenValue(householdToken) &&
  householdToken === plantHouseholdToken &&
  typeof plantId === "string" &&
  knownPlantIds.has(plantId);

export const migrateLegacyStateToDefaultHousehold = <T>(
  states: HouseholdScopedState<T>,
  defaultHouseholdToken: string,
  legacyState: T,
) => {
  if (!isValidHouseholdTokenValue(defaultHouseholdToken)) {
    throw new Error("Invalid default household token.");
  }

  if (states[defaultHouseholdToken]) {
    return states;
  }

  return {
    ...states,
    [defaultHouseholdToken]: legacyState,
  };
};
