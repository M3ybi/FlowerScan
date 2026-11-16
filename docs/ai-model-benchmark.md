# Step 5 model benchmark

## Step 5.2 executed comparison — 2026-11-16

The operator explicitly authorized one fresh maximum-100-attempt/$4/60-minute campaign against proposal SHA-256 `6111c943d8a827c46bb7e7ecad204d7b505f3e3cc8bfed92f5b05c6c632fe146`. Execution used `67704a904414311ff098a79d1e8c6748d5881d84`, with all three required CI verification jobs passed before paid work. Both old campaigns remained closed; no reset, continuation, smaller reservation or customer-model activation occurred.

**Completed: 50/50 diagnosis and 25/25 care-refresh generations; all 15 five-configuration pairs passed the existing structured/business contract.** The campaign made **93 actual provider attempts**, measured **$0.262243150000**, retained **$0 new unknown/$0 pending exposure**, then closed and removed only registered fixtures. This includes 15 real GPT-4o safety attempts costing $0.049775000000 and three additional ordinary GPT-4o generations in full save/refresh journeys. Two primary safety checks reused authorization, and both completed-result replays added zero attempts.

This is a technical comparison, not independent botanical approval. Ten diagnosis contexts use five distinct image hashes; note/locale variants and repeated photos are not independent cases. All requested locales (en/sk/de/fr/es) were exercised. No prompt, image resolution/detail, schema, output cap, cache lifetime or service tier changed. Every pair retained exact registered image/context/configuration and reconstructed provider-payload hashes. Returned IDs were `gpt-4o-2024-08-06`, `gpt-6-luna` and `gpt-6.1-terra`, all default tier. Requested/returned none/low effort was recorded for candidates; GPT-4o effort was unreported/null. Input counts below are provider totals, not separately measured image tokens.

| Route / configuration | N / valid | Input | Cached | Write30 / write12 | Output / reasoning / total | Measured USD | USD / structurally valid | Provider p50 / p95 ms | Caller p50 / p95 ms |
|---|---|---:|---:|---|---|---:|---:|---|---|
| diagnosis / gpt-4o / legacy | 10 / 10 | 11429 | 0 | 0 / 0 | 1924 / 0 / 13353 | 0.047812500000 | 0.004781250 | 2364 / 3817 | 2803 / 4354 |
| diagnosis / gpt-6-luna / none | 10 / 10 | 20637 | 0 | 19320 / 0 | 2434 / 0 / 23071 | 0.003763700000 | 0.000376370 | 3276 / 6015 | 3658 / 6782 |
| diagnosis / gpt-6-luna / low | 10 / 10 | 20637 | 0 | 19320 / 0 | 3555 / 796 / 24192 | 0.004324200000 | 0.000432420 | 4203 / 7683 | 4417 / 8064 |
| diagnosis / gpt-6.1-terra / none | 10 / 10 | 20637 | 0 | 19320 / 0 | 2167 / 0 / 22804 | 0.036302000000 | 0.003630200 | 4465 / 7202 | 4747 / 7737 |
| diagnosis / gpt-6.1-terra / low | 10 / 10 | 20637 | 0 | 19320 / 0 | 2168 / 80 / 22805 | 0.036307000000 | 0.003630700 | 4107 / 5909 | 4493 / 6364 |
| care_refresh / gpt-4o / legacy | 5 / 5 | 5124 | 0 | 0 / 0 | 1492 / 0 / 6616 | 0.027730000000 | 0.005546000 | 3339 / 5201 | 4312 / 5613 |
| care_refresh / gpt-6-luna / none | 5 / 5 | 6692 | 0 | 5177 / 0 | 2080 / 0 / 8772 | 0.001838625000 | 0.000367725 | 4655 / 8620 | 5362 / 8954 |
| care_refresh / gpt-6-luna / low | 5 / 5 | 6692 | 0 | 5177 / 0 | 3043 / 610 / 9735 | 0.002320125000 | 0.000464025 | 7110 / 7816 | 7421 / 8203 |
| care_refresh / gpt-6.1-terra / none | 5 / 5 | 6692 | 0 | 5177 / 0 | 2005 / 0 / 8697 | 0.018011250000 | 0.003602250 | 7190 / 9946 | 7544 / 10326 |
| care_refresh / gpt-6.1-terra / low | 5 / 5 | 6692 | 0 | 5177 / 0 | 2017 / 128 / 8709 | 0.018071250000 | 0.003614250 | 7374 / 9541 | 7700 / 9898 |

