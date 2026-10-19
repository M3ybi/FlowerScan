# Test Store billing on the live site

The user selected **RevenueCat Test Store only**. No production RevenueCat app or platform key exists. This choice changes billing independently of the hosting/database environment: the live web app uses the existing production Supabase project with simulated Test Store purchases. It does not require a staging backend or real payment setup.

## Client and build configuration

Set `VITE_REVENUECAT_BILLING_MODE=test_store` and the existing public `VITE_REVENUECAT_API_KEY_TEST_STORE=test_...`. The explicit mode takes priority over Vite's production/development mode and any old Web Billing sandbox/platform keys. An invalid mode or missing/malformed Test Store key leaves billing unconfigured; there is no fallback to a different store. Existing deployments without an explicit mode retain their previous selection behavior.

The Netlify build configuration selects Test Store. Its environment must still provide `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `PLANTIE_PRODUCTION_SUPABASE_URL` and the public Test Store key. Production database matching and preview database isolation checks remain enforced. A Test Store key alone never authorizes a preview to use the production database.

Build the live web bundle with `PLANTIE_RELEASE_ENV=production`, `PLANTIE_RELEASE_PLATFORM=web` and `npm run build`. The release manifest records both `environment=production` and `billingMode=test_store`, plus revision, backend fingerprint and final entry hashes. No server secret belongs in `VITE_` variables or the manifest.

For the existing GitHub Pages workflow, the equivalent repository variables are `PLANTIE_PRODUCTION_SUPABASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_REVENUECAT_BILLING_MODE=test_store` and `VITE_REVENUECAT_API_KEY_TEST_STORE`. The primary custom-domain deployment remains the existing Netlify site; this change does not create another site or change Auth redirects for another origin.

## Server configuration

Set only the non-secret setting `REVENUECAT_BILLING_MODE=test_store` on the existing Supabase project after deploying the compatible `revenuecat-webhook` source. Preserve `REVENUECAT_WEBHOOK_SECRET`, gateway `verify_jwt=false`, and all other secrets. Do not broadly enable `REVENUECAT_ALLOW_SANDBOX_EVENTS` for this release.

In Test Store mode, the signed webhook accepts only `store=TEST_STORE` **and** `environment=SANDBOX`. Apple/Google sandbox events, production store events and missing/unknown environments are ignored before privileged database I/O. An invalid configured billing mode returns a retryable 503. A missing/wrong shared secret is still rejected. Both the primary and compatibility handlers use the same gate. The compatibility backend remains disabled unless separately configured; do not enable it as a billing workaround.

Accepted events still use the existing household billing identity, product/entitlement mapping, receipt ownership, duplicate/order checks and atomic subscription RPC. This change has no SQL migration and does not edit existing entitlements, households, subscriptions or history. Legitimate future Test Store webhooks can update their associated household through the normal processing path. Test purchases are simulated and expire/renew on RevenueCat's accelerated schedule; see [Test Store documentation](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store).

If the compatibility Netlify webhook is active, configure its `REVENUECAT_BILLING_MODE` runtime variable consistently through the existing provider settings. A build-time Vite variable does not configure the server handler.

## Native testing

Use the Test Store key for native **debug** builds. For Android, select `PLANTIE_RELEASE_ENV=local`, `PLANTIE_RELEASE_PLATFORM=android` and `VITE_REVENUECAT_BILLING_MODE=test_store`, synchronize the reviewed app bundle, and run `:app:assembleDebug`. This is an internal debug APK, not a Play release. iOS similarly requires a Debug configuration and macOS/Xcode for compilation.

The production native build guard rejects explicit Test Store billing. Android also rejects release tasks when the synchronized web manifest selects Test Store, before signing. Do not submit a Test Store app to Google Play, TestFlight or the App Store, and do not disable RevenueCat's release safeguard: its [documented behavior](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store#test-store-api-keys-in-release-builds) is to reject/crash native release builds using Test Store keys. Capacitor does not expose the dangerous release override. Store publication requires a later explicit move to real platform keys and store configuration. The existing native household-billing restore verification gate is unchanged.

## Verification and recovery

Regressions cover explicit client key selection on all runtimes, missing/invalid keys and modes, live-web Test Store builds without database-guard relaxation, native store-build rejection, both manifest modes with emitted-file hash verification, existing live webhook behavior, and household Test Store event admission/application. `npm run test:revenuecat-mode` exercises the actual Deno entrypoint with a fake outbound Supabase read and no network permission: wrong secrets/other stores stop before I/O; a valid Test Store duplicate reaches the authenticated read without a write.

Production probes must not fabricate subscription events or customers. Use only an approved test identity for actual checkout, entitlement, renewal, cancellation and expiration acceptance. Without that identity/provider access, record the live purchase path as unverified.

Before deployment preserve the current function body/version and mode setting. If a critical invariant fails, stop publishing. Restore the reviewed prior function/mode or disable affected checkout while fixing forward; keep shared-secret authentication and retain existing records. Do not simulate recovery by editing subscription state, deleting event history or replaying purchases. Test Store mode is an explicit deployment choice, not an automatic fallback when paid billing is unavailable.
