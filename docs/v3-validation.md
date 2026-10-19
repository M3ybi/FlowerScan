# Plantie V3 validation report — 2026-10-19

Baseline `2e8e933` passed 581 reported Node test executions, TypeScript and production build before V3 changes. The final local source passes the following checks. Counts are executed checks, not claims of distinct test cases or exhaustive platform coverage.

| Command / workload | Actual result |
| --- | --- |
| `npm ci` | Passed: 315 packages installed; 316 audited; zero reported vulnerabilities. |
| `npm run check` | Passed: both TypeScript projects, full Node regression suite and Vite production build. **600 reported Node test executions**, zero failed/skipped/canceled. Some scripts repeat webhook tests. |
| `npm run test:image-browser` | Passed: **275 Chromium** real decode/encode/HEIC-worker/React image checks. |
| `npm run test:image-webkit` | Passed: **275 desktop WebKit** image checks. |
| `npm run test:application-browser` | Passed: **11 Chromium** assembled-app workflow groups. |
| `npm run test:application-webkit` | Passed: **11 desktop WebKit** assembled-app workflow groups. |
| `npm run test:auth-flow-browser` | Passed: **742** DOM/hook checks across the fixture's small/mobile/desktop and lifecycle scenarios. The extracted production recovery controller is exercised. |
| `PLANTIE_TEST_POSTGRES_URL=<disposable loopback URL> npm run test:postgres` | Passed: PostgreSQL **17.10**, **32 assertions**, **16 independent sessions**. No linked Supabase project. |
| `npx --yes deno check --node-modules-dir=none --no-lock <all nine Edge entrypoints>` | Passed with Deno **2.9.6**; shared imports included. `npm run check:edge-types` provides the same explicit entrypoint list when Deno is on PATH. |
| `npm run check:source-graph` | Passed: **183 modules, 688 resolved local import edges, zero unresolved local code imports, zero detected runtime/dynamic cycles**. |
| `npm run check:client-secrets` | Passed: **25** emitted text artifacts. Checks private-key material, known server-token prefixes and privileged Supabase JWT roles; permits public SDK/anon/publishable keys. Values are never printed. |
| `npm audit --json`; `npm audit --omit=dev --json` | Both passed with **zero** reported vulnerabilities at execution time. This is the registry's report, not proof that dependencies contain no defects. |
| `npx cap sync android`; Android Studio JBR + `android/gradlew.bat -p android :app:assembleDebug` | Passed; **BUILD SUCCESSFUL**, 152 tasks in the recorded build. Debug build only; no signing/publication/device run. |
| `npx cap sync ios`; portable Swift-path normalization; `npm run test:native-auth` | Sync/configuration and **10** native-auth/config tests passed. No Xcode compile/signing available on Windows. |
| Fixture `tsc --noEmit` using ESNext/Bundler/React JSX and `src/vite-env.d.ts` | New actual-App browser fixture passed. |
| `git diff --check` | Passed. No repository lint/formatter command is configured. New/extracted TypeScript was organized/formatted using the TypeScript language service; unrelated stylesheet/dictionaries were not reformatted. |

## Reproduction and regression evidence

Failures were investigated rather than hidden:

| Defect | Before / reproduction | After |
| --- | --- | --- |
| Diagnosis paid admission | Excess diagnosis request reached provider path instead of returning 429. | Handler rejects before fetch; actual SQL caps under contention. |
| Care/rename/removal save outcome | Failed persistence still cleared the preview/editor/confirmation or navigated. | Failure state remains available for retry; action-hook regressions pass. |
| Ignored abort/deadline | Fake-clock test left caller pending instead of producing TimeoutError. | Caller settles at deadline, with late result observed. |
| Stalled response body | Same regression bundled against previous `backendConfig` did not reject after cancellation. | Cancellation rejects with AbortError while body remains pending. |
| Purchase after unmount | Browser bundling the previous PricingPage counted one checkout after unmount. | Current PricingPage and UpgradeModal both require zero checkout calls. |
| Malformed diagnosis confidence | String confidence was accepted as a successful result. | Strings, null, fractional and out-of-range values reject and release reservation. |
| SDK quota-release builder | Deno reported six `.catch` type errors. Matching the actual SDK PromiseLike boundary produced three failing error-path tests. | Shared awaited cleanup works with that boundary; 20 Edge tests and all nine Deno checks pass. |
| Lazy feature focus | Root effect could run against loading fallback. | Browser holds the actual import, asserts fallback mount, then requires history-panel focus after release. |
| Initial dialog reverse Tab | Initial section focus was not treated as outside eligible fields. | Keyboard Shift+Tab/Tab remains trapped in both engines; Escape restores the keyboard opener and scroll state. |