These rows cover **new primary generation attempts only**, including any failures in that scope (observed 0/75). Safety and optional ordinary journeys are accounted separately, not silently omitted from the whole campaign. Cached reads and 12h writes were zero in these primary measurements. 30m writes replace ordinary-input billing and were counted once; reasoning is already part of output. Percentiles use nearest rank on only ten diagnosis/five refresh requests per profile, not production population percentiles. Raw model-specific token/usage/price facts and per-input PASS matrix remain in the private report and analysis.

The newly authorized German Luna-none refresh succeeded with measured usage and cost $0.000252300000. Its reconstructed JSON SHA-256 `eb7d23c3af14c1522de0c3da7e1c73a05e677351840ac929dbe391a2c4f4d2e8` matches the prior success/failure reconstruction. This verifies current invocation compatibility for that request; the historical HTTP 400 root cause and bill remain UNKNOWN, cost null/exposure $0.26355. It was not retried as the old operation or financially overwritten. New-campaign structural costs do not turn the cumulative historical Luna-none cost into a known total.

| Actual ordinary GPT-4o journey | Paid attempts | Exact USD | Operator end-to-end ms |
|---|---:|---:|---:|
| GPT-4o cold safety plus initial care and plant save | 2 | 0.010607500000 | 12008 |
| Completed initial-care result replay | 0 | 0.000000000000 | 593 |
| GPT-4o cold safety plus diagnosis and save with safety reuse | 2 | 0.005740000000 | 7817 |
| GPT-4o manual care refresh | 1 | 0.006390000000 | 5700 |

Cold journeys waited for previous validation authorization to expire naturally, then incurred one fresh safety attempt each. Both saves reused that fresh authorization; signed private-image readback matched original JPEG hashes. Manual refresh incurred one generation. Journey timing includes operator/ledger/Storage/RPC work, not native camera/UI timing. No candidate complete Add/save journey was executed; candidate generation means must not be presented as measured full-customer journeys.

### Step 5.2 monthly scenarios

These are **composed estimates**, not subscriber observations or independently acceptable-result costs. Per 100 actions: 20 cold adds, 50 cold diagnoses, 15 authorized refreshes, 10 completed replays, 4 expired-safety actions, 1 unknown-cost stress case. Known components cover 99% of actions: historical paired initial-care generation means, new per-model diagnosis/refresh means, and mean actual fresh GPT-4o safety cost. Generation means retain observed caching; do not assume equal model token/image/reasoning counts or future cache hits. Conversion assumption is **1 USD = EUR0.90**, not a current FX quote. Existing illustrative fee/tax/backend assumptions in the historical scenarios below remain unverified.

| Journeys/month | GPT-4o EUR | Luna none EUR | Luna low EUR | Terra none EUR | Terra low EUR |
|---|---:|---:|---:|---:|---:|
| 10 | 0.0602 | 0.0249 | 0.0255 | 0.0483 | 0.0488 |
| 30 | 0.1806 | 0.0746 | 0.0764 | 0.1449 | 0.1465 |
| 100 | 0.6018 | 0.2486 | 0.2546 | 0.4829 | 0.4884 |
| 300 | 1.8055 | 0.7457 | 0.7638 | 1.4488 | 1.4653 |
| 1000 | 6.0185 | 2.4857 | 2.5460 | 4.8293 | 4.8844 |
| 3000 | 18.0554 | 7.4570 | 7.6381 | 14.4879 | 14.6532 |

The remaining 1% is a separate held-exposure sensitivity, using the unchanged full diagnosis reservation plus $0.327 safety per affected action. It is not an expected charge and is not combined with the actual historical $0.26355 record:

| Journeys/month | GPT-4o held USD | Luna either effort held USD | Terra either effort held USD |
|---|---:|---:|---:|
| 10 | 0.0671 | 0.0591 | 0.2970 |
| 30 | 0.2013 | 0.1774 | 0.8910 |
| 100 | 0.6710 | 0.5913 | 2.9700 |
| 300 | 2.0130 | 1.7739 | 8.9100 |
| 1000 | 6.7100 | 5.9130 | 29.7000 |
| 3000 | 20.1300 | 17.7390 | 89.1000 |

