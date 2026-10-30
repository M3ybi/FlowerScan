# Plantie V3 findings inventory

Baseline: `2e8e933c19002af3c3b74f4e8c7dfd42adede9e0`. “Fixed locally” describes the reviewed source and controlled verification, not production deployment. Earlier evidence is retained in the [October 18 report](codebase-audit-2026-10-18.md). No user data was changed.

## Previous findings verified

| ID | Severity / classification | Feature and root cause | Owning file/function | Fix and regression evidence | Status |
| --- | --- | --- | --- | --- | --- |
| A01 | High / confirmed | Storage getter/quota failures escape initialization/effects. | `src/lib/browserStorage.ts`, custom/record hooks, App; V16 below closes AuthModal equivalent. | Session fallback and localized persistence health; blocked/quota/recovery tests. | Fixed locally; fallback is not durable storage. |
| A02 | Medium / confirmed | Late focus-session refresh restores a signed-out identity. | `src/hooks/useAuth.ts` auth-event generation. | Invalidate stale refreshes; real-hook auth-browser regression. | Fixed locally. |
| A03 | Medium / confirmed | Uninterruptible image promises retain work after cancellation. | `src/lib/imageOperation.ts`, `imageCaptureService.ts`. | Bounded waits, immediate caller cancellation, late-resource cleanup; V05 extends common request behavior. | Fixed locally. |
| A04 | Medium / confirmed | The same photo was validated repeatedly during selection/submission/upload. | Receipt modules, selection utility, shared safety validator. | HMAC-bound short-lived receipts; repeated-save browser tests and receipt cryptographic tests. V01 handles receipt rejection. | Fixed locally; signing configuration optional. |
| A05 | Medium / confirmed security | Paid image/care endpoints lacked independent request admission. | `20261018190000_image_operation_admission.sql`, image/care handlers. | Atomic per-user hourly limits, distinct from plan quotas. | Fixed locally; rollout required. |
| A06 | Medium / confirmed security | Arbitrary image UUIDs could accumulate unclaimed Storage objects. | Same migration, upload reservations/handler. | Household row lock, 20 pending/unclaimed cap, canonical paths and idempotent retry. Real PostgreSQL contention included. | Fixed locally; rollout required. |
| A07 | Medium / confirmed security | Ordinary users could invoke operator mail; provider errors leaked details. | `supabase/functions/send-test-email/index.ts`. | Default off, operator allowlist, configured recipient, hourly admission, safe errors. | Fixed locally; rollout required. |
| A08 | Medium / confirmed | Cleanup/reconciliation could replace the original persistence error. | `src/lib/supabaseSourceOfTruth.ts`. | Preserve original failure; reconcile ambiguous writes; retain image when commit state is unknown; safe cleanup codes. | Fixed locally. |
| A09 | Medium / confirmed | Invalid percent-encoding throws while parsing routes. | `src/app/routes.ts:parseHashRoute`. | Safe dashboard fallback; malformed/valid route tests. | Fixed locally. |
| A10 | High / confirmed dependency | Vulnerable Capacitor/runtime and transitive versions were locked. | Package manifests/lock/native package metadata. | Capacitor 8.5.3, earlier targeted patches; clean install and both npm audits pass. | Source fixed; native rebuild required to ship. |
| A11 | Low / confirmed | Diagnostic failure logging included arbitrary exception text. | `src/lib/errorDiagnostics.ts`; diagnostic persistence. | Fixed codes and whitelisted categories; private-message regression. | Fixed locally. |
| A12 | Low / confirmed test defect | Billing tests could inherit actual server configuration. | `tests/billing.test.ts`. | Save/remove/restore configuration and reject provider fetch. | Verified in full suite. |
| A13 | Low / confirmed | Card keyboard handler responded to nested controls; open label was English. | `features/plants/components/PlantGrid.tsx`. | Require card event ownership; translated label; browser keyboard checks. | Fixed locally. |
| A14 | Improvement | Add Plant presentation/orchestration lived inside App. | `features/plants/components`, `services/addPlant.ts`. | Earlier modal/grid/service extraction retained; V13 extends feature boundaries. | Implemented locally. |
| A15 | Improvement | PR verification did not run the full regression suite. | `.github/workflows/verify.yml`. | V14 adds real PostgreSQL, assembled browser workflows, Deno, source graph and secret scanning. | Implemented; hosted run unverified. |
| A16 | Low / confirmed | Swift package paths contained Windows separators. | `ios/App/CapApp-SPM/Package.swift`. | Portable paths and native-config regression. | Source fixed; macOS compilation unavailable. |

## V3 changes and new findings

