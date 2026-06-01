# RevenueCat billing architecture

RevenueCat billing is integrated for native Capacitor runtimes only. Web purchases remain disabled. The app must not activate Premium from the frontend and must not fake successful purchases.

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
plantie_premium_monthly
plantie_premium_yearly
```

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
- Uses `@revenuecat/purchases-capacitor` only on iOS and Android.
- Detects runtime as `web`, `ios`, or `android`.
- Returns `BillingWebDisabledError` on web.
- Returns `BillingNotConfiguredError` on native if the platform RevenueCat key is missing.
- Fetches products with `getProducts()` and purchases with `purchaseStoreProduct()`.
- Uses the Supabase user id as RevenueCat `appUserID`.
- Calls `syncEntitlements()` after purchase/restore to refresh Supabase server entitlement state.
- Never activates Premium locally.

## Frontend environment variables

These are public mobile SDK keys from RevenueCat Project Settings > API keys > App specific keys:

```bash
VITE_REVENUECAT_API_KEY_IOS=
VITE_REVENUECAT_API_KEY_ANDROID=
```

Do not commit real keys. These are not service-role keys and do not replace server-side webhook validation.

## Webhook endpoint

Netlify Function:

```text
/.netlify/functions/revenuecat-webhook
```

File:

```text
netlify/functions/revenuecat-webhook.ts
```

Current behavior:

- Accepts only `POST`.
- Requires `REVENUECAT_WEBHOOK_SECRET`.
- Accepts the secret through `Authorization: Bearer <secret>` or `x-revenuecat-webhook-secret`.
- Rejects missing secret configuration with `503`.
- Rejects invalid secret with `401`.
- Parses JSON safely.
- Logs only safe metadata: event type, event ID, product ID, and app user id prefix.
- Stores every valid event in `subscription_events` idempotently.
- Updates `user_subscriptions`, `user_entitlements`, and current-month `usage_counters` for known Supabase users and known products.
- Never creates an entitlement for an unknown Supabase user.
- Never grants Premium for an unknown product or missing `premium` entitlement.
- Returns `202` for accepted webhooks and includes whether state updates were applied.

## RevenueCat event mapping

Handled event types:

- `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION`, `PRODUCT_CHANGE` -> subscription `active`, Premium active for known products/users.
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
- `SUPABASE_SERVICE_ROLE_KEY` must only be available to Netlify Functions.

## RevenueCat webhook URL

Configure RevenueCat webhook URL to:

```text
https://<your-netlify-site>/.netlify/functions/revenuecat-webhook
```

Set the same shared secret in RevenueCat and Netlify:

```bash
REVENUECAT_WEBHOOK_SECRET=<shared secret>
```

RevenueCat can send the secret as `Authorization: Bearer <secret>` or `x-revenuecat-webhook-secret`.

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