The EUR0.20 average and EUR0.50 heavy-user targets are not verified for accepted customer outcomes. Under this specific mix, high-volume scenarios exceed the heavy-user target even before unresolved-cost stress. No guaranteed profitability, subscriber quota change, or production saving is claimed. Cost per independently acceptable result remains NOT VERIFIED for all five profiles; no accepted-result denominator exists.

Exact source report SHA-256: `09426c8cb3e5331c995ddc01a49db8bb389bd4e9480e7310fc0e532d3bbba19a`. Private evidence: `%TEMP%/plantie-ai-step52-20261116/production-campaign.json`, `campaign-analysis.json`, `campaign-ledger-readback.json` and `campaign-cleanup-verification.json`. Credentials, actor/request identifiers, raw photos, signed URLs and unblinded mappings are not committed. See [release](ai-step52-qualification-release.md), [review results](ai-model-review-results.md) and [qualification decision](ai-model-qualification-decision.md).

Step5.1 recovery: [root-cause evidence,paid-campaign preflight and release](ai-step5-recovery-release.md). No new inference is authorized by that preflight;historical measurements below remain unchanged.

Starting revision: `7c7a474eeab3a5da028cce4da38b4540c3832131`, matching clean remote main. Existing ordinary GPT-4o/v1/1600px-high behavior is the reference. The exact requested candidates are `gpt-6-luna` and `gpt-6.1-terra`; no substitute model is selected.

Official capability documentation and configured-project model metadata were checked before implementation. All three metadata GETs returned200 with matching IDs and made no inference calls. These checks do not prove image, strict-schema, reasoning, service-tier or timeout compatibility; that requires protected metered Responses execution.

## Pre-registered protocol

Compare five configurations per botanical route: GPT-4o reference, Luna none, Luna low, Terra none, Terra low. Retain current production v1 prompt/schema, one identical approved JPEG, high detail, selected locale, name/notes and1400/2400 output ceilings. No Step4 behavioral candidate is mixed into this model comparison. Current global endpoint/default service tier and `store:false` are retained. Report observed cache differences rather than pretending every pair is cold or using equal hypothetical token counts.

The campaign may use at most240 provider attempts/$4.00 aggregate exposure, including its normal smoke/safety calls. It stops on the first campaign/global financial admission denial. No reset, alternate run, smaller reservation, unmetered token-count call or automatic larger-output retry is allowed. The protected evaluator uses the same authoritative adapter/ledger. Technical sufficiency does not require spending all240 attempts.

For each attempt, record requested/returned model, immutable configuration/route/prompt/price versions, reasoning effort, image hash/dimensions/profile, actual input/cached/cache-write/output/reasoning/total tokens, exact USD cost, provider/caller latency, status and structural/business validation. Missing usage/pricing stays unknown with held exposure. Do not infer a separate image-token count from aggregate usage. Independent correctness/treatment review is UNKNOWN for the current unreviewed cases.

Complete synthetic ordinary API/storage journeys are separate from isolated candidate generation probes. Candidate full-sequence cost must include any actual GPT-4o safety calls; eligible safety/result replays add no attempt. Do not call a generation-only mean cost per full scan or treat a structurally valid result as independently acceptable.

## Planning assumptions

Monthly scenarios must cover10, 30, 100, 300, 1000, 3000 journeys with stated shares of cold add, cold diagnosis, refresh, replay, expired safety and uncertain failures. Use actual observed model-specific components; do not assign identical token counts to different models. Unknown-failure exposure is a separate stress envelope, not measured billing.

An illustrative conversion of1 USD=0.90 EUR may be used; it is an assumption, not a current exchange-rate quote. Illustrative tax/payment/store/backend deductions must be stated before comparing with€3.99 revenue. Neither€0.20 average subscriber-month, €0.50 heavy-use reserve nor<€0.002/completed journey is guaranteed. There is no guaranteed profitability for literally unlimited unique inference.

Executed results below supersede preparation status. No ordinary-user saving or qualified model winner is claimed.

## Executed production campaign

Runtime source: `29e16e91b33935aa258f9f47b8cc3448ab277d69`. Completed 2026-11-15T19:14:49.705Z. The first operator run passed all ordinary-flow assertions but failed on Management API rate limiting, then an operator recovery integer-transport mismatch. It was closed and its fixtures were removed. The user explicitly authorized **one continuation within the original total cap**. The closed run retains five attempts/$0.0267275; the continuation is permanently capped at235 attempts/$3.9732725. Both are reconciled together against240/$4.00. There was no reset, price/reservation reduction or additional budget. No further continuation is implied.

