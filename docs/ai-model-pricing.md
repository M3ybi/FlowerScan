# Versioned multi-model pricing

Step5.1 preserves all pricing rows and reservations. The old Luna cost remains null with$0.26355 exposure;organization usage access returned403 and no authoritative correction is available. A proposed$2 campaign cannot admit Terra's$2.6355/$2.643 full-context requests. No count-backed smaller bound,price change or new paid request is introduced. See [recovery evidence](ai-step5-recovery-release.md).

Step 5 retains the three historical `openai-standard-2026-11-15` GPT-4o price rows. The additive registry version `openai-multimodel-2026-11-15` records the requested Luna and Terra aliases. An unknown returned snapshot or service tier remains UNKNOWN_PRICING with null cost and retained exposure; it is not silently assigned its parent's price.

| Standard global API, USD per million tokens | Ordinary input | Cached read | 30m write | 12h write | Output |
|---|---:|---:|---:|---:|---:|
| GPT-4o, historical version |2.50|1.25|Not separately billed|Not separately billed|10.00|
| GPT-6 Luna |0.10|0.01|0.125|0.25|0.50|
| GPT-6.1 Terra |1.00|0.05|1.25|2.50|5.00|

Sources verified 2026-11-15: [GPT-4o](https://developers.openai.com/api/docs/models/gpt-4o), [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra), [Standard pricing](https://developers.openai.com/api/docs/pricing). Registry effective date is this verification date, not an invented provider price-change date. Metadata GETs using a key whose digest matched the deployed provider credential returned200 for all three IDs; image/schema/reasoning compatibility requires actual metered Responses calls.

## Exact settlement

For new models, ordinary input is `input - cached - writes30 - writes12`. Each input token receives one mutually exclusive rate. Multiply that sum by the applicable input multiplier, add output cost, then divide by one million using PostgreSQL numeric arithmetic. Reasoning is already included in output; it is never added again. The [caching guide](https://developers.openai.com/api/docs/guides/prompt-caching) specifies write-lifetime subsets and confirms that cache writes replace ordinary-input billing rather than add a surcharge.

The registry applies2× input/cache rates and1.5× output rates above272000 input tokens for Luna/Terra. The quote helper supports a separately explicit1.10 regional multiplier; current routes use the existing global `api.openai.com` endpoint and default service tier. Regional, Fast, Flex, Batch and tool-based requests cannot be selected by the client or this registry. An invoice and account-level regional settings have not been independently reconciled; token-rate accounting is not invoice verification.

The existing lifecycle implementation is retained as a service-only legacy helper. The public settlement wrapper delegates its authorization, lease, quota, result-retention and reconciliation behavior, then atomically prices new-model facts in the same ledger. Existing measured facts are immutable on retry. New cache-write columns are nullable for historical attempts; no historical counts are reconstructed. Invalid/missing usage, overlapping categories, unknown models and unknown prices retain exposure and null cost.

## Exposure bounds and remaining image-accounting gap

Inputs remain one normalized JPEG, maximum1600 pixels/2MiB, with the existing15MiB HTTP envelope and bounded names/notes/schema. Current [vision documentation](https://developers.openai.com/api/docs/guides/images-vision) does not list a Luna/Terra patch multiplier or sizing rule. GPT-4o's tile formula is not transferred to them. Aggregate provider input usage is billed; no separate image-token count is fabricated.

Until an independently justified smaller bound is available, evaluation reserves the documented1050000-token context ceiling at the maximum applicable30m write/long-context rate plus the full configured output allowance. The server explicitly requests30m TTL. This is a conservative model ceiling, not an observed image-token estimate or a forecast. Ordinary candidate routing also requires a separate bounded-input approval artifact and stays disabled. The existing GPT-4o reservation remains unchanged.

| Configuration | Conservative reservation USD |
|---|---:|
| GPT-4o safety700 |0.3270000|
| GPT-4o care1400 |0.3340000|
| GPT-4o diagnosis2400 |0.3440000|
| Luna care1400 |0.2635500|
| Luna diagnosis2400 |0.2643000|
| Terra care1400 |2.6355000|
| Terra diagnosis2400 |2.6430000|

Reservations include possible reasoning within the output cap. They are admitted atomically before provider work and checked against unchanged global controls and the whole campaign. A provider-reported measured cost exceeding its reservation is retained accurately, stops its campaign and disables the affected candidate route; it is not hidden by clipping cost. Unexpected12h writes can be priced, but are not an authorized request configuration.

No token-count endpoint, unmetered inference client, average-spend reservation or hypothetical identical-token model saving is introduced. A full-context reservation can legitimately stop the campaign before measured spend reaches$4.00. Actual model measurements follow in [the benchmark](ai-model-benchmark.md).

## Production settlement evidence

The38th migration was applied and all five price rows/two new rule rows were verified. All59 pre-existing attempt facts, three historical price rows, control values and unaffected financial functions matched their checkpoints. The three preserved legacy function bodies matched actual production with CRLF/LF normalized.

The combined campaign's 65 attempts reconciled independently with integer/rational arithmetic against the PostgreSQL decimal ledger: $0.172613090 measured, $0.263550000 unknown and $0.000000000 pending. Actual returned-model pricing and default service tier were checked per attempt. Observed cache categories and reasoning are in [the measured table](ai-model-benchmark.md); cache writes were billed once at their lifetime rate. No historical cache counts were reconstructed.

Live production encountered one unplanned HTTP400 with absent usage. Its actual cost remains null and its$0.26355 conservative reservation is retained as UNKNOWN_USAGE. The runner stopped further paid work; the closed run cannot silently restart. Total campaign cost is UNKNOWN, $0.17261309 is measured, and$0.43616309 is measured plus unresolved exposure. Independent arithmetic reconciles the64 measured attempts; the65th is validated as held unknown exposure, not assigned a token-rate bill.

Unknown returned snapshots, 12h writes, regional processing, over-reservation settlement and timeouts were covered by deterministic adapter/independent-session PostgreSQL tests; they were not deliberately induced in production. Invoice reconciliation, provider-side error diagnosis, account-level regional settings and throughput capacity remain NOT EXECUTED. Missing model-specific vision bounds still block ordinary candidate activation.
