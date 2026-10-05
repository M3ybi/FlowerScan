# Supabase setup for Plantie

The app uses Supabase Auth and, when configured for the Supabase backend, reads and writes household data through Supabase. Legacy localStorage and Netlify Blob paths remain for compatibility; keep their configuration until those paths are retired deliberately.

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
- Household owners and editors can manage non-owner invitations; only owners can manage owner invitations or remove non-owner members.
- Push subscriptions are writable only by authenticated members of the household.
- Notification delivery rows are readable by household members and have no client insert/update/delete policy.
- Plant catalog rows are publicly readable but not publicly writable.
- AI request rows are insertable/readable only by the related authenticated user and household members.

## Compatibility notes

The `20261005120000_household_people_management.sql` migration keeps invitation history but returns only actionable pending invitations in the household menu. It normalizes email addresses, revokes stale duplicates, and enforces one current pending invitation per household/email. Revoking an invite invalidates its hashed-token link; removing a member also revokes any pending link for that email and preserves the removed user's access to their other household or creates a standalone household. Membership and invitation writes must use the permission-checked RPCs, including `remove_household_member`; the older viewer-removal RPC delegates to it for existing clients. A new invite can be created after revocation or member removal.

- `households.legacy_public_token` preserves the current public household token model for future migration.
- `plant_catalog.legacy_id`, `plants.legacy_id`, and `plant_diagnostics.legacy_id` preserve current IDs such as `flower-04`, `custom-*`, and `diag-*`.
- Existing localStorage keys and Netlify Blob keys are intentionally untouched.
- The active Supabase backend reads and writes household data through the repository layer; legacy storage remains available in its configured compatibility modes.

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

These functions use the browser Supabase client and rely on RLS. The Supabase backend in `App.tsx` uses this repository layer for authenticated household data.

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
- Enable email confirmation and password reset emails; configure the Site URL and all application callback URLs below before testing those flows.
- Enable Google OAuth with Google's callback pointing to Supabase, then allow Supabase to redirect to the web or Capacitor callback URL.
- Apple Sign-In is shown as a disabled placeholder until Apple Developer setup is ready.
- Amazon Login is shown as a disabled placeholder and should stay disabled unless a complete provider integration is added.

Google Play Data Safety notes:

- Declare account creation and login with email/password.
- Declare OAuth login with Google.
- Apple and Amazon are not active providers yet because the buttons are disabled and do not authenticate users.
- Do not declare client-side password storage; Plantie uses Supabase Auth and does not store passwords manually.
- Does not migrate legacy household-token data.
- Does not replace localStorage or Netlify Blob sync.

### Hosted Supabase Auth settings

In the linked project `hzigkjukqpxryziscvag`, open **Authentication > URL Configuration**. Set **Site URL** to `https://flowerscann.netlify.app`. Site URL is only the fallback; the app supplies an explicit callback for Google sign-in, email confirmation, magic links, and password reset. Add the following **Redirect URLs** for the environments you use. Keep any existing entries when adding new ones.

| Environment | Google OAuth / email confirmation / magic link | Password reset |
| --- | --- | --- |
| Local web | `http://localhost:5173/auth/callback` | `http://localhost:5173/auth/recovery` |
| Production web | `https://flowerscann.netlify.app/auth/callback` | `https://flowerscann.netlify.app/auth/recovery` |
| Capacitor Android/iOS | `com.plantie.app://auth/callback` for Google OAuth and magic link; `com.plantie.app://auth/confirm` for email confirmation | `com.plantie.app://auth/recovery` |

If local development uses `127.0.0.1` instead of `localhost`, add its two exact `http://127.0.0.1:5173/auth/...` URLs too. For web testing on another device, use a hostname or HTTPS tunnel reachable from that device and add its exact callback and recovery URLs to the allow-list. Numeric non-loopback IP addresses (such as `http://192.168.0.115:5173`) **cannot** be used for Supabase Auth redirects: GoTrue rejects them before checking the allow-list and falls back to the production Site URL. The app blocks Google sign-in and email-link requests on those addresses with a clear error; email/password sign-in remains available. For Netlify deploy previews, add each preview's exact callback and recovery URLs, or use Supabase's documented Netlify wildcard form scoped to this site: `https://**--flowerscann.netlify.app/auth/callback` and `https://**--flowerscann.netlify.app/auth/recovery`. Keep production callbacks exact. The web app extracts the current origin, routes the incoming callback through its dedicated pre-hash URL, then restores a validated internal `#/...` route and, when present, a validated `householdId` query. Netlify rewrites both callback paths to `index.html`.

On 2026-10-02, the hosted project was updated additively with native `/confirm` and `/recovery` and both Netlify-preview patterns. The two previously added numeric LAN URLs remain in the hosted list but are ineffective because of GoTrue's IP check. A CLI readback confirmed the unchanged production Site URL and existing localhost and production entries.

