# AI Step 2 production release

Initial revision: `49dc7bad253d0eacb4b2a34f22f214d15f68346e`, local/remote `main` matched. The only initial untracked file was the Step 1 baseline authored in this task. No separate branch or hosted staging backend was created.

The implementation introduces service-only operation admission/settlement, pending plant binding, Free care pre-spend slots, financially tracked diagnosis/safety calls, exact versioned USD accounting, bounded global/account/household controls and recoverable results. The existing `gpt-4o` model and Free/Premium rules remain. Unauthenticated legacy Netlify AI cannot bypass the ledger through the old opt-in flag. See [lifecycle](ai-operation-lifecycle.md), [cost accounting](ai-cost-accounting.md) and [financial safeguards](ai-financial-safeguards.md).

New migration: `20261115140000_ai_operation_accounting.sql`. It adds the `ai_private` schema/tables/indexes, restricted RPCs and an after-insert plant linkage trigger; no historical migration is edited and no existing entitlement/billing function is replaced. Application changes concern the four Supabase image/AI endpoints and their shared adapter plus the permanently disabled Netlify AI wrappers. Tests, CI connection capacity and these documents accompany the change. No dependency or lockfile update is required.

## Local evidence before release

| Check | Result | Evidence |
| --- | --- | --- |
| Existing `npm run check` | PASS | Final candidate: TypeScript, 649 offline test executions and frontend build. |
| Separate edge-image suite | PASS | 21 handler tests; external provider/Auth/Storage boundaries substituted. |
| New Edge accounting/fault suite | PASS | 13 tests: unknown source/key/auth, replay, provider and database faults, incomplete/refused results, settlement retry, bounded provider bodies and five-language actionable client errors. |
| Real PostgreSQL accounting/concurrency | PASS | PostgreSQL 17.11, 100 independent sessions, 96 assertions; actual bundled care handlers admit one inference/settlement from 100 competing requests. Distinct image hashes, daily/monthly spending spikes and an administrator-rearmed multi-attempt ledger fixture are included; live inference retries remain disabled. |
| Existing PostgreSQL concurrency | PASS | 32 assertions / 16 independent sessions. |
| Clean replay and two upgrade paths | PASS | 35 migrations, seven SQL fixtures per replay; existing plant/image references preserved, schema/grants/RLS snapshots equal; 26 release-role/concurrency assertions. |
| Deno actual Edge type checking | PASS | Deno 2.9.6, nine entry points and new shared imports. |
| Deno billing-mode/signature regressions | PASS | Two RevenueCat mode cases and one real-signature adapter test. No webhook behavior/configuration changed. |
| Chromium / WebKit image workflows | PASS | 275 real browser checks each; native/provider boundaries substituted. |
| Client artifact secret scan | PASS | 26 text artifacts. |
| Source graph | PASS | 181 modules, 701 edges, no unresolved imports or cycles. |
| Production-mode frontend build | PASS | Existing Netlify public build configuration, production backend and unchanged Web Billing sandbox mode; candidate working tree build was explicitly dirty, not represented as a deployed artifact. |
| Full local Supabase/Docker | NOT EXECUTED | Docker unavailable locally. Actual local PostgreSQL/platform fixtures are not represented as real Auth/Storage/Vault services. Current-revision CI is a release gate for the provisioned full stack. |
| Full Supabase in Linux CI | PASS | Real disposable Auth/Storage/Vault stack, 35 migrations, synthetic upgrade and seven SQL fixtures; current release verification job succeeded. |
| Navigation / menu / QR / Auth browser CI | PASS | 24 navigation cases per engine, including wider-font French coverage; 53 menu cases and 40 QR cases per engine; full Auth DOM/hook suite. |
| Runtime dependency audit | PASS | Current CI `npm audit --omit=dev`: zero vulnerabilities. No dependency/lockfile changes. |
| Physical iOS/Android/store exercise | NOT EXECUTED | No device/store changes in Step 2; physical acceptance is not inferred from browser fixtures. |

