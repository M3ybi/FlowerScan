# Step 5.2 qualification preparation and verification

Starting local and remote main: `825a3a15497b02cc58a52d17d99ca127867f5128`, clean before work. Production readback on 2026-11-16 found the expected 39 migrations and unchanged guarded AI bundles. No runtime defect requiring a model, prompt, schema, reservation, entitlement or routing change was established. This release changes documentation and prepares restricted local evaluation/reviewer artifacts; no database migration or Edge deployment is required.

**PAID BENCHMARK BLOCKED pending separate operator authorization.** Section 5 of the Step 5.2 request explicitly states that the proposed $4 limit is not permission to spend. A concrete authorization question has been submitted; no approval is inferred from elapsed time or the earlier closed campaign's unused capacity. No new model campaign or paid attempt has been created.

## Production baseline and historical uncertainty

| Function | Current version | JWT/source verification |
|---|---:|---|
| plant-care-ai | 22 | PASS |
| plant-diagnosis-ai | 24 | PASS |
| validate-plant-image | 16 | PASS |
| upload-validated-image | 18 | PASS |
| vision-token-benchmark | 3 | PASS |
| prompt-evaluation | 3 | PASS |
| model-evaluation | 2 | PASS |

Current bundle hashes for all seven match their complete previously downloaded source, and every normalized source file matches the workspace. The model evaluator was downloaded again and matched the current bundle hash. The bundles contain the Step 5.1 allowlisted diagnostics module. All 16 model configuration identities, model/billing/server-secret fingerprints, non-AI function definitions and Storage configuration remain unchanged. GPT-4o remains active for ordinary requests; all four candidate flags remain disabled at 0%. v1 prompts, 1600px/high and the existing output ceilings are preserved.

The historical Luna HTTP 400 remains UNKNOWN_USAGE: cost null, exposure **$0.263550000000**, diagnostics null. No request-level billing/support evidence has been supplied since the prior organization-usage lookup returned 403. Root cause remains UNKNOWN. No financial correction, invented usage, diagnostic backfill or retry was performed. Both old campaigns remain disabled with empty actor allowlists and their immutable original limits.

The ledger still contains 124 historical attempts, 123 measured, with $0.393718090000 measured across all prior steps and $0.263550000000 unresolved exposure. There are no pending reservations at initial readback. Step 5 alone retains its separate 65-attempt/$0.172613090 measurement; these scopes must not be conflated. A fresh full-column checksum protects all 124 old attempts. Original-row hashes cover 16 customer/Auth/Storage tables, allowing unrelated additions while detecting changed/deleted checkpointed rows.

## Reviewable new campaign

Local artifact: `%TEMP%/plantie-ai-step52-20261116/campaign-proposal/campaign-plan.json`. Canonical proposal manifest SHA-256: `6111c943d8a827c46bb7e7ecad204d7b505f3e3cc8bfed92f5b05c6c632fe146`. This is an authorization/preflight artifact, not an enabled database run or route-activation approval.

| Setting | Proposed value |
|---|---|
| Whole-run maximum provider attempts | 100 |
| Whole-run measured + reserved + unknown exposure | $4.00 |
| Maximum expiry | 60 minutes from creation |
| Concurrent provider requests | One, including sequential Terra requests |
| Priority A | 10 diagnosis contexts × 5 configurations = 50 generations |
| Priority B | Five care-refresh locale contexts × 5 configurations = 25 generations |
| Primary safety allowance | At most 15 GPT-4o safety attempts |
| Optional cold journeys | At most 10 additional attempts, after primary pairs, within the same cap |
| Identity scope | Two newly created synthetic actors; temporary Premium owner and active viewer in one owned household |
| Retry/reset/continuation | Prohibited |
| Customer candidate activation | Prohibited |

The 75 inputs bind original image SHA-256/dimensions/bytes, exact normalized notes/name/language and context hash, immutable model configuration/hash and reconstructed provider JSON hash. All were checked against current source and a fresh production reservation oracle. Within each context, all five configurations use identical input. Five-model groups alternate the two actors; diagnosis counts are 25 per actor, preserving the existing 30/hour account ceiling. Group spacing is at least 120 seconds per actor and a group must finish within its four-minute safety authorization allowance. No rate or reasonable-use limit is raised.

