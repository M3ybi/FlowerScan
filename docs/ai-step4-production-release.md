# Step 4 production release

Starting revision `1682ddea7db67687d8ded7d8838b4ebff3812d7a` matched remote main with a clean working tree. Existing production is plantiecare.com,existing Supabase project,care19/diagnosis21/validation14/upload16/vision-benchmark1. Current model digest verifies GPT-4o. No branch,hosted staging,new project or dependency is introduced.

## Scope and release categories

**A — deploy after gates:** centralize byte-equivalent active v1 prompts/schemas/parsers; reject schema-invalid numeric-string/list types; distinguish refused,incomplete,failed and cancelled provider outcomes while retaining usage; pin immutable candidate versions; add protected default-off evaluation and reproducible unreviewed corpus/review framework.

**B — not activated:** changed botanical/diagnostic/language instructions or smaller output ceilings. **C — isolated only:** A/B/C/D candidates and bounded cap/language experiments. Ordinary API envelopes,fields,enums,model,1400/2400 ceilings,1600/high image policy,safety reuse,Free/Premium rules and financial controls remain. No unrelated frontend/native,RevenueCat,billing,price or entitlement change.

New migration `20261115163555_ai_prompt_evaluation.sql` adds one private RLS table containing registered hashes/configuration and two service-only fixed-search-path RPCs. It uses the existing50/$0.40 evaluation run and budget helper,delegates original Step2 admission and retains shared start/settlement. No existing accounting function/control row or migration is rewritten. Deploy migration before care/diagnosis and new `prompt-evaluation`; preserve all other Edge versions/JWT settings.

## Executed local verification

| Verification | Status | Actual evidence / limitation |
|---|---|---|
| Remote main / clean starting scope | PASS | Exact1682dde match; no unrelated initial modifications |
| Production model/configuration/data preflight | PASS | Fresh secret metadata,36 migrations,function/bucket/data checksums; GPT-4o retained |
| Recovery before changes | PASS | Fresh DPAPI archive public/auth/storage/vault/migrations/seven private tables; disk/hash/full parse verified; four prior guarded Edge bundles archived/read back |
| npm run check | PASS | Actual TypeScript,offline suites and build |
| test:edge-images | PASS |21 handlers; auth,input,safety,Storage,diagnosis and billing regression boundaries |
| test:ai-accounting | PASS |13 usage/fault/replay tests |
| test:ai-prompts | PASS |13 dedicated tests,including20 before/after v1 case/language comparisons,all8 immutable definitions,contracts,adversarial isolation and typed-output reproduction |
| test:ai-postgres | PASS |100 sessions,96 lifecycle/financial assertions |
| test:vision-images | PASS |7 existing image/fingerprint/safety tests |
| test:vision-postgres | PASS |100 sessions,44 budget/safety-reuse assertions |
| test:prompt-postgres | PASS |100 actual Edge workers,47 assertions; one inference then replay,exact registration,mixed ordinary/evaluation budget,unknown exposure,closed-run and privilege denials |
| test:image-browser | PASS |282 real Chromium checks;native/provider boundaries substituted |
| test:image-webkit | PASS |282 real WebKit checks;not physical-device acceptance |
| test:postgres-migrations | PASS |37 migrations,nine fixtures,clean and four upgrade paths,including deployed Step3; synthetic records preserved;schema/grant parity;26 role/concurrency release assertions |
| Deno actual graph | PASS |11 actual Edge entrypoints including evaluator |
| check:source-graph | PASS |Actual module graph |
| check:client-secrets | PASS |Source/build scan;no secret values printed |
| Full local Supabase | NOT EXECUTED |Docker unavailable locally;current-revision full-stack CI is required |
| Botanical diagnostic/treatment quality | NOT EXECUTED |No independent reviewed corpus/thresholds;new behavioral versions disabled |
| Physical iOS/Android/store | NOT EXECUTED |No device/native change;browser/native-boundary tests are not physical acceptance |

Initial failures were in test wiring: elapsed latency was incorrectly included in an exact snapshot,and onboarding source checks expected inline definitions. Timing is now checked as a metric but excluded from deterministic equality; wiring assertions follow the centralized factories/contracts. Actual all-language payload/parsed-output/fingerprint comparisons preserve the original safety requirement. A parser regression test reproduces old numeric-string acceptance and verifies rejection with financial usage retained. No security or financial assertion was disabled.

The current-revision hosted gates and production results are recorded below. GitHub Pages is a separate unused deployment target; active production is Netlify. Its configuration guard was preserved.

## Recovery and rollback

Preflight backup at2026-11-15T16:33:43.177Z,archive SHA-256 `a83171605f4931b99ad7993138adb5ae82d9d4f5d5e28d8f3b8f6e2f4a82522e`,protected evidence `%LOCALAPPDATA%/Plantie/production-recovery/ai-step4-preflight-evidence.json`. Logical backup excludes Storage object bytes and managed platform keys/configuration; no restore was performed. Fresh function bundles are versioned/encrypted,not secrets in Git.

