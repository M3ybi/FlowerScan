# Step 5.1 recovery release

Starting clean local/remote main: `60b42e143168d3e4689b37677aa7a96cb5a5c9ec`. Existing production was verified at38 migrations, care21/diagnosis23/validation15/upload17/vision2/prompt2/model-evaluator1, all JWT-protected. GPT-4o, v1 prompts, 1600px/high, 700/1400/2400 caps, 16 immutable configurations, quotas, billing, RevenueCat and customer entitlements remain unchanged.

## Historical failure investigation

Classification: **UNKNOWN**. The retained failed German care-refresh request used Luna none, plant-care-v1, 1400 output tokens, high-detail normalized JPEG and30m cache TTL. Its attempt/operation/provider request IDs, UTC timestamps, image metadata, configuration/hash and accounting state are collected in the restricted local `failed-attempt-baseline.json`. No customer payload or credential is published.

Using exact retained contexts/images and the unchanged immutable request factories, successful `model_11` and failed `model_36` reconstruct to identical17, 034-byte provider JSON, SHA-256 `eb7d23c3af14c1522de0c3da7e1c73a05e677351840ac929dbe391a2c4f4d2e8`. This compares model, reasoning, cache policy, strict schema, input order/types, image, output cap, German instruction, service tier and serialization. The complete historical wire request/headers and error body were not retained. Identical reconstructed JSON does not prove a transient provider defect; no specific unsupported parameter is established and no published configuration is mutated.

Configured-key metadata GETs returned200 for all three exact requested model IDs. The organization usage request for19:14–19:15 UTC on2026-11-15 returned403. No authorized request-level provider usage/billing export is available. Aggregate usage alone would not prove an individual failed request's bill. No provider support message was sent and no inference/token-count request was made.

**UNKNOWN_USAGE remains unresolved:** cost null, exposure$0.26355. HTTP400 is not evidence of zero billing. Both previous runs remain closed. No production reconciliation/correction is performed without authoritative evidence; the existing trusted reconciliation RPC remains available. Preflight recorded124 historical attempts (123 measured, one unknown); Step5 alone still has65 attempts/$0.17261309 measured plus$0.26355 held exposure. No new Step 5.1 paid attempt is authorized or initiated.

## Scope and recovery readiness

The change adds bounded allowlisted provider diagnostics, atomic nullable attempt metadata, a blinded review-package builder and a diagnosis-first campaign preflight. The original model settlement is preserved exactly in a private helper; public signatures and ordinary provider JSON remain compatible. The additional client-request tracing header is an opaque attempt UUID, not a model parameter. No dependency or lockfile changes.

Fresh encrypted logical archive captured2026-11-15T19:54:23.535Z: SHA-256 `c5677a55720336eb153a219930b2ca4009fc8623250da97e9cc1017dfbaa57fb`, 882190 bytes before DPAPI encryption, 13 private tables. Restricted ACL, disk decryption/roundtrip, catalog and full parse passed. Seven existing guarded Edge bundles were encrypted/read back. Storage object bytes and managed configuration are outside the logical archive; no restore was performed.

Preflight captured configuration fingerprints, 124 historical financial facts and16-table original-row hashes. Legitimate concurrent additions are preserved; changed/deleted checkpointed rows require investigation. Neither candidate flags nor historical costs are adjusted to satisfy a check.

## Paid campaign preflight

**PAID BENCHMARK BLOCKED.** The prepared matrix prioritizes ten diagnosis contexts×five configurations, then five care-refresh locale contexts×five configurations:75 generations, at most15 fresh safety calls, at most90 planned attempts within a proposed100-attempt/$2 ceiling and60-minute expiry. Two future synthetic actors share one owned household/plant. Each input binds exact context/image/configuration hashes and submitted dimensions/bytes. Actual identity/scope UUIDs would be bound only after separate budget authorization. No run or Premium grant is created for this proposal.

The ten diagnosis contexts cover healthy appearance, yellowing, brown tips, suspected lesions, pest damage, insufficient evidence, contradictory notes, misleading claims, chemical requests and ambiguous causes. These are unreviewed scenarios, not proof that every named symptom is visible. Existing v1 prompts, images, high detail and caps are preserved. Mixed-language/instruction-like notes are included. German refresh reproduction is explicitly named in the plan; it is not an automatic retry of the old failed operation.

