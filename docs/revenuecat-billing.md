# RevenueCat billing architecture

RevenueCat billing uses `@revenuecat/purchases-capacitor` on iOS and Android and `@revenuecat/purchases-js` in the browser. New purchases use a server-allocated RevenueCat App User ID for the selected household. Existing subscriptions retain their original purchaser UUID and provider receipt. The frontend never grants Premium: the RevenueCat webhook updates Supabase, and the selected household entitlement and usage remain the access-control source of truth.

## Household identity and rollout

Apply `20261007120000_household_invitation_lifecycle.sql`, then `20261007123000_household_billing_identity.sql`, before deploying the updated webhook and frontend. These migrations and the code in this checkout require a coordinated release; local validation does not apply or deploy them. The billing migration changes `begin_household_purchase(uuid)` from `void` to a provider customer ID; older clients that ignore its response remain compatible.

`get_household_billing_customer(householdId)` and `begin_household_purchase(householdId)` require an active Owner and return an opaque, stable `hh_<random UUID>` identity. Repeating an abandoned or cancelled checkout returns the same identity without reserving an irreversible purchase intent. An Owner can manage two households independently. A Viewer receives the selected household's plan, billing interval, validity, cancellation state and capacity from Supabase and does not need to read a provider customer.

`household_billing_customers` resolves new provider customers to their household. `household_subscription_sources` preserves existing source subscription associations. `household_provider_transactions` prevents a provider receipt from granting access to a second household. These mapping tables are private to trusted server code. A legacy subscription continues using its purchaser UUID; its purchasing Owner can manage it, while another Owner cannot impersonate that legacy payer. No existing purchase is aliased or migrated into a new provider account.

Supported new and legacy callbacks use the service-role-only `apply_household_provider_event` transaction. It serializes the selected household (and a legacy source row), deduplicates event IDs, protects immutable receipt associations, ignores older provider timestamps and superseded periods, updates billing history and reconciles membership access atomically. Legacy callbacks also update their existing `user_subscriptions`, `user_entitlements` and usage row inside that transaction. Event timestamp ordering starts with events received by the new code; older rows do not contain a historical provider timestamp. Missing provider timestamps use receipt time for backward compatibility, so production payloads should retain RevenueCat's `event_timestamp_ms`.

`20261007150000_household_subscription_history_facts.sql` adds recorded previous/new plan, provider event identity, actual provider occurrence time and billing-period bounds for the household timeline. Apply it before deploying the history reader. The provider transaction writes one meaningful lifecycle row; its legacy trigger still performs the same subscription and access work while suppressing its redundant history insert. Standalone sync and expiry reconciliation retain meaningful observed transitions. History uniqueness uses the provider event ID, with a renewal fallback limited to the same immutable receipt hash, plan and exact period. Different receipts and successive periods remain separate. Refunds are recorded as refunds rather than a generic Free transition. Active Owners and eligible active Viewers may read the informational history; neither receives direct history writes or additional billing permissions.

Existing rows retain their recorded plan and timestamp. Their unknown previous plan, provider identity and period remain null because current subscription state cannot reconstruct historical facts. The October 6 audit found four distinct successive five-minute renewal periods, not duplicate deliveries of one renewal; stored payloads do not retain environment, so sandbox provenance is unconfirmed. The rollback-only fixture in `supabase/tests/household_subscription_history.sql` checks event facts, idempotency, distinct periods/receipts, first observed event classification, legacy expiry noise and read-only Viewer access. The migration changes history metadata and ingestion only; it does not change paid access, provider binding, cancellation or membership decisions.

Cancellation retains paid Premium until the confirmed end of its period. Expiry suspends eligible Viewers and invalidates pending invitations; it does not delete plants, membership history or the configured special Owners. A subscription on another household never contributes Premium to the selected one.

