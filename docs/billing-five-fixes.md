# Billing compatibility fixes — 2026-11-16

Starting main: `a60d3c6e2ed033055e31a97514f811fcc7c7c288`. This release is limited to the five requested billing fixes. No new UI component, screen, button, tier, price, entitlement, usage limit, household role, job, dependency or billing architecture is introduced. Existing controls and manual account-deletion review remain.

## Implementation and boundaries

| Requested fix | Implementation | Provider dependency / limitation |
|---|---|---|
| Billing email | Existing web checkout receives `customerEmail` from authenticated Supabase `getUser`, only when the same user's email is confirmed. Identity is checked again before checkout. | Unverified/missing email preserves the SDK's existing collection; native store checkout is unchanged. |
| Cancellation fallback | Existing confirmation opens its existing portal first. Missing/failed portal handoff can call JWT-protected `manage-subscription` for RC Billing only. | Requires a server-only RevenueCat API v2 key and project ID. App Store, Play, Test Store and unknown stores retain their existing management behavior. A cross-origin portal that opens but later displays an error cannot be reliably inspected by the app. |
| Account deletion | Existing request queue receives a current billing-review snapshot. Completion and actual Auth removal reject known unresolved recurring/paid subscriptions. | Manual reviewer must verify provider-side inventory and pending checkouts, cancel through the existing authorized workflow/provider portal, and retain account/source data until the paid period has ended. No automated deletion or artificial subscription transition. |
| Orphan prevention | Exact household customer/source binding, fresh Owner/binding checks before cancellation, bounded provider reads, ambiguous-source denial, renewal-only cancellation, no automatic mutation retry and deletion guards. | Local webhook state cannot prove that no unreported remote checkout exists. Keep the existing manual provider review; failure/uncertainty must retain the account and billing identifiers. |
| Monthly ↔ Yearly | Existing Pricing controls continue through the provider portal in both directions; missing URL can be recovered securely. Existing Upgrade dialog also uses that portal for a web subscriber. Native SDK replacement behavior remains unchanged. | Both provider change paths must exist. No second ordinary web checkout is used to replace an active subscription. Provider decides immediate/deferred changes and proration. |

`manage-subscription` resolves the customer using the existing purchasing-Owner RPC, reads the existing household's immutable original transaction, and searches the provider by that transaction. It requires one unambiguous subscription belonging to that exact current customer, environment and `rc_billing` store. A transferred customer or mismatched binding fails closed. Pagination uses fixed API URLs; provider-supplied URLs are never followed with the key. Requests have a shared deadline, sanitized errors and no-store responses.

Cancellation reads authoritative state first. Already-disabled renewal returns without another mutation. It uses only the cancel action, never refund, deletion or local entitlement writes, then confirms `will_not_renew`. A timeout returns an unconfirmed error; a subsequent user retry reads provider state before deciding whether a mutation remains necessary. The existing signed webhook remains the only subscription/entitlement writer.

The deletion migration adds one column to `account_deletion_requests`, three restricted functions and two triggers; no table or status enum. Personal legacy billing is protected even when a household has another Owner. Household billing with a surviving Owner is retained rather than cancelled when a Viewer/coowner leaves. Active/trial/grace records, missing dates and cancelled-but-still-paid periods block removal. Expired/refunded or confirmed cancelled periods that have ended can proceed through existing manual processing. Existing requests are checked dynamically even if their snapshot predates the migration. Ordinary clients cannot mark requests completed or inspect another user's billing context.

## Required configuration and provider review

At preparation, both the production secret inventory and RevenueCat project had no secret API v2 key. Following explicit user authorization and a later instruction to resume, **PlantieCare subscription operations** was generated as API v2 with Customer information → Subscriptions Configuration → Read & write; all other permission categories remained No access. The key and the verified API project ID were saved to the existing Supabase Edge secrets at **2026-11-16 22:13:25 CET (21:13:25Z)**. The key stayed masked and was transferred directly between the authorized UIs, never revealed, printed or stored in the repository. Public SDK keys and the webhook secret were not reused.

The credential is stored only as Supabase Edge secret `REVENUECAT_SECRET_API_KEY`; `REVENUECAT_PROJECT_ID` was set for the same existing project. Required provider permission is `customer_information:subscriptions:read_write`, which also includes other provider subscription mutations; the application exposes only the scoped cancellation and URL recovery above. Do not put it in VITE variables, source, chat or logs. Existing SDK keys, billing mode, sandbox opt-in and webhook secret must remain unchanged.

In the existing Web Billing product configuration, verify both Monthly → Yearly and Yearly → Monthly change paths with the same existing prices/currency. A missing path is a provider configuration blocker; preserve the existing management workflow rather than launching a second purchase. RevenueCat's beta SDK change flow explicitly falls back to an ordinary new purchase when a path is missing; it is not introduced here. Sources: [Web SDK checkout email](https://www.revenuecat.com/docs/web/web-billing/web-sdk), [subscription API](https://www.revenuecat.com/docs/api-v2/subscription), [product changes](https://www.revenuecat.com/docs/web/product-changes).

Manual deletion processing remains: inspect the existing request and its billing snapshot; verify the provider's complete inventory/pending checkouts; avoid cancelling a shared household's surviving Owner's billing; cancel eligible renewal through the existing confirmed workflow; preserve paid access/source association through period end; refresh local trusted provider facts; revoke the account's sessions, then perform the existing approved removal and record completion. Do not fabricate callbacks or edit subscription status to satisfy the guard. Supabase access tokens can remain valid until expiry, and Storage ownership may independently block removal; use the established access/Storage cleanup review. [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data)

## Validation evidence