| ID | Severity / classification | Feature / problem / root cause | Owning file/function | Fix | Regression / validation | Status |
| --- | --- | --- | --- | --- | --- | --- |
| V01 | Medium / confirmed reliability | Expired/rotated receipt rejection strands an already processed image. | `src/lib/validatedImageUpload.ts:uploadWithValidationRecovery`; repository upload adapter. | Forget only that receipt; retry identical bytes/upload ID once without it after explicit `IMAGE_VALIDATION_REQUIRED`. | Valid/invalid/rotated receipt, one retry maximum, denial/network no-retry tests. | Fixed locally. |
| V02 / R02 | Medium / confirmed operational gap | Deletion endpoint acknowledged review without a durable destination. | `20261018200000_account_deletion_review.sql`; both deletion handlers; settings hook. | JWT-subject-only idempotent queue, private audit/status, self read, no client writes, accurate localized feedback. | Actual migration/RLS tests, handler forged-target/storage-failure tests, 64 requests across PostgreSQL sessions. | Fixed locally; operator policy/rollout required. |
| V03 | Medium / confirmed security | Premium diagnosis bypassed monthly reservation counting and had no independent paid-request limit. | `plant-diagnosis-ai/index.ts`; `20261018201000_complete_request_admission.sql`. | Admit every diagnosis request, including Premium, before provider work. | Handler 429 before fetch; exact 30/hour under real contention. | Fixed locally; deployment required. |
| V04 | Medium / confirmed security | Repeated delivery of one pending invite had no send budget/idempotency. | `send-household-invite-email/index.ts`; admission migration. | Six/user/hour across households; server recipient; five-minute provider idempotency bucket; ten-second provider request. | Unauthorized/rate-limited zero-send tests, trusted recipient, same retry key, bounded I/O; PostgreSQL cap/reset. | Fixed locally; deployment required. |
| V05 | Medium / confirmed reliability | An adapter ignoring abort, or a body stalled after headers, could outlive the client deadline. | `src/lib/abortableOperation.ts`, `requestTimeout.ts`, `backendConfig.ts`; Netlify deletion handler. | Deadline settles caller; body/error parsing stays inside it; complete compatibility deletion operation is bounded. | Deterministic ignored-abort regression; stalled-body cancellation fails against baseline and passes after. | Fixed locally. |
| V06 | Medium / confirmed correctness | Care/rename/removal completion did not await/inspect persistence success. | `features/plants/hooks/usePlantPersistence.ts`, `usePlantActions.ts`; care actions. | Return explicit save outcome; retain editor/preview/confirmation and safe error on failure; guard in-flight mutations. | Before-fix reproductions; actual action-hook failed-persistence tests pass. | Fixed locally. |
| V07 | Medium / confirmed extraction regression | Root scheduled diagnosis-history focus before lazy detail mounted. | `features/plants/components/PlantDetailsPage.tsx` mounted effect. | Own scroll/focus in mounted feature. | Browser import is intercepted; loading fallback must mount before import releases; focus then required. | Fixed locally. |
| V08 | Medium / confirmed correctness | Purchase scope string stayed unchanged after component unmount. | `src/hooks/useOperationScope.ts`; PricingPage/UpgradeModal. | Mounted epoch invalidation and checks before checkout/after awaits; scope reset and stale-feedback suppression. | Previous PricingPage starts checkout after unmount; current pricing/upgrade browser cases require zero calls. | Fixed locally. |
| V09 | Low / confirmed correctness | Change-plan anchor was interpreted as an application dashboard route. | `src/components/PricingPage.tsx` plan action. | Scroll to plans using a button without modifying the application hash. | Independent source verification; pricing regressions. | Fixed locally. |
| V10 | Medium / confirmed reliability | Quota release used `.catch()` on SDK PromiseLike RPC builders. | `supabase/functions/plant-diagnosis-ai/index.ts:releaseReservation`. | Await the builder inside a shared try/catch; safe fixed cleanup warning. | Deno reported six type errors; SDK-shaped boundary reproduced three failed error paths; all now pass. | Fixed locally. |
| V11 | Low / confirmed accessibility | Initial Shift+Tab from the dialog section could escape its focus trap. | `src/components/ModalDialog.tsx`. | Treat a focused section/non-field as outside the eligible field sequence. | Chromium/WebKit Shift+Tab then Tab cycle; Escape restores keyboard opener and scrolling. | Fixed locally. |
| V12 / R03 | Security hardening / no confirmed historical exploit | Test Store/sandbox provenance relied on external endpoint routing. | `src/lib/revenueCatEnvironment.ts`; both webhook handlers. | Default-deny explicit sandbox/Test Store before privileged writes; retain signed legacy omitted-environment compatibility. | Pure matrix and actual handlers reject signed sandbox before database I/O. | Source contained; review/test routing decision required. |
| V13 | Architecture/performance improvement | App owned feature views and mutation workflows, loading infrequent screens eagerly. | `src/features/*`, `src/app/AppRouter.tsx`, error boundaries. | Typed cohesive views/controllers, lazy feature screens, safe render fallback; shared modal infrastructure. | Full regression, assembled-app workflows, source graph and measured bundle reduction. | Implemented; some shared/hoisted state remains. |
| V14 | Verification improvement | Production checks missed Edge SDK typing and actual independent-session contention. | CI, graph/secret/browser/PostgreSQL scripts. | Clean/reusable CI, Deno checks, real database job, offline browser workflows, client-secret checks and deployment dependencies. | Local commands pass; hosted workflow not executed. | Implemented locally. |
| V15 | Low / confirmed test-infrastructure defect | Query overrides could bypass loopback targeting; fixture roles survived DB cleanup. | `scripts/test-postgres-concurrency.mjs`. | Reject query overrides/non-PostgreSQL URLs; generate DB name; track/remove created roles; serialize role setup/cleanup. | Independent review and local PostgreSQL rerun. No existing business database is targeted. | Fixed before delivery. |
| V16 | Low / confirmed equivalent A01 gap | AuthModal read the raw localStorage getter. | `src/components/AuthModal.tsx`. | Use existing resilient storage facade. | Type/Node/browser modal regressions; independent frontend review. | Fixed locally. |

