import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve("supabase/migrations/20260531210000_household_creation_rpc.sql"), "utf8");
const seedScript = readFileSync(resolve("scripts/seed-plant-catalog.mjs"), "utf8");
const authService = readFileSync(resolve("src/lib/authService.ts"), "utf8");
const authHook = readFileSync(resolve("src/hooks/useAuth.ts"), "utf8");
const authButton = readFileSync(resolve("src/components/AuthButton.tsx"), "utf8");
const entitlementMigration = readFileSync(resolve("supabase/migrations/20260531213000_subscription_entitlements.sql"), "utf8");
const entitlementService = readFileSync(resolve("src/lib/entitlementService.ts"), "utf8");
const pricingPage = readFileSync(resolve("src/components/PricingPage.tsx"), "utf8");
const upgradeModal = readFileSync(resolve("src/components/UpgradeModal.tsx"), "utf8");
const billingService = readFileSync(resolve("src/lib/billingService.ts"), "utf8");
const revenueCatWebhook = readFileSync(resolve("netlify/functions/revenuecat-webhook.ts"), "utf8");

const requiredSeedFragments = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_URL",
  ".upsert(catalogRows, { onConflict: \"legacy_id\" })",
  ".from(\"plant_care_pills\")",
  ".from(\"plant_care_tips\")",
  "catalog_plant_id",
  "legacy_id: flower.id",
];

for (const fragment of requiredSeedFragments) {
  if (!seedScript.includes(fragment)) {
    throw new Error(`Seed script is missing required fragment: ${fragment}`);
  }
}

const requiredMigrationFragments = [
  "create or replace function public.create_household_for_current_user",
  "security definer",
  "auth.uid()",
  "insert into public.household_members",
  "grant execute on function public.create_household_for_current_user(text) to authenticated",
];

for (const fragment of requiredMigrationFragments) {
  if (!migration.includes(fragment)) {
    throw new Error(`Household creation migration is missing required fragment: ${fragment}`);
  }
}

const requiredAuthFragments = [
  "signInWithOtp",
  "signInWithOAuth",
  "signOut",
  "getSession",
  "getUser",
  "onAuthStateChange",
  "profiles",
  "bootstrapAuthenticatedAccount",
  "createHousehold(\"Moja domácnosť\")",
];

for (const fragment of requiredAuthFragments) {
  if (!authService.includes(fragment)) {
    throw new Error(`Auth service is missing required fragment: ${fragment}`);
  }
}

const requiredHookFragments = ["useAuth", "isAuthenticated", "loading", "session", "user"];
for (const fragment of requiredHookFragments) {
  if (!authHook.includes(fragment)) {
    throw new Error(`Auth hook is missing required fragment: ${fragment}`);
  }
}

if (!authButton.includes("AuthModal") || !authButton.includes("AccountMenu")) {
  throw new Error("AuthButton must expose both sign-in and account states.");
}

const requiredEntitlementMigrationFragments = [
  "create type public.subscription_platform",
  "create type public.subscription_status",
  "create type public.billing_period",
  "create table public.subscription_plans",
  "create table public.user_subscriptions",
  "create table public.subscription_events",
  "create table public.user_entitlements",
  "create table public.usage_counters",
  "('free', 'Free', 'none', 10, 10, 10, false, false, false, 10)",
  "('premium_monthly', 'Premium Monthly', 'monthly', null, null, null, true, true, true, 20)",
  "('premium_yearly', 'Premium Yearly', 'yearly', null, null, null, true, true, true, 30)",
  "alter table public.user_subscriptions enable row level security",
  "create policy \"user_subscriptions_select_own\"",
  "create or replace function public.get_my_entitlement()",
  "create or replace function public.increment_usage_counter(counter_type text)",
  "create or replace function public.can_use_feature(feature_key text)",
  "create or replace function public.reset_monthly_usage_counters()",
  "grant execute on function public.increment_usage_counter(text) to authenticated",
];

for (const fragment of requiredEntitlementMigrationFragments) {
  if (!entitlementMigration.includes(fragment)) {
    throw new Error(`Entitlement migration is missing required fragment: ${fragment}`);
  }
}

const requiredEntitlementServiceFragments = [
  "getMyEntitlement",
  "isPremium",
  "canScanPlant",
  "canAddPlant",
  "canCreateQrLabel",
  "canUseAiDiagnosis",
  "incrementAiScanUsage",
  "get_my_entitlement",
  "increment_usage_counter",
];

for (const fragment of requiredEntitlementServiceFragments) {
  if (!entitlementService.includes(fragment)) {
    throw new Error(`Entitlement service is missing required fragment: ${fragment}`);
  }
}

if (
  !pricingPage.includes("Available in mobile app") ||
  !pricingPage.includes("Billing not configured") ||
  !pricingPage.includes("Premium access is still decided by Supabase server entitlements") ||
  !upgradeModal.includes("Available in mobile app") ||
  !upgradeModal.includes("Billing not configured") ||
  !upgradeModal.includes("Premium activates only after server entitlement confirmation")
) {
  throw new Error("Subscription UI must keep web disabled and avoid local Premium activation.");
}

const requiredBillingFragments = [
  "plantie_premium_monthly",
  "plantie_premium_yearly",
  "BillingNotConfiguredError",
  "BillingWebDisabledError",
  "VITE_REVENUECAT_API_KEY_IOS",
  "VITE_REVENUECAT_API_KEY_ANDROID",
  "premium",
  "purchasePremiumMonthly",
  "purchasePremiumYearly",
  "restorePurchases",
  "syncEntitlements",
];

for (const fragment of requiredBillingFragments) {
  if (!billingService.includes(fragment)) {
    throw new Error(`Billing service is missing required fragment: ${fragment}`);
  }
}

const requiredWebhookFragments = [
  "REVENUECAT_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
  "RevenueCat webhook is not configured.",
  "Unauthorized.",
  "Invalid RevenueCat webhook payload.",
  "processRevenueCatWebhookEvent",
  "subscription_events",
  "user_subscriptions",
  "user_entitlements",
  "usage_counters",
  "updatesApplied",
  "RevenueCat webhook received",
];

for (const fragment of requiredWebhookFragments) {
  if (!revenueCatWebhook.includes(fragment)) {
    throw new Error(`RevenueCat webhook is missing required fragment: ${fragment}`);
  }
}

console.log("Supabase catalog seed, auth, entitlement, and billing validation passed.");
