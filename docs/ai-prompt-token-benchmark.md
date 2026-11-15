# Prompt token and cost benchmark

Historical Step3 synthetic full-journey costs: add/persist2 attempts/$0.0108475; unwell/saved diagnosis2/$0.009505; refresh1/$0.006420; completed replay0/$0. These are not population means. Existing v1 ceilings remain care1400,diagnosis2400,safety700. Step2 observed care237–292 output tokens and diagnosis148–161; ceiling reductions do not themselves establish billed savings.

## Comparison protocol

Compare A baseline,B concise,C quality,D balanced with identical model,image bytes/high detail,selected language,name,notes,schema and standard service tier. Keep the original ceiling for the primary comparison. Record lower-ceiling experiments separately. Baseline ordinary care and diagnosis can serve as controls only when the provider inputs match the candidate case; initial care and refresh have identical provider payloads but different operation identities/product rules.

Capture actual input,cached subset,output,reasoning subset,total,provider status,price version,ledger USD,provider/caller latency,structural result and review status. Cached inputs are not added to input,and reasoning is not added to output again. Cost uses actual usage at the retained registry rates ($2.50/$1.25/$10 per million input/cached/output),not token estimates or maximum outputs. Unknown usage is null cost with conservative held exposure. Provider invoice reconciliation remains separate from token-rate accounting.

One separately approved expiring Step4 run covers **all** associated safety,ordinary care/diagnosis and experimental calls. Limit50 attempts or$0.40 measured-plus-pending-plus-unknown exposure,whichever prevents admission. Full-context reservations are retained: a1400-token care reservation is$0.334;2400-token diagnosis is$0.344. Thus a full comparison/language matrix may stop well before50 actual attempts or$0.40 measured spend. No reset,budget expansion,context-bound reduction or unmetered token-count call is allowed to fill missing cells. Report blocked cells as NOT EXECUTED.

## Prompt caching and parameters

Use reported `input_tokens_details.cached_tokens`,cache-hit attempt count,and per-attempt cost with/without the observed discount. Cache cannot be forced by repeating a completed application request: that returns a result replay with **no provider attempt**. Initial care and a separately admitted refresh can have identical provider payloads,providing an opportunity to observe provider caching without bypassing application deduplication. No hit is guaranteed;zero observed cached tokens is still a measured observation.

GPT-4o supports Responses and strict Structured Outputs according to [its model documentation](https://developers.openai.com/api/docs/models/gpt-4o). [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) still requires refusal/incomplete/business-rule handling. [Token accounting](https://developers.openai.com/api/docs/guides/token-counting) counts all reported generated tokens,not just visible strings. Newer-model reasoning,verbosity,explicit-cache/prewarm/extended-retention settings are not copied into this GPT-4o release. `store:false`,existing retention and provider concurrency stay unchanged.

## Attribution and targets

Centralizing an identical payload cannot save provider tokens. Strict invalid-output rejection/failure telemetry improve reliability/accounting,not model-cost per valid generation. Candidate cost differences must be separated into input,cache and output contributions and cannot be claimed as production savings while disabled. No expert quality score is available. See [quality limits](ai-diagnostic-quality.md).

Keep €0.20 average subscriber-month,€0.50 heavy-user planning reserve and<€0.002/completed-scan targets visible. Complete add/unwell requires safety plus generation; save/replay can add zero. No per-attempt mean is called cost per scan. Financial forecasts need actual journey mix,cache/expiry/retry/failure rates,FX,backend/payment/store/tax costs and representativeness. Step3 measurements alone already do not prove the targets; Step4 may not claim them from a disabled candidate or a small favorable output sample.

Actual hosted measurements are recorded only after release/evaluation executes. At implementation preparation,no Step4 paid call has been made; candidate cost/language/quality results are NOT EXECUTED rather than inferred from mocks.
