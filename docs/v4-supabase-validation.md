# V4 Supabase validation

Code candidate: `93992572890033edc00185151fdec308268f38d2`. Git baseline: `4077c2c5c6c3a89fda71328c350157e2374cfe10`. These are source revisions, **not the hosted migration baseline**. Hosted applied versions are UNKNOWN. No `--linked` test, production query or migration was run. In particular, `test:database-audit` remains unsuitable here because it targets a linked project.

## Actual local results

| Workload | Evidence | Result and limits |
| --- | --- | --- |
| Existing admission/monthly-quota/deletion concurrency | `npm run test:postgres`, PostgreSQL 17.10, 16 independent connections, 32 assertions | PASS: exact validation/diagnosis/invitation caps, shared pending-upload cap, duplicate IDs, lock/rollback, deletion uniqueness/private status, free monthly reservation/commit/release/expiry and UTC boundary. Auth/membership/Premium surrounding boundaries are fixtures |
| Complete application SQL replay | `npm run test:postgres-migrations`, 34 migrations, clean and synthetic upgrade DBs | PASS **with platform adapters**. Auth/Storage catalog fixtures; one Vault extension declaration replaced by an explicit plaintext test adapter. No other application SQL is substituted |
| SQL fixtures | Six `supabase/tests/*.sql` fixtures, each inside BEGIN/ROLLBACK, on both databases | PASS: billing binding, subscription history, provider revocation ordering, plant/quota integrity, invitation lifecycle and normalized image-bucket limits |
| Additional release checks | 16 independent sessions, 26 assertions | PASS: seven role cases, collaborative Viewer writes, blocked direct Storage insertion, duplicate subscription callback applied once, latest concurrent event wins, membership revoked while reservation waits |
| Synthetic upgrade | First 30 migrations → synthetic owner/home/plant/image reference → remaining four migrations | PASS: full plant row and image path unchanged; no production data or email |
| Schema diff | [v4-schema-diff.json](v4-schema-diff.json) | Empty difference between clean/upgrade public columns/defaults, constraints, indexes, functions/owners/ACLs, table grants and public/Storage policies. Adapter schema fingerprint retained; not a production schema diff |
| Full Supabase | `npm run test:supabase-local` | BLOCKED, exit 2: no local Docker engine. No PostgREST/Auth/Storage service or Vault encryption acceptance claimed |

The disposable runners reject remote URLs and URL query overrides, create random databases, serialize shared fixture-role setup, preserve existing roles and remove only databases/roles they created. The test server listened on loopback. All test identities are synthetic. The plaintext Vault adapter is deliberately unsuitable for any application deployment and exists only in the runner's generated disposable schema.

## Reproduced defects and remediation

1. Clean replay aborted at `20261005200000_household_content_permissions_and_special_owner.sql` when the designated historical household was absent. The historical migration now skips only complete absence. If a matching household exists but designated accounts/memberships are incomplete, the strict failure remains. An ambiguous match still aborts. The lifecycle fixture now validates any configured special household without requiring production-specific rows on a clean install. A real SQL regression checks the incomplete-household failure after each replay.
2. A real waiting connection passed `reserve_image_upload` authorization before taking the household lock. Another transaction removed the Viewer while it waited; the old function still inserted an intent. `20261019100000_recheck_upload_membership_after_lock.sql` adds a second membership check after serialization. The regression failed before the new migration and passes afterward. Signatures, grants, cap, object naming and existing records are preserved. This establishes reservation-time authorization; HTTP Storage operations are not a distributed transaction with later membership changes.

The historical file change repairs **new replay only**. Do not reapply it, delete migration-history rows, or run migration repair against an existing project. Record the edited historical artifact in the release review. Existing installations receive the new additive migration; confirm their prior history and schema before choosing pending migrations. Restore neither old vulnerable reservation code nor destructive down migrations during rollback.

## Full-stack workflow prepared, not executed

