export const isRevenueCatWebSandboxKey = (key: unknown): key is string =>
  typeof key === "string" && key.startsWith("rcb_sb_") && key.length > "rcb_sb_".length;

export const isRevenueCatTestStoreKey = (key: unknown): key is string =>
  typeof key === "string" && key.startsWith("test_") && key.length > "test_".length;

export const isRevenueCatEnvironmentAllowed = (
  event: { environment?: unknown; store?: unknown },
  allowSandbox: boolean,
  billingMode = "production",
  allowWebBillingSandbox = false,
) => {
  const environment = typeof event.environment === "string" ? event.environment.toUpperCase() : "";
  const store = typeof event.store === "string" ? event.store.toUpperCase() : "";
  if (billingMode !== "production" && billingMode !== "test_store") return false;
  // A separate opt-in keeps existing Test Store subscriptions working while
  // allowing Web Billing cancellation tests without admitting other sandboxes.
  if (allowWebBillingSandbox && store === "RC_BILLING" && environment === "SANDBOX") return true;
  if (billingMode === "test_store") return store === "TEST_STORE" && environment === "SANDBOX";
  if (store === "TEST_STORE" || environment === "SANDBOX") return allowSandbox;
  // Historical compatibility events may omit environment. A signed event with
  // an unknown explicit environment must not mutate subscription state.
  return environment === "" || environment === "PRODUCTION";
};