Combined provider attempts: **65**. Measured spend: **$0.172613090**. Unknown exposure: **$0.263550000**; pending exposure: **$0.000000000**. Attempted model generations: 37/100; not executed: 63; failed: 1. Complete five-configuration paired contexts: 7/8. Stop reason: Uncertain provider accounting retained; no further inference or budget reset.

| Configuration | N / valid | Known input | Known cached | Known write 30m / 12h | Known output / reasoning | Measured USD | Unknown exposure USD | Total USD | USD / structurally valid | Provider p50 / p95 ms | Caller p50 / p95 ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| gpt-4o:legacy | 8 / 8 | 7176 | 0 | 0 / 0 | 2302 / 0 | 0.040960000 | 0.000000000 | 0.040960000 | 0.005120000 | 2580 / 3310 | 3037 / 7782 |
| gpt-6-luna:none | 8 / 7 | 7701 | 2587 | 2587 / 0 | 3018 / 0 | 0.002110945 | 0.263550000 | UNKNOWN | UNKNOWN | 4078 / 5367 | 4591 / 6966 |
| gpt-6-luna:low | 7 / 7 | 7701 | 2587 | 2587 / 0 | 4695 / 1164 | 0.002949445 | 0.000000000 | 0.002949445 | 0.000421349 | 7130 / 9193 | 7604 / 9907 |
| gpt-6.1-terra:none | 7 / 7 | 7701 | 2587 | 2587 / 0 | 2458 / 0 | 0.018180100 | 0.000000000 | 0.018180100 | 0.002597157 | 6235 / 10202 | 6923 / 10797 |
| gpt-6.1-terra:low | 7 / 7 | 7701 | 2587 | 2587 / 0 | 2874 / 198 | 0.020260100 | 0.000000000 | 0.020260100 | 0.002894300 | 6852 / 12564 | 6815 / 13187 |

Successful returned IDs were `gpt-4o-2024-08-06`, `gpt-6-luna` and `gpt-6.1-terra`, all on the default service tier. The failed Luna request returned neither model nor usage; its returned model/tier/cost are UNKNOWN. Pricing is the historical GPT-4o version or new multi-model version documented in [pricing](ai-model-pricing.md). The inputs, output caps, high detail, schema and v1 prompt version were identical within each pair. Actual aggregate input usage differs by model; no separate image-token count is inferred. Token sums above cover reported usage only; they exclude the unknown attempt.

**Benchmark FAIL / incomplete.** All25 initial-care probes succeeded across five languages. Refresh probes completed11/12, then the Luna none German request returned provider HTTP400 without usage (caller HTTP503). All50 diagnosis probes and13 remaining care probes were NOT EXECUTED. The provider's underlying error reason is UNKNOWN; the privacy-preserving adapter retained status/request identifiers but no raw provider error body. Earlier successful requests do not resolve that failure. Do not retry it or release its$0.26355 exposure without independent billing/usage evidence. Total campaign cost is UNKNOWN; known measured spend plus held exposure is$0.43616309.

The operator continuation also paused once when its temporary database login expired. Its same run, registrations, limits and ledger were preserved. One completed Terra low result (`model_34`) was recovered by authenticated replay with zero additional model-generation attempts. Its expired safety authorization required one new GPT-4o validation costing$0.00237; this is included in the25 safety attempts and combined campaign cost. Its original generation caller latency was not recovered; the replay's HTTP latency is excluded from generation percentiles. Provider latency and token/cost facts remain known.