The first full V3 run found an import-extension compilation issue. Subsequent runs found source-location assertions still reading the old monolith; those were pointed to the actual extracted owners. The auth-browser wiring AST now reads those owners and requires one real recovery-controller call from App. No assertion was removed to conceal a regression. A WebKit focus assertion was corrected to activate the opener through the keyboard, because mouse-click focus differs across engines.

## Database scope

The PostgreSQL runner creates a random database on a disposable loopback server, rejects connection query overrides, and cleans its database plus any fixture roles it created. It preserves pre-existing roles and serializes shared fixture-role setup. It applies the actual image-admission/upload-intent, deletion-review and expanded admission migrations.

The monthly-quota scenarios load the actual counter/reservation table definitions and eight actual integrity functions. Surrounding Auth UID/role, membership and Premium boundaries are fixtures. Tests cover exact hourly caps/reset, two-user upload capacity, same-ID retries, claimed-path capacity, held row lock/rollback, deletion idempotency/audit/self access, five free monthly reservations under contention, one successful duplicate commit, idempotent release, untrusted commit denial, expired leases and the 05:00 UTC month boundary under another session timezone.

This establishes PostgreSQL locking/counter behavior, not a complete deployed Supabase authorization stack. PGlite tests separately execute the new deletion RLS/grants/audit migration. Existing policy and handler tests retain owner/collaborating-viewer/suspended/unrelated/anonymous and billing-event scenarios, but direct full-stack PostgREST/Storage/Auth, concurrent live RevenueCat delivery, and the complete SQL-fixture suite were not executed against a Supabase server. `test:database-audit` targets a linked project and was deliberately not run.

## Browser scope and visual inspection

The assembled fixture mounts actual App, router, feature controllers, image picker and dialogs using offline legacy persistence and synthetic provider boundaries. Its network policy prevents external connections. Ten actual photo selections/additions produce eleven independent stored plants including the seeded record; ten safety and ten care requests are required. Screens fit 320×568, 390×844, 844×390, 768×1024 and 1440×900 without horizontal overflow. Keyboard dialog cycling, delayed lazy feature focus and purchase unmount behavior are asserted. The mobile dashboard screenshot was visually inspected; the established CSS/layout was preserved.

These tests do not establish authenticated Supabase end-to-end writes, real AI correctness, real email delivery, hardware camera/gallery providers, iPhone Safari, software-keyboard behavior, full WCAG compliance or store purchases. Auth tests run real UI/hooks/recovery controller with synthetic provider events; actual signup, recovery email, OAuth and password changes were not sent.

## Independent security review

The immutable baseline scan completed with 345 substantive source reads and two reportable medium findings. Independent current-source reviews covered the extracted frontend/modal/router and backend/receipt/deletion/provider changes. A final narrow review rechecked the corrected purchase epochs, lazy focus, keyboard trap, recovery, SDK cleanup, deadlines and database targeting; it found no supported remaining defect within that scope. This is not a second canonical whole-repository scan of the final commit or a guarantee of absence of vulnerabilities.

Hosted CI, production settings, full Supabase deployment, physical Android/iOS behavior, Xcode, real billing, real email and real AI remain external release checks. No production infrastructure or user data was modified to obtain these results.
