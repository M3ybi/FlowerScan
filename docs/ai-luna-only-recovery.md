# Luna-only recovery and rollback

## Historical compatibility phase

During compatibility deployment, GPT-4o served households outside approved Luna cohorts. This phase has ended. The current service is Luna-only; the following backup history does not authorize restoring legacy inference.

Take and decrypt-verify an encrypted production backup before changes. The preparation backup at 2026-11-16T10:34:19Z was DPAPI CurrentUser encrypted with restricted ACL, 918,941 plaintext bytes and 919,158 encrypted bytes. Evidence SHA-256: `e29da5ed75ec641e69dec4bd72282ac19cafe1e77afda95f6692b20ac1607d34`. It is a logical public/Auth/Storage-metadata/Vault/migration/private-AI recovery archive, not Storage object bytes or managed signing-key recovery. No restore was performed. A fresh predeployment archive was then captured at 2026-11-16T11:57:35Z: 920,152 plaintext / 920,374 encrypted bytes, SHA-256 `dbb8606c437e2d49ffc851019833f9741c9a902edade840bf7c115be4cd2e02d`. PostgreSQL TLS used `verify-full` with the vendor CA and original hostname. DPAPI CurrentUser, restricted ACL, in-memory roundtrip/catalog/full parse and independent disk decrypt/full parse passed. No restore was performed.

## Final cutover barrier

Cutover requires all four routes at explicitly approved 100% with fresh measured Luna evidence, zero new unknown exposure, and no legacy RESERVED/PROCESSING work. The global admission lock serializes cutover with operation admission and provider starts. The transaction commits Luna active bindings and its timestamp together.

After that timestamp, database guards reject new non-Luna operations and provider attempts even through older service RPCs. Historical operations, models, configurations, prices, financial facts and authorized completed replays remain intact. Reverting a runtime bundle cannot authorize a legacy-model charge.

## Supported recovery

1. On outage or unsafe behavior, pause the affected route or revoke its acceptance. Preserve forms, photos, operation identity, existing results and unknown exposure.
2. Do not retry an uncertain paid operation or automatically call a different model. Return the existing controlled temporary-service/retry response.
3. An actual allowlisted owner may explicitly select an accepted, tested Luna none/low configuration through `recover`. Its exact hash must be present in unrevoked evidence; safety additionally requires an eligible safety configuration.
4. The change applies to new operations. Existing operations remain pinned, and accounting settlement can be retried without repeating inference. If no qualified alternative exists, controlled failure remains the recovery policy.
5. Verify the changed route/model/effort and new ledger rows using scoped synthetic smoke within the existing approved campaign, or obtain a new explicitly authorized budget if the single campaign has ended. Never reopen a closed run.

GPT-4o, GPT-4o-mini and Terra are not post-cutover recovery options. Do not restore old route data, reset a campaign, erase unknown exposure or weaken safety/authorization to restore apparent availability. Destructive restore of customer data is not a normal model rollback.

## Actual final recovery proof

**Cutover VERIFIED at 2026-11-16T16:50:51.831557Z**, release b6dd4d1addf5d302420bc9f68ec1bf0361418209; all four active defaults are Luna none. Strict Edge runtime and database barrier both reject new non-Luna starts. Both campaigns are closed; no more paid test or continuation is authorized.

The real authenticated owner selected exact accepted **care_refresh:gpt-6-luna:low:v1** through the existing production UI. A new measured operation succeeded at 16:52:43Z, $0.000371925. A retained none operation replayed through HTTP 200 during low with zero new attempt. The owner restored **care_refresh:gpt-6-luna:none:v1**; a fresh operation succeeded at 16:53:55Z, $0.000322425. A rolled-back service claim subsequently returned REPLAY for the retained low binding without inference. Its HTTP replay variant was not executed. All four final defaults are none; no automatic escalation occurred.

Disposable proof additionally covers all 20 stages, legacy draining, supported low recovery, denied GPT-4o/Terra new work, unknown retention and revocation. Failed/uncertain paid operations do not automatically retry. If no eligible accepted Luna alternative exists, pause/controlled failure remains the recovery policy.

The latest pre-completion logical archive was captured 16:04:53.750Z, encrypted SHA **b4eaed8be5a5ef06013e16d1a884301ed625f5978ac688ba6dcd40cb3bef83aa**, 1,046,675 plaintext / 1,046,902 encrypted bytes. TLS verify-full/vendor CA/original hostname, DPAPI CurrentUser / restricted ACL, independent disk decrypt/hash/full parse passed. Scope excludes Storage bytes and managed signing keys; restore NOT EXECUTED.

After cutover, do not deploy a legacy inference bundle expecting GPT-4o admission, restore pre-cutover route data, erase the barrier, reprice history or delete customer data to appear available. Recover with a compatible Luna-only runtime/configuration or controlled failure while retaining evidence and accounting. Additive migrations remain; a destructive database restore is not a model rollback.
