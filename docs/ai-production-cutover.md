# Production cutover evidence

## Preparation checkpoint — 2026-11-16

**Status: NOT CUT OVER.** Starting Git revision `4b89f42132a5a6e941190af57c4b146e84f1a03a`; working implementation and additive migrations require final review/current-revision CI before production application. No new branch or hosted staging backend is used.

Production at capture: four active GPT-4o legacy routes, candidates disabled at 0%, unchanged global limits, 39 applied migrations. Edge baseline: care22, diagnosis24, validation16, upload18, vision evaluator3, prompt evaluator3, model evaluator2; these AI functions have JWT verification enabled. New owner controls are not yet deployed. Existing RevenueCat configuration is not changed.

Ledger checkpoint: 218 attempts, $0.66296874 measured, $0.26355 unknown at 2026-11-16T11:18:56Z. Original rows across sixteen customer tables and exact original attempt facts are hashed privately. A live customer call occurred after the initial 217-attempt audit; do not attribute it to migration evaluation.

## Verification evidence

| Verification | Result | Evidence / limitation |
|---|---|---|
| `npm run check` | PASS | Executed typecheck, registered test runner and production build; private dated log |
| `test:edge-images` | PASS | Executed in check and targeted 44-test adapter/image/diagnostics run |
| Chromium image processing | PASS | 282 real checks |
| WebKit image processing | PASS | 282 real checks |
| Client-secret scan | PASS | Executed on generated client artifacts |
| Source graph | PASS | Executed unresolved-import/cycle check |
| Deno Edge types | PASS | Executed including new owner function |
| AI PostgreSQL | PASS | Real disposable sessions; provider/platform fixtures |
| Vision / prompt / model / diagnostics PostgreSQL | PASS | Executed; updated model suite uses 100 sessions, 117 assertions and mocked Luna calls |
| New Luna owner/rollout PostgreSQL | PASS | 167 assertions, twenty staged operations, cutover/recovery/revocation, historical review-hash constraints and financial preservation; synthetic facts |
| Clean/upgrade migration replay | PASS | All 42 migrations, 12 SQL fixtures/replay, zero schema difference; local Auth/Storage/Vault adapters |
| Household profitability | PASS | Deterministic 56-scenario, unknown-cost, fee/FX and negative-stress cases |
| Full disposable Supabase CI | FAIL | Initial `bec11a4` run failed during stack startup with a missing-file error, before SQL checks. The fixture omitted the newly declared owner function; complete source-graph copying and a regression test are prepared. Current-revision rerun required; PostgreSQL fixtures are not equivalent. |
| Application Chromium / WebKit | PASS | Executed existing application suites on the compatibility implementation |
| Mobile Chromium / WebKit | PASS | 24 checks per engine; unchanged existing assertions |
| Owner visual regression | NOT EXECUTED | Real owner UI and session still required |
| Paid Luna safety campaign | NOT EXECUTED | User approved exact cap; real owner Auth approval still needed |
| Authenticated owner risk acceptance | NOT EXECUTED | Requires actual qualified evidence and owner session |
| Production additive migrations / affected-function deployment | NOT EXECUTED | No production mutation at this checkpoint |
| Production smoke, canary, 100% and recovery | NOT EXECUTED | No model activation or cutover timestamp |
| Independent botanical review | NOT EXECUTED | Owner chooses engineering-assessed pathway; never claim specialist approval |

Initial test failures are retained: stale receipt version/model-env expectation, missing trusted SQL bindings in old mocks, obsolete fixed registry-count/request-shape checks, and a safety builder object-key order regression. The builder was corrected to preserve historical provider bytes/fingerprints; related fixtures/static tests were updated. No unrelated browser assertions were relaxed. Rerun affected checks after any subsequent code/schema change.

## Release sequence and receipt

Current-head CI must verify app, PostgreSQL and full disposable Supabase separately. The repository's separate Pages packaging job has an existing production database-configuration limitation; do not call the whole Pages workflow green when only verification jobs passed. Active hosting is Netlify and needs independent revision/asset verification.

Refresh encrypted recovery/data checkpoints, verify remote main, commit/push without force, apply only reviewed additive migrations, deploy affected functions with JWT/source/configuration parity and enroll only the explicitly authorized owner. Record exact deployed versions, bundle/source hashes, Git and CI job URLs, paid campaign run/ledger evidence, cleanup and unchanged customer/configuration facts privately.

The final receipt must name active configuration and effort per route, actual model in new attempts, all staged operating evidence, authenticated risk/grant records, qualified Luna recovery, old unknown retention, post-cutover non-Luna attempt counts and the actual cutover timestamp. None of those production outcomes is inferred from the local results above.

Until all mandatory gates pass: **Final 100% cutover NOT VERIFIED; final status PARTIAL IMPLEMENTATION / NO PRODUCTION ACTIVATION**.
