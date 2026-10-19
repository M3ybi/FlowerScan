# V4 deployment, operations and rollback runbook

Historical preparation snapshot: the later direct-production request authorized a partial deployment. See [actual production execution and remaining blockers](v4-production-deployment.md) for current status; the preparation-only statements below describe the earlier authorization.

**Prepared only. No staging is authorized; no production step below was executed.** Candidate code is `9399257`; baseline is `4077c2c`. Required external authority and final gate evidence must exist before using deployment commands. Never reset a linked database, include production data in fixtures, delete images speculatively, or enable the legacy backend as an automatic fallback.

## Local verification entrypoint

After provisioning a disposable loopback PostgreSQL administrator and the Android JBR/SDK:

```powershell
$env:PLANTIE_TEST_POSTGRES_URL = '<disposable loopback PostgreSQL connection>'
$env:JAVA_HOME = '<Android Studio JBR directory>'
npm run verify:release
$taskVerificationExit = $LASTEXITCODE
```

The command runs clean install, `check`, both image and application browser engines, auth-browser tests, both audits, pinned Deno checks/signature test, graph and bundle checks, PostgreSQL concurrency/replay, the full disposable Supabase gate, Android debug build and `git diff --check`. Repository-owned npm argument lists are fixed; secret values are not printed. Child exit 2 is a **failure** unless the specific infrastructure command explicitly defines it as blocked. Failed install/application checks mark dependent steps NOT_RUN. The report is `.tmp-tests/v4-release-verification.json`; per-step UTF-8 logs are ignored `.tmp-v4-release-*.log` files.

Exit codes: **0** = selected checks passed; **1** = an executable check failed; **2** = required infrastructure/manual gates remain blocked. `--local-only` allows exit 0 when executable local checks pass while retaining BLOCKED gates and **NOT READY** in the report. It never authorizes deployment. The script deliberately has no flag to self-certify physical/provider acceptance. Review and attach that evidence separately. On Linux/macOS run the platform-equivalent native Gradle commands; the existing `android:build` package command uses the Windows wrapper.

Full Supabase is a separate required Docker job. PostgreSQL adapters cannot waive it. Hosted Actions, protected branch requirements and Netlify deployment checks must be configured/verified by an operator; a committed workflow is not proof they ran.

## Dependency and compatibility map

| Entrypoint | Authentication / input / limits | Dependencies and failure behavior |
| --- | --- | --- |
| `validate-plant-image` | User JWT; bounded supported JPEG input; validation admission (60/hour) | OpenAI safety and optional receipt secret; safe errors, deadline; no Storage write |
| `upload-validated-image` | User JWT + active collaborative household access; canonical JPEG/path; pending cap 20 | Storage buckets/policies + upload reservation RPC, V4 post-lock membership check; valid receipt or server safety fallback; provider/Storage failure does not bypass validation |
| `plant-care-ai` | User JWT/membership; structured bounded plant/image inputs; monthly reservation and care admission | Integrity/quota RPCs + OpenAI; deadline, release on error; malformed results fail safely |
| `plant-diagnosis-ai` | User JWT/membership; bounded image; monthly reservation + 30/hour diagnosis admission | Complete request-admission migration, OpenAI and quota cleanup; throttling does not consume a successful monthly result |
| `send-household-invite-email` | User JWT, server-recovered invitation recipient/token; Owner/actionable invitation; six/hour | Vault/invitation lifecycle RPCs, complete admission, Resend + public URL; stable delivery idempotency, 10-second provider deadline; recoverable pending row |
| `send-test-email` | Disabled unless explicit enable flag, operator UUID allowlist + authenticated caller | Resend configured test recipient only; admission/deadline; do not enable for general users |
| `delete-account-request` | User JWT; identity derived from JWT, caller target/contact ignored | Deletion queue/audit migration before code; idempotent row creation; generic retry on persistence failure; no account purge |
| `revenuecat-webhook` | Server shared-secret authentication; bounded event schema; explicit sandbox default-deny | Billing identity/event/history/revocation migrations, service-role RPC; atomic duplicate/order/transaction binding; failed processing retryable |
| `send-auth-email` | Standard Webhooks signature/timestamp, no user JWT; validated action/recipient/hash/return URL; bounded body | Hook secret, verified Resend sender/key, Supabase/public URLs; 4-second provider deadline, stable idempotency, generic errors |

