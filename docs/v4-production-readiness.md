# V4 production readiness decision

**NOT READY.** Executable local checks pass, but no authorized staging environment exists and critical full-stack, hosted-provider and physical-platform gates remain blocked. No risk exception was approved. A passing debug build or desktop WebKit test does not close those gates.

The starting tree was clean at `4077c2c5c6c3a89fda71328c350157e2374cfe10`, on `codex/plantie-v3-hardening`. Git history confirmed `c770bb3`, `516dbe8`, the preceding remediation commits and the V3 documentation commit. The V3 findings, architecture/graph, validation, rollout and original audit were reconciled before editing. V4 is isolated on `codex/plantie-v4-release-readiness`. Reviewed code ends at `9399257`; subsequent documentation does not change runtime source.

## Release decision matrix

Statuses are PASS, FAIL, BLOCKED, NOT_RUN and NOT_APPLICABLE. PASS is bounded by the stated environment/evidence, never inferred live verification.

| Gate | Method / actual evidence | Environment | Risk if unresolved | Status | Required action |
| --- | --- | --- | --- | --- | --- |
| Dependency install, TypeScript, Node, production-mode bundle | `npm run verify:release`: clean install, `check`; 611 Node executions, zero failed/skipped/cancelled | Local Windows | Build/runtime regression | PASS | Preserve candidate/lockfile evidence |
| Guarded preview/production builds | Actual Vite builds with synthetic public keys and distinct `.invalid` targets; manifests record correct environment/fingerprints | Local synthetic config | Wrong project/provider routing | PASS for guard fixtures | Approved real production/preview config still required |
| Actual production artifact/config | No hosted config read; local build manifest is local/dirty and synthetic guard builds are not deployable | Production | Authentication/billing misrouting | BLOCKED | Verify approved URLs, public key ownership, secrets and clean artifact |
| Chromium/WebKit image and app | 275 image checks and 11 actual-App workflow groups in each engine | Desktop offline | Image/modal/lifecycle regression | PASS | Physical acceptance remains separate |
| Auth UI/session and signed email adapter | 742 browser DOM/hook checks; real Standard Webhooks signature adapter with fake Resend | Local offline | Account lockout/mail failure | PASS at boundary | Real confirmation/OAuth/recovery/delivery tests |
| Complete migrations with adapters | 34-file clean/upgrade replay, six SQL fixtures twice; empty schema diff; 32 + 26 separate PostgreSQL assertions, 16 sessions per workload | Disposable PostgreSQL 17.10 | Integrity/authorization/race regression | PASS with explicit adapters | Preserve schema/data comparison and new migration |
| Full Supabase platform/JWT/API | Docker prerequisite returned exit 2; no Vault encryption, Auth/PostgREST/Storage HTTP service acceptance | Disposable full Supabase | Required migrations/platform integration unvalidated | BLOCKED | Run prepared Docker job and real role/API tests |
| Hosted migration baseline and backup/restore | No authorized hosted query or restore rehearsal | Staging/production | Incompatible migration/data loss | BLOCKED | Inventory applied versions, reviewed pending list, approved backup and isolated restore drill |
| Cross-household authorization | Real SQL role cases and service/handler boundary tests pass | Local SQL/offline | Tenant data exposure | PASS for tested boundaries | Repeat actual JWT/Storage API positive/negative cases |
| Final candidate security review | Immutable `4077c2c..9399257`, all 29 source inventory items plus 13 test/config files, independent reviewers | Local static diff | New security regression | PASS within scope | See [security review](v4-security-review.md); no claim about unknown hosted settings |
| Dependencies / client secrets / source graph | Both npm audits: zero reported vulnerabilities; 26 emitted text artifacts scanned; 185 modules, 701 local edges, zero unresolved/cycles | Local registry/build | Known vulnerability/secret exposure | PASS | Recheck at actual release time |
| Live Email/Google/Resend | No real signup, recovery, email or OAuth sent | Authorized test environment | Broken authentication/delivery | BLOCKED | Dashboard checks and actual acceptance matrix |
| Subscription entitlement assignment | Both webhook test paths and real SQL binding/order/concurrency pass; no sandbox purchase | Local boundaries; provider unavailable | Wrong paid access/receipt transfer | BLOCKED for provider acceptance | Real store/web sandbox flow, restore policy and callbacks |
| Original physical image path | No physical iPhone/Android or mobile Safari/Chrome acceptance | Intended physical platforms | Users still cannot add plants | BLOCKED | At least ten actual additions and diagnosis selections on each intended platform, including gallery/cloud/HEIC |
| Android emulator acquisition | Fresh offline emulator, actual Camera bridge, 10 + 10 JPEG selections and cancel; no provider calls | Android emulator | Native URI/normalization regression | PASS for isolated acquisition | Full Auth/upload/readback/physical acceptance still required |
| Android debug / iOS sync | Debug APK BUILD SUCCESSFUL (152 tasks); iOS sync and ten config/auth tests | Local Windows | Native integration failure | PASS for stated checks | No signed release or Xcode compile inferred |
| Native signed builds / store readiness | No release signing, Xcode, physical store purchase or submission | Android/iOS stores | Uninstallable/broken store release | BLOCKED | Platform release checklists and approved test tracks |
| Partial deployment / old clients / rollback | Source contracts reviewed; missing receipt fallback retained; rollback runbook prepared | Local source; hosted rehearsal absent | Downtime/incompatible installed clients | BLOCKED for rehearsal | Stage old/new combinations, failed function deploy and web rollback |
| Deletion request persistence | Identity, duplicate, RLS/private audit and failure recovery tests | Local DB/handler | Lost/misrepresented deletion request | PASS for request queue | Assign processing owner, approved retention/shared-ownership/billing policy |
| Operational alerts / deletion processing policy | Structured event wrapper locally tested; no hosted aggregation/on-call/SLA configured | Operations | Undetected incident/unprocessed request | BLOCKED | Approve owner/policy and establish measured baselines |
| Production deployment | Explicitly outside authorization | Production | Unreviewed destructive/public change | NOT_RUN | Obtain separate approval only after gates close |
| Supabase OAuth Server | No third-party identity-provider use case | All | Unnecessary auth surface | NOT_APPLICABLE | Keep disabled |