| Verification | Status | Evidence |
|---|---|---|
| Checkout-email reproduction | PASS | New test failed before the fix with missing email, then passed after it. |
| Billing and webhook regressions | PASS | Existing purchases, identity isolation, cancellation/expiry/history and both Android switch directions; new verified-email/account-switch tests. |
| Existing subscription UI + fallback tests | PASS | 20 checks; portal first, failed/missing handoff, unsupported store/Viewer denied, retry preserves Premium. |
| Provider adapter and actual Edge entrypoint | PASS | 11 tests, including lost response, no automatic retry, wrong customer/environment/store, ambiguity, fixed-origin pagination, reauthorization/binding and missing configuration. Provider calls are mocked. |
| Deletion billing SQL | PASS | Five grouped PGlite tests cover multiple legacy states, NULL dates, manual queue/idempotency, paid period retention, last Owner/coowner/Viewer and denied client writes. |
| npm run check | PASS | Executed full typecheck, registered test runner and production build after fixture correction. |
| Deno Edge checks | PASS | All 14 function entrypoints, including manage-subscription. Initial PATH lookup failed; the installed/pinned Deno runner then executed successfully. |
| Source graph / client-secret scan | PASS | 200 modules, no unresolved imports/cycles; no privileged credential in 26 built text artifacts. |
| 45-migration clean/upgrade replay | PASS | Real loopback PostgreSQL with platform fixtures; 12 SQL fixtures, zero schema difference, 32 concurrent subscription events preserved. |
| Concurrent billing commit versus account removal | PASS | Three real PostgreSQL sessions, observed database lock barrier; newly committed subscription and account are retained when deletion resumes. No provider request. |
| Existing UI markup compatibility | PASS | 18 actual renders across nine states compare byte-for-byte with immutable starting source; no CSS change. Initial private comparison harness lacked automatic JSX and was corrected. |
| Chromium/WebKit application | PASS | 15 checks per engine. Initial fixture lacked two existing error exports and was corrected without changing assertions. |
| Full local Supabase stack | NOT EXECUTED | Docker engine unavailable; PostgreSQL platform fixtures do not prove Auth/PostgREST/Storage runtime behavior. |
| Live RevenueCat cancellation/switch/checkout | NOT EXECUTED | Restricted key setup completed; provider operations and release are still pending. No real customer cancellation, purchase, refund, deletion or fabricated callback used for testing. |
| Restricted credential setup and preservation | PASS | Both new entries saved; project-ID digest matches. All 17 prior secret digests and 13 function bundles/JWT settings unchanged. Platform refreshed all existing function versions by one. Subscription/entitlement/customer-binding hashes and active Luna routes unchanged. |
| Physical iOS/Android store behavior | NOT EXECUTED | Native SDK contract regressions passed; actual device/store confirmation remains required. |

Initial full-check failure was the disposable source fixture omitting the new declared function; adding its actual source graph fixed it. All failures remain in tool/local logs; skipped production/device checks are not called passed.

## Modified files and necessity

| Files | Reason |
|---|---|
| `src/lib/billingService.ts` | Verified checkout email only; existing identity/purchase guards retained. |
| `src/lib/subscriptionManagement.ts` | Minimal authenticated calls to the new secure provider operations. |
| `src/lib/subscriptionUiRules.ts` | Scoped fallback within the existing confirmation lifecycle. |
| `src/components/PricingPage.tsx` | Wire existing cancellation/plan controls; accurate confirmation/errors and stale-account suppression. |
| `src/components/UpgradeModal.tsx` | Route its existing web plan-change control to the current portal without another checkout. |
| `supabase/functions/_shared/revenueCatBilling.ts` | Server-only bounded provider client with exact source/environment and idempotent renewal cancellation. |
| `supabase/functions/manage-subscription/index.ts` | Required JWT/Owner/binding boundary for private provider access. |
| `supabase/migrations/20261116191922_billing_cancellation_deletion_safeguards.sql` | Extend existing review snapshot and prevent unsafe completion/removal. |
| `supabase/config.toml`, `.env.example` | Explicit JWT verification and server-only configuration names. |
| `tests/billing.test.ts`, `tests/subscription-ui.test.ts` | Focused email, identity and existing-control regressions. |
| `tests/subscription-management.test.mjs`, `tests/account-deletion-billing.test.mjs` | Provider/endpoint faults and actual SQL guard coverage. |
| `scripts/test-application-browser.mjs`, `scripts/test-supabase-local.mjs`, `tests/edge-source-fixture.test.mjs` | Include actual new dependencies in existing offline/disposable boundaries; no weakened assertion. |
| `scripts/test-billing-postgres.mjs` | Real concurrent billing/deletion regression using the existing disposable database harness. |
| `package.json` | Register the new tests in the existing suite and Edge typecheck; no dependency or lockfile change. |
| `docs/revenuecat-billing.md`, `docs/revenuecat-subscriptions.md`, this record | Document compatibility, configuration, manual review and actual limitations. |

## Release and rollback

This is a locally validated release candidate, **not yet a deployed billing fix**. Scoped credential confirmation and secure storage are complete. Next verify provider paths and finish current-revision CI, capture production billing/configuration checkpoints, apply only the reviewed additive migration, deploy manage-subscription with JWT verification, verify source parity, then publish the compatible frontend. Preserve existing customer data and entitlements. Live destructive/payment verification requires a specifically authorized sandbox identity; none is assumed here.

Rollback the frontend/Edge artifact if necessary while retaining original subscription/history data. Keep the additive review guard until the manual reviewer has assessed outstanding requests; do not bypass a billing block by fabricating provider state. A reviewed rollback may remove the two new triggers/functions and the extra snapshot column after preserving its review facts; do not drop the original request/audit tables or replay old migrations against production. Remove/revoke only the new credential if unused, without changing existing SDK/webhook credentials. No AI model or Luna route change belongs to this release.
