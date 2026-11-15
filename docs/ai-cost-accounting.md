# AI token and cost accounting

The authoritative ledger is `ai_private.attempts`, joined to `ai_private.operations`. The historical client-insertable `public.ai_requests` table is not a financial source. Every active OpenAI invocation goes through `_shared/aiOperation.ts`. Legacy Netlify inference handlers permanently return 410, even if the unrelated legacy data backend is enabled.

## Recorded facts

Operations record the verified actor/household/plant or pending creation, type, idempotency identity, fingerprint, image hash/dimensions/detail, requested model, prompt/schema version, price version, timestamps, lease, attempt count, quota reservation, final state/outcome and an optional short-lived result. Attempts record their operation/attempt number, requested/returned model, returned service tier, provider request/response IDs, start/completion/latency, HTTP/provider status, failure category, input/cached/output/reasoning/total tokens, accounting status, exact USD cost and conservative reserved exposure.

Actor/household details live in the operation relation. Deleting synthetic or real accounts/households does not fabricate zero historical spend: identifying foreign keys are cleared while necessary financial records remain for the defined retention period. Client roles cannot read or mutate the private schema or execute accounting RPCs. Service callers can use the reviewed mutation functions; direct table writes are not granted. Privileged operators remain responsible for safe access and recovery.

## Versioned pricing

Registry version **`openai-standard-2026-11-15`** was verified on 2026-11-15 against the [official GPT-4o documentation](https://developers.openai.com/api/docs/models/gpt-4o). Its internal effective date records this verification, not an asserted historical provider price-change date. Registered standard-tier identities are `gpt-4o`, `gpt-4o-2024-08-06` and `gpt-4o-2024-11-20`: input $2.50, cached input $1.25, output $10 per million tokens. The requested model remains the existing `OPENAI_MODEL=gpt-4o`.

Requests explicitly select `service_tier=default`; returned tier/model must match the pinned registry to obtain a measured price. Unknown models/tiers do not inherit guessed prices. New pricing requires a new version, retaining previous versions for in-flight/historical attempts. No future model receives traffic through this registry alone.

Calculation is PostgreSQL `numeric(24,12)`, never JavaScript floating-point money:

```text
cost_usd = ((input_tokens - cached_input_tokens) * input_rate
          + cached_input_tokens * cached_rate
          + output_tokens * output_rate) / 1,000,000
```

Cached input is a subset of input; reasoning tokens are a subset of output and are not added again. See the [Responses usage fields](https://developers.openai.com/api/reference/resources/responses/methods/create) and [reasoning billing guidance](https://developers.openai.com/api/docs/guides/reasoning). Provider-reported image input tokens are already included in input; image bytes/dimensions are not used to infer consumed tokens or an invoice. Nonzero cache-write usage is unpriced until an applicable policy is reviewed.

## Unknown and unsuccessful attempts

`IN_FLIGHT` is persisted before provider HTTP work. `MEASURED` requires valid input/cached/output/total counts and registered model/tier. A reported zero is a legitimate measured zero; missing/malformed usage is `UNKNOWN_USAGE` with null cost. Valid counts with no applicable price are `UNKNOWN_PRICING`, also null cost. Missing reasoning details stay null rather than inventing a measurement. Unsuccessful/incomplete/refused provider responses retain any reported usage even when no customer result succeeds.

Timeouts, transport loss, response parsing/size failures and failed persistence can leave unknown spend. They retain conservative exposure in global admission. `ai_reconcile_attempt` accepts trusted verified provider facts and recalculates from the attempt's original price version, without committing customer usage or turning a lost result into success. Measured attempts cannot be charged again by repeated settlement. A financially reconciled unknown operation can expire and permit a new explicit, independently admitted request. Never submit a frontend-supplied price, fabricate old usage, or clear exposure solely because a timer elapsed.

No provider request body, output body, image, raw provider error, API credential or signed storage URL belongs in attempt facts/logs. `store:false` avoids adding provider response storage for this workflow; reconciliation may therefore require provider usage/cost exports or support rather than later response retrieval. Account-specific provider retention controls and invoices remain separate operational responsibilities.

## Validation and reporting

`npm run test:ai-accounting` checks real bundled Edge behavior with external boundaries substituted. `npm run test:ai-postgres` requires a disposable loopback PostgreSQL administrator URL and 150 available server connections; it checks exact pricing, zero/missing usage, cached/reasoning semantics, version changes, concurrent settlement, 100-scan aggregation, roles and actual Edge handlers across 100 independent sessions. Migration tests cover clean replay and upgrades from the earlier V4 and current 34-migration baselines. SQL fixtures also check the actual local Supabase privileges when that stack is available.

Report measured/unknown attempts separately. Aggregate latency from attempt timestamps and whole-operation timestamps separately; exclude cached replay from provider-call counts. USD is the accounting currency. Subscription targets in EUR need an explicit FX and revenue/cost policy before comparisons. Small synthetic smoke samples cannot establish representative subscriber-month margins or diagnose model quality. Actual release evidence is in [the production report](ai-step2-production-release.md).
