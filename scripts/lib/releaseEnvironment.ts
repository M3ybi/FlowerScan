import { isRevenueCatTestStoreKey } from "../../src/lib/revenueCatEnvironment.js";

type Environment = Record<string, string | undefined>;
export type ReleaseEnvironment = "local" | "preview" | "staging" | "production";

export const releaseEndpoint = (value: string | undefined) => {
  if (!value) return "";
  try {
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)
      || url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return "";
    return url.origin;
  } catch { return ""; }
};

// Build-only checks. No keys, endpoint values or provider state are logged.
export const validateReleaseEnvironment = (env: Environment, mode: string): ReleaseEnvironment => {
  const explicit = env.PLANTIE_RELEASE_ENV;
  if (explicit && !["local", "preview", "staging", "production"].includes(explicit)) throw new Error("RELEASE_ENVIRONMENT_INVALID");
  const preview = env.CONTEXT === "deploy-preview" || env.CONTEXT === "branch-deploy";
  const selected = explicit || (preview ? "preview" : env.CONTEXT === "production" ? "production" : mode === "test" ? "staging" : "local");
  if (preview && selected !== "preview" && selected !== "staging") throw new Error("RELEASE_PREVIEW_ENVIRONMENT_REQUIRED");
  if (env.CONTEXT === "production" && selected !== "production") throw new Error("RELEASE_PRODUCTION_ENVIRONMENT_REQUIRED");
  const billingMode = env.VITE_REVENUECAT_BILLING_MODE;
  if (billingMode && !["production", "test_store"].includes(billingMode)) throw new Error("RELEASE_BILLING_MODE_INVALID");
  if (selected === "local") return selected;
  const active = releaseEndpoint(env.VITE_SUPABASE_URL);
  const production = releaseEndpoint(env.PLANTIE_PRODUCTION_SUPABASE_URL);
  if (!active || !production || !env.VITE_SUPABASE_ANON_KEY) throw new Error("RELEASE_DATABASE_CONFIGURATION_REQUIRED");
  if (env.VITE_BACKEND_PROVIDER === "netlify" || env.VITE_ENABLE_NETLIFY_LEGACY_BACKEND === "true") throw new Error("RELEASE_LEGACY_BACKEND_REVIEW_REQUIRED");
  if (selected === "preview" || selected === "staging") {
    const approved = releaseEndpoint(env.PLANTIE_TEST_SUPABASE_URL);
    if (!approved || active !== approved || active === production) throw new Error("RELEASE_DATABASE_ISOLATION_REQUIRED");
    if (mode === "production" || billingMode === "production" || !isRevenueCatTestStoreKey(env.VITE_REVENUECAT_API_KEY_TEST_STORE)) throw new Error("RELEASE_TEST_BILLING_REQUIRED");
  } else {
    if (active !== production || mode !== "production") throw new Error("RELEASE_PRODUCTION_TARGET_MISMATCH");
    const platform = env.PLANTIE_RELEASE_PLATFORM ?? "web";
    if (billingMode === "test_store") {
      if (platform === "ios" || platform === "android") throw new Error("RELEASE_TEST_STORE_NATIVE_DEBUG_REQUIRED");
      if (platform !== "web" || !isRevenueCatTestStoreKey(env.VITE_REVENUECAT_API_KEY_TEST_STORE)) throw new Error("RELEASE_TEST_BILLING_REQUIRED");
      return selected as ReleaseEnvironment;
    }
    const key = platform === "ios" ? env.VITE_REVENUECAT_API_KEY_IOS : platform === "android" ? env.VITE_REVENUECAT_API_KEY_ANDROID : env.VITE_REVENUECAT_API_KEY_WEB;
    const prefix = platform === "ios" ? "appl_" : platform === "android" ? "goog_" : platform === "web" ? "rcb_" : "";
    if (!prefix || !key?.startsWith(prefix) || key.length <= prefix.length || key.startsWith("rcb_sb_")) throw new Error("RELEASE_PRODUCTION_BILLING_REQUIRED");
  }
  return selected as ReleaseEnvironment;
};
