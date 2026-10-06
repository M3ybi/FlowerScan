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

Development mode and `npm run build:test-store` select this key. Run `npm run dev` to test web checkout, or run `npm run mobile:test-store` and open the native project on a device or simulator configured for RevenueCat Test Store.

## Store builds

Set the platform's public SDK key in the build environment:

```dotenv
VITE_REVENUECAT_API_KEY_IOS=appl_...
VITE_REVENUECAT_API_KEY_ANDROID=goog_...
```

Production-mode builds select the iOS or Android key by platform. Do not use the Test Store key for TestFlight, App Store, Play Store, or other release builds. These Vite variables must contain only RevenueCat public SDK keys, never secret API keys.

## Web Test Store rollout

The browser uses `@revenuecat/purchases-js` with the same Supabase user UUID as the mobile SDK. `npm run dev` selects `VITE_REVENUECAT_API_KEY_TEST_STORE`. Netlify deploy previews run `npm run build:test-store`; set that **public** Test Store key only in the Netlify **Deploy Previews** environment context, and protect test previews from general access. Test purchases can grant Premium to real Supabase test households through the existing webhook. Netlify production uses `npm run build` and has no web purchase capability until a real web billing configuration is provided.

After login and household selection, one subscription state controller loads RevenueCat customer info and Supabase household plan usage before a tier is shown. Monthly and yearly IDs are mapped in `src/lib/revenueCatProducts.ts`; Supabase household usage remains the access-control authority. A paid RevenueCat entitlement with a temporarily Free server mirror is shown as syncing, not Free. Failed lookups show an error and never use a stale client cache to grant access. The controller refreshes after purchase or restore, on web focus/native resume, and periodically while visible. It discards old responses after an account or household switch.

The Subscription section also refreshes when opened. Its summary shows the personal plan, renewal status, and RevenueCat entitlement expiration as local date and time. An inactive historical `premium` entitlement with a past expiration is labelled as an expired previous subscription while current access is Free. If the household is Premium but this user has no active RevenueCat purchase, it shows household access without inventing a personal billing period or renewal date. Missing or malformed paid subscription dates show an unknown/error state rather than an assumed renewal.

Webhook event writes are retryable after partial failures, but the subscription, entitlement, and event rows are still separate database requests. Simultaneous or equal-expiry out-of-order events are not transactionally serialized. A per-user database transaction or provider snapshot reconciliation is needed before treating that edge case as fully resolved.