The diagnosis scenarios cover healthy appearance, yellowing, brown tips, suspected lesions, suspected pest damage, insufficient evidence, contradictory notes, misleading claims, chemical requests and ambiguous causes. Scenario names do not certify that those symptoms are visible. Care refresh includes all five languages and an explicitly separate German/Luna comparison, not a retry of the historical operation. Optional ordinary GPT-4o journey contexts/images are also hash-bound; they cover add/save, diagnosis/save with safety reuse, manual refresh and completed replay. Any actual safety calls share the run budget. Optional work is skipped if the primary comparison, time or financial gates prevent it.

At readback, application in-flight headroom was **$4.736450000000**, daily headroom **$24.736450000000**, and monthly headroom **$99.342731910000**, after including the historical unknown exposure and applicable measured spending. Terra's unchanged $2.643 diagnosis reservation fits a fresh $4 run when sequentially admitted. A fully exposed new run plus the historical unknown would hold $4.26355 against the unchanged $5 in-flight control. These are readback calculations, not guaranteed future admission or provider credit balances. Authoritative SQL rechecks control, campaign and current global headroom on every claim/start. No reservation is reduced, and measured spend can exhaust Terra admission before the nominal $4 ceiling.

Stop on unknown required usage/pricing, a financial/authorization denial, an unpriced returned model/tier, an unexplained provider-parameter incompatibility, an accounting invariant failure, serious production error, circuit breaker or attempt/time/exposure limit. Do not retry, reset, continue through another run, or reopen an old run. Cleanup is restricted to registered synthetic identities/household/photos/registrations/results, with global sign-out before Auth deletion. Keep all ledger records and uncertain exposure.

## Botanical and financial evidence boundary

The expanded offline reviewer package reuses the original 36 blinded care responses and adds all 76 reference cards/62 original images, with provenance, rights information, explicit unknowns and an eight-step human workflow. No model identity mapping is included. Browser QA verified all images, 36 response cards, 76 reference cards, zero scripts/external requests and empty score fields. Visual inspection confirmed readable reference cards. ZIP: `%TEMP%/plantie-ai-step52-20261116/blinded-review-step52.zip`, SHA-256 `2df466800d2c47f0166e47aad1013f6cc84cb8799eed7b453c8e66d119577602`.

No independent botanical/localization review or approved non-inferiority policy has been supplied. Published crop labels remain partial reference evidence; there are zero fully independently reviewed qualification cases. Ten new diagnosis contexts would not alone meet the existing 60-independent-case policy. See [review workflow and results](ai-model-review-results.md). Neither a successful schema check nor an unsigned artifact hash authorizes activation.

No new diagnosis token, price, latency, failure-rate or quality result is reported as measured. Historical per-model care measurements remain in [benchmark](ai-model-benchmark.md). Cost per structurally valid result remains unknown where an unresolved failed attempt belongs in its numerator. Cost per independently acceptable result remains NOT VERIFIED for every candidate because the accepted-result denominator is absent. The six monthly scenarios (10, 30, 100, 300, 1,000, 3,000 journeys) retain their declared care/diagnosis/replay/expired-safety/failure mix and illustrative FX/fees. Candidate diagnosis components remain NOT MEASURED. €0.20 average and €0.50 heavy-user targets remain planning targets; no profitability guarantee or identical-model token assumption is introduced.

## Executed verification

Local execution used the starting revision above with a documentation-only working diff. Exact command times/results and private logs are under `%TEMP%/plantie-ai-step52-20261116`. No persistent production fault or paid provider failure was deliberately induced.