The canonical baseline scan records V03 as `csf_6c76a2cff868bbc9798924e4` (paid diagnosis admission) and V04 as `csf_0286ae887991a72410932f6a` (repeated invitation delivery). These were medium severity, high confidence under authenticated eligible-account/provider-configuration assumptions. No cross-household access-control bypass was established.

## Unresolved and external verification

| ID | Classification | Evidence / limitation | Required next verification |
| --- | --- | --- | --- |
| R01 | Suspected device-specific image failure | Exact affected handset/provider-file failure is not reproduced. Controlled Chromium/WebKit decode/lifecycle/addition checks pass. | Actual original files and affected Android/iOS devices; camera/Gallery/Files/cloud-provider/low-memory/repeated-save matrix. |
| R02 | Operational follow-up after local fix | Durable queue exists in source, but no production operator/SLA/retention/shared-ownership/subscription deletion policy was configured. | Authorized rollout and policy ownership; no automatic deletion. |
| R03 | External configuration uncertainty | RevenueCat routing/restore policy, Apple review sandbox strategy, production OAuth allowlists and host branch/deployment rules were not queried or changed. | Provider/project review and real sandbox purchase/restore/recovery tests before release. |
| ENV01 | Environment limitation | No full local Supabase stack, macOS/Xcode, physical devices or native store session. | Staging/full-stack and native release gates; focused PostgreSQL fixtures are not substitutes for the entire deployment. |

## Current remediation source locations

These references locate the current controls; baseline vulnerable-line evidence remains in the canonical security artifacts.

| Finding | Current source |
| --- | --- |
| V01 | [src/lib/validatedImageUpload.ts:8](../src/lib/validatedImageUpload.ts#L8) |
| V02 | [supabase/migrations/20261018200000_account_deletion_review.sql:4](../supabase/migrations/20261018200000_account_deletion_review.sql#L4) |
| V03 | [supabase/functions/plant-diagnosis-ai/index.ts:103](../supabase/functions/plant-diagnosis-ai/index.ts#L103) |
| V04 | [supabase/functions/send-household-invite-email/index.ts:66](../supabase/functions/send-household-invite-email/index.ts#L66) |
| V05 | [src/lib/abortableOperation.ts:6](../src/lib/abortableOperation.ts#L6) |
| V05 | [src/lib/backendConfig.ts:94](../src/lib/backendConfig.ts#L94) |
| V06 | [src/features/care/hooks/useCareActions.ts:106](../src/features/care/hooks/useCareActions.ts#L106) |
| V06 | [src/features/plants/hooks/usePlantActions.ts:144](../src/features/plants/hooks/usePlantActions.ts#L144) |
| V07 | [src/features/plants/components/PlantDetailsPage.tsx:197](../src/features/plants/components/PlantDetailsPage.tsx#L197) |
| V08 | [src/hooks/useOperationScope.ts:5](../src/hooks/useOperationScope.ts#L5) |
| V09 | [src/components/PricingPage.tsx:350](../src/components/PricingPage.tsx#L350) |
| V10 | [supabase/functions/plant-diagnosis-ai/index.ts:114](../supabase/functions/plant-diagnosis-ai/index.ts#L114) |
| V11 | [src/components/ModalDialog.tsx:32](../src/components/ModalDialog.tsx#L32) |
| V12 | [src/lib/revenueCatEnvironment.ts:1](../src/lib/revenueCatEnvironment.ts#L1) |
| V13 | [src/app/AppRouter.tsx:20](../src/app/AppRouter.tsx#L20) |
| V14 | [.github/workflows/verify.yml:11](../.github/workflows/verify.yml#L11) |
| V15 | [scripts/test-postgres-concurrency.mjs:13](../scripts/test-postgres-concurrency.mjs#L13) |
| V16 | Historical `src/components/AuthModal.tsx:2` at the baseline revision above; the unused modal was removed during the October 30 cleanup. Active authentication uses `AuthPanel` and the application account flow. |
