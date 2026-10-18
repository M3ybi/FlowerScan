# Plantie implementation audit - 2026-10-18

## 1. Executive summary

Baseline: `3b80469a6e1344e65145dfac6b63ed0e81dad128`, clean main branch. A detached baseline checkout passed 561 reported Node test executions, type checking and production build. The initial dependency audit reported two critical native-runtime advisories and two high dependency advisories (one high was development-only).

This pass implements image cancellation/resource fixes, secure reuse of image safety results, atomic request admission and bounded pending uploads, resilient local persistence, an authentication race fix, safe route parsing, cleanup diagnostics, targeted dependency remediation, initial feature extraction and continuous verification. Existing visual styling, data, subscription limits, membership semantics and the safety confidence threshold are preserved.

This is not a claim that every possible defect has been found. The exact gallery failures on the reported physical phones were not reproduced. The remaining route/household/diagnosis orchestration in `App.tsx` still needs incremental extraction; the complete feature-oriented architecture requested in the brief is not finished. The security report explicitly retains partial semantic coverage of static dictionaries, some tests, CSS and remaining prose documentation.

No production migrations, function deployments, account changes, purchases, email sends or production data mutations were performed. Commits are local pending coordinated rollout.

## 2. Findings and resolution inventory

| ID | Severity / classification | Root cause and reproduction | Changed boundary | Resolution / coverage | Status |
| --- | --- | --- | --- | --- | --- |
| A01 | High / CONFIRMED | Storage getter/quota exceptions escape React initialization/effects in legacy records, custom plants and App preferences. | `browserStorage`, record/custom hooks, App, household utilities, repository language lookup, `StorageNotice` | Session-memory fallback, localized warning, no overwrite of keys that could not be read. Blocked/quota/recovery tests. | Fixed locally |
| A02 | Medium / CONFIRMED | A pending focus-session read resolves after SIGNED_OUT and restores the old user in React state. New real-hook Chromium scenario failed before the fix. | `useAuth` | Auth-event generation invalidates stale refreshes; queued bootstrap checks its user. Scenario passes after fix. | Fixed locally |
| A03 | Medium / CONFIRMED | Bitmap/HTML/canvas operations can remain pending after cancellation, retaining image work across modal lifetimes. | `imageOperation`, `imageCaptureService` | Bounded 30-second waits; immediate caller cancellation; close late bitmaps and dispose HTML/canvas resources. Deterministic cancellation/timeout and browser lifecycle tests. | Fixed locally |
| A04 | Medium / CONFIRMED | The same photo is AI-validated on selection, again on submit and again on storage upload. | Selection utility, App, shared server safety validator, receipt modules, repository | Remove duplicate submit check; optional five-minute HMAC receipt binds exact bytes/user/upload action. Membership/JPEG checks remain independent. No-receipt clients still receive server validation; invalid supplied receipts fail closed. | Fixed locally |
| A05 | Medium / CONFIRMED security | Initial care and standalone safety endpoints admit repeated paid requests without a consumed request allowance. | Admission migration/helper, validation/upload/care endpoints | Atomic per-user hourly admission: validation 60, upload 40, care 30. These are anti-abuse request limits, independent of subscription usage. Endpoint tests and disposable PostgreSQL tests. | Fixed locally; migration/deploy required |
| A06 | Medium / CONFIRMED security | Fresh arbitrary UUIDs create permanent unclaimed Storage objects without consuming plant limits. | Upload intents/reservation RPC and upload handler | Lock household, count intents plus existing unclaimed objects, cap at 20, preserve retries/referenced paths. Expire only intents without objects. Normalize UUID case consistently before RPC and Storage writes. | Fixed locally; migration/deploy required |
| A07 | Medium / CONFIRMED security | Ordinary authenticated users can trigger operator test mail and disclose provider error details. | `send-test-email` | Disabled by default, operator UUID allowlist, three requests/hour, explicit configured recipient, safe failures. Auth/mail-boundary tests pass. | Fixed locally; deploy required |
| A08 | Medium / CONFIRMED | Cleanup/reconciliation exceptions can replace the original DB failure; cleanup of a replaced image swallowed failures. | `supabaseSourceOfTruth` | Preserve original write failure; retain image if commit state is unknown; emit safe stable cleanup codes without paths or provider messages. Lost-response, denied update, cleanup and reconciliation tests. | Fixed locally |
| A09 | Medium / CONFIRMED | Malformed percent encoding in a plant hash route throws URIError during render. Regression test failed before the fix. | `app/routes` | Return dashboard safely for malformed encoding; preserve normal decoded routes. Regression passes. | Fixed locally |
| A10 | High / CONFIRMED dependency | Installed native Capacitor 8.3.4 is covered by the maintainer's internal-proxy origin advisory; vulnerable busboy/source-map dependencies are locked. Exploitation in this application was not demonstrated. | Package manifest/lock, native package resolution | Targeted compatible updates; full and production-only npm audits now report zero vulnerabilities. Native rebuild required to ship runtime fixes. | Fixed in source/lock |
| A11 | Low / CONFIRMED | Diagnostic persistence logger prints arbitrary exception messages, which may contain submitted data. | `errorDiagnostics`, App | Log only fixed public code and whitelisted error category. Privacy regression excludes private message/name values. | Fixed locally |
| A12 | Low / CONFIRMED | A billing test inherits exported server credentials despite asserting missing configuration. | `billing.test` | Explicitly remove/restore admin configuration and fail any attempted fetch. No provider call is needed. | Fixed locally |
| A13 | Low / CONFIRMED | Plant-card key handler also responds to bubbled keyboard events from nested controls; open-link accessibility label is English. | `PlantGrid` | Respond only when the card owns the key event; use existing localized open-plant label. | Fixed locally |
| A14 | IMPROVEMENT | App mixes Add Plant presentation, grid presentation and creation orchestration. | `features/plants/components`, `features/plants/services/addPlant` | Extract cohesive typed boundaries; creation service checks current household between asynchronous steps, keeps supplied retry identity, refreshes usage only after save. Ten-submission and stale-household tests. | Incremental extraction complete; larger App refactor remains |
| A15 | IMPROVEMENT | Build/deploy workflow does not run the complete regression suite on PRs. | `.github/workflows/verify.yml` | Node 22 clean install, full check, Playwright Chromium/WebKit image checks, auth browser suite and production dependency audit. Workflow source prepared; hosted run not yet executed. | Implemented locally |
| A16 | Low / CONFIRMED | Checked-in Swift package paths use Windows backslashes, which are not portable Swift string paths. | `ios/App/CapApp-SPM/Package.swift`, native config test | Use forward-slash relative paths and resolve Capacitor 8.5.3. A regression checks portable paths and version consistency. Re-sync on macOS before release; Xcode was not run. | Fixed in source |
| R01 | SUSPECTED | Reported physical iOS/Android gallery failure after first success; no original failing photo/device trace supplied. | Image pipeline | Browser tests now run ten save/clear/reopen cycles, including second/tenth HEIC, cancellation and failure recovery. This does not establish the physical phone's root cause. | Device verification outstanding |
| R02 | Medium / CONFIRMED operational gap | Account-deletion endpoint acknowledges a manual review but only logs metadata; no durable request queue/delivery exists. | Existing deletion endpoint/docs | Correct misleading backend documentation. A real review destination, identity verification and anonymous-request abuse policy need an operational decision; no deletion or new public write queue was guessed. | Unresolved |
| R03 | SUSPECTED deployment | RevenueCat event environment/Test Store routing, production redirect allowlists and native restore policy are external configuration. | Existing billing/auth | Source controls and tests reviewed; provider/project configuration not queried or changed. | External verification outstanding |