Early test failures were corrected and rerun: migration syntax/type issues, cross-realm test serialization, an overly narrow synthetic RPC identifier validator, and the new third replay fixture's selected database connection. Legacy source-wiring assertions were adapted to service-only SQL settlement and permanent legacy denial; actual SQL/fault regressions now verify the runtime invariants. No security guard or financial test was disabled to obtain a pass.

## Recovery and release gates

A fresh production logical archive was captured at `2026-11-15T13:21:50Z`, encrypted with Windows DPAPI CurrentUser and restricted to the current Windows identity. SHA-256: `a63658a8e3f4d7d1d522b40e5ecf4ba83223c596d87fa334d249ef2907c6c775`. Disk readback/decryption/hash and full `pg_restore` parsing passed. The private evidence file is `%LOCALAPPDATA%/Plantie/production-recovery/ai-step2-preflight-evidence.json`. This is not a restore rehearsal or a claim of managed PITR; storage object bytes and managed platform keys/configuration are outside the logical dump. Future backups must include the new private financial schema.

Before production mutation, verify candidate tests, latest main, a clean tracked scope, unchanged model/RevenueCat secret digests, critical function/catalog fingerprints, a reviewed migration-only dry run and archived prior Edge bundles. Commit/push main without force, await required current-revision CI, apply only the reviewed new migration, deploy only the four image/AI functions with JWT verification and verify source readback. Do not deploy the RevenueCat/email functions. No model routing switch is introduced.