In **Authentication > Providers > Google**, enable the provider and configure its client ID and secret in Supabase. In the Google Cloud OAuth client's **Authorized redirect URIs**, use **only the Google-to-Supabase endpoint** `https://hzigkjukqpxryziscvag.supabase.co/auth/v1/callback` for this hosted project. The web URLs and `com.plantie.app://...` links above are Supabase-to-application destinations, not Google redirect URIs. If the Google client requires Authorized JavaScript origins, enter web origins there as a separate setting. See [native callback setup](native-google-auth.md) for Android and iOS intent/scheme registration and PKCE behavior.

For the hosted Email provider, keep confirmation enabled and set the server password minimum to at least the app's 8-character minimum. Review **Authentication > Email Templates > Reset Password**: the default `{{ .ConfirmationURL }}` carries the chosen redirect; a custom link must preserve the request's `{{ .RedirectTo }}` rather than hard-code the Site URL. Password-reset requests intentionally do not reveal whether an account exists, so a successful API response does **not** prove that an email was sent. The UI must use neutral wording. If an expected message does not arrive, inspect **Authentication > Logs** for the request and any rate-limit, `email_address_not_authorized`, SMTP, or template error; then check the SMTP provider's delivery/suppression logs and the recipient's spam or quarantine folder. Supabase's default sender is limited to organization-team recipients and is unsuitable for production delivery; configure custom SMTP with a verified sender domain and appropriate SPF/DKIM/DMARC records. Test with a known account on the same device/browser that requested the PKCE link, without changing existing users or passwords for diagnostics.

The reported `POST /recover` returned 200 for an address that was absent from **Authentication > Users**. Supabase intentionally does not send a reset email for an unknown user, so this particular missing email was expected. The hosted Auth config currently has no custom SMTP settings; real-user email delivery still requires a provider before production use.

`supabase/config.toml` is a local development configuration, **not** a snapshot of the hosted Auth settings. Use `npx supabase config diff` to inspect drift. Do not push the current local file directly to the hosted project: it declares a localhost Site URL and different email-confirmation behavior. Update the hosted allow-list additively in the Dashboard, or read its current `uri_allow_list` through the Management API before submitting the complete revised list.

References: [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [GoTrue redirect validation](https://github.com/supabase/auth/blob/master/internal/utilities/request.go#L640-L711), [Google provider setup](https://supabase.com/docs/guides/auth/social-login/auth-google), [SMTP limits and setup](https://supabase.com/docs/guides/auth/auth-smtp), [email delivery troubleshooting](https://supabase.com/docs/guides/troubleshooting/not-receiving-auth-emails-from-the-supabase-project-OFSNzw), and [password-reset behavior](https://supabase.com/docs/guides/auth/passwords).

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

The frontend cannot update subscription status directly; there are no client write policies for subscription status tables. RevenueCat purchases use the web or native SDK where configured, and the server-side webhook updates the authenticated user's Supabase entitlements.

The household subscription migration `20261005180000_household_subscription_membership.sql` binds an owner's trusted provider subscription to their household, converts existing Editors to Viewers, and limits Premium households to three active members including the Owner. Pending invitations reserve slots. Free households allow only the Owner; Viewers remain recorded but lose access until Premium is restored. The migration also introduces `household_subscriptions`, `household_subscription_history`, and `get_household_entitlement(household_id)`. All invitation and membership capacity changes run under a household row lock. The app reads this RPC for plan and member usage; client writes to billing fields are revoked. The migration was applied to the linked project on 2026-10-05.

`20261005183000_bind_provider_purchase_to_household.sql` adds `begin_household_purchase(household_id)` and a private purchaser-to-household binding. Both web and native checkout call this owner-checked RPC before opening RevenueCat, so a user who owns several households upgrades only the selected one. RevenueCat's webhook remains the source of paid status; the purchase binding alone grants no Premium access. This migration was also applied to the linked project on 2026-10-05.

`20261005184500_validate_household_invite_email.sql` authorizes the invitation email function against a current Owner-issued Premium Viewer invite. `20261005190000_household_billing_binding_visibility.sql` lets an authenticated Owner determine whether their provider purchase is bound to the currently selected household, without exposing other households' bindings. Both were applied on 2026-10-05.

Cancellation leaves Premium active through the paid period. At expiry, household access checks immediately reject Viewers, and the next entitlement read or provider event reconciles stored member status and pending invitations. The Owner can read billing history; Viewers can read the current household plan but cannot manage it.

Manual SQL step:

1. Apply `supabase/migrations/20260531213000_subscription_entitlements.sql` after the existing foundation/auth migrations.

## RevenueCat billing

See [RevenueCat billing](revenuecat-billing.md) for the current product, webhook, and environment configuration. The frontend must never grant Premium locally; the server-side entitlement remains the access-control source of truth.