All nine entrypoints changed in V4 because of the shared observability wrapper and require deployment. Their request schemas, receipts and database interfaces remain compatible. Each emits a per-invocation `plantie.operation` record and `X-Plantie-Request-ID` response header with CORS exposure. The wrapper never logs body/URL/headers/exception text and returns a safe 503 for uncaught exceptions. Platform termination can occur before a final event, so platform timeout logs remain necessary.

Old image clients **without** optional receipts follow server validation; invalid/expired receipts fail closed. V3 clients perform one explicit revalidation retry after receipt rejection, not after ambiguous network failure. Deploying a new validator with an older upload handler or vice versa retains the missing-receipt fallback. Verify these combinations in staging. Keep both functions' signing secret consistent; rotations require revalidation, not image deletion.

Existing sessions, household IDs, plant/image paths, subscription/history rows and invitation links are not rewritten by V4. The preexisting deletion endpoint now requires authenticated identity and old unauthenticated clients must update. New RPC consumers fail closed if schema deployment is missed, causing temporary unavailability rather than insecure fallback. Keep backend compatibility for installed native builds; no minimum supported version is assumed from local code.

## Exact rollout order — future authorized operator

1. Freeze the final candidate plus documentation revision. Require a clean tree, passing executable checks, completed security review and resolved BLOCKED gates. Save lockfile, tool versions, bundle hashes, release manifest, previous web artifact and previous Edge source/config. A local/dirty release manifest is not a production artifact.
2. Establish an explicitly authorized isolated staging project/site, allowed synthetic account/domain, test entitlements, provider projects and cleanup policy. This is currently absent. Use an isolated deployment checkout with no copied linked marker. Confirm backup/restore access and test recovery before production.
3. Have an authorized administrator capture hosted migration history and schema/ACLs; determine pending versions from the 34-file inventory. Verify Vault, Auth, Storage, billing bindings and existing historical data. Review the historical clean-replay correction; **do not reapply or repair already recorded migrations**. If prior versions are missing, stop for a specific upgrade plan rather than forcing `--include-all`.
4. Snapshot approved database state and preserve Storage objects/references using approved provider facilities. Record restore point/time and owner; test restoring to an isolated target. Do not test destructive restore on production.
5. In staging, set approved provider secrets privately. Explicitly specify project ref for each remote operation. The installed CLI supports `npx supabase db push --project-ref $testProjectRef --dry-run --skip-vault`; review the pending list. Only after review, run the matching push without `--dry-run`. Do not pass database passwords in shell arguments or logs, include seed data, alter Vault secrets from local config, or use this workspace's ambient linked target.
6. Apply additive schema in ascending order. The recent tail is `20261018190000_image_operation_admission.sql` → `20261018200000_account_deletion_review.sql` → `20261018201000_complete_request_admission.sql` → **`20261019100000_recheck_upload_membership_after_lock.sql`**. Earlier billing/invitation/Storage/integrity migrations must already be present. Validate grants/RLS/locks and synthetic upgrade/readback before functions.
7. Deploy `send-auth-email` with explicit project and `--no-verify-jwt`; then configure the signed Auth hook. Deploy `revenuecat-webhook` with `--no-verify-jwt` because RevenueCat supplies its configured shared secret rather than a Supabase user JWT. The handler must retain its shared-secret check. Confirm gateway settings explicitly; the repository config only declares the Auth hook exception. Never disable JWT validation indiscriminately across user endpoints.
8. Deploy user endpoints in order: `validate-plant-image`, `upload-validated-image`, `plant-care-ai`, `plant-diagnosis-ai`, `send-household-invite-email`, `send-test-email`, `delete-account-request`. Example syntax: `npx supabase functions deploy upload-validated-image --project-ref $testProjectRef`. Do not use `--prune` or omit the function list. Verify each deployment/version/secret presence; test safe 401/403/429/5xx and required CORS/request-ID behavior.
9. If still deployed, update the matching Netlify compatibility webhook/deletion functions with aligned server policy. Verify whether `ENABLE_NETLIFY_LEGACY_BACKEND` and frontend legacy flags are actually enabled (UNKNOWN). Do not activate them to work around a Supabase outage.
10. Configure isolated preview URLs and public Test Store key, then `build:test-store` and preview the web artifact. Check `/`, `/auth/callback`, `/auth/recovery`, asset cache, source-map absence, request ID exposure, CSP console and manifest revision/backend fingerprint. Production and test origins must differ.
11. Complete real auth/email, billing/webhook, private Storage/API and physical image/native matrices. Rehearse failed-function deployment, migration-before-client, old receipt-less client, receipt rotation, frontend rollback, provider timeouts, lost responses and retry without duplicates. Obtain explicit release approval based on actual evidence.
12. Production: repeat backup, history/config/pending-migration review against the approved production target. Apply only approved pending migrations; then deploy compatible Edge functions in the same order; update compatibility handlers if active; finally deploy the production-mode web bundle with production keys. Do not push or perform any of these actions automatically from this report.
13. Authorized smoke tests: login/refresh/recovery routing; private authorized read and cross-household denial; synthetic photo creation/readback; entitlement/history consistency; pending invitation/deletion review; safe rate denial. Use only approved test identities and avoid charges/messages to ordinary users. Stop rollout if any invariant fails.
14. Monitor the first approved traffic window and compare with the predeploy baseline. Prepare signed native releases only after platform acceptance, correct store version/signing and review-environment decisions. Maintain old-client backend support during adoption.

