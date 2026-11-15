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

Browser/current-revision CI,deployment and paid smoke outcomes are added only after execution. No pending gate is represented as a production pass. Prior CI's separate unused GitHub Pages build fails its missing configuration guard; active production is Netlify. That guard and its configuration are outside this change.

## Recovery and rollback

Preflight backup at2026-11-15T16:33:43.177Z,archive SHA-256 `a83171605f4931b99ad7993138adb5ae82d9d4f5d5e28d8f3b8f6e2f4a82522e`,protected evidence `%LOCALAPPDATA%/Plantie/production-recovery/ai-step4-preflight-evidence.json`. Logical backup excludes Storage object bytes and managed platform keys/configuration; no restore was performed. Fresh function bundles are versioned/encrypted,not secrets in Git.

On a serious quality/access/accounting regression,disable the private evaluation run first; keep ordinary v1. Pause new AI with the existing emergency control only if necessary,retain in-flight accounting,then restore the prior **guarded** care19/diagnosis21 bundles or a reviewed forward fix. Preserve additive tables,historical attempts/results/tombstones and all customer quota/entitlement facts. Keep the new evaluator disabled; it is not an ordinary route switch. Restore the recorded verified web artifact if needed. Never restore pre-Step2 unmetered inference,enable legacy handlers,drop ledger rows,reset production or overwrite customer subscriptions. A database restore is separate disaster recovery,not routine rollback.

## Step 5 readiness

**NO-GO for behavior-changing prompt activation or Luna/Terra routing** without the reviewed comparative botanical/multilingual safety gates in [the quality report](ai-diagnostic-quality.md). The authorized scope permits independently verified non-behavioral improvements to ship while candidates remain disabled. Measured token differences from isolated candidates are not production savings. Actual final implementation/deployment/accounting statuses follow below after release verification.
