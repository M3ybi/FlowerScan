# V4 RevenueCat validation

Status: offline client, webhook and SQL boundaries **VERIFIED_LOCALLY**; dashboard/products/store routing **UNKNOWN**; actual purchase callbacks **BLOCKED**. No purchase, restore, refund or subscription-record adjustment was performed.

## Authority and environment routing

`src/lib/billingService.ts` selects the public SDK key by actual runtime. Development web can explicitly use an `rcb_sb_` Web Billing sandbox key; other nonproduction modes use Test Store. Production web requires an `rcb_` key excluding `rcb_sb_`; iOS and Android use their platform keys. Public SDK keys are not server webhook credentials. Native household billing remains behind `VITE_REVENUECAT_HOUSEHOLD_NATIVE_BILLING_ENABLED` until restore/transfer behavior is verified.

The V4 build guard requires a separate approved database for preview/staging, as well as test billing, and the matching production platform key for production. The guard verifies configuration shape/selection, not that a key belongs to the intended RevenueCat project. Verify account ownership and products in the Dashboard.

Supabase and Netlify webhook implementations both authenticate `REVENUECAT_WEBHOOK_SECRET` before interpreting environment. Explicit SANDBOX/Test Store events are ignored before event/entitlement writes unless server-only `REVENUECAT_ALLOW_SANDBOX_EVENTS` is exactly `true`. Keep it false on production. Historical signed events lacking environment markers retain compatibility; the code does not retroactively classify or revoke existing subscriptions. This is an explicit residual compatibility boundary: route provider environments correctly and restrict the authenticated sender. See [RevenueCat webhook configuration](https://www.revenuecat.com/docs/integrations/webhooks).

Test Store keys must not ship in store releases; native store sandboxes are separate from Test Store. See [Test Store guidance](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store). App Review can produce sandbox transactions, so define a review/test routing and entitlement policy before submission. Do not enable sandbox entitlement writes on the production backend as an unreviewed workaround. See [RevenueCat App Review guidance](https://www.revenuecat.com/docs/test-and-launch/app-store-rejections).

## Local evidence and limits

Both webhook paths have offline shared-secret, malformed event, sandbox-default-deny, duplicate-event, mapping and provider-failure coverage. Real PostgreSQL fixtures execute authoritative receipt-to-household binding, legacy source compatibility, paid-through cancellation, refund revocation, stale-event rejection, grace/expiry and history logic. V4 uses 16 independent sessions to apply the same event concurrently (one state application), then out-of-order independent events (latest event wins). SQL state establishes transaction semantics, not an actual store webhook delivery.

UI/model tests cover Free, Monthly/Yearly, active cancellation, expired/pending/error and restore presentation. Application browser tests retain the unmount/household/account scope protections that prevent stale checkout after navigation. Server entitlements remain authoritative; an SDK result alone cannot grant Premium. Network delays may produce a confirmation-pending state until the server processes the event.

## Dashboard and sandbox acceptance — not executed

1. Record the intended RevenueCat project/app for web, iOS and Android; verify the platform public keys, offerings, product IDs, entitlements, store credentials, package/bundle IDs and price/currency. Keep private keys out of the client.
2. Verify household customer identities (`hh_…`), original transaction binding, restore/transfer behavior and **Keep with original App User ID** policy against the application's household ownership model. A Viewer cannot obtain an Owner billing identity or transfer an unrelated paid receipt.
3. Configure sandbox/test callbacks to a separate authorized test Supabase project. Check endpoint URL, environment filter and authentication header privately. If both Netlify and Supabase paths remain deployable, keep policy aligned; confirm whether either legacy route is actually active (UNKNOWN here).
4. In that environment, execute Free→Monthly, Free→Yearly, Monthly↔Yearly, cancellation with paid access retained, renewal, expiry, refund, restore, failed/pending purchase, repeated click, modal reopen, logout and household switch. Record provider event/transaction identity privately and redacted entitlement/history results.
5. Delay delivery, replay the same provider event and deliver older events after newer ones. Confirm one effective application/history fact, stable household association, no second-home entitlement and no refund resurrection. Check provider retries against safe 5xx responses; do not simulate rollback by changing paid records.
6. Restart web/native sessions and compare SDK presentation with the server entitlement. Complete physical native restore and App Review sandbox routing before enabling native billing or submitting builds.

All purchase scenarios above currently have provider status **NOT_RUN / BLOCKED**. No risk exception has been approved. Release rollback preserves event history and transaction ownership; reconcile from authoritative provider events using an approved process if delivery is delayed.
