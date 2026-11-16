# Production cutover evidence

## Final production checkpoint — 2026-11-16

**100% Luna cutover VERIFIED; canary DISABLED after completion.** All four unpaused active configurations are Luna none: initial_care/care_refresh/diagnosis v1 and image_safety v2. Candidates NULL, flags false and percentages zero indicate finished rollout; active bindings serve all households. Atomic barrier: **2026-11-16T16:50:51.831557Z**, implementation/release revision **b6dd4d1addf5d302420bc9f68ec1bf0361418209**. Starting main: 4b89f42132a5a6e941190af57c4b146e84f1a03a. Post-barrier GPT-4o/Terra attempts: **0/0**.

The final documentation-head revision, CI and Netlify readback are bound after commit in the private final-verification receipt. No feature branch, staging backend, dependency/lockfile change, unrelated CSS/browser-assertion change or customer entitlement change.

## Migrations and actual Edge deployment

Production 39 → 44 additive versions, all applied through reviewed linked pushes with exact dry runs, pinned CLI 2.119, TLS verify-full/vendor CA and no Vault/role/seed changes:

| Migration | Result / purpose |
|---|---|
| 20261116103419_ai_luna_owner_controls.sql | PASS — private owner authority, immutable evidence/proposals/approvals, distinct unreviewed-risk state, stage grants/cutover metadata |
| 20261116104401_ai_luna_routing_and_safety.sql | PASS — two safety v2 definitions, exact hashes, Luna-only admission, staged rollout/recovery/provider-start guards |
| 20261116105220_ai_luna_finops.sql | PASS — owner-only aggregates, no revenue backfill/entitlement changes |
| 20261116160710_ai_luna_fixture_allowlist_compatibility.sql | PASS — exact ALLOW fixture hash fallback only when imageHashes absent; explicit empty override denies |
| 20261116163736_ai_luna_scoped_cutover_updates.sql | PASS — accepted-route/singleton WHERE predicates, safe-update enforcement retained |

Initial completion registration rejected the approved plan's fixtures[].sha256 format; its whole transaction rolled back with zero run/input/provider effects. The compatibility correction preserved the approved immutable hash/budget and added six independent PostgreSQL allow/deny cases.

Actual PostgREST cutover initially failed SQLSTATE 21000, UPDATE requires a WHERE clause. No barrier committed. Scoped predicates fixed the two updates without changing authorization/evidence/drain/unknown gates or disabling safe-update protection. The same guarded RPC then committed the timestamp above; no admin SQL bypass substituted for it.

Seven strict Edge graphs were deployed after all routes reached 100%, from CI-passed 7cdc2d9 source. Their runtime bytes are identical at b6dd4d1, which adds the scoped SQL migration. Fresh ordinary strict-runtime success was measured before the barrier. After b6's required CI passed, migration 44 / barrier completed and the model secret changed. Secret refresh automatically incremented **all thirteen** function versions; unrelated source bundles/JWT flags remained identical.

| Current Edge function | Version | Verify JWT | Bundle SHA-256 |
|---|---:|---|---|
| plant-care-ai |25|true|00365a3e86224f997d8443b3655dc494b3f418f69944184162e9fc23d7285b97|
| plant-diagnosis-ai |27|true|805d5099333c3d9ece509e948bec83d553e9620be25d7ce3d01e200999eaf51e|
| validate-plant-image |19|true|249d9ec91d11d5992f0d19138afe1fb36a6dbf1087dd78b99bf4fb7c271c3856|
| upload-validated-image |21|true|a805168ffc97da6dd42a67f9f20014016964638fd504407e88b4385b87aa8127|
| model-evaluation |5|true|d73dce833b11f3556557c9691d267557e693a6fbfeed218273a536e1fae10f3c|
| vision-token-benchmark |6|true|595ab15250f736fb4c2f52f9bbdc60c6a2467db9b5a189b3ae8e836b47548cd3|
| prompt-evaluation |6|true|5c0c5b080e7ed9132ff390d72838096f988ae2fee507826dc7eb562d80352219|
| ai-owner-control |2|true|9209a4543e25bafbfda82ee9b6dd12a5bb97078c6202b2da7890b43affee1336|
| revenuecat-webhook |15|false, preserved|99bd72444c74b1f006ea491944125528a48e16ab2ffccfd7a02b7437e868d0cf|

