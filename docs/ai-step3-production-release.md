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
| test:ai-postgres | PASS | PostgreSQL17.11,100 sessions,96 assertions through new wrappers |
| test:vision-postgres | PASS | 100 sessions,34 assertions; exact image metadata and aggregate exposure/count ceilings |
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