| Configuration | Purpose | N / valid | Generation USD mean | Observed safety + generation USD mean | Composed cold safety + generation USD |
|---|---|---|---|---|---|
| gpt-4o:legacy | initial_care | 5 / 5 | 0.005045500 | 0.007772500 | 0.007770200 |
| gpt-6-luna:none | initial_care | 5 / 5 | 0.000314635 | 0.003049635 | 0.003039335 |
| gpt-6-luna:low | initial_care | 5 / 5 | 0.000437635 | 0.003160635 | 0.003162335 |
| gpt-6.1-terra:none | initial_care | 5 / 5 | 0.002774350 | 0.005507350 | 0.005499050 |
| gpt-6.1-terra:low | initial_care | 5 / 5 | 0.003070350 | 0.003070350 | 0.005795050 |
| gpt-4o:legacy | care_refresh | 3 / 3 | 0.005244167 | 0.005991667 | 0.008256167 |
| gpt-6-luna:none | care_refresh | 3 / 2 | UNKNOWN | UNKNOWN | UNKNOWN |
| gpt-6-luna:low | care_refresh | 2 / 2 | 0.000380635 | 0.000380635 | 0.003759885 |
| gpt-6.1-terra:none | care_refresh | 2 / 2 | 0.002154175 | 0.002154175 | 0.005533425 |
| gpt-6.1-terra:low | care_refresh | 2 / 2 | 0.002454175 | 0.003639175 | 0.005833425 |

The observed sequence column includes only actual safety calls incurred for that probe; a reusable authorized safety result can cost zero. The cold column is an **estimate composed from measured components**: generation plus the mean measured GPT-4o safety cost for that exact case/language. It is not an actual candidate Add New Plant/save journey. Initial-care probes deliberately use the care-refresh admission lease on an owned plant while preserving the exact initial-care provider payload. Candidate persistence and independently acceptable complete journeys remain unverified.

| Ordinary GPT-4o journey | Provider attempts | Measured USD | Observed operator end-to-end ms |
|---|---|---|---|
| Add New Plant through persistence | 2 | 0.010867500 | 17154 |
| Completed care and same-image replay | 0 | 0.000000000 | 4413 |
| Premium unwell through saved diagnosis | 2 | 0.009700000 | 10806 |
| Premium manual care refresh | 1 | 0.006160000 | 7468 |
| Free limits and authorization denials | 0 | 0.000000000 | 12255 |

These complete ordinary API/storage journeys use one synthetic photo and include operator/ledger overhead. They are not representative production percentiles or native-device timings. Completed replay and denied operations add no provider attempt.

## Reasoning comparison

| Model | None / low attempts | Reasoning tokens none / low | USD none / low | Provider p95 ms none / low | Quality conclusion |
|---|---|---|---|---|---|
| gpt-6-luna | 7 / 7 | 0 / 1164 | 0.002110945 / 0.002949445 | 5367 / 9193 | Botanical benefit UNKNOWN |
| gpt-6.1-terra | 7 / 7 | 0 / 198 | 0.018180100 / 0.020260100 | 10202 / 12564 | Botanical benefit UNKNOWN |

These are descriptive measurements restricted to seven successfully completed matched none/low care pairs per model, with observed caching and fixed output ceilings. The unsuccessful Luna none request is excluded from this paired arithmetic but remains in total cost/exposure and failure tables. No diagnosis comparison was reached. These data do not prove that none is botanically non-inferior or that low improves diagnosis. No medium profile or automatic escalation was used. Cost per structurally valid response is measured only where all relevant billed attempts have known cost; cost per independently acceptable result remains UNKNOWN.

## Reproducible attempt evidence

| Case | SHA-256 | Pixels | JPEG bytes | Languages |
|---|---|---|---|---|
| houseplant_01 | bdb76111229f8b9895099bffa29fb48f6e8b5b2f2da81bfd14ac51a0d4befbf8 | 1125 x 1600 | 114858 | en |
| pv_001 | 23eff20e99a15cc76627faffb0a16caa451047a2e060e787fa2ec7131df4f5f9 | 256 x 256 | 17124 | sk |
| pv_034 | f457678638005152406198e087c6c79769e547bc7783371417f385337d4c0a35 | 256 x 256 | 10719 | de |
| pv_055 | e7a0bfcde5d0dbec10505a121587fdac55ccf4cafe4262e85545f2673f8dd1a6 | 256 x 256 | 17822 | fr |
| pv_058 | b5b5e2313185ee642fc6931aab24d4e2c2b6915d467eca6e16508e1e458cc7b0 | 256 x 256 | 14851 | es |

Each executed generation below used high detail/normalized-jpeg-v1, store:false, one attempt, and plant-care-v1/1400. Successful responses confirmed the default tier; the failed response supplied no tier. Diagnosis-v1/2400 was planned but NOT EXECUTED. Exact configuration hashes are pinned in `tests/fixtures/ai-model-manifest.json`. Full synthetic JSON outputs and safe operator evidence remain locally under `%TEMP%/plantie-ai-step5-20261115`; the authoritative database retains token/price/attempt facts while private result caches and test identities were removed. No provider identifiers, actor IDs or customer payloads are published here.