## Failure injection and rollback

| Scenario | Local evidence | External rehearsal / safe recovery |
| --- | --- | --- |
| Auth refresh unavailable/stale callback | Hook/controller/browser tests | Real session/network interruptions; sign-in recovery, no stale account state |
| Safety/AI timeout, malformed result, Storage failure | Browser/Edge boundary tests, caller deadlines | Real service outage in isolated environment; retain form, release quota lease, no unvalidated upload |
| Network loss during plant create / database failure | Assembled offline App + repository/action tests | Actual PostgREST/Storage ambiguity/readback; reconcile outcome before retry/cleanup; never delete a referenced image |
| Duplicate/delayed webhook, refund/stale renewal | Both webhook tests + real SQL/order/concurrency fixtures | Provider retry/sandbox delivery and history inspection; authoritative reconciliation, no fabricated subscription rollback |
| Resend failure / repeated invitation | Signed hook/handler/client tests | Actual test sender failure/retry; same pending invitation and idempotency key |
| Membership revoked during upload reservation | Real 16-session waiting-lock regression | Repeat through actual platform JWT/API before release |
| One function fails deployment / old client remains | Source dependency review only | BLOCKED staging rehearsal. Keep schema additive; restore compatible function version or disable the affected operation |
| Frontend rollback after migration | Signature/schema review and clean/upgrade data preservation | BLOCKED hosted rehearsal. Restore verified previous artifact only after compatibility test; keep new schema/records |

Database rollback: retain additive queue/audit/intents and membership fix. Prefer a reviewed forward fix; do not drop tables, delete migration history, reset DB, purge user records or restore an old authorization race. If incompatible data changes are ever required, stop and use an approved isolated restore/recovery plan.

Edge rollback: retain a reviewed prior source bundle and secret-name requirements. Reverting diagnosis/invitation admission restores known abuse gaps; prefer fixing forward or disabling the operation. Keep Auth hook secret/handler and RevenueCat routing aligned. Do not silently disable authentication to make smoke tests pass.

Web rollback: restore the prior verified Netlify deploy/artifact after old/new backend compatibility tests. Hashed assets are immutable; HTML revalidates. Native rollback cannot recall installed apps; publish a corrected signed higher version while preserving server contracts. RevenueCat rollback never edits paid records to mimic a provider event.

