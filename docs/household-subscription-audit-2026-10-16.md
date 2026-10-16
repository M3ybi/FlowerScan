# Household, plant creation and subscription audit — 2026-10-16

## Outcome and limits

Repository fixes are implemented and tested. The new migrations were executed against the linked Supabase project inside BEGIN/ROLLBACK with synthetic accounts and households. They have **not been permanently applied**, and the changed Edge Functions, web bundle and Android app have **not been released**. Existing production household records were not changed.

The exact historical reason that `majercakovalenka01@gmail.com` failed while `fedorcor28@gmail.com` succeeded cannot be established from the available evidence. No failing request, browser trace, device session or historical Edge request log was supplied. Do not describe the account-specific incident as resolved until its original flow succeeds after rollout.

## Account and deployed database findings

Read-only queries against Authentication, profiles, memberships, households, subscriptions and policies established:

| Check | Both affected accounts / Petzvalova |
| --- | --- |
| Authentication | Both accounts exist and have confirmed email addresses |
| Profiles | Both profiles exist |
| Household mapping | Both belong to the same Petzvalova household |
| Membership | Both currently have active Owner memberships |
| Effective Premium | Enabled by the existing indefinite `manual_admin_grant` |
| Provider subscription | No household provider subscription row was present |
| Plant policies | SELECT uses active membership; INSERT/UPDATE/DELETE use `can_manage_household_content` |
| Image upload authorization | The deployed upload source calls `can_manage_household_content` |
| RLS | Enabled on all inspected public application tables |
| Image buckets | Private, JPEG only, 8 MiB bucket maximum |
| Free monthly analysis limit | Deployed plan and repository both allowed 10, rather than the requested 5 |
| Monthly reset | Deployed database timezone and quota boundary use UTC, first day at 05:00 |

Current authorization therefore does not explain a difference between these two users. Historical migrations previously used owner-only content permissions. Migration `20261005200000` already changed those policies and separately promoted the affected member through `special_coowner_user_id`. That historical promotion is **not a new fix in this patch**. Existing administrative assignments were preserved; no new email exception, Premium grant or ownership promotion was introduced. Synthetic Viewer tests prove plant access without billing authority.

The deployed database also contained a quota helper and function revisions absent from the recorded local migration sources. The new migration versions the canonical helper and its callers so that replay and deployment agree.

## Confirmed defects and implemented corrections

| Defect and precise path | Correction |
| --- | --- |
| `App.tsx`: `addFlower` discarded the false result from `writeSupabaseFirst`; `handleAddCustomFlower` could then close the dialog and report success | Creation now propagates failure, updates the authorized household list only after a committed write, and treats a later refresh failure separately |
| Post-create care-generation bookkeeping could throw after a successful plant insert and make the user retry a committed operation | Moved initial care-generation bookkeeping into the plant-creation transaction |
| `plantieRepository.ts`: parent and child inserts/updates used separate HTTP calls and compensating deletes; child or reload failures could leave partial data or ambiguous results | Invoker-rights transactional RPCs create/update plants and create diagnoses with their children; existing RLS, constraints and quota triggers remain active |
| `supabaseSourceOfTruth.ts`: upload preceded insertion without cleanup on insertion failure | Failed writes check whether the record actually committed before deleting an unreferenced upload; photo replacement uses a fresh object path and preserves the old photo until commit |
| Unsupported embedded images silently became plants without their supplied image | Invalid supplied image payloads fail instead of silently dropping the photo |
| `upload-validated-image`: malformed base64 could throw; PNG/WebP bytes were accepted but stored as JPEG | Bounded, exception-safe parser verifies JPEG signature; the existing capture pipeline converts supported source formats to JPEG |
| Image validation provider outages were reported as content rejection | Upload handler distinguishes temporary validator unavailability from a rejected image |
| Add Plant depended only on asynchronous React state to prevent repeated submissions | A synchronous submission ref closes the duplicate-submission window and resets on household changes |
| Add Plant errors exposed backend text and labeled database/storage failures as AI identification failures | Localized upload and save messages in all five application languages; unconfirmed saves advise checking the list before retrying |
| Free analysis limit was 10 instead of 5 | Canonical server plan/helper and UI product limits now use 5; existing plant and QR limits remain 10 |
| Monthly helper depended on connection/device timezone | Explicit 05:00 UTC period calculation preserves the deployed database boundary across clients and sessions |
| AI commit/release charged the current month instead of the reservation's month | Settlement targets the reservation's original period, including requests crossing a reset |
| Clients could release in-flight server reservations and bypass quota counting | Commit/release require the service role; authenticated clients cannot settle a running request |
| Diagnosis fetch rejection could leave its reservation indefinitely | Provider timeout, failure cleanup, and a two-minute recovery lease for abandoned reservations |
| Free care-tip refresh raised PostgreSQL `42702` because `generation_source` was ambiguous | Qualified the table column; check-and-record now serializes on the household row; day boundaries are explicit UTC |
| RevenueCat webhook parsers ignored `grace_period_expiration_at_ms` | Both primary Supabase and compatibility Netlify handlers use the provider's effective grace end |
| Provider revocation was discarded when its expiration shortened the existing paid period | Accept authoritative refund revocation for the current receipt/period while retaining stale-event and unrelated-receipt protection |
| Same-time callbacks could reactivate a terminal subscription state | Expired/refunded state wins over a nonterminal callback with the same provider timestamp |
| Four image/AI handlers assumed JSON bodies were objects | Null and array bodies now return controlled 400 responses; initial-care provider failure returns 502 with a bounded timeout |

