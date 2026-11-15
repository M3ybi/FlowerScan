# AI operation lifecycle

Step 2 keeps `gpt-4o` and the existing response contracts. All provider work must pass service-only PostgreSQL admission before inference. Database locks cover short transactions, never provider HTTP requests.

## States and transaction boundaries

Authorization, creation and reservation commit together as `RESERVED`. `ai_start_attempt` atomically creates an attempt and transitions to `PROCESSING` before HTTP inference. The normal path ends at `COMPLETED`. `FAILED` means no customer success; `UNKNOWN` means an attempt might have incurred cost or its result cannot be recovered. `EXPIRED` releases an operation identity for a later separately admitted operation. `final_outcome` distinguishes success, safety rejection, failure and uncertainty. Expiration never erases financial exposure.

All lifecycle RPCs are service-only SECURITY DEFINER routines with fixed search paths. `ai_private` tables have RLS and no client schema access. The Edge verifies the JWT through Auth, then supplies that verified actor to SQL. SQL rechecks actual membership before claim, start and successful settlement. Plant authorization and current entitlement are checked before inference. Clients cannot choose actors, dollar amounts, leases or provider attempts.

One singleton control row serializes short admission/settlement transactions across Edge instances. Household locks protect existing usage accounting. No lock spans a provider request. Maintenance skips independently locked households/rows, avoiding an inverted lock order with existing plant transactions. Independent sessions, rather than process memory, enforce concurrency and Free care uniqueness.

The active policy permits **one provider attempt per operation** with no automatic inference retry. Attempt numbers and independent attempt records keep the financial schema ready for a separately reviewed future retry policy; increasing a configuration value does not introduce model routing or automatic retries. A settlement RPC can be repeated safely without another provider call.

## Identity and compatibility

The shared Edge adapter hashes normalized model input, image SHA-256, model, schema/prompt version and, for manual refresh, the UTC day. SQL binds that fingerprint to actor, household scope and operation type. Optional `operationKey` values are bounded and fingerprint-bound. Existing clients omit them and receive a server-derived `legacy:<fingerprint>` identity. Changing a key cannot evade content deduplication. A mismatched reused key is rejected.

Existing endpoints, JWT settings, `{ care }`, `{ diagnosis }`, validation/upload shapes, image limits and storage paths remain usable. Generation source may be omitted by old clients; only explicit `initial_plant_add` and `manual_refresh` values are accepted when supplied. Null, unknown and malformed sources are rejected. Generated output schemas and selected-language instructions are unchanged; new operation errors are localized for all five supported languages.

Replays reauthorize the actor/household and return the stored completed result before financial/rate admission. A processing duplicate receives 409 and can retry the same request; it does not start another inference. A failed attempt is held briefly (30 seconds) before another operation can be admitted. Unknown attempts retain their financial exposure and have an explicit uncertain result; verified reconciliation or expiry permits a later new operation, without repeating the original attempt.

## Initial plants

Initial identification and care are one existing provider call and one operation. Every fresh call reserves a server-generated pending plant UUID. At most **three unpersisted pending generations per household** are allowed for 24 hours; this is a recoverable draft-capacity protection, not a Premium monthly scan quota. Free admission also reserves against the remaining ten-plant capacity. Saving remains subject to the existing plant-limit trigger.

Plant upload records a trusted, short-lived image-hash/path binding. A new after-insert plant trigger links one matching completed initial operation to the persisted plant, freeing draft capacity. This works for existing clients without requiring an operation ID in their persistence payload. An unsuccessful save leaves the completed result available for retry. Initial generation never reserves the monthly unwell allowance. A reused completed profile can serve another authorized creation without another provider call; actual persistence still enforces the Free plant cap.

## Care and diagnosis quotas

Free manual care acquires a unique `(household, plant, UTC reservation day)` slot before inference. Existing successful refresh logs are checked too. Competing fresh operations cannot all pass. Success records usage once at the reserved UTC day, including a preview the user discards. Cross-midnight operations remain bound to their reservation day; monthly diagnosis remains bound to its existing 05:00 UTC monthly reservation period. Premium retains no customer scan/day counter limit and remains subject to temporary concurrency/rate controls.

Free diagnosis uses the existing household counter/reservation tables in the same transaction as operation admission. Success commits once through the trusted settlement function. Failure, uncertainty or an expired worker releases customer reservation capacity; provider financial exposure is separate. Successful generation consumes allowance even when its result is not saved, as before.

## Safety, leases and retention

Selection and upload-time fallback both use the adapter. Exact, recent safety results can be reused server-side across selection/upload, after upload authorization, even when the optional receipt signing secret is absent. Signed receipt compatibility and fail-closed safety decisions remain. Upload capacity is checked before fallback safety inference.

Worker leases last 90 seconds. Provider deadlines remain 15 seconds for safety and 30 seconds for care/diagnosis; each database RPC has a ten-second client deadline. A lost response to a database claim/start is not proof that nothing committed. No provider call begins without a confirmed attempt row. If accounting settlement cannot be confirmed, the endpoint returns a safe failure and the persisted attempt eventually becomes financially unknown. Client cancellation cannot promise cancellation of already-started provider work.

Completed safety results live five minutes, diagnosis results fifteen minutes, and care results 24 hours. Image bindings live at most two days. Completed financial records/tombstones are retained for 90 days; unresolved financial exposure is retained until reviewed reconciliation. `ai_maintain_operations` provides service-only cleanup and is also invoked through admission reconciliation. An operator should schedule maintenance independently for idle installations. No photos, prompts, user notes or credentials are placed in attempt facts. Generated recoverable responses are separate private, short-lived operation data.

Production smoke tests are authorized to create temporary synthetic accounts, including a test-only Premium grant and cleanup. Existing customer entitlements and billing configuration remain outside scope.

The pre-existing care UI's diagnosis-allowance gate is unchanged in Step 2; changing that product behavior requires a separate decision. No Luna/Terra routing is enabled.
