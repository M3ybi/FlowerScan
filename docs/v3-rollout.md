# Plantie V3 rollout and operations

All changes were prepared locally. No production migration, deployment, secret update, user-data change, purchase, email, native publication, merge or push was performed.

## Preconditions

Review the [findings](v3-findings.md) and [validation limits](v3-validation.md). Use a separate staging backend/provider environment first. Preserve database/Storage backups and existing user, household, subscription, invitation and photo records. Do not reset a linked database or run cleanup against production.

The prior local commits contain required image admission/upload-integrity changes. Apply outstanding migrations in repository order, including `20261018190000_image_operation_admission.sql`, before the V3 additions:

1. `20261018200000_account_deletion_review.sql` adds the authenticated private review queue and audit.
2. `20261018201000_complete_request_admission.sql` adds `diagnosis` and `invite_email` request admission.

Inspect pending migrations explicitly before using any linked-project migration command. These additions do not delete accounts, modify customer plan limits or rewrite existing plant/image data.

## Configuration

| Setting | Boundary and meaning |
| --- | --- |
| Existing Supabase URL/anon key | Public client configuration remains unchanged. Edge automatically receives its platform configuration. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Required server configuration for the compatibility Netlify deletion endpoint. It forwards and verifies the caller's JWT; no service-role authority is used for request creation. |
| Existing `SUPABASE_SERVICE_ROLE_KEY` | Server-only provider subscription/usage operations. Never bundle it. |
| `IMAGE_VALIDATION_SIGNING_SECRET` | Optional server-only random secret, at least 32 characters. Without it, the server repeats safety validation. Rotation invalidates cached receipts; V3 retries the same processed image once after explicit receipt rejection. |
| `REVENUECAT_ALLOW_SANDBOX_EVENTS` | Defaults false in both webhook handlers. Set exactly `true` only for a separate test backend receiving sandbox/Test Store events. |
| Existing `REVENUECAT_WEBHOOK_SECRET` | Authenticate webhooks before environment filtering. Keep compatibility endpoint configuration aligned while both are deployed. |
| Existing Resend configuration | Invitation email still uses server-owned recipient/token, `RESEND_API_KEY`, verified `RESEND_FROM_EMAIL` and `APP_PUBLIC_URL`. Auth email continues through the signed Supabase Send Email Hook; this does not require Custom SMTP. |
| Existing operator-mail settings | `ENABLE_TEST_EMAIL` remains false unless explicitly enabled with operator UUIDs and a configured test recipient. |

No secret values were changed. See `.env.example` for names and public/server separation.

## Coordinated application deployment

After staging migration validation, deploy the changed Edge functions: `delete-account-request`, `plant-diagnosis-ai`, `send-household-invite-email`, and `revenuecat-webhook`. Deploy prior image-related functions if those earlier local changes are also outstanding. Deploy the matching Netlify deletion and RevenueCat compatibility handlers, then the web client. The new client handles expired/rotated receipts and the authenticated review response; older deletion clients should update to display the new sign-in requirement.

The private deletion queue must exist before either deletion endpoint is deployed. The expanded admission function must exist before the new diagnosis/invitation handlers. Failure to meet these dependencies fails closed and can temporarily make those operations unavailable.

GitHub Pages deployment now calls the reusable verification workflow and waits for both application and disposable PostgreSQL jobs. Verification performs clean install, Node/TypeScript/build, Deno Edge checks, source graph, client-secret scan, Chromium/WebKit workflows, auth-browser checks and dependency audit. Hosted Actions were not run locally. Deno setup follows the [maintainer's action](https://github.com/denoland/setup-deno). Netlify still uses its existing build configuration; protected-branch checks and Netlify deployment gating must be confirmed in the host settings. Neither workflow automatically applies SQL or deploys Edge functions.

## Account-deletion review operations

`request_account_deletion()` derives the subject from `auth.uid()` and accepts no target/contact fields. It creates at most one request per authenticated account; retries preserve its ID, timestamp and current status. An existing authenticated session establishes request identity. Require any additional identity verification specified by the eventual deletion policy before destructive processing.

Operators with authorized database administration can inspect `public.account_deletion_requests`, indexed by status/time. Statuses are `requested`, `processing`, `completed`; insertion and status changes create private audit rows. Ordinary users can read only their own request and cannot write status, timestamps or audit entries. Service/dashboard audit actions can have a null `changed_by`; use existing restricted administrator access and its platform audit trail for operator attribution. No public admin endpoint or automatic deletion worker was introduced.

Assign an operator and review schedule before advertising an operational SLA. Decide how shared ownership, subscriptions, billing/legal retention, identity re-verification and deletion confirmation are handled. Retention/purge duration is deliberately not guessed: the queue stores an account UUID/status/timestamps, not submitted contact text or household contents; the FK becomes null if an account is later deleted. Audit/request retention needs an approved policy and controlled implementation. No delivery notification destination was configured, so no automatic notification is claimed. A durable row is the current administrative destination.

Only mark a review completed after the approved processing workflow has actually finished. The UI states that a request is saved/under review/marked completed; it never equates receipt with automatic deletion. Storage failure returns a safe retry response, and retry creation is idempotent after an ambiguous response.

## Billing environment release decision

Sandbox/Test Store events now return a safe ignored response before database event/entitlement writes unless explicitly enabled. Signed historical events that omit environment remain compatible. Existing rows are not retroactively classified or revoked.

Verify RevenueCat endpoint environment routing, restore behavior, store identities and the Apple App Review purchase strategy before release. App Review/tester sandbox purchases against a production backend will be ignored by default. Do not enable sandbox events on the production data backend merely to bypass that gate; establish the intended isolated review/test environment first. No real purchase/refund/restore or provider configuration was exercised here.

## Native delivery and device gates

Rebuild Android and iOS from the reviewed web bundle. Local Android debug compilation passed. Windows cannot build/sign with Xcode. Re-sync on macOS and verify the portable relative paths in `ios/App/CapApp-SPM/Package.swift`.

On actual affected Android/iOS devices, verify ten additions, second/tenth HEIC selections, camera/gallery/Files, cancellation, replacement, low memory, cloud-provider files, offline/foreground transitions and household/account changes. Desktop WebKit is not an iPhone. The original affected-device failure remains unverified without those devices/files; do not close that incident based only on these fixtures.

## Rollback

Keep the additive queue/audit and admission schema in place. Roll back application/function code through reviewed versions without deleting records or resetting the database. Preserve existing request/audit rows. Restore compatible endpoint behavior before rolling back client assumptions. Receipt-secret rotation is recoverable through revalidation and does not require photo deletion.

Restoring old diagnosis/invitation functions also restores the reviewed request-abuse gaps. Prefer fixing forward or temporarily disabling the affected provider operation over silently removing admission. Changing webhook sandbox policy or native billing flags requires an explicit environment decision and verification; this document does not authorize those changes.