| Key / case | Purpose / language | Model / effort | Input / cached / write30 / write12 | Output / reasoning / total | USD | Provider / caller ms | HTTP / accounting |
|---|---|---|---|---|---|---|---|
| model_0 / houseplant_01 | initial_care / en | gpt-4o / legacy | 1536 / 0 / 0 / 0 | 282 / 0 / 1818 | 0.006660000000 | 2824 / 3433 | 200 / MEASURED |
| model_1 / houseplant_01 | initial_care / en | gpt-6-luna / none | 2590 / 0 / 2587 / 0 | 359 / 0 / 2949 | 0.000503175000 | 4076 / 4844 | 200 / MEASURED |
| model_2 / houseplant_01 | initial_care / en | gpt-6-luna / low | 2590 / 0 / 2587 / 0 | 527 / 63 / 3117 | 0.000587175000 | 5578 / 5959 | 200 / MEASURED |
| model_3 / houseplant_01 | initial_care / en | gpt-6.1-terra / none | 2590 / 0 / 2587 / 0 | 274 / 0 / 2864 | 0.004606750000 | 4791 / 5430 | 200 / MEASURED |
| model_4 / houseplant_01 | initial_care / en | gpt-6.1-terra / low | 2590 / 0 / 2587 / 0 | 270 / 0 / 2860 | 0.004586750000 | 4072 / 4517 | 200 / MEASURED |
| model_5 / pv_001 | initial_care / sk | gpt-4o / legacy | 686 / 0 / 0 / 0 | 316 / 0 / 1002 | 0.004875000000 | 2678 / 3165 | 200 / MEASURED |
| model_6 / pv_001 | initial_care / sk | gpt-6-luna / none | 506 / 0 / 0 / 0 | 549 / 0 / 1055 | 0.000325100000 | 5056 / 5455 | 200 / MEASURED |
| model_7 / pv_001 | initial_care / sk | gpt-6-luna / low | 506 / 0 / 0 / 0 | 775 / 171 / 1281 | 0.000438100000 | 7945 / 8377 | 200 / MEASURED |
| model_8 / pv_001 | initial_care / sk | gpt-6.1-terra / none | 506 / 0 / 0 / 0 | 412 / 0 / 918 | 0.002566000000 | 10202 / 10797 | 200 / MEASURED |
| model_9 / pv_001 | initial_care / sk | gpt-6.1-terra / low | 506 / 0 / 0 / 0 | 562 / 36 / 1068 | 0.003316000000 | 12564 / 13187 | 200 / MEASURED |
| model_10 / pv_034 | initial_care / de | gpt-4o / legacy | 683 / 0 / 0 / 0 | 288 / 0 / 971 | 0.004587500000 | 2548 / 3037 | 200 / MEASURED |
| model_11 / pv_034 | initial_care / de | gpt-6-luna / none | 503 / 0 / 0 / 0 | 433 / 0 / 936 | 0.000266800000 | 4753 / 5174 | 200 / MEASURED |
| model_12 / pv_034 | initial_care / de | gpt-6-luna / low | 503 / 0 / 0 / 0 | 686 / 149 / 1189 | 0.000393300000 | 6959 / 7331 | 200 / MEASURED |
| model_13 / pv_034 | initial_care / de | gpt-6.1-terra / none | 503 / 0 / 0 / 0 | 342 / 0 / 845 | 0.002213000000 | 7454 / 7807 | 200 / MEASURED |
| model_14 / pv_034 | initial_care / de | gpt-6.1-terra / low | 503 / 0 / 0 / 0 | 394 / 36 / 897 | 0.002473000000 | 6417 / 6815 | 200 / MEASURED |
| model_15 / pv_055 | initial_care / fr | gpt-4o / legacy | 683 / 0 / 0 / 0 | 294 / 0 / 977 | 0.004647500000 | 2382 / 2738 | 200 / MEASURED |
| model_16 / pv_055 | initial_care / fr | gpt-6-luna / none | 503 / 0 / 0 / 0 | 360 / 0 / 863 | 0.000230300000 | 4078 / 4467 | 200 / MEASURED |
| model_17 / pv_055 | initial_care / fr | gpt-6-luna / low | 503 / 0 / 0 / 0 | 664 / 172 / 1167 | 0.000382300000 | 7696 / 8023 | 200 / MEASURED |
| model_18 / pv_055 | initial_care / fr | gpt-6.1-terra / none | 503 / 0 / 0 / 0 | 340 / 0 / 843 | 0.002203000000 | 5492 / 5853 | 200 / MEASURED |
| model_19 / pv_055 | initial_care / fr | gpt-6.1-terra / low | 503 / 0 / 0 / 0 | 384 / 40 / 887 | 0.002423000000 | 7145 / 7511 | 200 / MEASURED |
| model_20 / pv_058 | initial_care / es | gpt-4o / legacy | 683 / 0 / 0 / 0 | 275 / 0 / 958 | 0.004457500000 | 2333 / 2790 | 200 / MEASURED |
| model_21 / pv_058 | initial_care / es | gpt-6-luna / none | 503 / 0 / 0 / 0 | 395 / 0 / 898 | 0.000247800000 | 4144 / 4591 | 200 / MEASURED |
| model_22 / pv_058 | initial_care / es | gpt-6-luna / low | 503 / 0 / 0 / 0 | 674 / 290 / 1177 | 0.000387300000 | 7130 / 7604 | 200 / MEASURED |
| model_23 / pv_058 | initial_care / es | gpt-6.1-terra / none | 503 / 0 / 0 / 0 | 356 / 0 / 859 | 0.002283000000 | 6235 / 6923 | 200 / MEASURED |
| model_24 / pv_058 | initial_care / es | gpt-6.1-terra / low | 503 / 0 / 0 / 0 | 410 / 48 / 913 | 0.002553000000 | 6852 / 7419 | 200 / MEASURED |
| model_25 / houseplant_01 | care_refresh / en | gpt-4o / legacy | 1536 / 0 / 0 / 0 | 238 / 0 / 1774 | 0.006220000000 | 3310 / 3895 | 200 / MEASURED |
| model_26 / houseplant_01 | care_refresh / en | gpt-6-luna / none | 2590 / 2587 / 0 / 0 | 365 / 0 / 2955 | 0.000208670000 | 3128 / 3505 | 200 / MEASURED |
| model_27 / houseplant_01 | care_refresh / en | gpt-6-luna / low | 2590 / 2587 / 0 / 0 | 531 / 84 / 3121 | 0.000291670000 | 6882 / 7516 | 200 / MEASURED |
| model_28 / houseplant_01 | care_refresh / en | gpt-6.1-terra / none | 2590 / 2587 / 0 / 0 | 287 / 0 / 2877 | 0.001567350000 | 4304 / 5929 | 200 / MEASURED |
| model_29 / houseplant_01 | care_refresh / en | gpt-6.1-terra / low | 2590 / 2587 / 0 / 0 | 279 / 0 / 2869 | 0.001527350000 | 4374 / 6664 | 200 / MEASURED |
| model_30 / pv_001 | care_refresh / sk | gpt-4o / legacy | 686 / 0 / 0 / 0 | 343 / 0 / 1029 | 0.005145000000 | 3052 / 7782 | 200 / MEASURED |
| model_31 / pv_001 | care_refresh / sk | gpt-6-luna / none | 506 / 0 / 0 / 0 | 557 / 0 / 1063 | 0.000329100000 | 5367 / 6966 | 200 / MEASURED |
| model_32 / pv_001 | care_refresh / sk | gpt-6-luna / low | 506 / 0 / 0 / 0 | 838 / 235 / 1344 | 0.000469600000 | 9193 / 9907 | 200 / MEASURED |
| model_33 / pv_001 | care_refresh / sk | gpt-6.1-terra / none | 506 / 0 / 0 / 0 | 447 / 0 / 953 | 0.002741000000 | 8934 / 9322 | 200 / MEASURED |
| model_34 / pv_001 | care_refresh / sk | gpt-6.1-terra / low | 506 / 0 / 0 / 0 | 575 / 38 / 1081 | 0.003381000000 | 10154 / UNKNOWN (replay395) | 200 / MEASURED |
| model_35 / pv_034 | care_refresh / de | gpt-4o / legacy | 683 / 0 / 0 / 0 | 266 / 0 / 949 | 0.004367500000 | 2580 / 2956 | 200 / MEASURED |
| model_36 / pv_034 | care_refresh / de | gpt-6-luna / none | UNKNOWN / UNKNOWN / UNKNOWN / UNKNOWN | UNKNOWN / UNKNOWN / UNKNOWN | UNKNOWN | 2392 / 2744 | 503 / UNKNOWN_USAGE |