Reproduction and implementation references above identify the owning files/functions. The generated security report separately records source-line evidence, attacker paths, mitigations and baseline severity for A05-A07.

## 3. Architecture changes

```text
src/features/plants/
  components/AddPlantModal.tsx   existing shared modal/picker presentation
  components/PlantGrid.tsx       dashboard cards and keyboard behavior
  services/addPlant.ts           eligibility -> care -> persistence -> usage
src/lib/
  browserStorage.ts              non-auth session fallback and persistence health
  imageOperation.ts              cancellable bounded decoder/encoder waits
  imageValidationReceipts.ts     at most two session-only safety receipts
  errorDiagnostics.ts           public error categories without raw messages
supabase/functions/_shared/
  plantImageValidation.ts        one safety prompt/schema and shared decision rules
  imageValidationReceipt.ts      HMAC issuance/verification
  imageAdmission.ts             safe admission errors
```

Existing auth, directory, invitation and subscription controllers remain separate. Supabase remains authoritative for authenticated records, household permissions and billing. Legacy caches/data are retained for migration and rollback. No new global state library, runtime dependency, database-column rewrite or API removal was introduced. Existing static tests follow extracted owners; their assertions were retained, and runtime/regression coverage was added.

## 4. Image processing and repeated selection

The previous pipeline already had stream/FileReader recovery, real software HEIC decoding, signature checks, JPEG normalization, resource ownership and shared modals. This audit does not claim to rediscover or newly implement those earlier fixes.