For an active, renewing subscription owned by the signed-in purchaser, **Cancel subscription** opens a confirmation dialog and then RevenueCat's `managementURL` for the actual store or web customer portal. Opening that page does not cancel billing; the provider must confirm the change. When RevenueCat reports auto-renewal off, the UI shows the plan as cancelled but active until its expiry. Supabase keeps Premium access until the trusted entitlement expires, and the free-tier limits apply to future actions afterward without deleting plants. Shared household members cannot cancel another person's purchase. When RevenueCat supplies no management URL, the dialog explains that cancellation is unavailable from this app. Test Store is not a supported management portal; test actual cancellation with the Play/App Store sandbox or RevenueCat Web Billing, and test Test Store expiration separately ([subscription management](https://www.revenuecat.com/docs/subscription-guidance/managing-subscriptions), [Test Store](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store)).

On Android, Monthly → Yearly uses RevenueCat's store product-change purchase with the active monthly product as `oldProductIdentifier`. On iOS, purchasing Yearly while Monthly is active relies on both products being in the **same App Store subscription group**; Apple determines when the change takes effect. The displayed plan follows RevenueCat customer info after the transaction, including deferred changes.

On web, a Monthly subscriber uses the RevenueCat-provided management URL to change plans. Configure an allowed Monthly → Yearly change path in the Web Billing provider/customer portal and verify it with a real web billing sandbox before enabling production web purchases. The Test Store does not document a safe web product-change flow; if it provides no management URL, the switch is unavailable. Do not implement web upgrade as a second ordinary checkout: the Web SDK can fall back to a separate purchase when no change path exists. The Supabase webhook must be redeployed after these changes: it records `PRODUCT_CHANGE` with `new_product_id`, but waits for the effective `RENEWAL` or `INITIAL_PURCHASE` before changing the active plan, and ignores stale expiration events from a previous period.

To test on web, sign in with a Free test household, open Subscription, choose monthly or yearly, and use the Test Store valid, failed, and purchase-cancel actions. Valid must create the `premium` entitlement for that Supabase user, reach the webhook, and update the household plan without a logout. Failed or abandoned purchases must leave the household Free. Reload and use **Refresh subscription** to confirm the same account remains Premium. The Test Store purchase dialog's Cancel button only abandons that purchase; it does not cancel an existing subscription ([RevenueCat Test Store](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store)).

For future live web payments, create a RevenueCat Web Billing configuration with a supported provider, products attached to the same `premium` entitlement and current offering, and set `VITE_REVENUECAT_API_KEY_WEB=rcb_...` in the Netlify **Production** environment. Keep product IDs aligned with `src/lib/revenueCatProducts.ts` and the webhook before enabling the key. RevenueCat's Web SDK requires this separate web configuration ([Web SDK setup](https://www.revenuecat.com/docs/web/web-billing/web-sdk)). Do not put private payment-provider or RevenueCat secret keys in `VITE_` variables.

The server-confirmed household plan remains usable when the personal RevenueCat SDK cannot load customer details. In that case, the UI shows the verified household plan and member capacity, while purchaser-only billing controls stay unavailable until the SDK succeeds. Missing web products still require the Web Billing public key and matching products in the current offering; the household entitlement alone cannot supply store prices or checkout.

## Google Play rollout

1. In Google Play Console, create the app with package `com.plantie.app` and upload a signed Android App Bundle to an internal testing track. Play requires an uploaded app before subscription products can be configured. Increment `versionCode` before each new Play upload. See [Android internal testing](android-internal-testing.md) for signing and build commands.
2. Under **Monetize → Products → Subscriptions**, create `plantie_premium_monthly` with an active, auto-renewing monthly base plan named `monthly`, and `plantie_premium_yearly` with an active, auto-renewing yearly base plan named `yearly`. Set prices and availability in Play Console. RevenueCat represents each as `subscription_id:base_plan_id` ([Google Play product setup](https://www.revenuecat.com/docs/getting-started/entitlements/android-products)).
3. Add the Google Play app to the existing RevenueCat project. Connect its Play service account credentials and real-time developer notifications ([RevenueCat service credentials](https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials)). Import the two Play products, attach both to the `premium` entitlement, then put the monthly product in the `$rc_monthly` package and yearly product in `$rc_annual` of the current `default` offering. Keep the Test Store products attached to their Test Store app packages.
4. Put the Google Play app's **public** `goog_...` SDK key in `VITE_REVENUECAT_API_KEY_ANDROID` for the release build. `npm run android:aab` uses production mode and selects that key; `npm run build:test-store` remains for Test Store development. Verify that the release build contains the `goog_...` key, never the `test_...` key ([RevenueCat Test Store guidance](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store)).
5. Add test accounts to the Play internal track and to **license testing**, install the app through Play's opt-in link, and make monthly and yearly test purchases. Verify the RevenueCat customer has `premium`, the webhook delivery succeeds, and the Supabase household becomes Premium. Then test restore purchases, cancellation, expiration, and refund. Play license testers can make test purchases without charges ([Google Play billing tests](https://support.google.com/googleplay/android-developer/answer/6062777)).

## Supabase entitlement sync

The migration `20260930120000_revenuecat_household_entitlements.sql` and the `revenuecat-webhook` Edge Function are deployed to the linked Supabase project. Its `REVENUECAT_WEBHOOK_SECRET` is stored in `.env.server` locally and Supabase Edge Function secrets; keep it out of source control. In RevenueCat, configure the webhook URL as:

```text
https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook
```

Set the webhook Authorization header to `Bearer <same-secret>` using the value from `.env.server`, and enable the purchase, renewal, cancellation, expiration, refund, billing issue, uncancellation, and product change events. The webhook stores the user's entitlement; Supabase grants household Premium while any current household member has a valid Premium entitlement. RevenueCat accepts the Test Store SDK key locally; use platform-specific keys for release builds.
