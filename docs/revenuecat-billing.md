# RevenueCat billing architecture

RevenueCat billing uses `@revenuecat/purchases-capacitor` on iOS and Android and `@revenuecat/purchases-js` in the browser. Both use the authenticated Supabase user UUID as the RevenueCat App User ID. The frontend never grants Premium: the RevenueCat webhook updates Supabase, and household plan usage remains the access-control source of truth.

## Product and entitlement mapping

RevenueCat entitlement:

```text
premium
```

App Store product IDs:

```text
plantie_premium_monthly
plantie_premium_yearly
```

Google Play product IDs:

```text
plantie_premium_monthly:monthly
plantie_premium_yearly:yearly
```

The Test Store and planned web catalog use `plantie_premium_monthly` and `plantie_premium_yearly`. Accepted store IDs and their canonical plans are centralized in `src/lib/revenueCatProducts.ts`.

Supabase plans:

```text
plantie_premium_monthly -> subscription_plans.plan_key = premium_monthly
plantie_premium_yearly -> subscription_plans.plan_key = premium_yearly
no active premium entitlement -> subscription_plans.plan_key = free
```

## Client billing abstraction

File:

```text
src/lib/billingService.ts
```

Interface:

- `getAvailableProducts()`
- `purchasePremiumMonthly()`
- `purchasePremiumYearly()`
- `restorePurchases()`
- `getCustomerInfo()`
- `syncEntitlements()`

Current adapter:

- Exposes stable product IDs.
- Uses `@revenuecat/purchases-capacitor` on iOS and Android, and `@revenuecat/purchases-js` on web.
- Detects runtime as `web`, `ios`, or `android`.
- Returns `BillingNotConfiguredError` if the runtime's public SDK key is missing.
- Fetches the current offering and purchases its monthly or yearly package through the platform SDK.
- Uses the Supabase user id as RevenueCat `appUserID`.
- Re-fetches RevenueCat customer info after web checkout, refreshes Supabase entitlement state, and waits for the webhook-driven household plan update.
- On web, `restorePurchases()` refreshes the existing identified customer's info; mobile keeps the native restore operation.
- Never activates Premium locally.

## Frontend environment variables

These are browser-safe public SDK keys from RevenueCat Project Settings > API keys > App specific keys:

```bash
VITE_REVENUECAT_API_KEY_IOS=
VITE_REVENUECAT_API_KEY_ANDROID=
VITE_REVENUECAT_API_KEY_WEB=
VITE_REVENUECAT_API_KEY_TEST_STORE=
```

Development and Netlify deploy previews use only the `test_...` Test Store key. Production web builds require a separate `rcb_...` public Web Billing key and a configured web billing provider; if absent, purchase buttons fail closed. Never put the Test Store key in the production web key or expose webhook, Stripe, or Supabase service-role secrets to the browser. The production Netlify site does not enable real web billing until its Web Billing configuration is set up intentionally.

## Active webhook endpoint

Supabase Edge Function:

```text
https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook
```

File:

```text
supabase/functions/revenuecat-webhook/index.ts
```

Current behavior:

- Accepts only `POST`.
- Requires `REVENUECAT_WEBHOOK_SECRET`.
- Accepts the secret through `Authorization: Bearer <secret>` or `x-revenuecat-webhook-secret`.
- Rejects missing secret configuration with `503`.
- Rejects invalid secret with `401`.
- Parses JSON safely.
- Logs only safe metadata: event type, event ID, product ID, and app user id prefix.
- Stores each accepted event ID in `subscription_events` after any subscription and entitlement writes succeed, so a failed write remains retryable.
- Updates `user_subscriptions`, `user_entitlements`, and current-month `usage_counters` for known Supabase users and known products.
- Never creates an entitlement for an unknown Supabase user.
- Never grants Premium for an unknown product or missing `premium` entitlement.
- Leaves the current entitlement unchanged when a known subscription event lacks the `premium` entitlement or an active period has no valid expiration date.
- Deployed with gateway JWT verification disabled; the function validates the RevenueCat bearer secret itself.
- Returns `200` for accepted webhooks so RevenueCat does not retry successful deliveries.
- Returns `500` on Supabase Auth lookup or entitlement-write outages so RevenueCat can retry the same event ID.

