# Privacy-safe provider diagnostics

Step 5.1 extends the existing `runAiOperation` adapter and authoritative attempt ledger. It introduces no alternate provider client, inference retry, model switch, prompt change or customer-facing diagnostic payload.

## Retained evidence

Non-2xx requests retain HTTP status, validated `x-request-id`, an Edge-observed UTC response timestamp, finite internal category, allowlisted provider code/type, canonical parameter identifier, parsing status and usage-presence status. Missing server request IDs remain null. The request's existing random attempt UUID is sent as `X-Client-Request-Id`, supporting correlation without exposing an actor or household identifier. This follows [OpenAI request-debugging guidance](https://developers.openai.com/api/reference/overview).

`aiProviderDiagnostics.ts` defines the explicit code/type/parameter/category allowlists. Unknown identifiers map to `OTHER`; absent identifiers remain null. Recognized indexed image parameters become `input[].content[].image_url` and equivalent finite fields. No arbitrary parameter path is accepted. The response stream remains bounded at128KiB. Oversized, malformed and interrupted reads are distinguishable from parsed errors.

The fixed categories distinguish invalid request, unsupported configuration, authentication, permission, rate limiting, provider internal error, other HTTP failure, timeout, transport failure, invalid result, missing usage, incomplete/cancelled/failed response and refusal. Categories describe observed failure classes, not an inferred historical root cause. [Official error guidance](https://developers.openai.com/api/docs/guides/error-codes) does not establish that an HTTP400 was free or that reasoning caused it.

No provider message, raw error object, prompt, image, user note/name, signed URL, credential or output text enters diagnostic storage or logs. Error-path financial model/tier/response identifiers are constrained, token counts must be nonnegative safe integers, and reasoning identifiers are finite. Unknown/malformed usage is omitted, never fabricated as zero. The existing invalid-image public classification and other response envelopes remain compatible.

## Atomic storage and failure recovery

Migration `20261115195536_ai_provider_error_diagnostics.sql` adds one nullable `provider_diagnostics` JSONB column to the existing private attempts table. No history is backfilled or repriced. A private SQL sanitizer and CHECK constraint enforce the same finite storage shape, stripping unsupported keys. Both new private functions deny direct execution to public, anon, authenticated and service_role.

The public service-only settlement signature is unchanged. It delegates an exact copy of the Step5 model-settlement implementation and stores sanitized diagnostics in the same transaction, only on first settlement. The existing global control lock serializes this decision. Repeated settlement and trusted usage reconciliation retain the original diagnostic record. Original accounting, pricing, quotas, authorization, expiry, leases and unknown-exposure rules remain delegated unchanged.

A bounded sanitized warning is emitted before settlement so a database failure need not erase every correlation field. Accounting may retry twice; inference does not repeat. If both settlement attempts fail, an attempt can remain processing until existing maintenance marks uncertainty; its exposure remains reserved. Logs are supplementary evidence, never a second financial ledger.

## Verification

`npm run test:provider-diagnostics` covers metadata allowlisting, sensitive/malicious messages and identifiers, oversized/non-JSON bodies, missing details/request IDs/usage,401/403/429/500/503, valid usage on unsuccessful responses, timeout/transport failures and settlement failure. It also checks exact preserved SQL, blinded-package escaping/provenance and campaign preflight.

`npm run test:provider-postgres` uses100 independent PostgreSQL sessions and actual bundled Edge handlers: one provider error/attempt under100 callers, concurrent duplicate settlement, immutable first diagnostics, exact verified-usage reconciliation, unknown exposure retention, constraint enforcement and private helper denial. Provider faults are mocked; no paid production fault is induced. See the [release record](ai-step5-recovery-release.md) for executed results and deployment limits.

Rollback restores the captured guarded Edge bundles after evaluations/candidate routes are closed. Retain the nullable column, compatible settlement wrapper, diagnostic/financial history and unknown exposure. Never restore unmetered Netlify inference or invent a no-charge settlement.
