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

## Executed production evaluation — 2026-11-15

Run window: 17:13:16.826–17:14:50.849 UTC, using runtime revision `18986e1fc2c557f50e0b515b789d158fd187dc5f`. One expiring run included every associated safety, ordinary generation and candidate attempt. All requests selected `gpt-4o`; all returned `gpt-4o-2024-08-06`, service tier `default`, `store:false`. The approved public Ficus image was unchanged normalized JPEG,1125×1600,131447 bytes,high detail. The baseline/candidate English comparisons shared image,name,notes,language,schema and original output ceiling. Candidate definition and context hashes were registered before inference. No ordinary customer photo or output was used.

Every row below is one actual **MEASURED** ledger attempt,with provider request/response IDs retained privately. All completed with validated structured output; reasoning tokens were0. Cached tokens are a subset of input tokens. Total is input+output. A/B/C/D designate baseline/concise/quality/balanced; the full immutable versions are in the architecture inventory. Caller latency for candidate rows includes a post-call ledger read; ordinary caller timings measure the HTTP request. These small samples are not production latency percentiles.

| Attempt / prompt | Ceiling | Input | Cached | Output | Total | Actual USD | Provider ms | Caller ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
|1 safety v1,Free add |700|1507|0|59|1566|0.0043575|2931|3590|
|2 care A,en,initial |1400|1536|0|271|1807|0.0065500|3938|4411|
|3 safety v1,Premium unwell |700|1507|1280|60|1567|0.0027675|1237|1496|
|4 diagnosis A,en |2400|1461|0|152|1613|0.0051725|3809|4193|
|5 care A,en,manual refresh |1400|1536|0|247|1783|0.0063100|2860|3264|
|6 diagnosis B,en |2400|1372|0|132|1504|0.0047500|2341|3251|
|7 diagnosis C,en |2400|1562|0|165|1727|0.0055550|3902|4610|
|8 diagnosis D,en |2400|1555|0|133|1688|0.0052175|3367|4057|
|9 care B,en |1400|1423|0|223|1646|0.0057875|2718|3488|
|10 care C,en |1400|1600|0|239|1839|0.0063900|2477|3090|
|11 care D,en |1400|1593|0|225|1818|0.0062325|2813|3430|
|12 care D,sk |512|1594|0|366|1960|0.0076450|3170|3780|
|13 care D,de |512|1593|0|300|1893|0.0069825|3917|4960|
|14 care D,fr |512|1593|0|283|1876|0.0068125|2784|3406|

Totals: **21432 input,1280 cached,2855 output,24287 total tokens;$0.0805300**. All14 attempts had known usage,exact decimal cost reconciliation and completed status;0 refused,0 incomplete,0 invalid,0 unknown. The price version remained `openai-standard-2026-11-15`. Provider p50/p95 were2860/3938ms (nearest-rank,14 attempts); candidate caller p50/p95 were3488/4960ms (nine attempts). Input p95 was1600 and output p95 was366. Zero observed failures in this sample is not a future error-rate guarantee.

### Measured comparison and attribution

Against initial care A,concise B removed113 input tokens (7.36%) and produced48 fewer output tokens; observed cost fell$0.0007625 (11.64%). Diagnosis B removed89 input tokens (6.09%) and produced20 fewer output tokens; observed cost fell$0.0004225 (8.17%). These are **measured candidate differences**,not production savings or evidence of equivalent botanical quality.

Care C/D added64/57 input tokens; their observed costs were$0.0001600/$0.0003175 lower than initial A because that particular output was shorter. Diagnosis C/D added101/94 input tokens and cost$0.0003825/$0.0000450 more than A. D therefore was not uniformly cheapest. One output per candidate cannot separate prompt effect from sampling variance: the two identical v1 care payloads themselves produced271 versus247 output tokens. No candidate is selected for activation.

The512-token Slovak,German and French care responses completed,but language and ceiling changed together. They do not establish savings from reducing the ceiling. Spanish512 was denied before inference. English512,adversarial Slovak diagnosis700 and truncation256 were **NOT EXECUTED** after the first admission stop. Refusal/incomplete/truncation handling passed deterministic integration tests; no real refusal or incomplete response was observed. No automatic larger-limit retry was made.

### Cache observation

One of14 attempts reported cached input (7.14% attempt hit rate);1280/21432 input tokens were cached (5.97%). This was the second safety call,not a new botanical prompt optimization. Its recorded discount was$0.0016000;the total at uncached-input rates would have been$0.0821300. Botanical generations had0 cache hits across12 attempts,including the repeated ordinary care payload. Application replay separately added0 provider attempts. No causal latency improvement is inferred from one cached safety response.

### Full journeys and financial stop

| Actual synthetic journey | Paid attempts | Cost USD | Instrumented end-to-end ms |
|---|---:|---:|---:|
| Add New Plant + private image readback + persistence |2|0.0109075|12073|
| Unwell + saved diagnosis + safety reuse |2|0.0079400|9130|
| Premium manual care refresh |1|0.0063100|4184|
| Eligible completed care/safety replay |0|0|2938|
| Free-limit/nonmember/revoked-viewer denials |0|0|9570|

End-to-end timings include test instrumentation,ledger reads,persistence and grouped assertions;they are not browser UX measurements. The ordinary journeys used five attempts/$0.0251575 and the nine isolated candidates used$0.0553725. Differences from Step3 are influenced by cache/output variability and do not prove a release saving.

The next care512 admission required$0.3251200 (unchanged128000-token context reservation plus output allowance). $0.0805300+$0.3251200=$0.4056500 exceeds$0.40,so the server returned429 with **zero** new provider attempts. The entire paid evaluation stopped at that first denial;no reset,budget extension,alternate run or reduced reservation was used. The run is now disabled with0 actors,0 registered inputs,0 active operations and0 unknown exposure. Unspent measured budget did not authorize bypassing conservative reservations.

**Prompt token reduction: MEASURED in isolated concise candidates. Actual production cost reduction: NOT VERIFIED.** Activated v1 payloads remain identical. These USD journey samples do not establish the<€0.002 planning target;no FX conversion was performed. The €0.20/€0.50 subscriber-month objectives remain unverified without representative journey volumes,FX and all operating costs. No attempt average is presented as cost per completed scan.