RevenueCat and the device's store still determine which purchases, product changes and restores they support. One receipt cannot be restored into a different Plantie household. **Release prerequisite: configure RevenueCat's restore behavior to “Keep with original App User ID” before enabling new native household billing**, following the [restore behavior documentation](https://www.revenuecat.com/docs/projects/restore-behavior). The default transfer behavior can move the receipt at RevenueCat even though Plantie's database rejects reassignment, leaving later renewal events on the wrong provider customer. Database checks alone cannot prevent that provider-side move. `VITE_REVENUECAT_HOUSEHOLD_NATIVE_BILLING_ENABLED` defaults to `false`: new `hh_` native purchases, plan changes and restores fail closed before a provider mutation. Set it to exactly `true` and rebuild only after confirming the remote policy. Household customer reads, legacy purchaser-UUID operations and web billing remain supported. This checkout does not change the remote RevenueCat configuration. Verify the policy, native store account restrictions, coowner management, renewal and actual cancellation in the store/web sandbox. No real provider purchase or cancellation is exercised by the SQL fixtures.

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
- `purchasePremiumMonthly(householdId)`
- `purchasePremiumYearly(householdId)`
- `changePlan(period, householdId)`
- `restorePurchases(householdId)`
- `getCustomerInfo(forceRefresh, householdId)`
- `syncEntitlements(householdId)`

Current adapter:

- Exposes stable product IDs.
- Uses `@revenuecat/purchases-capacitor` on iOS and Android, and `@revenuecat/purchases-js` on web.
- Detects runtime as `web`, `ios`, or `android`.
- Returns `BillingNotConfiguredError` if the runtime's public SDK key is missing.
- Fetches the current offering and purchases its monthly or yearly package through the platform SDK.
- Resolves the selected household's authorized provider identity before customer, purchase and restore calls; serializes shared SDK identity changes and rejects results after an account switch.
- Re-fetches RevenueCat customer info after web checkout, refreshes Supabase entitlement state, and waits for the webhook-driven household plan update.
- On web, `restorePurchases()` refreshes the existing identified customer's info; mobile keeps the native restore operation.
- Never activates Premium locally.

## Frontend environment variables

These are browser-safe public SDK keys from RevenueCat Project Settings > API keys > App specific keys:

```bash
VITE_REVENUECAT_API_KEY_IOS=
VITE_REVENUECAT_API_KEY_ANDROID=
VITE_REVENUECAT_API_KEY_WEB=
VITE_REVENUECAT_API_KEY_WEB_SANDBOX=
VITE_REVENUECAT_API_KEY_TEST_STORE=
VITE_REVENUECAT_HOUSEHOLD_NATIVE_BILLING_ENABLED=false
```

Local browser development uses the `rcb_sb_...` Web Billing sandbox key when provided in `.env.development.local`; otherwise it uses the `test_...` Test Store key. Native development and Netlify deploy previews use the Test Store key. Production web builds require a separate `rcb_...` public Web Billing key and a configured web billing provider; if absent, purchase buttons fail closed. Never put the Test Store or sandbox key in the production web key or expose webhook, Stripe, or Supabase service-role secrets to the browser. The production Netlify site does not enable real web billing until its Web Billing configuration is set up intentionally.

## Cancellation testing

The pricing page opens the purchased subscription's RevenueCat `managementURL` after confirmation. Opening the portal does not itself cancel renewal; the customer must complete cancellation there. Cancellation preserves Premium until the provider-confirmed period end, and expiration removes paid access through the existing webhook flow.

RevenueCat Test Store purchases do not have a supported cancellation portal or cancellation API. The SDK adapters retain the active entitlement's `store`. Renewing Test Store subscriptions show **Cancel subscription** for their authorized Owner; it opens an explanation with a Close button, never an unsupported portal or a simulated cancellation. The purchased store is checked independently of the currently configured SDK key: switching to a Web Billing sandbox key does not convert an earlier Test Store subscription.

To test actual cancellation, use a new RevenueCat Web Billing sandbox purchase. Local browser development must have `VITE_REVENUECAT_API_KEY_WEB_SANDBOX` configured and no `VITE_REVENUECAT_BILLING_MODE=test_store` override; restart Vite and reload the browser. The target backend must also accept Web Billing sandbox webhooks. After deploying the compatible webhook, set `REVENUECAT_ALLOW_WEB_BILLING_SANDBOX_EVENTS=true` on the explicitly authorized testing project. This admits only signed `RC_BILLING` events whose environment is `SANDBOX`. It works alongside `REVENUECAT_BILLING_MODE=test_store`, preserving existing Test Store renewal/expiration handling without admitting Apple, Google, Stripe Billing, Paddle or production Web Billing events. The flag defaults to false; unknown billing modes still fail closed. Leave the broader `REVENUECAT_ALLOW_SANDBOX_EVENTS` flag disabled.

Verify `INITIAL_PURCHASE`, cancellation with retained paid access, and `EXPIRATION` against the same authorized household. Existing production Test Store configuration is documented in `test-store-billing.md`; switching it to Web Billing is a separate deployment change, not a frontend-only fix. Do not edit database subscription rows or fabricate webhook events to simulate provider cancellation.

For rollback, set `REVENUECAT_ALLOW_WEB_BILLING_SANDBOX_EVENTS=false` before restoring the previous webhook source. Disabling the flag stops future Web Billing sandbox lifecycle updates, including cancellations and expirations; existing entitlement rows are not rewritten. Finish active sandbox tests before disabling the integration.

### Setup verification — 2026-10-25

The user explicitly authorized Web Billing sandbox cancellation testing on the existing project. The compatible primary webhook was deployed and verified ACTIVE at version 13 after configuration refresh, with `verify_jwt=false` and the shared-secret check retained. All six deployed source files matched the local source. Only `REVENUECAT_ALLOW_WEB_BILLING_SANDBOX_EVENTS=true` was added; all 16 prior configuration digests, including `REVENUECAT_BILLING_MODE=test_store`, were unchanged. The broad sandbox flag remains absent. Recovery source and digest snapshots are stored locally under `.netlify/web-billing-sandbox-recovery/` (ignored).

`npm run check` passed (type checking, full configured Node suite, production build). Deno type checking and both actual-entrypoint tests passed without network permission, covering Web Billing sandbox purchase/cancellation/expiration routing, retained period end, invalid credentials, other-provider denial and disabling the opt-in. A headless Edge session using the real RevenueCat Web SDK confirmed the default offering contains the monthly and yearly sandbox products with prices. Live wrong-secret and authenticated-invalid-body probes returned 401 and 400; they created no subscription events. Local served environment readback confirmed Web Billing sandbox selection.

The approved account's old Test Store subscription was confirmed expired in both RevenueCat and Supabase; no subscription row was manually changed. A new actual sandbox purchase, customer-portal cancellation and resulting provider webhook delivery remain to be exercised by the signed-in tester. No hosted frontend deployment, production purchase, actual cancellation or refund was performed.

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
- Commits supported subscription updates and their `subscription_events` ID in one database transaction, so failed writes remain retryable.
- Updates only the resolved household for new customer identities; preserves legacy personal subscription rows and their fixed household source mapping.
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
- `event.event_timestamp_ms`
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

`household_subscriptions` stores the effective plan, lifecycle, provider customer, original transaction and most recent provider timestamp for one household. Its entitlement is the access authority for every active member. `user_subscriptions` remains the compatibility source for existing purchaser-UUID subscriptions:

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
- Use a server-authorized household provider customer as `event.app_user_id`, or an existing mapped legacy purchaser UUID. An unknown customer or unbound legacy user does not grant household Premium.
- Re-send the same `event.id` to verify idempotency.
- `supabase/tests/household_billing_binding.sql` and `household_invitation_lifecycle.sql` contain synthetic assertions. Run both migrations and fixtures within one `BEGIN` / `ROLLBACK` transaction; never apply these fixtures to production without rollback. Multi-session provider delivery and real store restore behavior still require staging checks.

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

## V3 webhook environment gate

Both handlers ignore signed sandbox/Test Store events before database writes unless `REVENUECAT_ALLOW_SANDBOX_EVENTS` is exactly `true`. Keep that opt-in on a separate test backend. Explicit unknown environments are denied; signed legacy events without environment remain compatible. Existing stored records are not reclassified. Confirm App Review/tester sandbox routing before rollout; those purchases will be ignored against the default production gate. See [V3 deployment decisions](v3-rollout.md).


## Hosted Web Billing sandbox ? 2026-10-26

The user authorized Web Billing sandbox on `plantiecare.com` for cancellation testing. The hosted web build explicitly selects `VITE_REVENUECAT_BILLING_MODE=web_sandbox` and requires `VITE_REVENUECAT_API_KEY_WEB_SANDBOX` with a nonempty `rcb_sb_` key. This mode cannot fall back to a live or Test Store key and is rejected for native production builds. Production database target checks still apply; previews retain Test Store mode and database isolation. The Netlify production context contains only the public sandbox SDK key and explicit mode as new settings. This account requires default scopes for environment variables; its plan rejects build-only scopes. Existing settings are preserved, and recovery configuration is archived locally with Windows DPAPI. Native debug builds must explicitly select Test Store as before.

Only new Web Billing sandbox purchases can use its customer portal for cancellation. Existing Test Store purchases keep their original store and must expire naturally. The backend retains Test Store mode and the separate Web Billing sandbox webhook opt-in so both existing and new subscriptions continue through the trusted lifecycle handler. No subscription rows or history are edited for this transition.

The visible cancellation action for a renewing Test Store Owner opens its translated limitation explanation. For Web Billing, confirmation still opens the provider management URL, with Premium retained until the provider confirms expiration. Test a new purchase, provider cancellation, retained access and final expiry with an authorized signed-in test household. Deployment readback alone does not verify that full purchase lifecycle.

To recover the previous purchase mode, restore the previous production deployment and set the production frontend mode back to `test_store`; preserve the webhook sandbox opt-in while outstanding Web Billing sandbox subscriptions exist. Never use `rcb_sb_` as a live Web Billing key.


Local verification for this change: `npm run check`, focused subscription and billing tests, all three release artifact modes with entry hashes/client-secret scans, and Chromium/WebKit application workflows passed. The browser fixtures cover Test Store explanation, provider handoff without entitlement changes, Viewer restrictions, Slovak mobile layout and dialog keyboard behavior. `npm run test:revenuecat-mode` could not run because Deno is unavailable on this machine; the Node webhook regression suite passed. Live configuration readback confirmed the primary webhook is ACTIVE, retains Test Store mode, enables only the narrow Web Billing sandbox opt-in and leaves the broad sandbox flag absent. No live test purchase or cancellation was performed by this change.
