export const isRevenueCatTestStoreKey = (key: unknown): key is string =>
  typeof key === "string" && key.startsWith("test_") && key.length > "test_".length;

export const isRevenueCatEnvironmentAllowed = (
  event: { environment?: unknown; store?: unknown },
  allowSandbox: boolean,
  billingMode = "production",
) => {
  const environment = typeof event.environment === "string" ? event.environment.toUpperCase() : "";
  const store = typeof event.store === "string" ? event.store.toUpperCase() : "";
  if (billingMode === "test_store") return store === "TEST_STORE" && environment === "SANDBOX";
  if (billingMode !== "production") return false;
  if (store === "TEST_STORE" || environment === "SANDBOX") return allowSandbox;
  // Historical compatibility events may omit environment. A signed event with
  // an unknown explicit environment must not mutate subscription state.
  return environment === "" || environment === "PRODUCTION";
};
