import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve("supabase/migrations/20260531210000_household_creation_rpc.sql"), "utf8");
const seedScript = readFileSync(resolve("scripts/seed-plant-catalog.mjs"), "utf8");
const authService = readFileSync(resolve("src/lib/authService.ts"), "utf8");
const authRules = readFileSync(resolve("src/lib/authRules.ts"), "utf8");
const authHook = readFileSync(resolve("src/hooks/useAuth.ts"), "utf8");
const authButton = readFileSync(resolve("src/components/AuthButton.tsx"), "utf8");
const entitlementMigration = readFileSync(resolve("supabase/migrations/20260531213000_subscription_entitlements.sql"), "utf8");
const entitlementService = readFileSync(resolve("src/lib/entitlementService.ts"), "utf8");
const pricingPage = readFileSync(resolve("src/components/PricingPage.tsx"), "utf8");
const upgradeModal = readFileSync(resolve("src/components/UpgradeModal.tsx"), "utf8");
const i18n = readFileSync(resolve("src/lib/i18n.ts"), "utf8");
const billingService = readFileSync(resolve("src/lib/billingService.ts"), "utf8");
const revenueCatProducts = readFileSync(resolve("src/lib/revenueCatProducts.ts"), "utf8");
const revenueCatWebhook = readFileSync(resolve("netlify/functions/revenuecat-webhook.ts"), "utf8");
const revenueCatEdgeWebhook = readFileSync(resolve("supabase/functions/revenuecat-webhook/index.ts"), "utf8");
const householdBillingMigration = readFileSync(resolve("supabase/migrations/20261007123000_household_billing_identity.sql"), "utf8");

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
  "signUp",
  "signInWithPassword",
  "resetPasswordForEmail",
  "getUserHouseholds()",
  "return null",
];

for (const fragment of requiredAuthFragments) {
  if (!(authService.includes(fragment) || authRules.includes(fragment))) {
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

const requiredSubscriptionUiFragments = [
  [pricingPage, 't("pricing.notConfigured")'],
  [pricingPage, 't("pricing.purchaseSubmitted")'],
  [pricingPage, 't("pricing.cancelSubscription")'],
  [pricingPage, 'createCancellationHandoff'],
  [i18n, '"pricing.notConfigured": "Billing not configured"'],
  [i18n, "Choose a plan below"],
  [i18n, "Premium activates after secure server confirmation"],
  [upgradeModal, 't("pricing.buyMonthly")'],
  [upgradeModal, 't("pricing.notConfigured")'],
  [upgradeModal, 't("pricing.purchaseSubmitted")'],
];

for (const [source, fragment] of requiredSubscriptionUiFragments) {
  if (!source.includes(fragment)) {
    throw new Error(`Subscription UI must support web and avoid local Premium activation. Missing: ${fragment}`);
  }
}

const requiredBillingFragments = [
  "BillingNotConfiguredError",
  "createRevenueCatWebBillingService",
  "VITE_REVENUECAT_API_KEY_IOS",
  "VITE_REVENUECAT_API_KEY_ANDROID",
  "VITE_REVENUECAT_API_KEY_WEB",
  "premium",
  "purchasePremiumMonthly",
  "purchasePremiumYearly",
  "restorePurchases",
  "syncEntitlements",
];

for (const fragment of ["plantie_premium_monthly", "plantie_premium_yearly", "plantie_premium_monthly:monthly", "plantie_premium_yearly:yearly"]) {
  if (!revenueCatProducts.includes(fragment)) {
    throw new Error(`RevenueCat product mapping is missing required fragment: ${fragment}`);
  }
}

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
  'rpc("apply_household_provider_event"',
  "event_occurred_at",
  "updatesApplied",
  "RevenueCat webhook received",
];

for (const fragment of requiredWebhookFragments) {
  if (!revenueCatWebhook.includes(fragment)) {
    throw new Error(`RevenueCat webhook is missing required fragment: ${fragment}`);
  }
}

if (!revenueCatEdgeWebhook.includes('rpc("apply_household_provider_event"')) {
  throw new Error("Primary RevenueCat webhook must use the same atomic household provider event RPC.");
}

const requiredHouseholdBillingFragments = [
  "create table public.household_billing_customers",
  "create table public.household_subscription_sources",
  "create table public.household_provider_transactions",
  "create function public.apply_household_provider_event",
  "security definer",
  "for update",
  "on conflict (event_id) do nothing",
  "previous_row.last_provider_event_at > event_occurred_at",
  "insert into public.household_subscriptions",
  "insert into public.user_subscriptions",
  "insert into public.user_entitlements",
  "insert into public.usage_counters",
  "perform public.reconcile_household_access(target_household)",
  "from public, anon, authenticated",
  "to service_role",
];
for (const fragment of requiredHouseholdBillingFragments) {
  if (!householdBillingMigration.includes(fragment)) {
    throw new Error(`Atomic household billing migration is missing required fragment: ${fragment}`);
  }
}

console.log("Supabase catalog seed, auth, entitlement, and billing validation passed.");