The new defect fixed here is that native browser decode/encode promises did not themselves settle on cancellation. The caller now stops waiting, resources are disposed, and a bitmap arriving late is closed. Native OS picker serialization remains intact because AbortSignal cannot close an OS picker. HEIC workers still terminate on completion, error, abort or timeout. Native/browser failures remain distinct from safety rejection and provider outages.

Original limit remains 15 MiB; processed upload limit remains 2 MiB, JPEG only, longest side at most 1600 px. The preferred target is under 1 MiB without extra quality loss solely to reach that target. Safety probability threshold remains 0.75. No representative labeled safe/unsafe classification corpus was available, so thresholds were not weakened.

On selection, normalize and validate once. With the optional signing secret configured, the server returns a five-minute receipt for that exact photo, authenticated user and upload action. Upload verifies the HMAC and content hash after authenticating membership/JPEG constraints. A missing receipt takes the original server validation path, preserving older clients and operation without the optional secret. Expired/tampered/mismatched receipts return `IMAGE_VALIDATION_REQUIRED` and require selecting the photo again. A frontend string/boolean never authorizes Storage.

## 5. Security and data-integrity changes

The new forward migration creates private admission counters and upload intents, with RLS and no direct public/anonymous/authenticated table access. Authenticated RPCs derive the user from `auth.uid()`. Atomic counter increments bound request bursts; household locking makes outstanding reservations count before external Storage completion. Existing owner/viewer content semantics, plant limits, diagnosis monthly reservations, webhook deduplication/order and service-role restrictions remain in force.

Storage and row creation remain a staged operation. Upload uses a stable retry path; save follows; lost responses trigger readback; confirmed unclaimed uploads are eligible for the existing reference-checked compensation. If readback fails, retain the image and preserve the write error. Cleanup failures are observable through a safe code. The new cap bounds abandoned images without deleting user photos. Old unclaimed objects can exhaust the cap; operators must inspect references and resolve them explicitly. This audit does not introduce an automatic destructive orphan collector.

## 6. Performance and dependency findings

For an ordinary Add Plant request with a current receipt, safety-provider calls fall from three to one: the duplicated submit call is removed and Storage reuses the signed result. Endpoint tests confirm no second provider invocation with a valid receipt. This is a call-count result, not a latency benchmark or billing measurement. No handset memory/CPU benchmark is claimed.

HEIC remains lazy and worker-isolated. PGlite is a development-only test dependency and is absent from production bundles. Large bundle warnings remain; the component extraction alone is not route-level code splitting. See [dependency inventory](dependency-inventory-2026-10-18.md) for every outdated direct package, usage/retention rationale and targeted versions. Both npm audits are clean; unrelated major upgrades were not applied.

## 7. Validation

No lint/formatter configuration exists in this repository; type checking, tests, build, Deno checks and `git diff --check` are used instead. No configured assertion was removed to make a failure pass.

| Verification | Actual result |
| --- | --- |
| `npm ci` | Clean lockfile installation succeeded. |
| Baseline `npm run check` in detached `3b80469` checkout | Passed: 561 reported Node test executions, TypeScript and production build. |
| Final `npm run check` | Passed, exit 0: 581 reported Node test executions, both TypeScript projects and Vite production build. Some scripts repeat tests; this is an execution count, not a distinct-test count. |
| `npm run test:image-browser` | Passed: 275 Chromium checks at a 390 px viewport, real decoding/encoding/HEIC worker and React hook/component behavior. Includes ten save/clear/reopen selections, second/tenth HEIC, blocked-storage editing and nested card keyboard controls. |
| `npm run test:image-webkit` | Passed: the same 275 checks in Windows desktop WebKit. |
| `npm run test:auth-flow-browser` | Passed: 742 real DOM/hook assertions across mobile/desktop scenarios. Supabase/profile boundaries are synthetic. Includes the reproduced stale focus/sign-out race. |
| New admission migration tests | Passed in disposable PGlite PostgreSQL: actual migration execution, 70 queued admissions with 60 accepted, window reset, denied direct table edits, membership checks, 20-pending cap, retry, claims, expired empty intents and preexisting orphan accounting. One database connection; no multi-session claim. |
| New receipt and endpoint tests | Passed: HMAC signature, exact content, user/action/expiry, tampering and key mismatch; current receipt avoids a second provider request; UUID casing uses one canonical namespace; missing receipts retain independent server validation. |
| `deno check --node-modules-dir=none --no-lock` on four changed Edge entrypoints | Passed, exit 0: validation, upload, care and operational mail, including shared dependencies. Corrected shared Error/optional-navigator/narrowing typing for this runtime. |
| Extra TypeScript check of image-selection browser fixture | Passed. |
| `npx cap sync android` and `:app:assembleDebug` | Passed: Gradle reported BUILD SUCCESSFUL, 152 tasks, patched native runtime. Debug APK at `android/app/build/outputs/apk/debug/app-debug.apk`. No connected handset/emulator test. |
| `npx cap sync ios` | Asset/plugin/package synchronization succeeded. Portable package paths corrected afterward; native config regression passes. No Xcode compile/signing on Windows. |
| `npm audit` and `npm audit --omit=dev` | Both passed: zero vulnerabilities reported. |
| `git diff --check` | Passed for the final tree and commit range. |