`scripts/test-supabase-local.mjs` requires a local Docker context/engine and unoccupied test ports. It creates a random project in a dedicated temporary directory, copies config/migrations without `.env` or linked `.temp`, removes application seed input and provider credentials, and never uses `--linked`. It starts Supabase, resets only that random local project through the first 30 migrations, inserts synthetic upgrade data, applies pending migrations, runs the six SQL fixtures, then resets through the complete history and compares policies. It also invokes the 16-session release checks on the real platform schema. Cleanup stops only its generated project and removes only its verified temporary directory. CLI status credentials stay in memory and are not printed.

The GitHub verification workflow adds this as a required job. It has not run in hosted Actions here. A newly prepared workflow is not evidence that Docker startup, all service versions, local configuration compatibility or real Vault behavior pass. Run it on an isolated Linux Docker host; do not weaken or skip a failing infrastructure gate. Windows has no Docker/Podman or installed WSL here; the Supabase native runtime's documented platforms do not provide a Windows alternative. See [Supabase local runtime requirements](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes).

## RLS and service acceptance remaining

Local SQL checks explicitly cover anonymous denial, authenticated nonmember, active Owner, active collaborating Viewer, suspended Viewer, removed member and another household's Owner. A Viewer may read/change shared plant content; invitation/member/billing administration remains Owner-only. Server entitlement/event/usage operations retain service-role-only grants. Account deletion requests are self-readable and not client-writable; audit history is private.

Full-stack acceptance must repeat those roles over **actual JWT/PostgREST and Storage APIs**, verify no direct Storage upload, test private authorized reads and cross-household denial, actual bucket MIME/2 MiB enforcement, SECURITY DEFINER ownership/search paths, execute ACLs, and Auth/Vault service boundaries. Repeat concurrent requests while membership/subscriptions change. Inspect orphan/unclaimed objects without deleting them. Metadata-only fixture objects are not stored image files.

## Hosted baseline and migration inventory

An authorized administrator must capture `supabase_migrations.schema_migrations` versions and `pg_catalog` schema/grants, compare against these artifacts, and identify genuinely pending versions. Staging is not configured/authorized, so every staging applied status is BLOCKED; every production applied status is UNKNOWN. No version is assumed pending merely because of Git ancestry.

Risk labels describe review attention, not findings: H = security/billing/targeted existing-data transition; M = additive schema/RPC/policy change. Dependencies refer to earlier ordered migrations and platform schemas unless named otherwise. No V4 migration drops user records or replaces household IDs/image references.

