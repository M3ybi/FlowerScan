# Production cutover evidence

## Verified compatibility release — 2026-11-16

**Status: DEPLOYED, NOT CUT OVER.** Starting revision: `4b89f42132a5a6e941190af57c4b146e84f1a03a`. Current tested/deployed application revision: `18aa79931f210f63a249988c8c7cc9ecadea8470`. All four customer routes remain their original GPT-4o legacy configurations with Luna candidates disabled at 0%. The separate exact-hash owner risk decision is pending. No new branch, staging backend, Terra provider request or customer entitlement change was created.

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

The 11:18:56Z checkpoint contained 218 attempts, $0.66296874 measured and $0.26355 unknown. A normal customer request after the older 217-attempt audit is not attributed to this campaign. Postdeployment comparison found identical full facts for all 218 original attempts, original prices/rules/global controls, and every original row hash across sixteen customer tables. Auth sign-in timestamps were excluded from row comparisons in advance. New test rows are scoped separately.

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
| Current-head application / PostgreSQL / full disposable Supabase CI | PASS | Run 43860689731; jobs 133276398369 / 133276398313 / 133276397850 |
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
| Authenticated exact-hash quality risk acceptance | NOT EXECUTED | Separate user decision pending; spending does not authorize it |
| Real staged canary / final 100% / qualified recovery | NOT EXECUTED | Customer activation remains disabled |
| Physical Android / iOS | NOT EXECUTED | No physical device validation claimed |
| Independent botanical / native-speaker review | NOT EXECUTED | Zero independent reviews; engineering evidence is separately labelled |
| Actual collected-revenue profitability | NOT EXECUTED | Net receipts/tax/fees/refund/infrastructure reconciliation unavailable; projections only |

CI: [current tested revision](https://github.com/M3ybi/FlowerScan/actions/runs/43860689731). The entire workflow is not green because the separate Pages job failed. The initial compatibility Supabase CI failed before SQL checks because its fixture omitted the new owner function; copying the full declared source graph fixed that failure and later full-stack CI passed. Earlier application runs failed the pre-existing Chromium safe-area geometry assertion; the current run passed without changing CSS or assertions. Earlier local stale mocks/receipt/count checks and a historical payload key-order regression were corrected and rerun; failures remain in private logs. npm audit found zero production vulnerabilities; CI still reported three pre-existing moderate development vulnerabilities.

New closed RLS tables add eight informational [no-policy lints](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) deliberately, with no client grants. Four low-volume [unindexed FK notices](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) are retained; unrelated database/Auth settings were not changed. No independent security-scan approval is claimed.

## Campaign and remaining release gates

The one real campaign runs 12:16:44Z–13:16:44Z with an immutable 120-attempt/$4 cap, three synthetic actors/two households, approved image/configuration hashes and one request in flight. At this checkpoint 44 calls/$0.00912220 are measured, zero new unknown and no pending provider work. Exact plan SHA-256 is `0a956fc2fd4348ba1df36556ea129236834cc96810f3f240f730108b00463bad`; factual evidence SHA-256 is `f4be0ded5a094ce82f203f2efc6942f3404a6c5e39b0d7e781110e5821073f9a`. The old $0.26355 remains held. No retry/reset/continuation is allowed.

The owner must separately accept the exact configurations, limitations, initial maximum 5% cohort, twenty explicit route/stage grants and Luna-only rollback conditions. Each stage must consume its real grant and fresh previous-stage measured evidence. Final cutover requires all four at 100%, no new unknown and drained legacy RESERVED/PROCESSING work, then an atomic Luna binding/timestamp barrier. Finish runtime Luna-only restrictions, retire legacy paid evaluator handlers, verify qualified recovery/new actual model rows and cleanup only synthetic fixtures. None of these outcomes may be inferred from local tests or deployment.

Until those gates pass: **Final 100% cutover NOT VERIFIED; final status PARTIAL RELEASE; customer activation DISABLED**.
