# Supabase-first backend migration

Plantie mobile runtime uses Supabase as the primary backend. Netlify can still host the web build and can remain as a legacy compatibility backend only when explicitly enabled.

## Backend provider

Frontend selection:

```text
VITE_BACKEND_PROVIDER=supabase
```

Supabase is the default if `VITE_BACKEND_PROVIDER` is missing. Legacy Netlify calls are disabled unless one of these is set:

```text
VITE_BACKEND_PROVIDER=netlify
VITE_ENABLE_NETLIFY_LEGACY_BACKEND=true
```

Do not set `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `REVENUECAT_WEBHOOK_SECRET` as `VITE_*` variables.

For production Supabase-only plant data, also set:

```text
VITE_ENABLE_SUPABASE_WRITES=true
```

With Supabase configured, writes enabled, and `VITE_BACKEND_PROVIDER=supabase`, the app uses Supabase as the only household plant data source. Empty households show an empty dashboard, and failed plant writes are reported instead of being saved to localStorage or Netlify Blobs.

## Netlify dependency audit

| Area | Previous Netlify dependency | Supabase-first status |
| --- | --- | --- |
| Household creation | `/.netlify/functions/household-access` POST | Authenticated creation uses `create_household_for_current_user` RPC. Guest households are local-only. |
| Household token join/lookup | `/.netlify/functions/household-access` GET | New sharing uses Supabase invite RPCs and `#/join?invite=<token>`. Legacy token lookup requires explicit Netlify fallback for migration compatibility. |
| Plant-state sync | `/.netlify/functions/plant-state` and Netlify Blobs | Disabled unless legacy Netlify backend is explicitly enabled. Supabase source-of-truth handles authenticated households, including empty households before the first user-created plant. |
| Report settings sync | `/.netlify/functions/report-settings` | Supabase source-of-truth writes report settings when enabled. Otherwise local fallback is used unless legacy Netlify is explicitly enabled. |
| AI diagnosis | `/.netlify/functions/plant-diagnosis-ai` | `supabase/functions/plant-diagnosis-ai` with authenticated request, server-side entitlement check, and server-side `OPENAI_API_KEY`. |
| AI care generation | `/.netlify/functions/plant-care-ai` | `supabase/functions/plant-care-ai` with authenticated request and server-side `OPENAI_API_KEY`. |
| Push notifications | `push-public-key`, `push-subscription`, scheduled notification function | Still Netlify-only and gated behind explicit legacy backend flag. Supabase push delivery is a future migration. |
| RevenueCat webhook | `/.netlify/functions/revenuecat-webhook` | `supabase/functions/revenuecat-webhook` with idempotent event insert and service-role subscription/entitlement writes. Netlify webhook remains deprecated compatibility fallback. |
| Health endpoint | `/.netlify/functions/health` | Health page reports selected Supabase backend in Supabase mode. Netlify health remains only for legacy backend checks. |
| Delete account request | `/.netlify/functions/delete-account-request` | `supabase/functions/delete-account-request` records a safe manual-review request response without destructive deletes. |

## Supabase Edge Functions

Deploy from the repository root:

```bash
supabase functions deploy plant-diagnosis-ai
supabase functions deploy plant-care-ai
supabase functions deploy revenuecat-webhook
supabase functions deploy delete-account-request
```

Set required Supabase secrets:

```bash
supabase secrets set OPENAI_API_KEY=...
supabase secrets set OPENAI_MODEL=gpt-4o
supabase secrets set REVENUECAT_WEBHOOK_SECRET=...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are available in the Edge Function runtime for user-authenticated Supabase clients. `SUPABASE_SERVICE_ROLE_KEY` is only used server-side for RevenueCat webhook writes.

## RevenueCat webhook URL

Use the Supabase Edge Function URL:

```text
https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook
```

Configure RevenueCat to send either:

```text
Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>
```

or:

```text
x-revenuecat-webhook-secret: <REVENUECAT_WEBHOOK_SECRET>
```

The Netlify webhook URL may remain configured temporarily during rollout, but it is deprecated and should be removed after Supabase webhook delivery is verified.

## Rollback

1. Keep Supabase database/storage as the source for authenticated mobile users.
2. For emergency web rollback, deploy an older Netlify build.
3. To re-enable legacy function calls temporarily, set `VITE_ENABLE_NETLIFY_LEGACY_BACKEND=true`.
4. Do not delete legacy Netlify Blobs until migrated household parity and RevenueCat webhook delivery are verified in production.

## Household invites

Supabase-native household sharing is implemented by `20260603103000_household_invite_rpcs.sql`.

Deploy the SQL:

```bash
supabase db push
```

Invite links use:

```text
#/join?invite=<raw-token>
```

The raw token is returned only once when the invite is created. Supabase stores only `token_hash`, and `list_household_invites` returns safe invite metadata without raw token material.

## Remaining blockers

- Push notification subscription and scheduled delivery still need a Supabase-native design.
- Email reports are not exposed in the mobile UI. Reintroducing them would require Supabase-native scheduling or an external scheduler.
- Netlify Functions can be removed only after RevenueCat webhook, AI Edge Functions, and delete-account request are live and monitored.