Other current versions/JWT: send-test-email11/true, send-household-invite-email15/true, send-auth-email7/false, delete-account-request4/true. These four plus owner/webhook bundles were unchanged by the strict release; all 13 functions' metadata read back. Seven downloaded source graphs match local source after LF normalization and documented type-only omissions. The two tiny retired bundles relocate their common root supabase/functions→functions; exact prefix normalization corrected an initial parity-tool false failure, and actual authenticated 410 responses passed.

OPENAI_MODEL=gpt-6-luna was digest-verified 16:50:52Z; other 16 secret digests identical. Both buckets remain private/JPEG-only/2MiB. No secret values/customer content published.

## Recovery and preservation

Fresh pre-completion archive **16:04:53.750Z**: 1,046,675 plaintext / 1,046,902 encrypted bytes, encrypted-file SHA-256 **b4eaed8be5a5ef06013e16d1a884301ed625f5978ac688ba6dcd40cb3bef83aa**. TLS verify-full/vendor CA/original hostname, DPAPI CurrentUser / restricted ACL, catalog/full parse, in-memory roundtrip and independent disk decrypt/hash/full parse: **PASS**. Earlier verified archives 11:57:35Z(dbb8606c437e2d49ffc851019833f9741c9a902edade840bf7c115be4cd2e02d) and 13:29:09Z(185736b2558b716bdc4b89118966390778af11df800b9323bda40b959e12621b) retained. Scope public/Auth/Storage metadata/Vault/migrations/private AI; excludes Storage object bytes/managed keys. Restore: **NOT EXECUTED**.

11:18:56Z ledger218 attempts / $0.66296874 measured / $0.26355 unknown. Pre-completion 278 / $0.676289015 includes original campaign 60. **All 278 attempt-fact hashes remained identical**, as did original prices/rules/global controls.

Final checkpoint **302 attempts / $0.689492255 measured / $0.26355 unknown** =278 + completion 23+ one organic care refresh. That real customer request started **16:25:24Z**, before completion registration and cutover, returning the historical GPT-4o snapshot at **$0.0072775**. It was outside all synthetic identities and changed one existing plant plus three tips/five pills. Read-only attribution matched changed hashes/timestamps to that ordinary request. Counts: 24 plants / 129 tips / 215 pills unchanged; the other 13 customer-table hash sets, including entitlements, membership, households and Storage, were identical. Auth sign-in timestamps were excluded in advance. Legitimate updates were preserved; all 16 table hashes are not claimed unchanged.

## Closed campaigns and actual owner authority

| Campaign | Window / authority | Actual result |
|---|---|---|
| Original 623d0c85-b221-4766-8949-ed68495171f6 |12:16:44.808056–13:16:44.808056Z; normal owner approval 12:14:52Z;120 / $4/60m|Closed 13:18:52.246941Z; 60 attempts/$0.013320275; 44 safety + 16 stage proofs;pending 0 / new unknown 0|
| Completion 3d64c379-04ac-4269-b5cc-50f2445ab0b5 |16:25:56.732828–16:55:56.732828Z; user-authorized single exception and normal owner approval 8484076c-4999-4fc5-b1e9-a6ecd07d2231 at 16:03:08.364013Z;24 / $1/30m|Closed **16:55:41.541736Z**, before expiry; 23 attempts/$0.005925740;pending 0 / new unknown 0|

Original plan SHA 0a956fc2fd4348ba1df36556ea129236834cc96810f3f240f730108b00463bad; completion SHA 07dbe8ac89339a061375cd00c2d7b9ff6958e5d44961dd3d386ea93e34c3462b. One in flight and aggregate measured/reserved/unknown controls applied. Combined **83 / $0.019246015**, below authorized combined84 / $1.013320275 and original120 / $4. No reset/reopening/further continuation/Terra/unmetered call.

Both runs have empty actor lists. Each run's3 Auth accounts/sessions,2 households and4 private objects were deleted, zero readback; scoped credential files removed, money retained. A first completion cleanup SQL text syntax error rolled back; corrected exact-identity/nonce-scoped cleanup passed. No customer deletion.