The storage-hook/card browser tests initially exposed mistakes in the new test fixture's lifetime/import setup; those fixture issues were corrected and both engines rerun successfully. No product assertion was weakened. Reproduction evidence for the auth race and malformed route remains in the targeted regression logs; both fail before their respective fixes and pass afterward.

The Codex Security report covers baseline `3b80469` and records three medium findings. It is separate from local remediation verification and intentionally retains partial coverage. The plugin reported cumulative usage over three thread histories: 45,002,747 input tokens (44,056,320 cached), 135,224 output tokens, 45,137,971 total. These are host-reported cumulative thread measurements, not an isolated measurement of this implementation audit.

## 8. Remaining work and environment limits

- Physical iOS gallery/camera and Android gallery/camera verification, including ten real saves, low-memory conditions, permissions and app foreground/restart behavior. Desktop WebKit is not iOS Safari.
- Xcode compile, signing and iOS distribution require macOS. Android debug compilation does not prove a physical-device flow.
- Real auth emails/OAuth redirects, live AI classification, paid purchases/refunds/restores, deployed RLS/RPC and Storage end-to-end behavior require a controlled integration environment. No live provider call or production security test was performed.
- Full Supabase migration history was reviewed as source, but the new migration was executed against an embedded PostgreSQL compatibility fixture, not a complete local Supabase stack. PGlite has one connection; queued concurrent admissions test actual SQL behavior but do not replace multi-session integration/load testing.
- Complete feature extraction, route splitting, remaining localization/accessibility inconsistencies and large-bundle optimization are still outstanding; no broad speculative rewrite was used to claim completion.
- Durable account-deletion review delivery remains unresolved. Documentation now describes its actual behavior.

## 9. Coordinated deployment and rollback

1. Review/apply `20261018190000_image_operation_admission.sql` in staging, then run full Supabase integration/concurrency tests. It adds tables/RPCs and deletes no stored images or business records. Review the 20-unclaimed-image cap against existing objects before production activation.
2. Optionally set the **server-only** `IMAGE_VALIDATION_SIGNING_SECRET` to a random value of at least 32 characters on both validation/upload functions. Empty leaves the old secure revalidation path. Do not expose a `VITE_*` counterpart. Secret rotation invalidates outstanding five-minute receipts and requires reselection.
3. Deploy `validate-plant-image`, `upload-validated-image`, `plant-care-ai`, and `send-test-email` together with shared files. Deploy the migration first: missing admission RPCs intentionally fail closed with a service error. Keep `ENABLE_TEST_EMAIL=false` normally. An operator test additionally requires `TEST_EMAIL_OPERATOR_IDS`, `RESEND_TEST_EMAIL` and existing mail configuration; it has a three-request/hour allowance.
4. Publish the verified web bundle. Netlify needs no new runtime configuration; frontend build variables remain as before. PR verification is additive and does not alter the existing Pages environment protection rules.
5. Rebuild/distribute native applications to ship patched Capacitor runtimes. A web deployment cannot patch the installed native shell. Re-sync iOS on macOS and verify its package resolution/signing before release; Windows Capacitor synchronization can rewrite Swift package paths with backslashes, which the new config test rejects. RevenueCat product/configuration changes are not required by this patch.
6. Roll back frontend and Edge Functions as a coordinated version if necessary. Retain the additive migration/tables and all user data; reverting functions removes admission enforcement, so treat that as a temporary operator-controlled rollback. No database down migration or destructive cleanup is supplied.

The brief explicitly requires authorization before modifying production services. This pass prepares reviewable local changes and does not push main, apply production SQL or deploy functions.