## Priorities and remaining uncertainties

**P0:** No currently demonstrated remaining critical vulnerability or confirmed production data loss. This is a bounded local result; unknown production configuration is not a clean bill of health.

**P1 — release blockers:** authorize/provision isolated staging; execute the full Supabase/Vault/JWT/Storage matrix and migration/restore rehearsal; inspect actual hosted configuration; verify real Auth/Resend/RevenueCat callbacks and native restore policy; reproduce and verify physical image paths; compile/sign/test intended native releases; rehearse old-client/partial-deploy/rollback compatibility. Missing provider configuration cannot be classified as NOT_CONFIGURED without authorized evidence; it remains UNKNOWN/BLOCKED.

**P2 — operational follow-through:** approve deletion policy/owner and review cadence, configure dashboards/on-call and traffic-based admission/availability thresholds, tune the report-only script/connect CSP from real provider use, and review large bundle warnings against a measured performance budget. Broad refactoring and a new monitoring service were not introduced.

The migration recheck fixes a proven local race; it does not prove the original physical gallery incident is resolved. Historical migration correction affects fresh replay only; existing recorded history must not be rewritten. Build guards intentionally block unconfigured production/preview deployments, so hosting context configuration must be reviewed before the next authorized deployment. The prepared Docker workflow has not run on this host or hosted Actions.

The complete [deployment and rollback runbook](v4-deployment-runbook.md) provides the dependency sequence. No staging/production smoke test, email, purchase, data deletion, reset, push, merge or store publication was performed.
