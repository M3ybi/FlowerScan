# RevenueCat subscriptions

The app uses RevenueCat's current offering and supports these product identifiers:

- `plantie_premium_monthly`
- `plantie_premium_yearly`

Google Play subscriptions include a base plan in RevenueCat. For the first Play release, use exactly these store product identifiers:

- `plantie_premium_monthly:monthly`
- `plantie_premium_yearly:yearly`

The app and webhook map both formats to the same monthly and yearly plans. Other product or base-plan identifiers are intentionally rejected until they are explicitly mapped in `src/lib/revenueCatProducts.ts`.

Attach both products to the active `default` offering. Attach both products to the RevenueCat entitlement with identifier `premium`; the Supabase webhook maps that entitlement to the app's `premium_monthly` and `premium_yearly` plans. The app currently uses RevenueCat's standard monthly and annual packages from the offering.

## Local Test Store development

Create a Test Store public SDK key in RevenueCat and place it in the ignored `.env.local` file:

```dotenv
VITE_REVENUECAT_API_KEY_TEST_STORE=test_...
```

Without a web sandbox key, development mode and `npm run build:test-store` select this key. Run `npm run dev` to test Test Store web checkout, or run `npm run mobile:test-store` and open the native project on a device or simulator configured for RevenueCat Test Store.

To test a RevenueCat Billing Stripe sandbox in the local browser, put its **public** `rcb_sb_...` key in the ignored `.env.development.local` file as `VITE_REVENUECAT_API_KEY_WEB_SANDBOX`. Local `npm run dev` then uses that key for web checkout. Native development and `npm run build:test-store` still use the Test Store key. Restart Vite after changing the file. The sandbox key is never selected by a production build; do not put it in Netlify Production.

## Store builds

Set the platform's public SDK key in the build environment:

```dotenv
VITE_REVENUECAT_API_KEY_IOS=appl_...
VITE_REVENUECAT_API_KEY_ANDROID=goog_...
VITE_REVENUECAT_HOUSEHOLD_NATIVE_BILLING_ENABLED=false
```

Production-mode builds select the iOS or Android key by platform. Do not use the Test Store key for TestFlight, App Store, Play Store, or other release builds. These Vite variables must contain only RevenueCat public SDK keys, never secret API keys.

New native household purchases, plan changes and restores stay disabled by default. Configure RevenueCat restore behavior to **Keep with original App User ID**, verify that policy, then set `VITE_REVENUECAT_HOUSEHOLD_NATIVE_BILLING_ENABLED=true` and rebuild. This prevents a default provider-side transfer from misrouting the original household's renewal. Household customer reads, legacy purchaser-UUID billing and web checkout remain usable while this gate is off.

## Web Test Store rollout

The browser uses `@revenuecat/purchases-js` with the same authorized household provider identity as the mobile SDK. New identities are opaque server-allocated `hh_<random UUID>` values; existing purchaser-UUID subscriptions retain their original identity and household association. `npm run dev` selects the Web Billing sandbox key when configured, otherwise `VITE_REVENUECAT_API_KEY_TEST_STORE`. Netlify deploy previews run `npm run build:test-store`; set that **public** Test Store key only in the Netlify **Deploy Previews** environment context, and protect test previews from general access. Test purchases can grant Premium to real Supabase test households through the webhook. Netlify production uses `npm run build` and has no web purchase capability until a real web billing configuration is provided.

After login and household selection, one subscription state controller loads the selected household entitlement and plan usage. It reads that household's provider customer only for Owners; Viewers need no personal billing customer. Monthly and yearly IDs are mapped in `src/lib/revenueCatProducts.ts`; Supabase household usage remains the access-control authority. A bound paid RevenueCat entitlement with a temporarily Free server mirror is shown as syncing, not Free. Failed lookups never use a stale client cache to grant access. The controller refreshes after purchase or restore, on web focus/native resume, and periodically while visible. It discards old responses after an account or household switch.

