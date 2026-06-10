# Supabase setup for Plantie

This project now contains the Supabase foundation, but the running app still uses the existing localStorage and Netlify Blob flows. Do not remove the Netlify functions or blob storage until the app logic is explicitly migrated.

## Required frontend environment variables

Set these in local development and hosting environments:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

Rules:

- Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are used by frontend code.
- Do not add `SUPABASE_SERVICE_ROLE_KEY` to Vite, React, or any `VITE_*` variable.
- Service role credentials, if needed later for migrations, scheduled jobs, or Edge Functions, must stay server-side only.

## Migration file

Apply the SQL migration in:

```text
supabase/migrations/20260531203000_plantie_foundation.sql
```

The migration creates:

- `profiles`
- `households`
- `household_members`
- `household_invites`
- `plant_catalog`
- `plants`
- `plant_care_pills`
- `plant_care_tips`
- `plant_care_records`
- `plant_diagnostics`
- `diagnostic_observed_symptoms`
- `diagnostic_recommended_steps`
- `household_report_settings`
- `push_subscriptions`
- `ai_requests`
- `notification_deliveries`

It also creates required enums, UUID primary keys, legacy ID/token fields, indexes, `updated_at` triggers, and RLS policies.

## Manual Supabase dashboard steps

1. Open the existing Supabase project.
2. Apply the migration through the Supabase CLI or SQL editor.
3. Apply follow-up migrations in timestamp order, including `supabase/migrations/20260531210000_household_creation_rpc.sql`.
4. Confirm Row Level Security is enabled on all app tables.
5. Create the Storage buckets listed in `docs/supabase-storage-buckets.md` when image migration starts.
6. Keep the service role key out of frontend hosting variables.
7. Keep current Netlify environment variables unchanged until backend migration begins.

## Catalog seed

The built-in catalog can be seeded from `src/data/flowers.ts` with:

```bash
npm run seed:plant-catalog
```

Required local/server environment:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
```

Notes:

- The seed script is idempotent and upserts `plant_catalog` by `legacy_id`.
- It replaces catalog-linked `plant_care_pills` and `plant_care_tips` for the seeded catalog rows before reinserting them.
- The service role key is allowed only for this local/server seed script.
- Do not put the service role key in frontend code or in any `VITE_*` variable.
- The script preserves current IDs such as `flower-01` in `plant_catalog.legacy_id`.

To run static validation for the seed assets:

```bash
npm run test:supabase
```

This validation does not connect to Supabase.

## RLS policy summary

- Users can read only households where they have a `household_members` row.
- `owner` and `editor` members can insert, update, and delete household plants, plant care records, diagnostics, report settings, and related child rows.
- `viewer` members can read household-owned data but cannot write it.
- Household invites are manageable only by owners.
- Push subscriptions are writable only by authenticated members of the household.
- Notification delivery rows are readable by household members and have no client insert/update/delete policy.
- Plant catalog rows are publicly readable but not publicly writable.
- AI request rows are insertable/readable only by the related authenticated user and household members.

## Compatibility notes

- `households.legacy_public_token` preserves the current public household token model for future migration.
- `plant_catalog.legacy_id`, `plants.legacy_id`, and `plant_diagnostics.legacy_id` preserve current IDs such as `flower-04`, `custom-*`, and `diag-*`.
- Existing localStorage keys and Netlify Blob keys are intentionally untouched.
- Existing app code does not yet read from or write to Supabase.

## Repository layer

Typed browser repository functions are available in `src/lib/plantieRepository.ts`.

Current functions:

- `getPlantCatalog()`
- `getPlantCatalogByLegacyId(legacyId)`
- `getUserHouseholds()`
- `getHouseholdPlants(householdId)`
- `getHouseholdPlantByLegacyId(householdId, legacyId)`
- `createHousehold(name)`
- `createHouseholdPlant(input)`
- `updateHouseholdPlant(id, patch)`
- `updatePlantCareRecord(plantId, patch)`

These functions use the browser Supabase client and rely on RLS. They are intentionally not called from `App.tsx` yet.

## Auth infrastructure

Optional Supabase Auth infrastructure is available. First-run onboarding now asks users to choose language, sign in or create an account, then explicitly create a household or accept a valid invite before the dashboard appears. Guest mode is not exposed in production UI.

Files:

- `src/lib/authService.ts`
- `src/hooks/useAuth.ts`
- `src/components/AuthPanel.tsx`
- `src/components/AuthButton.tsx`
- `src/components/AuthModal.tsx`
- `src/components/AccountMenu.tsx`

Available auth service functions:

- `signInWithMagicLink(email)`
- `registerWithEmailPassword(email, password)`
- `signInWithEmailPassword(email, password)`
- `requestPasswordReset(email)`
- `signInWithGoogle()`
- `signOut()`
- `getCurrentUser()`
- `getCurrentSession()`
- `onAuthStateChange(callback)`

The auth bootstrap:

- Upserts `profiles.id` from `auth.users.id`.
- Loads the first existing household for the authenticated user.
- Returns `null` when the user has no household. The app must then show Create or Join Household.
- Does not create a household automatically on login.

Required Supabase Auth settings:

- Enable Email provider with password sign-up/sign-in.
- Configure password minimum length at least 8 characters.
- Enable password reset emails and set the site URL / redirect URLs for web and Capacitor deep links before production.
- Enable Google OAuth with the configured web, Android, and iOS redirect URIs.
- Apple Sign-In is shown as a disabled placeholder until Apple Developer setup is ready.
- Amazon Login is shown as a disabled placeholder and should stay disabled unless a complete provider integration is added.

Google Play Data Safety notes:

- Declare account creation and login with email/password.
- Declare OAuth login with Google.
- Apple and Amazon are not active providers yet because the buttons are disabled and do not authenticate users.
- Do not declare client-side password storage; Plantie uses Supabase Auth and does not store passwords manually.
- Does not migrate legacy household-token data.
- Does not replace localStorage or Netlify Blob sync.

### Manual Supabase Auth dashboard settings

In Supabase Dashboard > Authentication:

1. Enable Email provider if magic links should be available.
2. Configure Site URL for the deployed app URL.
3. Add local and deployed redirect URLs, for example `http://localhost:5173/**` and the production app URL.
4. Enable Google provider before using Google sign-in.
5. Add Google OAuth client ID and secret in Supabase, not in frontend code.
6. Confirm email templates and redirect URLs are appropriate for Plantie.