## Minimal observability and provisional alerts

Use existing Supabase Auth/Edge/DB logs, Netlify function logs and provider dashboards. No monitoring SaaS or collection endpoint was added. New fixed-field events contain operation, request ID, status, duration and coarse outcome only. Exclude 204 preflight responses from request-success denominators. Capture `X-Plantie-Request-ID` from a failed request and match it to the function event; it is per invocation, not a global cross-request trace. Existing error codes/diagnostic references identify image processing stages without image content.

| Metric | Source / definition | Status / proposed response |
| --- | --- | --- |
| Auth delivery failure | `auth_email` failed / attempted; Auth logs for direct login/refresh failures | Logs locally tested; hosted aggregation UNKNOWN |
| Image upload / validation / AI success | Corresponding operation status/outcome; 429 counted separately | Local records tested; hosted dashboard/traffic baseline required |
| HEIC decode failures | Safe client stage/code reports and physical fixture results | No centralized production client collector exists; rate UNKNOWN. Do not claim an automated metric |
| Admission denial | 429 operation events; distinguish quota denial from hourly abuse limits by public code during investigation | 60 validation, 30 diagnosis, 6 invitations per user/hour; review actual legitimate usage before changing |
| Webhook failure / duplicates | Function outcome + provider delivery dashboard; duplicate acknowledgements and event identity in restricted DB/provider logs | Avoid payload/token export; new wrapper alone cannot distinguish duplicate 2xx from applied 2xx |
| Pending deletion age | Aggregate queue query below | Policy/SLA not assigned; review owner required |
| Unclaimed images | Restricted count comparing intents/objects to plant/diagnostic references | Measure baseline; do not automatically delete |
| Edge timeout | Platform execution/timeout logs joined to completed events when available | Wrapper cannot emit after a platform kill |

Provisional, **not applied**: page immediately for confirmed cross-household access, wrong paid entitlement or data loss. For availability, start with review if at least five failures and >5% failures among at least 20 operations in each of two consecutive 15-minute windows; tune with actual traffic and provider budgets. Small-volume Auth delivery requires investigation of any sustained failure, not an unreliable percentage. Deletion age alerts must use an approved SLA; unclaimed-object alerts need a measured baseline and review, not a guessed deletion age. No operator destination or on-call schedule is configured here.

Restricted aggregate query (operator only):

```sql
select status, count(*) as requests, min(requested_at) as oldest_request
from public.account_deletion_requests
where status <> 'completed'
group by status;
```

## Deletion-review operating procedure

Assign an authorized reviewer and policy owner. Review pending queue IDs through restricted database access; verify that the requester still controls the authenticated account, and perform any additional identity verification required by policy. A JWT-bound submission is not proof that a human operator completed identity re-verification.

Before processing, decide and record shared-household/last-owner consequences, subscription cancellation/refunds/store obligations, billing/legal retention, diagnostic history, personal images and backup retention. These decisions are **unapproved**; no automatic purge or destructive admin endpoint was added. Obtain the required policy/identity approvals before any deletion. Do not alter billing records to simulate provider cancellation.

An authorized operator can claim a row transactionally with `UPDATE public.account_deletion_requests SET status='processing' WHERE id=<bound request UUID> AND status='requested' RETURNING id,status;` using a parameterized/admin tool. Require one returned row; otherwise inspect the current status and avoid duplicate processing. The trigger records each status transition in the private audit table. Platform administrator actions may have null `changed_by`; retain operator identity/evidence in the existing restricted administrative audit system. Do not put sensitive notes in a public endpoint or invent an audit column.

After the approved workflow has actually completed and been independently checked, transition `processing` → `completed` with the same conditional update pattern and record the restricted evidence. If processing fails, preserve the row and current status for operator recovery; do not claim completion. The schema has no `rejected`/`failed` status or notes field: handle policy decisions in the approved restricted operator process until a separately reviewed schema/workflow is required. Users can read their own saved review status, cannot modify it or view private audit history. Localized UI describes a saved/processing/completed **review**, not automatic account deletion.