## Monthly planning scenarios

These are **illustrative estimates**, not measured subscriber behavior or production savings. Mix per100 actions:20 cold add/save journeys, 50 cold diagnosis/save journeys, 15 care refreshes with an authorized safety result, 10 completed-result replays, 4 expired-safety revalidation/upload-only actions, and1 interrupted/unknown-cost action. The GPT-4o components use the actual complete synthetic journeys above and the mean of25 measured safety attempts ($0.002808000). This is a small workload sample, not a forecast. The remaining candidate diagnosis comparisons were NOT EXECUTED; their expected monthly cost is **UNKNOWN**. No hypothetical identical candidate token counts are used.

The known component covers99% of actions. The separate1% unknown stress holds a full GPT-4o diagnosis plus safety reservation ($0.671 per affected action), not a predicted charge. This is an assumed failure frequency and conservative exposure envelope. Actual campaign unknown usage retains$0.26355 and a null cost; it is never set to zero or replaced with this scenario assumption.

Conversion assumption:**1 USD = €0.90**, illustrative only; no current FX quote. Before comparing with€3.99 Premium gross revenue, assume20% consumption tax, €0.10/backend allocation per subscriber-month, and either15% store fee on tax-exclusive revenue or a web payment fee of3% of gross plus€0.30. These are **unverified planning assumptions**, not actual tax obligations, contracts, store commissions or infrastructure costs. Store and web fees are alternative channels. They leave**€2.72625 store / €2.80530 web before AI**. RevenueCat configuration, billing mode and prices were unchanged.