On a serious quality/access/accounting regression,disable the private evaluation run first; keep ordinary v1. Pause new AI with the existing emergency control only if necessary,retain in-flight accounting,then restore the prior **guarded** care19/diagnosis21 bundles or a reviewed forward fix. Preserve additive tables,historical attempts/results/tombstones and all customer quota/entitlement facts. Keep the new evaluator disabled; it is not an ordinary route switch. Restore the recorded verified web artifact if needed. Never restore pre-Step2 unmetered inference,enable legacy handlers,drop ledger rows,reset production or overwrite customer subscriptions. A database restore is separate disaster recovery,not routine rollback.

## Step 5 readiness

**NO-GO for behavior-changing prompt activation or Luna/Terra routing** without the reviewed comparative botanical/multilingual safety gates in [the quality report](ai-diagnostic-quality.md). The authorized scope permits independently verified non-behavioral improvements to ship while candidates remain disabled. Measured token differences from isolated candidates are not production savings. Actual final implementation/deployment/accounting statuses follow below after release verification.

## Executed deployment and production verification

Implementation commit `f650cd1ff28bebc81e52bfd72c94b17c988fe2c2` plus EOF whitespace cleanup produced final **runtime source revision `18986e1fc2c557f50e0b515b789d158fd187dc5f`**. Both were pushed to main without force. Later release-record commits change documentation only;the final evidence revision is the commit containing this record (`git log -1 --format=%H -- docs/ai-step4-production-release.md`),also reported explicitly in the delivery response. No separate branch or backend was created.