The Subscription section also refreshes when opened. Its summary shows the household plan, billing cycle, validity/cancellation state and occupied slots (active memberships plus valid pending invitations). Owners and Viewers see the same confirmed lifecycle dates in local time. Only Owners with a matching provider customer can buy, change or cancel a plan. An expired previous household subscription is labelled as historical while current access is Free; a personal subscription from another household cannot supply its status or dates. Manual Premium without a provider billing cycle is displayed without inventing renewal details. Missing or malformed paid subscription dates show an unknown/error state rather than an assumed renewal.

Supported webhooks use the service-only `apply_household_provider_event` SQL transaction. Event-ID deduplication, subscription writes, legacy entitlement/usage writes, history and household access reconciliation commit together. Household/source locks serialize writes, provider timestamps reject older events, and prior-period expiry cannot revoke a longer confirmed period. Immutable receipt/source associations prevent another household from acquiring the same paid receipt. Historical rows lack provider event timestamps until the first updated callback; preserve `event_timestamp_ms` in new payloads for timestamp ordering.

For an active, renewing subscription owned by the signed-in purchaser, **Cancel subscription** opens a confirmation dialog and then RevenueCat's `managementURL` for the actual store or web customer portal. Opening that page does not cancel billing; the provider must confirm the change. When RevenueCat reports auto-renewal off, the UI shows the plan as cancelled but active until its expiry. Supabase keeps Premium access until the trusted entitlement expires, and the free-tier limits apply to future actions afterward without deleting plants. Shared household members cannot cancel another person's purchase. When RevenueCat supplies no management URL, the dialog explains that cancellation is unavailable from this app. Test Store is not a supported management portal; test actual cancellation with the Play/App Store sandbox or RevenueCat Web Billing, and test Test Store expiration separately ([subscription management](https://www.revenuecat.com/docs/subscription-guidance/managing-subscriptions), [Test Store](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store)).

On Android, Monthly → Yearly uses RevenueCat's store product-change purchase with the active monthly product as `oldProductIdentifier`. On iOS, purchasing Yearly while Monthly is active relies on both products being in the **same App Store subscription group**; Apple determines when the change takes effect. The displayed plan follows RevenueCat customer info after the transaction, including deferred changes.

On web, a Monthly subscriber uses the RevenueCat-provided management URL to change plans. Configure an allowed Monthly → Yearly change path in the Web Billing provider/customer portal and verify it with a real web billing sandbox before enabling production web purchases. The Test Store does not document a safe web product-change flow; if it provides no management URL, the switch is unavailable. Do not implement web upgrade as a second ordinary checkout: the Web SDK can fall back to a separate purchase when no change path exists. The Supabase webhook must be redeployed after these changes: it records `PRODUCT_CHANGE` with `new_product_id`, but waits for the effective `RENEWAL` or `INITIAL_PURCHASE` before changing the active plan, and ignores stale expiration events from a previous period.

To test on web, sign in as an Owner of a Free test household, open Subscription, choose monthly or yearly, and use the Test Store valid, failed, and purchase-cancel actions. Valid must create the `premium` entitlement for the authorized household customer, reach the webhook, and update only that household plan without a logout. Failed or abandoned purchases must leave the household Free and remain retryable. Reload and use **Refresh subscription** to confirm the same household remains Premium. Join a second Free household and verify switching changes quotas without sharing the first household's subscription. A Viewer must see the same paid dates but no billing administration. The Test Store purchase dialog's Cancel button only abandons that purchase; it does not cancel an existing subscription ([RevenueCat Test Store](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store)).

For future live web payments, create a RevenueCat Web Billing configuration with a supported provider, products attached to the same `premium` entitlement and current offering, and set `VITE_REVENUECAT_API_KEY_WEB=rcb_...` in the Netlify **Production** environment. Keep product IDs aligned with `src/lib/revenueCatProducts.ts` and the webhook before enabling the key. RevenueCat's Web SDK requires this separate web configuration ([Web SDK setup](https://www.revenuecat.com/docs/web/web-billing/web-sdk)). Do not put private payment-provider or RevenueCat secret keys in `VITE_` variables.

The server-confirmed household plan remains usable when the personal RevenueCat SDK cannot load customer details. In that case, the UI shows the verified household plan and member capacity, while purchaser-only billing controls stay unavailable until the SDK succeeds. Missing web products still require the Web Billing public key and matching products in the current offering; the household entitlement alone cannot supply store prices or checkout.

## Google Play rollout

1. In Google Play Console, create the app with package `com.plantie.app` and upload a signed Android App Bundle to an internal testing track. Play requires an uploaded app before subscription products can be configured. Increment `versionCode` before each new Play upload. See [Android internal testing](android-internal-testing.md) for signing and build commands.
2. Under **Monetize → Products → Subscriptions**, create `plantie_premium_monthly` with an active, auto-renewing monthly base plan named `monthly`, and `plantie_premium_yearly` with an active, auto-renewing yearly base plan named `yearly`. Set prices and availability in Play Console. RevenueCat represents each as `subscription_id:base_plan_id` ([Google Play product setup](https://www.revenuecat.com/docs/getting-started/entitlements/android-products)).
3. Add the Google Play app to the existing RevenueCat project. Connect its Play service account credentials and real-time developer notifications ([RevenueCat service credentials](https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials)). Import the two Play products, attach both to the `premium` entitlement, then put the monthly product in the `$rc_monthly` package and yearly product in `$rc_annual` of the current `default` offering. Keep the Test Store products attached to their Test Store app packages.
4. Put the Google Play app's **public** `goog_...` SDK key in `VITE_REVENUECAT_API_KEY_ANDROID` for the release build. `npm run android:aab` uses production mode and selects that key; `npm run build:test-store` remains for Test Store development. Verify that the release build contains the `goog_...` key, never the `test_...` key ([RevenueCat Test Store guidance](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store)).
5. Add test accounts to the Play internal track and to **license testing**, install the app through Play's opt-in link, and make monthly and yearly test purchases. Verify the RevenueCat customer has `premium`, the webhook delivery succeeds, and the Supabase household becomes Premium. Then test restore purchases, cancellation, expiration, and refund. Play license testers can make test purchases without charges ([Google Play billing tests](https://support.google.com/googleplay/android-developer/answer/6062777)).

## Supabase entitlement sync

Before releasing this checkout, apply `20261007120000_household_invitation_lifecycle.sql` then `20261007123000_household_billing_identity.sql`, deploy the updated `revenuecat-webhook`, then deploy the frontend. The existing migration `20260930120000_revenuecat_household_entitlements.sql` predates household-specific source ownership and is not the current subscription contract. Keep `REVENUECAT_WEBHOOK_SECRET` in server configuration and out of source control. In RevenueCat, configure the webhook URL as:

```text
https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook
```

Set the webhook Authorization header to `Bearer <same-secret>` from server configuration, and enable the purchase, renewal, cancellation, expiration, refund, billing issue, uncancellation, and product change events. Supabase grants Premium only to the household identified by its provider customer or immutable legacy source association. A member's subscription on another household has no effect. RevenueCat accepts the Test Store SDK key locally; use platform-specific keys for release builds.

The billing mapping deliberately does not transfer existing receipts. Legacy purchases remain manageable by the original purchasing Owner; a special coowner still sees all household access details but cannot impersonate that legacy payer. New households share their household customer between authorized Owners, subject to provider/store account restrictions. **Before release, configure and verify RevenueCat restore behavior “Keep with original App User ID”**; see [customer identity](https://www.revenuecat.com/docs/customers/identifying-customers) and [restore behavior](https://www.revenuecat.com/docs/projects/restore-behavior). Database rejection alone cannot stop RevenueCat's default provider-side transfer, which could misroute future source-household renewals. A restore into another household cannot grant access there. The remote policy was not changed by this checkout. Test this with real platform sandboxes before release; passing mocked SDK and rollback SQL tests does not verify store account behavior.

The migration and both `supabase/tests/household_*.sql` fixtures were validated in a single rollback transaction. They do not deploy schema, issue a checkout, or cancel any production subscription. See [billing architecture](revenuecat-billing.md) for the API and release order.