| Verification | Result | Evidence / limitation |
|---|---|---|
| npm run check | PASS | Type checking, existing offline suites and build |
| Edge image / accounting / prompt / vision / model units | PASS | All targeted commands executed in addition to check |
| Provider diagnostics / blinded review / campaign tests | PASS | 14 deterministic tests; sensitive/malicious/oversized errors, missing usage, HTTP classes, timeout, malformed result and settlement failure |
| PostgreSQL base and migration replay | PASS | 39 migrations, 11 fixtures and existing upgrade/grant checks |
| AI / vision / prompt / model / provider PostgreSQL | PASS | 100 independent sessions each; 96/44/47/104/16 assertions |
| Deno actual Edge graph | PASS | All 12 real entrypoints |
| Auth signature / RevenueCat mode units | PASS | Existing deterministic Deno suites; configuration unchanged |
| Chromium / WebKit image browser | PASS | 282 image checks each |
| Chromium / WebKit application browser | PASS | Existing application workflow checks |
| Client-secret / source-graph checks | PASS | Existing scanners executed |
| Expanded offline review package | PASS | 76 reference cards, 36 blinded outputs, all original images loaded; scores unset |
| Current production source/JWT/configuration readback | PASS | Seven matching guarded bundles; unchanged model/secret/configuration fingerprints |
| Public AI RPC/private helper grants and private RLS | PASS | Client denials/fixed search paths and private helper denial for anon/authenticated/service_role |
| Historical failure and original-row preservation | PASS | Full-column old attempt checksum and 16-table hashes |
| Bounded unpaid production smoke and cleanup | PASS | 13 endpoint checks plus direct RPC denial; zero provider attempts; scoped temporary Free fixtures removed |
| Local full Supabase stack | NOT EXECUTED | Docker CLI unavailable; full disposable Supabase is required in current-revision hosted CI |
| New paid compatibility/diagnosis/cold journeys | NOT EXECUTED | Separate $4 authorization pending; no new run created |
| Independent botanical/treatment/localization review | NOT EXECUTED | No completed independent worksheet or approved thresholds supplied |

The first local 100-session accounting invocation failed because the local server was started with its default 100-connection capacity. It was restarted on loopback with 200 connections; the unchanged 100-session test and all remaining database suites then passed. The initial failure log/result is retained separately. No production limit, test assertion or product rule was changed.

Earlier Chromium navigation failures from Step 5.1 remain recorded in [the recovery release](ai-step5-recovery-release.md). No navigation source/assertion/timeout was modified here. Any recurrence in current-revision CI must be reported and investigated separately. Final hosted CI, exact release commit and active Netlify manifest/asset readback are recorded in the local `final-verification-receipt.json` after the documentation commit; do not infer a green whole Pages workflow from green verification jobs. The prior separate Pages build failed `RELEASE_DATABASE_CONFIGURATION_REQUIRED`; Netlify is the active host.

Current security advisors retain the existing counts: private RLS/no-policy INFO 20; mutable search path WARN 4; anon/authenticated SECURITY DEFINER execution WARN 8/41; leaked-password protection WARN 1. This is an unchanged-boundary observation, not a clean-security claim. The new/private AI interfaces passed targeted denial checks; unrelated security policy was not changed.

## Release and rollback disposition

The unpaid smoke executed at 2026-11-16T06:49:29.488Z–06:49:37.616Z. Seven anonymous requests returned 401; closed-run and cross-household calls returned 403; invalid inputs returned 400; direct client settlement returned 42501. The actual test actor had zero attempts. Global sign-out and owned household/Auth deletion passed. No Storage object or Premium grant was created for this smoke. Customer entitlements, RevenueCat and billing remain unchanged.

No migration, runtime redeployment, new model configuration, prompt version or route-activation artifact is required/issued. Existing guarded rollback bundles and additive ledger remain available. A future incident closes only the affected campaign and disables its candidate route; never restore unmetered Netlify/pre-ledger inference or overwrite financial history. Documentation rollback is a normal reviewed revert on main.

| Required field | Disposition at preparation |
|---|---|
| Implementation | PASS — preparation and verification; no runtime fix required |
| Automated tests | PASS — executed local suites; final-head hosted result recorded separately |
| New paid campaign authorization | NOT APPROVED |
| Paid diagnosis benchmark | BLOCKED |
| Luna compatibility | NOT VERIFIED |
| Terra compatibility | NOT VERIFIED |
| Botanical review | UNREVIEWED |
| Treatment safety | NOT VERIFIED |
| Multilingual quality | NOT VERIFIED |
| Luna qualification | BLOCKED |
| Terra qualification | BLOCKED |
| Financial accounting | VERIFIED — historical uncertainty retained; not invoice reconciliation |
| Historical unknown exposure | UNRESOLVED |
| Cost per acceptable result | NOT VERIFIED |
| Production routing | DISABLED for candidates; ordinary GPT-4o remains active |
| Production smoke | PASS — unpaid protection paths only |
| Final release | PARTIAL RELEASE |

**NO-GO for candidate activation.** Paid model comparison requires the explicit new $4 authorization and fresh headroom/admission checks. Qualification additionally requires independent botanical/treatment/language review, approved thresholds and sufficient independent coverage. A route-specific reviewer-approved artifact must bind exact immutable configurations, evidence and numerical rollback gates before any at-most-5% cohort is enabled.