[Runtime-revision CI run43737887025](https://github.com/M3ybi/FlowerScan/actions/runs/43737887025) completed its required jobs successfully before deployment:

| Verification | Status | Evidence |
|---|---|---|
| verify / verify | PASS |Job132886302045;Deno,full check,secret/source scans,Chromium/WebKit image/application/navigation/menu/QR/auth suites and runtime dependency audit |
| verify / postgres | PASS |Job132886303664;real PostgreSQL,migration replay,accounting,image and prompt suites |
| verify / supabase | PASS |Job132886336762;full disposable Supabase stack,37 migrations and nine fixtures |
| Initial verify attempt | FAIL |Unchanged mobile safe-area navigation case read12px instead of46px;23/24 passed. Exact local suite24/24 passed;unchanged CI retry passed both browser engines. Root cause was not established. No UI/assertion change was made |
| Separate GitHub Pages build | FAIL |Job132889799386;`RELEASE_DATABASE_CONFIGURATION_REQUIRED`;Pages deploy skipped. This is not described as an entirely green workflow |
| Active Netlify web manifest/assets | PASS |plantiecare.com ready at18986e1;clean manifest,public billing mode and every entry asset hash matched local production-configured build at17:16:02 UTC |
| Production migration | PASS |Only reviewed `20261115163555_ai_prompt_evaluation.sql` in fresh dry-run;applied37th migration;private RLS and service-only fixed-search-path RPC checks passed |
| Affected Edge deployment | PASS |care20,diagnosis22,evaluator1,allACTIVE/JWT true;source readback matched every module,13/13/15 respectively |
| Unrelated Edge/configuration preservation | PASS |Validation14,upload16,vision-token-benchmark1 and all remaining function versions/JWT flags retained;model/server secret metadata and bucket configuration unchanged |
| Controls/pricing/historical ledger preservation | PASS |Exact captured control,price and pre-existing financial function hashes;all43 preflight historical attempt rows retained unchanged |
| Ordinary records/entitlements | PASS |Before/after household,membership,plant,Auth stable fields,Storage,billing/subscription/entitlement hashes;additional nine-table plant/diagnostic graph matched |
| Existing security advisories | FAIL |Existing mutable-path4,anonymous definer8,authenticated definer41,leaked-password protection disabled1 remain. They were not introduced or fixed by this release |
| New evaluation privileges | PASS |No client execute access to new accounting RPCs;new private RLS table has no client policies/grants. RLS/no-policy INFO count14→15 is expected deny-by-default private bookkeeping |

The migration and three deployments completed at17:12:49.244 UTC. No model,image,RevenueCat,billing,price,subscription or ordinary entitlement setting changed. The authorized Premium grant was temporary and applied only to a newly created synthetic household,then removed with cleanup.

### Bounded production smoke and accounting

Actual smoke window17:13:16.826–17:14:50.849 UTC. **40 recorded assertions passed**,five ordinary grouped journeys passed,and nine of13 planned candidate generations executed. Full measurements,per-attempt statuses and caller/provider timings are in [the benchmark](ai-prompt-token-benchmark.md).

| Verification | Status | Evidence / limitation |
|---|---|---|
| Anonymous endpoint/direct client RPC denial | PASS |Five endpoints401;anonymous/authenticated evaluator SQL access42501;no provider attempts |
| Add New Plant + identification/care + persistence | PASS |Free synthetic actor,safety+v1 care,two attempts/$0.0109075;exact uploaded JPEG read back privately |
| Plant Looks Unwell + saved diagnosis | PASS |Synthetic Premium actor,safety+v1 diagnosis,two attempts/$0.0079400;diagnosis persisted,save reused safety |
| Manual care refresh | PASS |Premium actor,one v1 attempt/$0.0063100;existing output ceiling and envelope |
| Completed ordinary/candidate replay | PASS |Same result;zero extra provider attempts. Image safety/upload reuse also added zero |
| Free/Premium regression | PASS |Free monthly diagnosis,daily refresh and plant limits enforced403;Premium remained unlimited despite synthetic500-used fixture;nonmember and revoked viewer denied with no new paid calls |
| Server model/schema/cap control | PASS |Forged ordinary request fields could not replace trusted configuration;strict evaluator override tests passed locally/CI |
| Prompt-version isolation | PASS |Registered immutable versions/namespaced fingerprints;completed candidate replay;changed-version cache miss verified in deterministic/real-PG suites |
| Real candidate structured output | PASS |Six English same-input B/C/D responses plus sk/de/fr care512;all completed/valid,zero consistency signals. This does not verify semantics |
| Remaining real candidate cells | NOT EXECUTED |Spanish512 denied before provider;English512,adversarial Slovak diagnosis700 and256 truncation were stopped with the whole evaluation |
| Real refusal/incomplete/fault injection | NOT EXECUTED |No such provider response observed;deterministic handler/settlement tests passed |
| Provider usage/cost reconciliation | PASS |14/14 attempts MEASURED;21432 input,1280 cached,2855 output,0 reasoning,24287 total;exact$0.0805300;all IDs/model/tier/price versions recorded |
| Financial run limit | PASS |First429 at$0.0805300 measured+$0.3251200 next reservation>$0.40;zero new attempt. No reset,alternate budget,reduced reservation or retry |
| Financial circuit/concurrency/unknown exposure | PASS |Production controls unchanged;disposable100-session suites exercised circuit,exact admission,unknown usage/reconciliation and concurrency. No production emergency-control mutation |
| Cleanup | PASS |Three synthetic users and two households removed;objects removed;private results cleared;run disabled,0 actors,0 registrations,0 active operations,0 unknown exposure. Financial history retained |
| Botanical/multilingual safety gates | NOT EXECUTED |No reviewed corpus/thresholds;overall identification/diagnosis/treatment/multilingual quality NOT VERIFIED;new behavior stays disabled |

Experiment outputs never entered ordinary customer records. A nonzero remaining measured budget was not treated as permission to bypass conservative admission. Provider-token reconciliation verifies ledger calculations,not a provider invoice or representative subscriber profitability.

### Post-cleanup monitoring

**PASS**, observed through17:20:18 UTC: the17:12:49.244–17:20:18 UTC log window includes more than five minutes after cleanup. Aggregate Edge logs showed31 relevant requests:19 success,5 expected401,6 expected403 and1 evaluation-budget429;0 endpoint5xx. Runtime error/fatal/boot-failure aggregate was empty. Care20/diagnosis22/evaluator1 and unchanged validation14/upload16 appeared in the execution logs. These are bounded observations,not long-term reliability or language-quality guarantees.

Ledger readback at17:20:23 retained exactly14 measured attempts/$0.0805300,0 refused/incomplete/invalid results,0 unknown exposure and0 active work. Final configuration/data checks at17:20:27 passed again;the evaluation stayed disabled with0 actors/registrations/results. No new paid call was made after the admission stop. Monitoring queried aggregate fields only,without customer payloads or personal data.

### Recovery after release

Fresh post-cleanup archive captured17:15:28.420 UTC: SHA-256 `6e00ce6019792ce5f0730bc419278e8f39a78226bebb66b7f8878cbbd906cca7`,794353 plaintext bytes. It includes eight private tables with the retained Step4 ledger. DPAPI encryption,restricted ACL,disk readback,decryption,hash and full archive parse passed. Evidence is `%LOCALAPPDATA%/Plantie/production-recovery/ai-step4-final-evidence.json`. No production restore was executed;Storage object bytes and managed platform configuration remain outside the logical archive.

### Final disposition

Category A implementation and exercised production contracts: PASS. Category B activation: **NO-GO**. Category C evaluation: closed and disabled. Structured output,accounting and financial safeguards are verified within the executed automated/synthetic scope. Botanical identification,diagnosis,treatment safety and complete multilingual behavior are **NOT VERIFIED**. Prompt token reduction and caching were measured;actual production cost reduction is **NOT VERIFIED**. Final release classification: **PARTIAL RELEASE**,with **NO-GO for Step5 Luna/Terra routing** until the independent quality gates pass.
