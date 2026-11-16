# Luna-only recovery and rollback

## Compatibility phase

Before final cutover the existing GPT-4o service remains active outside explicitly approved Luna cohorts. The new schema/runtime is deployed default-off. If compatibility checks fail, stop and retain the working baseline; do not activate candidates or spend an unapproved campaign.

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

Local proof: disposable tests exercised all twenty stages, legacy draining, all-Luna cutover, authorized Luna low recovery, denied Terra/GPT-4o new operations, retained unknown financial facts and revocation. Compatibility migrations/functions are deployed. Actual authenticated risk acceptance and all sixteen stages through 50% are verified. Production 100% cutover/recovery remains NOT EXECUTED; the original campaign expired and was closed without resetting its window. A completion exception needs separate spending consent and authenticated owner approval. No legacy-model recovery is authorized after a future cutover.

The strict final runtime source is prepared and locally tested, but must not be deployed against the current 50% legacy cohorts. Current-revision CI and the all-Luna database cutover barrier must pass first. A fresh encrypted pre-cutover backup at 13:29:09Z passed independent disk decrypt/hash/full parse; see the cutover record for its exact hash and scope.