Security notes:

- Frontend auth uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Service role keys are not used by auth UI, hooks, or repository code.
- RLS remains the authorization boundary for authenticated reads and writes.

## Subscription entitlement foundation

Subscription entitlement tables and RPCs are defined in:

```text
supabase/migrations/20260531213000_subscription_entitlements.sql
```

Plans seeded by the migration:

- `free`: 10 AI scans/month, 10 plants, 10 QR labels, no AI disease diagnosis, no unlimited household sharing.
- `premium_monthly`: unlimited AI scans, plants, QR labels, AI disease diagnosis, cloud backup, household sharing.
- `premium_yearly`: same entitlements as monthly premium.

The migration adds:

- `subscription_plans`
- `user_subscriptions`
- `subscription_events`
- `user_entitlements`
- `usage_counters`

Entitlement RPCs:

- `get_my_entitlement()`
- `increment_usage_counter(counter_type)`
- `can_use_feature(feature_key)`
- `reset_monthly_usage_counters()`

Frontend service:

- `src/lib/entitlementService.ts`

Standalone UI components:

- `src/components/PricingPage.tsx`
- `src/components/UpgradeModal.tsx`

Important constraints:

- Current production flows do not enforce these limits yet.
- Login remains optional.
- No RevenueCat, App Store, Google Play, Stripe, or fake purchase flow is implemented.
- Frontend cannot update subscription status directly; there are no client write policies for subscription status tables.
- Server-side functions or future billing webhooks should write subscription state using server credentials only.

Manual SQL step:

1. Apply `supabase/migrations/20260531213000_subscription_entitlements.sql` after the existing foundation/auth migrations.

## RevenueCat billing preparation

RevenueCat billing is documented and stubbed, but real purchases are disabled.

See:

```text
docs/revenuecat-billing.md
```

Server-only environment variables for future setup:

- `REVENUECAT_WEBHOOK_SECRET`
- `REVENUECAT_API_KEY_IOS`
- `REVENUECAT_API_KEY_ANDROID`
- `REVENUECAT_PROJECT_ID`

The frontend billing adapter currently throws `BillingNotConfiguredError` and never activates Premium locally.
