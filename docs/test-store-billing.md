# Test Store billing on the live site

The initial release selected **RevenueCat Test Store only**. This choice changes billing independently of the hosting/database environment: the live web app uses the existing production Supabase project with simulated Test Store purchases. It does not require a staging backend or real payment setup.

On 2026-10-25, the user additionally authorized local Web Billing sandbox cancellation testing against this backend. The primary webhook now supports a separate `REVENUECAT_ALLOW_WEB_BILLING_SANDBOX_EVENTS` opt-in alongside Test Store mode. Local development uses the configured `rcb_sb_` key without the Test Store override. On 2026-10-26, the user also authorized hosted Web Billing sandbox for new purchases and cancellation testing; see [the hosted configuration](revenuecat-billing.md#hosted-web-billing-sandbox--2026-10-26). The Test Store settings below describe the previous hosted configuration and retained native debug/preview behavior. See [cancellation testing and deployment verification](revenuecat-billing.md#cancellation-testing).

## Client and build configuration

Set `VITE_REVENUECAT_BILLING_MODE=test_store` and the existing public `VITE_REVENUECAT_API_KEY_TEST_STORE=test_...`. The explicit mode takes priority over Vite's production/development mode and any old Web Billing sandbox/platform keys. An invalid mode or missing/malformed Test Store key leaves billing unconfigured; there is no fallback to a different store. Existing deployments without an explicit mode retain their previous selection behavior.

The previous Netlify build configuration selected Test Store; the current production web context selects Web Billing sandbox, while preview contexts retain Test Store. Its environment must still provide `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `PLANTIE_PRODUCTION_SUPABASE_URL` and the public Test Store key. Production database matching and preview database isolation checks remain enforced. A Test Store key alone never authorizes a preview to use the production database.

Build the live web bundle with `PLANTIE_RELEASE_ENV=production`, `PLANTIE_RELEASE_PLATFORM=web` and `npm run build`. The release manifest records both `environment=production` and `billingMode=test_store`, plus revision, backend fingerprint and final entry hashes. No server secret belongs in `VITE_` variables or the manifest.

For the existing GitHub Pages workflow, the equivalent repository variables are `PLANTIE_PRODUCTION_SUPABASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_REVENUECAT_BILLING_MODE=test_store` and `VITE_REVENUECAT_API_KEY_TEST_STORE`. The primary custom-domain deployment remains the existing Netlify site; this change does not create another site or change Auth redirects for another origin.

## Server configuration

Set only the non-secret setting `REVENUECAT_BILLING_MODE=test_store` on the existing Supabase project after deploying the compatible `revenuecat-webhook` source. Preserve `REVENUECAT_WEBHOOK_SECRET`, gateway `verify_jwt=false`, and all other secrets. Do not broadly enable `REVENUECAT_ALLOW_SANDBOX_EVENTS` for this release.

In Test Store mode, the signed webhook accepts only `store=TEST_STORE` **and** `environment=SANDBOX`. Apple/Google sandbox events, production store events and missing/unknown environments are ignored before privileged database I/O. An invalid configured billing mode returns a retryable 503. A missing/wrong shared secret is still rejected. Both the primary and compatibility handlers use the same gate. The compatibility backend remains disabled unless separately configured; do not enable it as a billing workaround.

Accepted events still use the existing household billing identity, product/entitlement mapping, receipt ownership, duplicate/order checks and atomic subscription RPC. This change has no SQL migration and does not edit existing entitlements, households, subscriptions or history. Legitimate future Test Store webhooks can update their associated household through the normal processing path. Test purchases are simulated and expire/renew on RevenueCat's accelerated schedule; see [Test Store documentation](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store).

If the compatibility Netlify webhook is active, configure its `REVENUECAT_BILLING_MODE` runtime variable consistently through the existing provider settings. A build-time Vite variable does not configure the server handler.

## Native testing

Use the Test Store key for native **debug** builds. For Android, select `PLANTIE_RELEASE_ENV=local`, `PLANTIE_RELEASE_PLATFORM=android` and `VITE_REVENUECAT_BILLING_MODE=test_store`, synchronize the reviewed app bundle, and run `:app:assembleDebug`. This is an internal debug APK, not a Play release. iOS similarly requires a Debug configuration and macOS/Xcode for compilation.

The production native build guard rejects explicit Test Store billing. Android also rejects release tasks when the synchronized web manifest selects Test Store, before signing. Do not submit a Test Store app to Google Play, TestFlight or the App Store, and do not disable RevenueCat's release safeguard: its [documented behavior](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store#test-store-api-keys-in-release-builds) is to reject/crash native release builds using Test Store keys. Capacitor does not expose the dangerous release override. Store publication requires a later explicit move to real platform keys and store configuration. Native household purchases and restores remain disabled by the existing `VITE_REVENUECAT_HOUSEHOLD_NATIVE_BILLING_ENABLED` gate until provider receipt-ownership configuration is verified; that gate was not enabled for the debug APK.

## Verification and recovery

Regressions cover explicit client key selection on all runtimes, missing/invalid keys and modes, live-web Test Store builds without database-guard relaxation, native store-build rejection, both manifest modes with emitted-file hash verification, existing live webhook behavior, and household Test Store event admission/application. `npm run test:revenuecat-mode` exercises the actual Deno entrypoint with a fake outbound Supabase read and no network permission: wrong secrets/other stores stop before I/O; a valid Test Store duplicate reaches the authenticated read without a write.

Production probes must not fabricate subscription events or customers. Use only an approved test identity for actual checkout, entitlement, renewal, cancellation and expiration acceptance. Without that identity/provider access, record the live purchase path as unverified.

Before deployment preserve the current function body/version and mode setting. If a critical invariant fails, stop publishing. Restore the reviewed prior function/mode or disable affected checkout while fixing forward; keep shared-secret authentication and retain existing records. Do not simulate recovery by editing subscription state, deleting event history or replaying purchases. Test Store mode is an explicit deployment choice, not an automatic fallback when paid billing is unavailable.

## Execution record — 2026-10-19

Functional source `f3dcd0d9ae79d738e8ca7326de49001a44ace08a` was committed and pushed directly to existing `main` after local verification. This operational report is a separate documentation change. No dependency, lockfile or database migration changed.

Before the update, the existing webhook v9 body/metadata and absent billing-mode setting were archived under `%LOCALAPPDATA%/Plantie/production-recovery/test-store-1792401687216/`. The DPAPI CurrentUser archive was read back, decrypted in memory and compared byte for byte. Existing database recovery evidence remains in [the V4 rollout report](v4-production-deployment.md#recovery-evidence-and-limits).

The compatible webhook was deployed to existing project `hzigkjukqpxryziscvag`, then only `REVENUECAT_BILLING_MODE=test_store` was added. Readback at `2026-10-19T09:22:13Z` verified ACTIVE webhook v11, `verify_jwt=false`, and the expected SHA-256 digest of the new setting. All prior secret digests remained identical. Setting the configuration incremented the other eight function version counters by one; every other metadata field, source bundle hash and JWT setting matched the snapshot. All nine remain ACTIVE:

| Function | Current version | Gateway JWT |
| --- | --- | --- |
| `validate-plant-image` | 11 | true |
| `upload-validated-image` | 13 | true |
| `plant-care-ai` | 16 | true |
| `plant-diagnosis-ai` | 18 | true |
| `send-household-invite-email` | 13 | true |
| `send-test-email` | 9 | true |
| `delete-account-request` | 2 | true |
| `revenuecat-webhook` | 11 | false; shared secret required |
| `send-auth-email` | 5 | false; signed hook required |

Live unsigned/wrong-secret probes returned 401, the authenticated empty body returned 400, and authenticated Apple sandbox, Google production and Test Store production payloads returned `environment_not_allowed`. These probes admitted no purchase event or business record. Actual Test Store acceptance/application was verified against fake outbound boundaries locally; no live purchase/entitlement acceptance is claimed.

Local verification passed: `npm run check` (**618 reported Node test executions**, TypeScript and build), all **14 V4 release tests**, billing/webhook regressions, Edge image/diagnosis regressions, Deno webhook type checking, and the real Deno Test Store adapter test without network permission. A clean production web bundle using the existing public Test Store key and production database passed the **26-artifact** client-secret scan, backend fingerprint and emitted entry hashes. Its manifest records `environment=production`, `billingMode=test_store`, `dirty=false` and the functional source revision. The archived bundle is `.netlify/test-store-web-f3dcd0d/dist/` (ignored, not committed).

Hosted [verification on that functional revision](https://github.com/M3ybi/FlowerScan/actions/runs/39229661047) passed all three jobs: application at `09:27:49Z`, PostgreSQL at `09:23:52Z`, and full disposable Supabase at `09:26:24Z`. Application logs confirm **618 Node test executions**, both actual Deno adapters, TypeScript/build, client-secret/source-graph checks, Chromium/WebKit image/application fixtures, Auth browser fixtures and zero reported production dependency vulnerabilities. The Supabase job passed all **34 migrations**, synthetic upgrade and **six SQL fixtures twice**. The subsequent Pages build failed with `RELEASE_DATABASE_CONFIGURATION_REQUIRED`; deployment was skipped. The overall hosting workflow is therefore failed for missing Pages configuration, while all verification jobs passed. This does not imply Netlify publication.

Android synchronization and `:app:assembleDebug` passed using the installed JDK 22. The debug APK is `android/app/build/outputs/apk/debug/app-debug.apk`; an immutable local copy and checksum evidence are under `.netlify/test-store-android-f3dcd0d/`. The source-revision APK has **16,357,763 bytes**, SHA-256 `9aa2405be5f9cddfe24f79d4afe052721d723531c8e7d7173bacd7e92a44dbfd`. Android tools verified its v2 signature, `com.plantie.app` identity, versionCode 3/versionName 0.1.0 and debuggable flag. The embedded Test Store manifest and entry hashes match the reviewed assets. An actual Gradle release-task probe was rejected by the intended Test Store guard. No physical install or checkout was performed. iOS asset/plugin synchronization passed and portable Swift paths were preserved; compilation/signing remains unavailable on Windows.

The existing Netlify CLI still reports `NOT_LOGGED_IN` and `linked=false`. The primary domain still returns 404 for `/plantie-release.json`, so the new web bundle is **not published**. Existing-site login remains pending; do not create a replacement site. No production RevenueCat key is needed for the selected web mode. GitHub Pages build variables remain empty; no alternate hosting origin or Auth redirect was enabled as a workaround. Provider dashboard/product mapping and an approved test household are still required for real checkout/lifecycle acceptance. Physical iOS/Android photo-selection acceptance also remains open.
