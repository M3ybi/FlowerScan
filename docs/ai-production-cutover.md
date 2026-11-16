# Production cutover evidence

## Verified compatibility release — 2026-11-16

**Status: PARTIAL RELEASE, FOUR LUNA CANARIES ACTIVE AT 50%, NOT CUT OVER.** Starting revision: `4b89f42132a5a6e941190af57c4b146e84f1a03a`. Current published application revision: `9b1faf846df521c21e621755409a6a92e766948b`. All four routes select the exact approved Luna none candidate for their 50% cohort and retain GPT-4o outside it. The authenticated exact-hash owner risk acceptance and sixteen stage applications through 50% are verified. No new branch, staging backend, Terra provider request or customer entitlement change was created. Source preparation for the strict final runtime is separate from the deployed compatibility Edge versions below.

Applied migrations: `20261116103419`, `20261116104401`, `20261116105220` (39 → 42 total). The dry run named exactly these three; actual linked push excluded Vault, roles and seeds. Nine affected Edge functions were deployed through the Supabase connector and retrieved sources matched local source graphs after line-ending normalization. A bundled-out type-only module was explicitly accounted for.

| Edge function | Version | JWT verification | Bundle SHA-256 |
|---|---:|---|---|
| plant-care-ai | 23 | true | 900d4534490fafdb0d2882365a7ccbe3675b549ff8deeed206b66cfe995dc34d |
| plant-diagnosis-ai | 25 | true | b20c422460dd21c24ca25725ddd5191fc5a95970187c2b469e63d0a2039c87e6 |
| validate-plant-image | 17 | true | b0498b8ffb21e255b9ea03337136bd06fa6a74947ed13aadf49cf2c3c71ac699 |
| upload-validated-image | 19 | true | a87303c099f3fcb58c6e57eea31aa03aae4addf55f36fb8b0fec71afa334972e |
| vision-token-benchmark | 4 | true | f17bb07541681af82c03986992b4a1792181cf2f279608d40c6ebe6aad34ab58 |
| prompt-evaluation | 4 | true | 46879e5335df9ff74c0f7605d898009db3e4aa8fa7256429735b3de69d882368 |
| model-evaluation | 3 | true | 26d1a9e4ed6fa8ceca92502953f71ee77b20599e3dab9b775194c1d463a76787 |
| ai-owner-control | 1 | true | 9209a4543e25bafbfda82ee9b6dd12a5bb97078c6202b2da7890b43affee1336 |
| revenuecat-webhook | 14 | false, preserved | 99bd72444c74b1f006ea491944125528a48e16ab2ffccfd7a02b7437e868d0cf |

All thirteen function versions/status/JWT/bundle metadata were read back. Four unrelated functions retain exact prior versions and bundles: send-test-email 10, send-household-invite-email 14, send-auth-email 6, delete-account-request 3. All seventeen secret digests, including existing model, billing and signing configuration, remain unchanged. Both Storage buckets remain private, JPEG-only, 2MiB. No secret values are published.

## Recovery and preservation

Fresh predeployment logical archive captured 2026-11-16T11:57:35Z: 920,152 plaintext / 920,374 encrypted bytes, SHA-256 `dbb8606c437e2d49ffc851019833f9741c9a902edade840bf7c115be4cd2e02d`. TLS used verify-full, original hostname and the vendor CA. DPAPI CurrentUser encryption, restricted ACL, roundtrip/catalog/full parse and independent on-disk decrypt/full parse passed. No restore was performed. The archive contains public/Auth/Storage metadata/Vault/migrations/private AI, not Storage object bytes or managed signing keys.

The 11:18:56Z checkpoint contained 218 attempts, $0.66296874 measured and $0.26355 unknown. A normal customer request after the older 217-attempt audit is not attributed to this campaign. Postdeployment and post-cleanup comparisons found identical full facts for all 218 original attempts, original prices/rules/global controls, and every original row hash across sixteen customer tables. Auth sign-in timestamps were excluded from row comparisons in advance. New test rows are scoped separately.

A fresh pre-cutover logical archive was captured at 2026-11-16T13:29:09.542Z: 1,043,286 plaintext / 1,043,510 encrypted bytes, SHA-256 `185736b2558b716bdc4b89118966390778af11df800b9323bda40b959e12621b`. TLS verify-full/vendor CA, DPAPI/restricted ACL, catalog/full parse and independent disk decrypt/hash/full parse passed. Scope and restore limitations remain those described above; no production restore occurred.