The first candidate, `775f444257ee59cb5df2d4577d24439069210323`, was pushed without force. Its clean production build and the hosted Netlify revision/entry hashes passed; the live legacy AI wrappers returned 410. [CI run 43720519290](https://github.com/M3ybi/FlowerScan/actions/runs/43720519290) passed the PostgreSQL and full Supabase jobs, application/Deno/source checks, both image engines (275 each) and both application browser engines (15 each). Its overall result was FAIL at the pre-existing French navigation-label fit assertion, identical to [the previous main run](https://github.com/M3ybi/FlowerScan/actions/runs/41524272271). The stylesheet and navigation test were unchanged by that candidate. No production backend migration/deployment was performed while this gate failed.

The user explicitly authorized the minimal label-fit correction and continuing the release. It constrains navigation label width and permits wrapping within existing buttons, without changing text, button dimensions or billing behavior. Both preview engines passed all 24 navigation scenarios; the applied source is revalidated before the next push.

The second candidate `46c81939013ade81505de6b770891c280b5566eb` passed both database CI jobs and the AI/application checks, but Linux exposed a second fit failure for the French add-plant label. Wider-font spacing reproduced that failure locally before the correction. Allowing balanced character wrapping for that action label passed the reproduction in both engines; the navigation suite now retains a wider-font regression assertion. The original assertions remain intact.

Candidate `cd2ac44f26ea8cb4353ab6bad4efbe9dd00453e3` passed the French checks in Linux but failed the separate safe-area positioning probe on its first run and a rerun. The probe is changed to measure the actual browser viewport and fixed navigation rectangle in one snapshot, retains the 46-pixel clearance threshold, and additionally asserts viewport height and computed CSS offset. It emits numeric geometry on failure. No production safe-area rule is changed; no assumption about the original failure's cause is presented as a measurement.

Temporary synthetic Free/Premium accounts, a test-only Premium grant and cleanup were explicitly authorized by the user for smoke tests. Ordinary customer entitlements remain excluded. Bound real provider calls, verify token/model/cost records, replay, denied access and current quotas, clean only the named fixtures and compare existing data/configuration fingerprints. The monitoring window and actual results must be recorded before production can be labelled verified.

Rollback keeps the new schema/accounting facts and guarded adapter, pauses new AI through `ai_private.control.paused`, and uses a reviewed forward fix or an already-verified guarded bundle. Restoring the old unguarded functions or legacy Netlify inference is not an approved rollback. The first guarded release has no older guarded production version.

## Production execution status

Release revision: **`06caac5052d30bed57c98adea50941e7bdbe1e25`**, pushed to GitHub `main` without force. [Release CI](https://github.com/M3ybi/FlowerScan/actions/runs/43723687270) passed all three required verification jobs: application/browser, PostgreSQL and full Supabase. The separate GitHub Pages build is **FAIL**, `RELEASE_DATABASE_CONFIGURATION_REQUIRED`, because its production repository variables are empty; its deployment was skipped. This is not the active PlantieCare host. The existing **Netlify production build is PASS**, clean manifest and asset hashes verified, using the existing backend and unchanged `web_sandbox` billing mode. No missing Pages variable or billing configuration was changed to bypass its guard.

Only `20261115140000_ai_operation_accounting.sql` was applied; production now records 35 migrations. The new private tables have RLS and restricted grants; ordinary clients cannot execute accounting RPCs. Historical migrations and existing public function definitions, bucket settings, model/server-secret digests and billing environment remain unchanged.

The post-migration checksum gate initially stopped Edge rollout because one existing Auth user's `updated_at` changed during the long verification period. Read-only comparison of the encrypted preflight and post-migration archives confirmed that **only that timestamp changed**; all other Auth columns matched. Original evidence was retained. Stable-account verification explicitly excludes `updated_at` and `last_sign_in_at`, checks all remaining fields and the original user count, and keeps exact checks for plants, memberships, households, subscriptions, entitlements and storage. No existing account was edited by the release.

All four Edge functions were deployed with JWT verification and read back from production:

| Function | Before | Deployed | JWT | Matching source modules |
| --- | ---: | ---: | --- | ---: |
| `plant-care-ai` | 17 | 18 | true | 9 |
| `plant-diagnosis-ai` | 19 | 20 | true | 9 |
| `validate-plant-image` | 12 | 13 | true | 12 |
| `upload-validated-image` | 14 | 15 | true | 13 |

Readback compared every bundled local module, including the shared adapter and client error catalog. Other Edge versions/JWT settings, including RevenueCat and email functions, were unchanged. Deployment verification completed at **2026-11-15T14:34:07.979Z**. No model switch or future routing feature was introduced.

### Real production smoke evidence

Smoke interval: **2026-11-15T14:34:25.966Z–14:35:43.342Z**. Three authorized temporary users, two households and a temporary Premium grant were used. Real inference was capped at 12 attempts; **nine** occurred. Four anonymous Edge requests returned 401, and anonymous/authenticated direct accounting RPC calls returned SQL permission code `42501`. The remaining 26 function requests returned 17×200, 4×400 and 5×403, all as expected, with zero unexpected responses.

| Verification | Result | Actual evidence |
| --- | --- | --- |
| Identification and initial care, Free/Premium | PASS | Valid `{ care }`, stored plant/private photo, trusted initial-operation linkage. |
| Manual refresh, Free/Premium | PASS | Real care generation; discarded Free preview recorded exactly once. A distinct second Free refresh was denied before inference. |
| Diagnosis, Free/Premium/active Premium Viewer | PASS | Valid `{ diagnosis }`, integer confidence/risk fields and private-photo persistence. |
| Current Free limits | PASS | Monthly diagnosis counter settled once; exhausted synthetic allowance and ten-plant capacity denied new inference without extra attempts. |
| Premium normal unlimited access | PASS | Diagnosis succeeded despite a synthetic Free counter of 500; current Premium monthly limit remained null. No new Premium customer counter. |
| Replay and upload fallback | PASS | Initial/diagnosis retries returned identical completed results; four uploads reused recent safety validation with no extra provider attempt. |
| Invalid images / source | PASS | Malformed JPEG and unknown source rejected before inference. Provider safety rejection/fault cases additionally passed local handler tests. |
| Authorization and RPC isolation | PASS | Revoked Viewer and cross-household actor denied without provider work; direct client accounting RPC denied. |
| Real financial accounting | PASS | All nine attempts `MEASURED`, real request/response IDs, requested `gpt-4o`, returned `gpt-4o-2024-08-06`, `default` tier; exact integer cross-check of every USD amount. |
| Cleanup / existing data | PASS | Temporary sessions revoked; accounts, households, grant, photos and cached generated results removed. Financial facts retained. Nine plant/diagnostic graph tables and existing subscription/entitlement/storage/account-identity checks matched. |

Measured totals: **13,530 input tokens**, of which **1,280 cached**; **1,637 output**, **0 reported reasoning**, **15,167 total**; **$0.048595000000 USD**. Provider duration 1,303–6,569 ms, mean 3,145 ms, discrete p50 2,539 ms and p95 6,569 ms. See [the per-operation baseline](ai-cost-accounting.md#measured-production-baseline-2026-11-15). These are synthetic measurements, not historical estimates, invoice reconciliation, representative scan costs or subscriber-month profitability.

### Monitoring and recovery evidence

Monitoring ran from deployment verification at **14:34:07.979Z to 14:41:54.071Z**, including **370 seconds after smoke cleanup finished**. Aggregate Supabase runtime-log verification covered **14:34:00Z–14:41:20Z**. It found all **30** expected Edge requests: 17×200, 4×400, 4×401 and 5×403; **zero 5xx**, no runtime WARN/error entries, and only the deployed function versions. Maximum observed Edge duration was **6,778 ms**. The ledger stayed at nine measured attempts, zero provider failures, zero unresolved usage/exposure and zero active operations. No additional inference or spend appeared during the quiet window. The circuit remained unpaused and all configured concurrency/rate/exposure/warning/emergency values matched the reviewed defaults. This bounded release observation is not a production stress test or a long-term availability claim.

Security-advisor comparison found no new WARN findings after removing observation timestamps. Five additional private-table [RLS-without-policy INFO notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) reflect intentional default-deny financial tables. Existing [mutable search-path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [anonymous privileged-RPC](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated privileged-RPC](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) warnings are unchanged; Step 1 contains their context. New accounting RPCs have fixed paths and no client execute grants.

A post-smoke logical archive at **2026-11-15T14:38:29.968Z** includes all five `ai_private` tables and their financial records. SHA-256 **`52e63716436de1d0199e534eea1a9c966d19b40981c88f997c124ee02b72c78a`**; DPAPI encryption, restricted ACL, disk decryption/hash and full archive parse passed. Evidence: `%LOCALAPPDATA%/Plantie/production-recovery/ai-step2-final-evidence.json`. The preflight archive is retained. No production restore was attempted.

### Limits and next boundary

Physical iOS/Android and live store purchase/cancellation exercises are **NOT EXECUTED**; their adapters and subscription regressions passed, and billing/webhook/configuration were preserved. Production timeout storms, database outages and emergency global budget activation were **NOT EXECUTED** against live users; those fault/concurrency/financial scenarios passed in disposable infrastructure. Native store acceptance, provider invoice reconciliation, representative quality/cost data, FX and full subscription unit economics remain separate work. The active policy allows one provider attempt per operation; multi-attempt ledger accounting was exercised through an explicitly administrator-rearmed disposable fixture, not enabled as a production retry policy.

The existing care UI's diagnosis-allowance gate remains; changing that product behavior is outside Step 2. Operators must run/schedule the documented trusted maintenance and review unresolved exposure rather than clearing it by elapsed time. Before Luna/Terra deployment, validate candidate model quality, prices/service tiers and realistic workload costs, preserve these lifecycle/access/accounting invariants, and repeat production acceptance. No later model routing is authorized or enabled by this release.

**Implementation:** PASS

**Automated tests:** PASS for all required Step 2 suites and the three release verification jobs; the separate non-active GitHub Pages build is FAIL as recorded above

**Database migration:** DEPLOYED

**Edge Functions:** DEPLOYED

**OpenAI accounting:** VERIFIED

**Financial safeguards:** VERIFIED through real deployed admission/replay/quota checks, production configuration/grants and disposable concurrency/fault tests; live emergency interruption was not induced

**Subscription regression:** PASS

**Production smoke tests:** PASS

**Final status:** PRODUCTION VERIFIED for the active Netlify/Supabase application

**GO:** Step 2 is released and verified. Proceed to a separately reviewed Luna/Terra quality/cost evaluation; do not switch production models without that acceptance.