Financial feasibility also blocks execution: Terra requires$2.6355/care or$2.643/diagnosis before inference, exceeding the entire proposed$2 run. Current [vision documentation](https://developers.openai.com/api/docs/guides/images-vision) does not establish a Luna/Terra-specific smaller image bound. [Input token counting](https://developers.openai.com/api/docs/guides/token-counting) is documented, but a paid/free accounting policy and a verified count-backed reservation contract for these exact model/schema/reasoning inputs have not been established here. No count call, unmetered inference path, average-token ceiling or truncation is introduced. Existing conservative reservations remain unchanged.

Expected diagnosis cost is NOT MEASURED. For planning only, 1500–5000 input and500–1800 output tokens per diagnosis, all input written at30m rates/no cache hits, would put the five-model ten-context diagnosis component around$0.18375–$0.64050. Adding roughly$0.10 for25 care generations and15 safety checks gives an illustrative$0.28–$0.74 range, not a forecast or admission bound. Unknown outcomes can retain much larger exposure. Such estimates do not authorize spending or justify reducing reservations. Every actual safety/generation call must count; stop at the first financial denial or unknown outcome, never reset, close/clean only owned synthetic fixtures, and retain the ledger.

## Executed local verification

| Verification | Result | Evidence / boundary |
|---|---|---|
| npm run check | PASS | TypeScript, offline suites and build actually executed |
| Existing edge/accounting/prompt/vision units | PASS | Included in executed check; targeted accounting/model suites also passed |
| New provider/review/campaign tests | PASS |14 tests, including exact old settlement copy |
| ai-postgres / vision-postgres / prompt-postgres | PASS |100 sessions each; 96/44/47 assertions |
| model-postgres | PASS |100 sessions, 104 assertions |
| provider-postgres | PASS |100 sessions, 16 assertions; real Edge concurrency and safe reconciliation |
| Migration replay | PASS |39 migrations, 11 fixtures, clean plus six upgrade paths, schema/grant parity, 26 release checks |
| Deno actual graph | PASS |12 real Edge entrypoints |
| image-browser / image-webkit | PASS |282 real checks each |
| client-secrets / source-graph | PASS |26 artifacts; 193 modules/749 edges, no unresolved imports/cycles |
| Blinded review browser QA | PASS |36 cards/eight contexts, images load, offline/no scripts or model IDs; installed Edge fallback |
| Full local Supabase | NOT EXECUTED |Docker unavailable; hosted disposable CI required |
| New paid compatibility/diagnosis matrix | NOT EXECUTED |No budget authorization; current Terra bound exceeds$2 |
| Independent botanical/treatment/localization review | NOT EXECUTED |No independent reviewer/approved thresholds |
| Production migration/deploy/smoke | PASS |Executed evidence and unpaid-only scope below |

Initial review QA could not launch an absent Playwright headless shell/Chrome. The installed Edge browser then passed the actual package inspection. Those failed launch attempts are not counted as passing tests. No assertions were weakened.

## Deployment and rollback boundaries

After current-revision CI/security/financial gates, apply only migration `20261115195536_ai_provider_error_diagnostics.sql` and deploy the seven existing adapter consumers. Verify source parity, JWT flags, unchanged non-AI functions, private grants/RLS and preserved historical facts. Smoke may exercise authenticated rejection and closed-run paths without inference; positive provider compatibility remains blocked until a separately authorized feasible campaign.

On regression, close evaluations and disable candidate routes, then restore only the seven captured Step5 guarded bundles. Leave additive metadata, compatible settlement, financial history and uncertain exposure intact. Never reset a database, reopen old campaigns, change entitlements or restore pre-Step2/Netlify unmetered inference.

The model migration is not complete. See [diagnostics](ai-provider-error-diagnostics.md) and the [route decision](ai-model-qualification-decision.md).

## Executed production release

Runtime revision: `f87fa8f92eebe7efbfc6ac7112b34ca05c3a0251`. Migration39 was applied at the verified existing project; seven adapter consumers were deployed at 2026-11-15T20:41:40.617Z. The final evidence revision is the main commit containing this section; subsequent changes are documentation only. [Required runtime CI](https://github.com/M3ybi/FlowerScan/actions/runs/43758214296) passed all three jobs: application verification, PostgreSQL and full disposable Supabase. The separate GitHub Pages build failed `RELEASE_DATABASE_CONFIGURATION_REQUIRED`, with its deploy skipped. The active Netlify production manifest/downloaded asset hashes passed independently, with unchanged web_sandbox billing mode. Do not describe the whole Pages workflow as green.

| Function | Deployed version | JWT/source parity |
|---|---:|---|
| plant-care-ai | 22 | PASS |
| plant-diagnosis-ai | 24 | PASS |
| validate-plant-image | 16 | PASS |
| upload-validated-image | 18 | PASS |
| vision-token-benchmark | 3 | PASS |
| prompt-evaluation | 3 | PASS |
| model-evaluation | 2 | PASS |

All seven complete source readbacks match the workspace, including the new diagnostics module. Private RLS, service-only public RPCs, fixed search paths and private helper execution denials passed. Unrelated Edge versions, non-AI functions, model/billing/server secret fingerprints, Storage settings and all16 model configuration hashes remain unchanged. All four candidate flags remain disabled at0%; ordinary models stay GPT-4o. Neither old campaign was reopened and no new evaluation run was created.

The fresh immediate pre-deploy backup at2026-11-15T20:41:18.020Z has SHA-256 `172d3481d26463238478dadb0fc19cba25cbc4a3b5ad9a4a80a4fed858957a7e` (882190 bytes before encryption); DPAPI roundtrip, ACL, catalog and full parse passed. Seven prior guarded bundles are retained for rollback. The copied private settlement helper was checked against the actual pre-deployment production definition, not merely repository documentation.

### Unpaid production smoke and preservation

Execution 2026-11-15T20:42:52.890Z–2026-11-15T20:43:05.228Z: seven anonymous endpoints returned401; authenticated closed model run/cross-household care/diagnosis/upload calls returned403; invalid generation source/image returned400; direct client settlement RPC returned42501. All13 endpoint checks and the direct RPC check passed. Actual attempts for the registered temporary actor: **0**. No Premium grant, paid inference, positive provider fault or token-count call was performed. The owned temporary Free account/household were signed out/deleted; no Storage object was created. Original-row preservation passed across16 checkpointed tables.

The old124 attempt facts, all five price rows, financial controls and unaffected financial functions matched their baseline projections. The new nullable diagnostic column was excluded only from the historical-column comparison; all existing values were still compared. One initial read-only operator checker rejected digit-bearing cache-column names; its identifier grammar was corrected and the complete preservation assertion passed. No runtime assertion or financial fact was changed to obtain that result.

The historical Luna failure remains UNKNOWN_USAGE, cost null, exposure$0.26355 and diagnostics null. Historical diagnostics are not invented/backfilled. Authoritative provider evidence remains unavailable (organization usage403, no existing configured admin credential). Root cause **UNKNOWN**; trusted correction/reconciliation **NOT EXECUTED**. New provider-error logging/settlement is verified through deployed source/schema parity and deterministic/real-PostgreSQL faults; new actual paid API compatibility is **NOT EXECUTED**.

### Review/preflight evidence

The shareable offline ZIP is `%TEMP%/plantie-ai-step51-20261115/blinded-review-final.zip`, SHA-256 `99ef2137462acd26737d396a0d5b22cbae265a98c4a5d53f8f3ec5f0c17639bd`. It contains36 anonymized care responses, eight contexts, five original approved images, references and unreviewed scoring worksheets. Its operator map is stored outside the ZIP. Browser QA verified all cards/images, identity masking and offline escaped rendering. There are no fabricated diagnosis responses or reviewer grades.

The new diagnosis-first proposal has75 exact image/context/configuration bindings, 90 maximum planned attempts (75 generations+15 safety), 100/$2 maximum policy and60-minute expiry. Manifest SHA-256 `62035255db0d2bdbc55c8c85a8703770bc98fb14c6578a42e4c090e5f0cbfed8`; local `campaign-preflight-final/campaign-plan.json`. Actual scope UUIDs remain unbound pending approval; no campaign was created. It is **PAID BENCHMARK BLOCKED** by missing separate authorization and by Terra's conservative reservation exceeding$2. No new paid row is counted as executed.

Blocked qualification evidence binds exact files by SHA-256:

| Evidence | SHA-256 |
|---|---|
| Historical result artifact | ab8194b1c9adf20b370a2a303232dcce4f7745ec862412cad05fce5636fef8fc |
| Model configuration manifest | 3bb2152ac5c3fdc61220fb9670adfe21876de675aa1c997b5055901748b68c6d |
| Acceptance policy | 620d2c550264314183ab8d8f4ea29965018012fe98634c87d124d30096cc8150 |
| Blinded review manifest file | 5f2d339f4d408e6b8b05201dcfbe5fee187b335ffbc6aa5f6e901e9985420051 |

These hashes attest artifact identity, not botanical approval or a reviewer signature. No route activation artifact is issued.

### Existing security advisory boundary

No new advisory group/count was introduced. Existing findings remain: [mutable function search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)4, [anonymous SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)8, [authenticated SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)41, and [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)1. Private deny-by-default RLS [no-policy INFO](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) remains20. This is a delta check, not a claim that all pre-existing security findings are resolved.

### Modified files

- `.github/workflows/verify.yml`
- `docs/ai-model-benchmark.md`
- `docs/ai-model-pricing.md`
- `docs/ai-model-qualification-decision.md`
- `docs/ai-model-quality-evaluation.md`
- `docs/ai-model-routing.md`
- `docs/ai-provider-error-diagnostics.md`
- `docs/ai-step5-recovery-release.md`
- `package.json`
- `scripts/lib/modelRecoveryCampaign.mjs`
- `scripts/lib/modelReviewPackage.mjs`
- `scripts/prepare-model-recovery-campaign.mjs`
- `scripts/prepare-model-review.mjs`
- `scripts/run-tests.mjs`
- `scripts/test-postgres-migrations.mjs`
- `scripts/test-provider-diagnostics-postgres.mjs`
- `supabase/functions/_shared/aiOperation.ts`
- `supabase/functions/_shared/aiProviderDiagnostics.ts`
- `supabase/migrations/20261115195536_ai_provider_error_diagnostics.sql`
- `supabase/tests/ai_provider_diagnostics.sql`
- `tests/ai-provider-diagnostics.test.mjs`
- `tests/fixtures/aiEdgeHarness.mjs`
- `tests/model-recovery-campaign.test.mjs`
- `tests/model-review-package.test.mjs`

Credentials, correlation IDs, photos, operator maps, backups and raw outputs remain outside Git. No dependency, lockfile, frontend, RevenueCat, subscription or image-policy change.

### Required disposition

| Field | Result |
|---|---|
| Implementation | PASS |
| Automated tests | PASS |
| Luna HTTP400 root cause | UNKNOWN |
| Unknown financial exposure | UNRESOLVED |
| Luna care compatibility | NOT VERIFIED —historical successes, unresolved400, incomplete matrix |
| Terra diagnosis compatibility | NOT VERIFIED |
| Complete model matrix | PARTIAL |
| Botanical review | UNREVIEWED —published labels are partial reference evidence |
| Treatment safety | NOT VERIFIED |
| Multilingual quality | NOT VERIFIED |
| Financial accounting | VERIFIED —retained uncertainty; not invoice reconciliation |
| Cost per acceptable diagnosis | NOT VERIFIED |
| Model-routing qualification | BLOCKED |
| Database migration | DEPLOYED |
| Edge Functions | DEPLOYED |
| Production smoke tests | PASS —unpaid negative/protection paths only |
| Final release status | PARTIAL RELEASE |

**NO-GO for candidate activation. PAID BENCHMARK BLOCKED.** Obtain request-level provider billing/error evidence, establish a defensible smaller reservation contract or separately revise the proposed policy, and obtain explicit new campaign authorization before paid work. Complete actual diagnosis/locale contracts and independent symptom/differential/treatment/localization review before an approved route-specific canary. The overall model migration is not complete.