## Executed verification

| Verification | Result | Evidence / limitation |
|---|---|---|
| npm run check | PASS | Executed typecheck, registered test runner and production build |
| npm run test:edge-images | PASS | Existing image/adapter/security contracts; targeted 44-test run |
| Chromium / WebKit image processing | PASS | 282 actual checks per engine |
| Client-secret scan / source graph / Deno Edge types | PASS | Executed, including new owner endpoint |
| AI / vision / prompt / model / diagnostics PostgreSQL | PASS | Real disposable sessions; external provider/platform fixtures |
| Model PostgreSQL | PASS | 100 sessions, 117 assertions |
| Luna owner/rollout PostgreSQL | PASS | 167 assertions, twenty synthetic staged operations, replay/drain/cutover/recovery/revoke/unknown preservation |
| Clean/upgrade migration replay | PASS | 42 migrations, 12 SQL fixtures and eight branches, zero schema difference |
| Contribution calculator | PASS | Deterministic 56-scenario tests; 840 numerical projections with measured safety inputs |
| Application Chromium / WebKit | PASS | 15 checks per engine |
| Mobile navigation Chromium / WebKit | PASS | 24 checks per engine; original assertions unchanged |
| Published-head application / PostgreSQL / full disposable Supabase CI | PASS | 9b1faf8 run 43868659295; jobs 133303687355 / 133303687395 / 133303687044 |
| Separate Pages packaging | FAIL | Existing RELEASE_DATABASE_CONFIGURATION_REQUIRED; deployment skipped |
| Active Netlify host | PASS | Published commit, ready state, clean production manifest and asset SHA match current tested revision; web_sandbox billing unchanged |
| Production owner access / campaign approval | PASS | Real pre-existing signed-in owner, private allowlist; exact proposal approved at 12:14:52Z; Auth record read back |
| Paid Luna safety comparison | PASS | 44 measured attempts, $0.00912220, no new unknown; both efforts match 5 allowed / 17 rejected labels |
| Ordinary-user owner data/actions denied | PASS | 401 unauthenticated; 403 non-owner FinOps and acceptance; direct authenticated owner RPC denied |
| Cross-household generation denied | PASS | 403, no added provider attempts |
| Corrupted JPEG production rejection | PASS | 400 before provider |
| Oversized JPEG local/CI rejection | PASS | Bounded parser/decoded-byte/request-body tests executed |
| Oversized JPEG production HTTP assertion | FAIL | Caller transport timed out, including 60s recheck; no application response recovered, no new provider attempt; preserve this limitation |
| Original data / financial facts / secrets / buckets / unrelated functions | PASS | Exact scoped comparisons described above |
| Security advisor delta | PASS | No new WARN/ERROR: original 4 search-path, 8 anon-definer, 41 authenticated-definer and 1 leaked-password warnings remain |
| Performance advisor delta | PASS | Original 16 RLS-initplan warnings unchanged; informational unindexed FKs 26→30, unused indexes 21→20 |
| Authenticated exact-hash quality risk acceptance | PASS | Actual owner session at 13:09:29Z; exact evidence/configurations, twenty conditional stage grants; acceptance b36509a7-ca4f-4a69-a3b0-8fcb69550fd0 |
| Real staged canaries through 50% | PASS | Four routes × stages 5/10/25/50; sixteen measured ordinary successes and exact grant/version bindings |
| Production save / private image / Viewer persistence | PASS | Add/save and diagnosis save at 5/10; four private JPEG hashes matched, Premium Viewer read and unrelated Free denial; validation reuse added zero inference |
| Production signed receipt issuance | NOT EXECUTED | Optional signing receipt absent; server-side authorized validation reuse passed; signed-receipt fault tests passed locally |
| New Luna Free allowance regression | NOT EXECUTED | Disposable/CI quota tests passed; remaining bounded production check requires authorized completion spend |
| Final 100% / post-cutover smoke / qualified recovery | NOT EXECUTED | Original campaign expired before these stages; four approved 100% grants remain unapplied |
| Final runtime candidate local checks | PASS | Exact frozen patch: full npm check, Edge types, sixteen Luna tests including forty configuration/locale payload comparisons, PostgreSQL model 100 sessions/117 assertions and Luna 167 assertions |
| Final runtime candidate initial CI | FAIL | 3780791 run 43877278358: disposable Supabase passed; PostgreSQL accounting fixture loaded the strict adapter while expecting legacy GPT-4o, so no provider call started |
| Historical PostgreSQL fixture correction | PASS | Explicitly pinned original accounting/diagnostics adapters to immutable 18aa799; AI/vision/prompt/model/Luna/diagnostics PostgreSQL reruns passed, including 100-session regressions; current Luna runtime remains tested separately |
| Corrected final runtime current-revision CI / deployment | NOT EXECUTED | Awaiting the corrected revision's CI; source is not the current production Edge runtime; strict deployment must follow 100% cutover gates |
| Physical Android / iOS | NOT EXECUTED | No physical device validation claimed |
| Independent botanical / native-speaker review | NOT EXECUTED | Zero independent reviews; engineering evidence is separately labelled |
| Actual collected-revenue profitability | NOT EXECUTED | Net receipts/tax/fees/refund/infrastructure reconciliation unavailable; projections only |