Risk acceptance **b36509a7-ca4f-4a69-a3b0-8fcb69550fd0**, SUPABASE_AUTH_OWNER,13:09:29.149344Z binds all 4 current routes and all 20 applied stage grants. Evidence SHA**f4be0ded5a094ce82f203f2efc6942f3404a6c5e39b0d7e781110e5821073f9a**. Second actual owner acceptance44a07a05-08ee-47aa-a36e-ed51daefe058 at 16:01:52.883386Z has the same evidence/hashes, unused grants and is preserved. No manufactured owner token or independent approval.

## Verification ledger

| Verification | Result | Executed evidence / limitation |
|---|---|---|
| npm run check |PASS|Typecheck, registered suites/build; latest local16:08:16–16:09:55, CI repeats|
| npm run test:edge-images |PASS|44 targeted image/adapter/security checks|
| AI accounting/registry/diagnostics/prompts/vision |PASS|Executed current suites and strict care/diagnosis output checks|
| npm run test:ai-luna |PASS|16 runtime/economics/source-fixture tests;40 configuration/locale payload and logical-identity comparisons|
| Historical accounting/replay |PASS|Legacy fixtures pin 18aa799; current Luna separately tested|
| PostgreSQL concurrency/AI/vision/prompt/model/diagnostics |PASS|Independent disposable sessions;model 100 sessions / 117 assertions;AI 100 sessions / 96 assertions;provider 100 sessions|
| Luna stages/cutover/recovery SQL |PASS|173 assertions, six new format cases, all 20 stages, drain/pinning/unknown/revocation|
| Clean/upgrade migrations |PASS|44 migrations, 12 SQL fixtures, eight branches, zero schema difference|
| Deno Edge types/client-secret/source graph |PASS|Executed including owner/strict runtime|
| Chromium/WebKit image processing |PASS|282 checks per engine|
| Chromium/WebKit application |PASS|15 checks per engine|
| Chromium/WebKit mobile navigation |PASS|24 checks per engine;no assertion/CSS change|
| Auth/menu/QR browser fixtures |PASS|Required application CI steps executed|
| Profitability arithmetic |PASS|56 deterministic scenarios per cost set,840 projections;negative heavy case retained|
| Required implementation-head CI |PASS|b6 run 43909805259;Supabase 133448307578, PostgreSQL 133448308096, application 133448308741|
| Separate Pages packaging |FAIL|133454968223:RELEASE_DATABASE_CONFIGURATION_REQUIRED;deployment skipped|
| Actual Netlify publication |PASS|b6 ready/clean manifest/revision/asset hashes;web_sandbox unchanged;finaldocs-head receipt follows commit|
| Authenticated owner controls/approvals |PASS|Normal existing owner session, exact database spending/risk records|
| Twenty gated stages/atomic barrier |PASS|Actual fresh previous-stage evidence/exact grants;timestamp above|
| Requested/returned model/effort/tier/price |PASS|All 83 metered Luna;completion: 22 none / 1 low / default / exact registered price|
| Fixed safety none/low |PASS|44 responses / $0.00912220; 22/22 labels each; zero new unknown;finite engineering labels|
| Add/identify/care/save;diagnosis/save |PASS|Synthetic ordinary API/persistence, fresh strict-runtime smoke before barrier|
| Refresh/Premium Viewer persistence |PASS|Actual saves/Viewer reads|
| Free daily refresh |PASS|Replay 200 / zero inference; changed second refresh 403|
| Free monthly diagnosis |PASS|Five successes;used 5 / reserved 0 / limit 5; sixth 403 / zero inference|
| Free plant cap |PASS|Existing 10-plant limit reached in test household; next initial 403 / zero inference|
| Private images/upload/auth |PASS|Four completion upload hashes; members/Viewer read, outsider denied; upload reuse zero inference|
| Owner data/actions/service-only RPC |PASS|Unauthenticated 401; non-owner FinOps/accept 403; direct authenticated RPC denied|
| Cross-HH care |PASS|403 / zero provider calls|
| Retired vision/prompt evaluators |PASS|Authenticated 410 / zero provider calls|
| Corrupt JPEG |PASS|Actual 400 before provider|
| Actual 1601px dimension boundary |PASS|400 INVALID_IMAGE unchanged contract;operator's initial 413 assertion was incorrect|
| Size/metadata stripping local+CI |PASS|Parser/byte/request checks;deployed guards byte-identical to 4b89|
| Oversized full-body production HTTP |FAIL|2.95MB invalid body transport timeouts;no app response/provider/storage effect;unresolved availability limitation|
| Production optional signed receipt issuance |NOT EXECUTED|Signing absent;server-cache fallback/reuse PASS;forged/stale/wrong-user/hash/configuration receipt local tests PASS|
| Qualified care low recovery/new operation |PASS|Actual owner UI;new measured low response|
| Restore none/new operation |PASS|Actual owner UI;new measured none response;all 4 defaults none|
| Retained none HTTP replay during low |PASS|200 / zero new attempt|
| Retained low replay after none |PASS|Service claim REPLAY/low binding in rolled-back transaction;HTTP version NOT EXECUTED|
| Safety probe zero-cost replay expectation |FAIL|16:54:06Z probe eight seconds after five-minute expiry;fresh validation$0.00005005included;maxattempts/operation: 1|
| Planned post-barrier initial/diagnosis HTTP replay |NOT EXECUTED|Loop stopped at expired-safety assertion;no more paid tests after closure|
| Post-barrier fresh paid smoke |PASS|Low refresh, restored-none refresh, none safety; other fresh strict-runtime routes just before barrier|
| Timeout/400/429/5xx/unknown/malformed/settlement faults |PASS|Mock/disposable tests;no paid production fault storm|
| Financial facts/prices/controls/entitlements |PASS|All 278 pre-completionfacts exact;organic customer update separately attributed|
| Security advisor delta |PASS|No new WARN/ERROR;existing search-path 4, anon-definer 8, authenticated-definer 41, leaked-password 1|
| Performance advisor delta |PASS|RLS initplan 16 unchanged; final INFO unindexed FK 30 / unused index 20|
| Physical Android/iOS |NOT EXECUTED|No physical device run|
| Independent botanical/treatment/native-language |NOT EXECUTED|Zero independent reviews|
| Actual collected-revenue profitability |NOT EXECUTED|Net receipts/VAT/fees/refunds/infra absent;projections only|
| Production restore exercise |NOT EXECUTED|Archive decrypt/full parse only|

