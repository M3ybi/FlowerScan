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
| Real PostgreSQL accounting/concurrency | PASS | PostgreSQL 17.11, 100 independent sessions, 93 assertions; actual bundled care handlers admit one inference/settlement from 100 competing requests. Distinct image hashes and daily/monthly spending spikes are included. |
| Existing PostgreSQL concurrency | PASS | 32 assertions / 16 independent sessions. |
| Clean replay and two upgrade paths | PASS | 35 migrations, seven SQL fixtures per replay; existing plant/image references preserved, schema/grants/RLS snapshots equal; 26 release-role/concurrency assertions. |
| Deno actual Edge type checking | PASS | Deno 2.9.6, nine entry points and new shared imports. |
| Deno billing-mode/signature regressions | PASS | Two RevenueCat mode cases and one real-signature adapter test. No webhook behavior/configuration changed. |
| Chromium / WebKit image workflows | PASS | 275 real browser checks each; native/provider boundaries substituted. |
| Client artifact secret scan | PASS | 26 text artifacts. |
| Source graph | PASS | 181 modules, 701 edges, no unresolved imports or cycles. |
| Production-mode frontend build | PASS | Existing Netlify public build configuration, production backend and unchanged Web Billing sandbox mode; candidate working tree build was explicitly dirty, not represented as a deployed artifact. |
| Full local Supabase/Docker | NOT EXECUTED | Docker unavailable locally. Actual local PostgreSQL/platform fixtures are not represented as real Auth/Storage/Vault services. Current-revision CI is a release gate for the provisioned full stack. |
| Physical iOS/Android/store exercise | NOT EXECUTED | No device/store changes in Step 2; physical acceptance is not inferred from browser fixtures. |

Early test failures were corrected and rerun: migration syntax/type issues, cross-realm test serialization, an overly narrow synthetic RPC identifier validator, and the new third replay fixture's selected database connection. Legacy source-wiring assertions were adapted to service-only SQL settlement and permanent legacy denial; actual SQL/fault regressions now verify the runtime invariants. No security guard or financial test was disabled to obtain a pass.

## Recovery and release gates

A fresh production logical archive was captured at `2026-11-15T13:21:50Z`, encrypted with Windows DPAPI CurrentUser and restricted to the current Windows identity. SHA-256: `a63658a8e3f4d7d1d522b40e5ecf4ba83223c596d87fa334d249ef2907c6c775`. Disk readback/decryption/hash and full `pg_restore` parsing passed. The private evidence file is `%LOCALAPPDATA%/Plantie/production-recovery/ai-step2-preflight-evidence.json`. This is not a restore rehearsal or a claim of managed PITR; storage object bytes and managed platform keys/configuration are outside the logical dump. Future backups must include the new private financial schema.

Before production mutation, verify candidate tests, latest main, a clean tracked scope, unchanged model/RevenueCat secret digests, critical function/catalog fingerprints, a reviewed migration-only dry run and archived prior Edge bundles. Commit/push main without force, await required current-revision CI, apply only the reviewed new migration, deploy only the four image/AI functions with JWT verification and verify source readback. Do not deploy the RevenueCat/email functions. No model routing switch is introduced.

Temporary synthetic Free/Premium accounts, a test-only Premium grant and cleanup were explicitly authorized by the user for smoke tests. Ordinary customer entitlements remain excluded. Bound real provider calls, verify token/model/cost records, replay, denied access and current quotas, clean only the named fixtures and compare existing data/configuration fingerprints. The monitoring window and actual results must be recorded before production can be labelled verified.

Rollback keeps the new schema/accounting facts and guarded adapter, pauses new AI through `ai_private.control.paused`, and uses a reviewed forward fix or an already-verified guarded bundle. Restoring the old unguarded functions or legacy Netlify inference is not an approved rollback. The first guarded release has no older guarded production version.

## Production execution status

At this documentation checkpoint, no Step 2 migration or Edge release has been applied. Production smoke tests and financial/operational monitoring are NOT EXECUTED. Deployment evidence will be recorded only after the mandatory gates pass.

**Implementation:** PASS (candidate implemented)

**Automated tests:** PASS for executed checks above; final candidate/CI gates remain required

**Database migration:** BLOCKED pending release gates

**Edge Functions:** BLOCKED pending release gates

**OpenAI accounting:** NOT VERIFIED in production

**Financial safeguards:** NOT VERIFIED in production

**Subscription regression:** PASS locally; production unchanged-state verification pending

**Production smoke tests:** NOT EXECUTED

**Final status:** BLOCKED pending production verification