CI: [published tested revision](https://github.com/M3ybi/FlowerScan/actions/runs/43868659295). The entire workflow is not green because the separate Pages job failed. The initial compatibility Supabase CI failed before SQL checks because its fixture omitted the new owner function; copying the full declared source graph fixed that failure and later full-stack CI passed. Earlier application runs failed the pre-existing Chromium safe-area geometry assertion; the current run passed without changing CSS or assertions. Earlier local stale mocks/receipt/count checks and a historical payload key-order regression were corrected and rerun; failures remain in private logs. npm audit found zero production vulnerabilities; CI still reported three pre-existing moderate development vulnerabilities.

New closed RLS tables add eight informational [no-policy lints](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) deliberately, with no client grants. Four low-volume [unindexed FK notices](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) are retained; unrelated database/Auth settings were not changed. No independent security-scan approval is claimed.

## Campaign and remaining release gates

The original campaign ran 12:16:44Z–13:16:44Z with an immutable 120-attempt/$4 cap, three synthetic actors/two households, approved image/configuration hashes and one request in flight. It expired and was closed at 13:18:52Z with **60 calls/$0.013320275 measured, zero new unknown and zero pending**. Exact plan SHA-256 is `0a956fc2fd4348ba1df36556ea129236834cc96810f3f240f730108b00463bad`; factual evidence SHA-256 is `f4be0ded5a094ce82f203f2efc6942f3404a6c5e39b0d7e781110e5821073f9a`. The old $0.26355 remains held. All three synthetic Auth accounts/sessions, two households and four private objects were removed, with readback zero and all sixty money facts retained. No retry/reset/reopening is allowed.

The authenticated owner separately accepted the exact configurations, limitations, initial maximum 5% cohort, twenty explicit route/stage grants and Luna-only rollback conditions at 13:09:29Z. Sixteen grants through 50% consumed fresh previous-stage measured evidence. Final cutover still requires all four at 100%, no new unknown and drained legacy RESERVED/PROCESSING work, then an atomic Luna binding/timestamp barrier. Finish strict runtime deployment, retired legacy evaluators and qualified recovery/new actual model rows. None of these outcomes may be inferred from local tests or deployment.

A proposed completion exception is registered at SHA-256 `07dbe8ac89339a061375cd00c2d7b9ff6958e5d44961dd3d386ea93e34c3462b`: at most 24 attempts/$1/30 minutes, one in flight, three fresh synthetic identities/two households with cleanup. Combined maximum with the closed campaign is 84 attempts/$1.013320275. It is **not authorization**; new explicit exception consent and a real owner-session spending approval remain pending. No completion run, identities or paid calls exist at this checkpoint.

Additional engineering assessment found six of eight stage care names disagreeing with publisher crop labels: Apple healthy, Apple scab and Tomato spider-mite references, two outputs each. Two full-plant Ficus outputs matched. Four diagnoses used uncertainty; treatment correctness, native-language semantics and botanical non-inferiority remain unreviewed. These findings are not hidden by structured-output success or the owner's accepted unreviewed state.

Until remaining gates pass: **Final 100% cutover NOT VERIFIED; final status PARTIAL RELEASE; customer canaries ACTIVE AT 50%**.
