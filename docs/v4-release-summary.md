# Plantie V4 release summary — 2026-10-19

**Recommendation: NOT READY.** Local engineering and verification are complete within the authorized scope. No staging environment was authorized, and production readiness requires external evidence that was not available. The original physical-gallery issue remains open.

## Changes and why

| Change | Root cause / resulting behavior |
| --- | --- |
| Additive post-lock upload-membership migration | Reproduced a removed Viewer receiving an upload reservation after waiting on the household lock. Authorization is checked again after the lock; regression now passes |
| Clean replay correction | Historical special-household migration aborted on a clean database with no such household. Complete absence is safe; partial/ambiguous target records still fail closed |
| Invitation result/error handling | SDK non-2xx responses hid `EMAIL_RATE_LIMITED` behind a generic failure. Known bounded result codes now reach existing localized messages, with a 30-second deadline and no blind resend |
| Nine Edge operation wrappers | Per-invocation UUID header and fixed-field outcome/duration events support diagnosis without request/provider payload or credential logging |
| Release target guard and manifest | Preview/Test Store alone did not isolate the database. Builds now require approved distinct test origins and correct public billing-key class, with revision/environment/backend fingerprint and entry hashes. A final regression moved hashing after Vite transforms so hashes match actual emitted bytes |
| Web hosting policy | Narrow enforced frame/object/base CSP, broader report-only policy, nosniff/referrer headers, immutable hashed assets and revalidating HTML/manifest; public source maps disabled |
| Verification infrastructure | Single runner distinguishes failures from blocked gates; real signature adapter test; 34-migration clean/upgrade SQL replay and schema comparison; independent role/subscription/membership concurrency; prepared full Supabase Docker CI job; offline native picker fixture |

V3 architecture, collaborative Viewer semantics, receipt fallback, monthly quotas, server entitlement authority and private image paths were preserved. No runtime dependency or lockfile change was required.

Local commits:

- `6531a1c` — migration replay and upload membership serialization.
- `13554d4` — safe Edge correlation and invitation throttling.
- `c3af7c7` — release target isolation, workflow and native fixture.
- `9399257` — final emitted artifact hash correctness and actual-build regression.

Documentation is committed separately. No push, deploy or merge is part of V4 authorization.

## Executed verification

The final `npm run verify:release` ran against `9399257` with a dirty tree consisting of authored documentation. It returned **exit 2**, correctly reflecting blocked infrastructure/manual release gates; executable checks all passed. The report's dirty flag is preserved, not disguised as a clean deployment artifact.

| Actual command/workload | Result |
| --- | --- |
| `npm ci`; `npm run check` | PASS; TypeScript, **611 Node test executions**, production-mode local bundle |
| `test:image-browser`; `test:image-webkit` | PASS; **275 checks each** |
| `test:application-browser`; `test:application-webkit` | PASS; **11 workflow groups each**, actual offline App with ten additions |
| `test:auth-flow-browser` | PASS; **742 DOM/hook checks**, synthetic identity/provider boundary |
| `npm audit`; `npm audit --omit=dev` | PASS; **zero reported vulnerabilities** at execution time |
| `check:edge-types`; `test:auth-signature` with Deno 2.9.6 | PASS; **nine entrypoints**, real Standard Webhooks adapter, fake network transport |
| `test:postgres` | PASS; PostgreSQL **17.10**, **32 assertions / 16 sessions** |
| `test:postgres-migrations` | PASS with explicit platform adapters; **34 migrations**, clean/upgrade, **six SQL fixtures twice**, preserved plant/image row, empty schema diff, additional **26 assertions / 16 sessions** |
| `check:source-graph`; `check:client-secrets` | PASS; **185 modules / 701 edges / zero unresolved or cycles**; **26 emitted text artifacts** |
| `android:build` | PASS; debug APK, **152 tasks**; no signed release claim |
| `npx cap sync ios`; `test:native-auth` | PASS for sync/configuration, **ten tests**; no Xcode compile |
| Native offline emulator | PASS; actual gallery/normalizer, **ten + ten JPEG selections and cancellation**; no Auth/AI/Storage/database |
| Guarded actual Vite builds | PASS with **synthetic** production and isolated preview configuration; these are not deployable provider-verified artifacts |
| `git diff --check` | PASS |
| `test:supabase-local` | **BLOCKED**, exit 2; Docker unavailable |

The initial V4 baseline re-observed V3's 600 Node executions. New tests increased the count naturally; counts were not preserved by deleting coverage. Earlier failing reproductions for target isolation, invitation 429, historical clean replay and the membership race were corrected and rerun. No configured lint/formatter script exists; no silent lint pass is claimed. TOML configuration parsed successfully; workflow YAML was source-reviewed, but an independent YAML parser and hosted Actions were unavailable. The large-chunk build warning remains, with no unrelated bundle rewrite.

## Reports and retained evidence

1. [Infrastructure inventory](v4-infrastructure-inventory.md)
2. [Production readiness / decision matrix](v4-production-readiness.md)
3. [Supabase migration/RLS/concurrency validation](v4-supabase-validation.md)
4. [Auth and Resend validation](v4-auth-email-validation.md)
5. [RevenueCat validation](v4-revenuecat-validation.md)
6. [Android/iOS and device verification](v4-native-verification.md)
7. [Final code candidate security review](v4-security-review.md)
8. [Deployment, operations and rollback runbook](v4-deployment-runbook.md)
9. This release summary.

Machine-readable supporting evidence: [local verification](v4-local-verification.json), [adapter schema diff](v4-schema-diff.json), [native acquisition counts](v4-native-selection-evidence.json). Ephemeral execution logs remain ignored locally. They contain tool/test results, not secret-value exports.

## Required external actions

Supabase administrator: authorize isolated staging; inspect Auth hook/Google/redirect/rate/session settings, actual migration baseline, Storage/grants and secret presence; run complete platform/JWT/API tests and backup/restore rehearsal. Resend administrator: verify sender domain/DNS/key environment and test delivery only to approved synthetic accounts. RevenueCat/store administrator: verify key/product/customer/restore/environment routing and complete real sandbox purchases/callbacks. Netlify/GitHub administrator: set context-specific approved targets/public keys, deploy checks/protection, inspect served headers/SPA/cache and rehearse rollback. Android tester: physical camera/gallery/Files, lifecycle and store sandbox. iPhone/macOS operator: Xcode compile/sign/simulator, physical gallery/cloud/HEIC and StoreKit/TestFlight review routing.

Assign a deletion-review operator and approve retention, shared household/last-owner, billing, history/image and confirmation policies before processing requests or promising an SLA. Do not invent automated purge rules. No approval exception exists for blocked critical image, migration, authentication or entitlement gates.