The Netlify Function at `/.netlify/functions/revenuecat-webhook` remains a deprecated compatibility fallback.

## RevenueCat event mapping

Handled event types:

- `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION` -> subscription `active`, Premium active for known products/users.
- `PRODUCT_CHANGE` -> event recorded; the effective plan changes only when a subsequent purchase or renewal confirms it.
- `BILLING_ISSUE` -> subscription `grace_period`, Premium remains active until RevenueCat sends expiration/refund.
- `CANCELLATION` -> subscription `cancelled`, Premium remains active until expiration/refund.
- `EXPIRATION` -> subscription `expired`, entitlement downgraded to Free.
- `REFUND` -> subscription `refunded`, entitlement downgraded to Free.

## Expected payload fields

Use only validated fields needed for entitlement updates:

- `event.id`
- `event.type`
- `event.app_user_id`
- `event.product_id`
- `event.entitlement_ids`
- `event.entitlement_id`
- `event.period_type`
- `event.purchased_at_ms`
- `event.expiration_at_ms`
- `event.store`
- `event.transaction_id`
- `event.original_transaction_id`
- `event.price`
- `event.currency`

Do not log raw receipts, auth headers, tokens, subscriber attributes, customer info, or full payloads.

## Table mapping

`subscription_events`:

- Store one row per RevenueCat event.
- Use `event.id` as idempotency key.
- Store sanitized payload subset only.

`user_subscriptions`:

- `user_id`: resolved from `event.app_user_id`.
- `plan_key`: map from product ID.
- `platform`: map from RevenueCat store, usually `ios` or `android`.
- `status`: map from event type and expiration/grace state.
- `platform_transaction_id`: `event.transaction_id`.
- `platform_original_transaction_id`: `event.original_transaction_id`.
- `current_period_start`: `event.purchased_at_ms`.
- `current_period_end` / `expires_at`: `event.expiration_at_ms`.

`user_entitlements`:

- Set Premium when RevenueCat entitlement `premium` is active.
- Clear or downgrade to Free when subscription expires, is refunded, or entitlement is no longer active.
- Entitlement writes must happen server-side only.

`usage_counters`:

- Ensure the current monthly `ai_scan` row exists after a known-user known-product webhook.

## Environment variables

Server-only:

```bash
REVENUECAT_WEBHOOK_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
REVENUECAT_PROJECT_ID=
```

Rules:

- Do not prefix server-only keys with `VITE_`.
- Do not expose service or secret keys in frontend code.
- Do not store them in source control.
- `SUPABASE_SERVICE_ROLE_KEY` is available only to trusted server-side code and Edge Functions.

## RevenueCat webhook URL

Configure the RevenueCat webhook URL to:

```text
https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook
```

Set the same shared secret in RevenueCat and Supabase Edge Function secrets:

```bash
REVENUECAT_WEBHOOK_SECRET=<shared secret>
```

RevenueCat should send the secret as `Authorization: Bearer <secret>`.

## Local webhook testing notes

- Use Netlify Dev or invoke the function with a local POST.
- Set `REVENUECAT_WEBHOOK_SECRET`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` locally.
- Use a Supabase auth user id as `event.app_user_id`; unknown users are stored as events but do not receive Premium.
- Re-send the same `event.id` to verify idempotency.

## Native setup

1. Install dependencies:

```bash
npm install @revenuecat/purchases-capacitor
npx cap sync
```

2. Configure RevenueCat dashboard:
   - Project app/package id: `com.plantie.app`
   - Entitlement: `premium`
   - Products:
     - `plantie_premium_monthly`
     - `plantie_premium_yearly`
   - Attach both products to the `premium` entitlement.

3. Configure App Store Connect and Google Play Console products later. Until store products exist and are approved/active, `getProducts()` may return no products or purchase may fail safely.

## Test Store limitation

RevenueCat Test Store can be used before App Store Connect / Google Play products are ready if the SDK version supports it and the RevenueCat dashboard is configured for Test Store products. Test Store results still must not activate Premium locally. Server entitlement confirmation remains the final source of truth.
