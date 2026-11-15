# Step 3 production release evidence

Initial main `f5380f1e8bbd338d3c893a9ce58918ea432c8eeb`; previous guarded backend `06caac5052d30bed57c98adea50941e7bdbe1e25`. Release targets existing main, plantiecare.com and existing Supabase project only. No branch or hosted staging backend is created.

## Release scope

Lossless client encoding reuse, unchanged-input fingerprint optimization, cached safety policy validation, optional receipt policy binding, additive accounting metadata and default-off bounded evaluation infrastructure. Ordinary users retain GPT-4o, standard tier, high detail, 1600px/2MiB normalized JPEG and existing plans/rate/financial controls. Billing, RevenueCat, email functions and model secrets are outside the changed scope.

## Verification record before deployment

| Verification | Outcome | Evidence / limitation |
|---|---|---|
| Duplicate client conversion reproduced | PASS | Before fix: one fetch, one byte FileReader, one data-URL FileReader on normalized save; after: zero, same Blob and bytes |
| npm run check | PASS | Actual local typecheck, offline suites and Vite build; final log retained privately |
| test:edge-images | PASS | 21 handler tests, including input/auth/household/legacy boundaries |
| test:ai-accounting | PASS | 13 adapter/usage/error/replay tests |
| test:vision-images | PASS | 7 tests; immutable Step 2 provider input/fingerprint equivalence; cached safety revalidation; protected/metered benchmark |
| test:image-browser | PASS | 282 real Chromium decoding/hook/native-boundary checks |
| test:image-webkit | PASS | 282 real WebKit checks; physical Safari/iOS is not implied |
| test:ai-postgres | PASS | PostgreSQL17.11,100 sessions,96 assertions; updated Edge adapter plus retained lifecycle RPC cases |
| test:vision-postgres | PASS | 100 sessions,44 assertions; metadata, aggregate exposure/count ceilings, concurrent safety reuse, cross-household/expiry isolation |
| Migration replay | PASS | 36 migrations; clean, historical and deployed Step 2 upgrade paths; unchanged synthetic plant/image reference; schema/grant parity |
| Deno actual graph | PASS | All ten actual Edge entrypoints checked |
| check:client-secrets | PASS | Source/build artifact secret checks |
| check:source-graph | PASS | Actual graph analysis |
| Full local Supabase | NOT EXECUTED | Docker unavailable locally; current-revision CI must verify managed platform services |
| Reviewed diagnostic non-inferiority | NOT EXECUTED | No reviewed corpus/thresholds available; user authorized using available public catalog; quality NOT VERIFIED |
| Representative classifier safety quality | NOT EXECUTED | Public photos/one synthetic restricted fixture cannot establish a false-acceptance rate |
| Physical iOS/Android, store/native builds | NOT EXECUTED | No physical devices/store execution available; no native dependency change |

Initial full check failed on an obsolete source assertion naming `ai_claim_operation`; it now verifies the new wrapper **and** its delegation to the original claim/start functions. Initial typing failures in added WeakRef/observability code were fixed before final passing checks. No security assertions were removed to make tests pass.

Preflight verified deployed versions care18,diagnosis20,validation13,upload15 (JWT true), 35 migrations and production model secret digest matching GPT-4o. Before-state data/function/bucket checksums and secret metadata stay private. A fresh logical backup of public/auth/storage/vault/migrations/ai_private was encrypted with Windows CurrentUser DPAPI and restricted ACL; hash, decryption, archive catalog and full parse verified. Four prior Edge bundles were separately encrypted and read back. Backup excludes Storage object bytes and managed platform configuration; no production restore was executed.