| Monthly actions | Known GPT-4o component USD / EUR | Additional unknown exposure USD / EUR | Store remainder incl. stress EUR | Web remainder incl. stress EUR | Candidate expected cost |
|---|---|---|---|---|---|
| 10 | 0.0806 / 0.0725 | 0.0671 / 0.0604 | 2.5933 | 2.6724 | NOT MEASURED |
| 30 | 0.2418 / 0.2176 | 0.2013 / 0.1812 | 2.3275 | 2.4065 | NOT MEASURED |
| 100 | 0.8060 / 0.7254 | 0.6710 / 0.6039 | 1.3970 | 1.4760 | NOT MEASURED |
| 300 | 2.4179 / 2.1762 | 2.0130 / 1.8117 | -1.2616 | -1.1826 | NOT MEASURED |
| 1000 | 8.0598 / 7.2538 | 6.7100 / 6.0390 | -10.5666 | -10.4875 | NOT MEASURED |
| 3000 | 24.1795 / 21.7615 | 20.1300 / 18.1170 | -37.1523 | -37.0732 | NOT MEASURED |

For a separate worst-exposure sensitivity, replace generation components with their existing conservative reservations, retain one safety reservation for cold actions, and use the same mix. The following is **EUR held-exposure upper-envelope planning**, not expected token billing or a model-cost comparison. Luna/Terra diagnosis rates are registry-based bounds because no diagnosis experiment executed. These high ceilings also show why a reviewed smaller vision-input bound is required before ordinary activation. Server reservations were not lowered to complete this benchmark.

| Monthly actions | GPT-4o exposure EUR | Luna (either effort) exposure EUR | Terra (either effort) exposure EUR |
|---|---|---|---|
| 10 | 4.8383 | 4.2506 | 22.6404 |
| 30 | 14.5149 | 12.7517 | 67.9213 |
| 100 | 48.3831 | 42.5057 | 226.4044 |
| 300 | 145.1493 | 127.5171 | 679.2133 |
| 1000 | 483.8310 | 425.0569 | 2264.0445 |
| 3000 | 1451.4930 | 1275.1708 | 6792.1335 |

The€0.20 average and€0.50 heavy-user targets require a measured workload distribution and independently acceptable results; neither is established. Initial-care generation plus matched measured safety alone averaged approximately€0.002735 for Luna none in these five cases, as a composed estimate. That does not prove<€0.002 per independently acceptable completed scan. No guaranteed profitability claim is possible for literally unlimited unique inference.
