export const isRevenueCatEnvironmentAllowed = (
  event: { environment?: unknown; store?: unknown },
  allowSandbox: boolean,
) => {
  const environment = typeof event.environment === "string" ? event.environment.toUpperCase() : "";
  const store = typeof event.store === "string" ? event.store.toUpperCase() : "";
  if (store === "TEST_STORE" || environment === "SANDBOX") return allowSandbox;
  // Historical compatibility events may omit environment. A signed event with
  // an unknown explicit environment must not mutate subscription state.
  return environment === "" || environment === "PRODUCTION";
};