Ordinary cancellation retains Premium through its effective expiration. A support-refund cancellation is classified as revoked only when its provider expiration is at/before its event timestamp. Monthly/yearly PRODUCT_CHANGE remains pending until the provider supplies an effective purchase/renewal; this patch does not invent an immediate plan switch. These distinctions follow [RevenueCat's lifecycle flows](https://www.revenuecat.com/docs/integrations/webhooks/event-flows) and [event fields](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields).

## Files changed

- Frontend and repositories: `src/App.tsx`, `src/lib/plantieRepository.ts`, `src/lib/supabaseSourceOfTruth.ts`, `src/lib/householdPlanRules.ts`, `src/lib/entitlementService.ts`, `src/lib/i18n.ts`.
- Shared validation/lifecycle rules: `src/lib/validatedImageInput.ts`, `src/lib/revenueCatWebhookRules.ts`.
- Edge handlers: `supabase/functions/{upload-validated-image,validate-plant-image,plant-care-ai,plant-diagnosis-ai,revenuecat-webhook}/index.ts`.
- Compatibility webhook: `netlify/functions/revenuecat-webhook.ts`.
- Migrations: `20261016120000_plant_creation_and_quota_integrity.sql`, `20261016123000_provider_revocation_ordering.sql`.
- Tests: `tests/{supabase-source-of-truth,image-upload-validation,household-plan,product-redesign,revenuecat-webhook}.test.ts`, `tests/edge-image-diagnosis.test.mjs`, `supabase/tests/{plant_creation_and_quota_integrity,provider_revocation_ordering}.sql`.
- Execution and diagnostics: `package.json`, `scripts/run-tests.mjs`, `scripts/test-database-audit.mjs`, `supabase/diagnostics/household_subscription_audit.sql`, this report.

No dependency or lockfile changes are required. Applied historical migrations were not rewritten.

## Validation

The final verification results are recorded below; these are distinct from a live end-to-end purchase or device test.

- `npm run check`: passed TypeScript checks, 534 automated test executions across 38 test scripts, and the production Vite build. The runner includes some repeated billing/webhook coverage.
- `npm run test:database-audit`: five SQL fixtures against the linked database, with both new migrations and all synthetic data rolled back. Covers member/owner CRUD, no-image database creation, transactional plant/diagnosis children, cross-household isolation, Storage read/insert policies, five outstanding reservations, Premium bypass, trusted settlement, reset boundaries, stale leases, daily care tips, billing identity isolation, duplicate/stale events, cancellation/expiry/refund, and invitations/history.
- `npm run test:edge-images`: actual handler code bundled and executed with authentication, provider and storage boundaries mocked. Covers malformed input, member/outsider authorization, upload/AI failures, trusted quota settlement and primary-webhook grace/refund handling.
- Final Capacitor Android sync and `:app:assembleDebug` compilation succeeded using Android Studio's bundled JDK. The initial attempt used an existing Java 8 `JAVA_HOME` and failed; changing the environment for the build process resolved it without repository configuration changes.
- `git diff --check`: no whitespace errors.

Regression evidence: the five-analysis test failed with `10 !== 5` before its fix; the refund SQL fixture failed against the deployed function with “Provider revocation shortening a paid period was ignored”; the Free care-tip fixture exposed the deployed `generation_source` ambiguity. Each passed with the new implementation. A new malformed-body handler test also reproduced and then closed a null dereference.

Not executed: actual affected-user browser/Android sessions; real camera/gallery uploads through Storage and OpenAI; real RevenueCat/Play/App Store checkout, restore or refund; simultaneous independent database sessions contending for the same quota. SQL tests exercise outstanding reservations and the locking contract, not a multi-session load test. Storage API deletion is mocked; Supabase prohibits direct SQL deletion of storage metadata, and its protection was not bypassed. No Android device/emulator was attached. Deno is not installed locally; Edge handlers were executed through the test bundler rather than a standalone Deno typecheck.

## Rollout and remaining risks

1. Run `npm run check` and the opt-in `npm run test:database-audit`. The latter contacts the linked project and rolls back its changes; it is intentionally excluded from offline `npm test`.
2. Release the migrations and diagnosis Edge Function together in a short maintenance window. Old diagnosis handlers settle with the user JWT; the new database requires the service role. Deploying only one half temporarily breaks Free diagnosis settlement. Commands: `npx supabase db push --linked`, then `npx supabase functions deploy plant-diagnosis-ai`. No destructive schema migration is involved.
3. Deploy `upload-validated-image`, `validate-plant-image`, `plant-care-ai`, and `revenuecat-webhook` with `npx supabase functions deploy <name>`. Preserve the existing webhook's `verify_jwt=false` configuration and configured shared secret. Keep the other functions' authenticated access. New upload paths are fresh; server upsert compatibility remains for older clients.
4. Release the web bundle/Netlify compatibility function and rebuild/release Android. New repository methods require the migrations before the new frontend is served. Build Android with a modern JDK; for this machine, the working process-local `JAVA_HOME` was Android Studio's `jbr` directory.
5. Verify both named users on their actual devices: upload a supported photo, create a plant, confirm it is visible to the other account, edit/delete a synthetic test plant, and confirm shared Premium. Capture the failed operation's status/code if the original symptom remains; do not collect tokens or passwords.
6. Verify RevenueCat dashboard webhook delivery, offering/product/base-plan configuration, restore/transfer policy, and sandbox lifecycle cases. No server-side RevenueCat API credential/dashboard session was available, so permanent webhook loss/reconciliation and actual double-billing behavior remain externally unverified. Provider callbacks remain the backend subscription authority; client SDK claims do not grant Premium.

The inspected local environment files do not set `VITE_REVENUECAT_HOUSEHOLD_NATIVE_BILLING_ENABLED`. Its existing default is false, so native household checkout remains intentionally disabled by `billingService.ts`. Enable it for a release only after confirming store products, customer mapping and restore/transfer behavior in the sandbox. Shared Premium access itself does not require that member checkout switch.

Additional limits: cleanup cannot guarantee removal if a client terminates after uploading or if both write confirmation and cleanup become unreachable. In that uncertain case the implementation preserves potentially referenced files rather than deleting a committed plant's image. Old unreferenced files require a separate reviewed maintenance pass; none were deleted during this audit. Existing indefinite manual Premium grants intentionally override provider expiration and were preserved. Existing special coownership still grants administration because it is a pre-existing persisted role, not because a member manages plants; removing that historical arrangement is a separate access change.

The quota reduction applies to the current month without deleting usage or plants. A Free household already at five analyses becomes blocked until its next period or an upgrade. If the product intends 05:00 Europe/Bratislava instead of the deployed UTC rule, that requires an explicit period migration/accounting decision; it was not silently changed here.

For read-only follow-up, run the statements in `supabase/diagnostics/household_subscription_audit.sql` individually in the Supabase SQL editor. They inspect account mapping, every public/storage policy, constraints, indexes, triggers, function definitions, bucket settings and quota configuration without printing credentials.