Security advisors report existing mutable-search-path/auth/definer advisories and intentional private-table RLS-without-policy notices. This scoped release does not assert that the entire repository or managed platform is free of findings. See [Supabase linter guidance](https://supabase.com/docs/guides/database/database-linter) for remediation interpretation.

## Migration, deployment and rollback

Migration `20261115151650_ai_image_evaluation.sql` adds private default-off run/input tables, operation detail/profile/bytes/run metadata, and three service-only fixed-search-path wrappers. Historical ledger/price/control data and original Step 2 public RPC definitions are retained. Apply migration first, then care/diagnosis/validation/upload and new JWT-protected benchmark. No unrelated service is redeployed. Read back all deployed modules/JWT/version, compare source, and verify billing/model/config/data checksums after synthetic cleanup.

Rollback: first disable the evaluation run; keep original high detail. On a serious accounting/security regression pause the existing AI circuit breaker and preserve evidence. Restore the encrypted **guarded Step 2** Edge bundles and prior verified web artifact, retaining additive tables/columns and all financial history. Original claim/start RPCs remain compatible. Old clients with missing or rejected receipts still use server validation. Do not restore pre-Step-2 unmetered inference, drop financial rows, reset the database, change entitlements or delete customer images. Unpause only after the guarded model/accounting configuration is verified. Logical restoration is a separately controlled disaster-recovery action, not routine rollback.

The release remains bounded by diagnostic quality: candidate lower-resolution/detail activation requires reviewed quality/safety evidence. Production deployment and paid experiment results are recorded after current-revision CI and hosted checks actually execute; no pending verification is represented as passed.

## Implementation release

Implementation commit: `3af3d762b95539a01fb9e9aa908706663ccd9acd`. [Current implementation CI](https://github.com/M3ybi/FlowerScan/actions/runs/43731440490): application/browser/Deno/security-audit job PASS, PostgreSQL job PASS, full Supabase job PASS (36 migrations, clean replay, upgrade and eight fixtures twice). CI PostgreSQL17.12 also passed all 96 lifecycle and then-current 34 evaluation assertions. The subsequent ten additional reuse assertions pass locally and are included in the final evidence revision's CI.

The overall GitHub Pages workflow is **FAIL** at its separate build: existing missing public database configuration yields `RELEASE_DATABASE_CONFIGURATION_REQUIRED`. Pages deployment is skipped. This same unused-host configuration failure predates Step 3; its fail-closed guard is retained. The active **Netlify** production host is ready at the implementation revision, and downloaded manifest/backend fingerprint/billing mode/entry-asset SHA-256 match the actual production-config build (generation timestamps appropriately differ).

Migration `20261115151650` is **DEPLOYED**, total36; dry run listed only that migration. New RPC grants/search paths/private RLS passed hosted readback. Existing public non-AI function definitions, bucket settings and ordinary data checksums matched after migration. Deployed functions: care **19**, diagnosis **21**, validation **14**, upload **16**, benchmark **1**; all ACTIVE, JWT true, all modules exactly match repository source after LF normalization. All unrelated function versions remain unchanged. Full server-secret metadata and Netlify environment digests match preflight, including configured GPT-4o and unchanged RevenueCat/billing modes.

## Exact tracked implementation files

* Client: `src/lib/imageCaptureService.ts`, `src/hooks/useImageSelection.ts`, `src/lib/imageUploadValidationRules.ts`.
* Edge: `supabase/functions/_shared/{aiOperation,imageSafetyPolicy,imageValidationReceipt,plantImageValidation,observability}.ts`, `supabase/functions/vision-token-benchmark/index.ts`.
* Database: `supabase/migrations/20261115151650_ai_image_evaluation.sql`, `supabase/tests/ai_image_evaluation.sql`.
* Scripts/config: `.github/workflows/verify.yml`, `package.json`, `scripts/run-tests.mjs`, `scripts/test-postgres-migrations.mjs`, `scripts/test-vision-postgres.mjs`, `scripts/prepare-vision-corpus.mjs`, `scripts/lib/visionBenchmark.mjs`.
* Tests: `tests/{ai-operation,edge-image-diagnosis,image-validation-receipt,vision-token-optimization}.test.mjs`, `tests/backend-migration.test.ts`, `tests/fixtures/aiEdgeHarness.mjs`, `tests/fixtures/{image-processing-browser,image-roundtrip-browser}.ts`.
* Documentation: the four `docs/ai-image-optimization.md`, `docs/ai-vision-token-benchmark.md`, `docs/ai-image-safety-reuse.md`, `docs/ai-step3-production-release.md` files.

Private operator scripts/evidence stay in ignored local directories. No dependency/lockfile, billing/email service, ordinary entitlement, native project or unrelated UI file changed.

## Hosted smoke and accounting result

**PASS**,47 hosted checks, 2026-11-15T15:53:59.515Z–2026-11-15T16:00:49.707Z. Three authorized temporary synthetic identities and two owned temporary households were used, including the previously authorized synthetic-only Premium grant. Ordinary billing/RevenueCat entitlements were unchanged. Free capacity/monthly denial and revoked/nonmember denial spent nothing; Premium diagnosis succeeded with a synthetic counter above the Free limit and retained unlimited product entitlement. Identification/care, diagnosis, manual refresh, private persistence/readback, session refresh, completed replay and natural safety expiry passed.

All26 experiments completed under one shared private run: **32 actual attempts,$0.073275**,24638 input,0 cached,1168 output,25806 total, returned GPT-4o2024-08-06/default. Exact decimal cost was independently recalculated from each attempt's usage; request/response correlation IDs exist privately. Zero provider failures,unknown usages or active reservations at the first post-smoke snapshot. Every normal/benchmark attempt is linked to the same evaluation budget; zero-cost replays created no fabricated attempt rows. See [all experiment and journey rows](ai-vision-token-benchmark.md).

**Cleanup PASS**: synthetic refresh sessions revoked, exact temporary Storage paths removed, synthetic households/accounts deleted, cached results cleared, run disabled and actor allowlist emptied; financial history preserved. Before/after ordinary account,plant/household graph,subscription/entitlement and Storage checksums match. Auth comparison intentionally excludes only operational updated_at/last_sign_in_at timestamps. Nine plant/diagnostic child/catalog tables also match independently.

Legacy live boundaries **PASS**: care/diagnosis410; validation/upload404 because those Netlify functions do not exist. An initial overly broad expectation of four410s failed, was corrected against actual source/path inventory, then exact two410/two404 assertions passed. Both absent routes remain incapable of inference. Initial manifest comparison also correctly identified differing local/hosted generation timestamps; stable metadata and downloaded asset hashes subsequently passed.

The isolated QR fixture was rejected at both details. Broader image safety and diagnostic quality remain **NOT VERIFIED**, so no cheaper image policy was activated. The lossless client path, safety freshness checks and accounting instrumentation are the released improvements. Physical devices, live native/store builds, representative visual non-inferiority, real forced provider failures and live policy/model changes are **NOT EXECUTED**, with reasons above. This is a **PARTIAL RELEASE** of the requested wider quality/cost optimization programme; its safe implementation and measured experiments are deployed.

## Post-deployment observation

Actual logs,15:53:40–16:04:28 UTC: **46 function requests**,37 successes,five expected anonymous401s,four expected plan/household403s,zero422/429/5xx. Runtime logs contain41 info events,11 boots,11 normal shutdowns and no error/warning-level records. An initial query against the general gateway stream returned no function rows; field discovery identified `function_edge_logs`/`request.pathname`, and only the corrected non-empty aggregation is used as evidence. No headers, tokens, account identifiers or image payloads were selected.

| Function/version | Requests | 2xx | 401 | 403 | 5xx | Gateway execution p50/p95 ms |
|---|---:|---:|---:|---:|---:|---|
| care19 | 5 | 3 | 1 | 1 | 0 | 605 / 5640 |
| diagnosis21 | 5 | 1 | 1 | 3 | 0 | 194 / 2366 |
| upload16 | 5 | 4 | 1 | 0 | 0 | 638 / 2883 |
| validation14 | 4 | 3 | 1 | 0 | 0 | 2579 / 3212 |
| benchmark1 | 27 | 26 | 1 | 0 | 0 | 1455 / 2953 |

Ledger snapshot at16:03:53 UTC remains32 measured attempts,$0.073275,zero provider failures,zero unknown exposure,zero active operations; provider latency mean1457ms,p501134ms,p952615ms (range573–5192ms). Mean input770 tokens,p951536. These percentiles describe the tiny mixed smoke/probe sample, not subscriber traffic or a causal performance improvement. Invalid provider output count is zero in this sample. Three of three eligible uploads reused safety (all uploads3/4, because the fourth intentionally expired); these are deliberately selected tests, not a population cache-hit rate. No unexpected cache authorization failure occurred; four403s are intentional denial tests.

Browser tests reported no unexpected processing failures, but production client failure rates, physical memory pressure/backgrounding and slow-device telemetry are unavailable: **NOT EXECUTED** as fleet measurements. Successful mocked fault cases do not prove live failure rates. A post-smoke encrypted backup includes all seven private accounting/evaluation tables; disk decrypt/hash/full parse passed. No restoration was executed. Default-off evaluation readback confirms enabled=false,zero approved actors,unchanged50/$0.40 caps and32 retained attempts. Model/billing/bucket/ordinary-data guards still pass.

**NO-GO for lower-detail diagnostic or safety activation** until the reviewed corpus and thresholds in the safety document are supplied and pass. Safe lossless production changes and bounded accounting-backed experiments are deployed; recurring AI cost savings and broad visual non-inferiority are not claimed.