| Migration | Purpose | Dependencies | Risk | Applied in staging | Applied in production |
| --- | --- | --- | --- | --- | --- |
| `20260531203000_plantie_foundation.sql` | Plantie foundation | Supabase Auth + pgcrypto | M | BLOCKED | UNKNOWN |
| `20260531210000_household_creation_rpc.sql` | Household creation rpc | Prior ordered schema | M | BLOCKED | UNKNOWN |
| `20260531213000_subscription_entitlements.sql` | Subscription entitlements | Prior ordered schema | H | BLOCKED | UNKNOWN |
| `20260601093000_storage_image_buckets.sql` | Storage image buckets | Foundation + Storage service | M | BLOCKED | UNKNOWN |
| `20260603103000_household_invite_rpcs.sql` | Household invite rpcs | Prior ordered schema | M | BLOCKED | UNKNOWN |
| `20260610102000_authenticated_table_grants.sql` | Authenticated table grants | Prior ordered schema | H | BLOCKED | UNKNOWN |
| `20260612110000_require_validated_image_uploads.sql` | Require validated image uploads | Prior ordered schema | H | BLOCKED | UNKNOWN |
| `20260615120000_household_premium_usage_limits.sql` | Household premium usage limits | Prior ordered schema | H | BLOCKED | UNKNOWN |
| `20260615133000_regrant_petzvalova_household_premium.sql` | Regrant petzvalova household premium | Prior ordered schema | H | BLOCKED | UNKNOWN |
| `20260615143000_tighten_postgrest_egress_access.sql` | Tighten postgrest egress access | Prior ordered schema | M | BLOCKED | UNKNOWN |
| `20260617103000_remove_invite_expiry_and_viewer_removal.sql` | Remove invite expiry and viewer removal | Prior ordered schema | M | BLOCKED | UNKNOWN |
| `20260617110000_household_name_safety.sql` | Household name safety | Prior ordered schema | M | BLOCKED | UNKNOWN |
| `20260622120000_ai_diagnosis_household_access_fix.sql` | Ai diagnosis household access fix | Prior ordered schema | M | BLOCKED | UNKNOWN |
| `20260623100000_diagnosis_created_by_and_access.sql` | Diagnosis created by and access | Prior ordered schema | M | BLOCKED | UNKNOWN |
| `20260930120000_revenuecat_household_entitlements.sql` | Revenuecat household entitlements | Prior ordered schema | M | BLOCKED | UNKNOWN |
| `20261005120000_household_people_management.sql` | Household people management | Prior ordered schema | M | BLOCKED | UNKNOWN |
| `20261005180000_household_subscription_membership.sql` | Household subscription membership | Prior ordered schema | H | BLOCKED | UNKNOWN |
| `20261005183000_bind_provider_purchase_to_household.sql` | Bind provider purchase to household | Prior ordered schema | H | BLOCKED | UNKNOWN |
| `20261005184500_validate_household_invite_email.sql` | Validate household invite email | Prior ordered schema | M | BLOCKED | UNKNOWN |
| `20261005190000_household_billing_binding_visibility.sql` | Household billing binding visibility | Prior ordered schema | H | BLOCKED | UNKNOWN |
| `20261005200000_household_content_permissions_and_special_owner.sql` | Household content permissions and special owner | Prior ordered schema | H | BLOCKED | UNKNOWN |
| `20261005203000_qualify_household_invite_capacity.sql` | Qualify household invite capacity | Prior ordered schema | M | BLOCKED | UNKNOWN |
| `20261006100000_household_subscription_history_read_grant.sql` | Household subscription history read grant | Prior ordered schema | H | BLOCKED | UNKNOWN |
| `20261006113000_recoverable_household_invites.sql` | Recoverable household invites | Invitation RPCs + Supabase Vault | M | BLOCKED | UNKNOWN |
| `20261007120000_household_invitation_lifecycle.sql` | Household invitation lifecycle | Prior ordered schema | M | BLOCKED | UNKNOWN |
| `20261007123000_household_billing_identity.sql` | Household billing identity | Prior ordered schema | H | BLOCKED | UNKNOWN |
| `20261007150000_household_subscription_history_facts.sql` | Household subscription history facts | Prior ordered schema | H | BLOCKED | UNKNOWN |
| `20261016120000_plant_creation_and_quota_integrity.sql` | Plant creation and quota integrity | Prior ordered schema | H | BLOCKED | UNKNOWN |
| `20261016123000_provider_revocation_ordering.sql` | Provider revocation ordering | Prior ordered schema | H | BLOCKED | UNKNOWN |
| `20261016130000_normalized_image_bucket_limits.sql` | Normalized image bucket limits | Prior ordered schema | M | BLOCKED | UNKNOWN |
| `20261018190000_image_operation_admission.sql` | Image operation admission | Prior ordered schema | H | BLOCKED | UNKNOWN |
| `20261018200000_account_deletion_review.sql` | Account deletion review | Auth + UUID generation | H | BLOCKED | UNKNOWN |
| `20261018201000_complete_request_admission.sql` | Complete request admission | 20261018190000 image admission | H | BLOCKED | UNKNOWN |
| `20261019100000_recheck_upload_membership_after_lock.sql` | Recheck upload membership after lock | 20261018190000 reservation + content helper | H | BLOCKED | UNKNOWN |