[Implementation CI](https://github.com/M3ybi/FlowerScan/actions/runs/43909805259): required three jobs passed; whole workflow not green because separate Pages packaging failed. Retained earlier failures: incomplete owner source graph in initial Supabase fixture (full graph fixed); G4 accounting fixture loaded strict Luna adapter (historical pin fixed); shallow CI lacked pinned Git object (full history fixed); Chromium safe-area 12px/46px on 7cdc (job 133429500514), one rerun passed without CSS/assertion changes. No skipped tests counted as pass. Audit foundzero production vulnerabilities / three pre-existing moderate development vulnerabilities.

Final RLS no-policy INFO 28 includes 8 deliberately closed private tables with no client grants. No independent security-scan approval claimed. Existing unrelated database/Auth warnings were retained.

## Decision and open limitations

Independent botanical/native-speaker review remains absent. Six of eight selected care IDs disagree with public Apple/Apple-scab/Tomato-spider-mite labels;two full-plant Ficus match. Four cautious diagnoses do not establish treatment safety. Historical Peperomia/tomato disagreement remains. Owner acceptance does not imply botanical non-inferiority.

The full-body HTTP timeout is a retained failed transport assertion, not a claimed pass or demonstrated bypass. Actual dimension rejection, unchanged deployed guards/local+CI byte bounds and zero inference/storage support preserved enforcement. The expired-safety zero-cost assertion is also retained: one new authorized operation under existing expiry semantics, fully metered and within budget, not a second attempt on an operation.

**GO for verified Luna-only production under explicit owner-accepted unreviewed risk.** Supported recovery is manual accepted Luna for new operations or controlled failure. Remaining quality/transport/device/revenue limitations remain open.
