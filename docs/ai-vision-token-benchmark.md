# Vision token measurements and cost boundaries

## Method

Rates remain the Step 2 registry: GPT-4o standard input $2.50, cached input $1.25, output $10 per million tokens, pricing version `openai-standard-2026-11-15`. Cached tokens are a subset of input; reasoning tokens are a subset of output. The authoritative USD cost is `(input-cached)*2.50e-6 + cached*1.25e-6 + output*10e-6`. Missing/invalid usage is unknown, not free.

The [official image guide](https://developers.openai.com/api/docs/guides/images-vision) describes GPT-4o high-detail resizing/tile accounting; low detail uses a fixed base. Our image-only **estimate** fits within 2048 square, reduces the shorter side to 768 only if larger, then counts 512px tiles: 85 + 170 × tiles. Do not upscale small images. These estimates are not Responses usage or financial admission bounds. Provider total input also includes prompt/schema. [GPT-4o pricing](https://developers.openai.com/api/docs/models/gpt-4o) and [token counting](https://developers.openai.com/api/docs/guides/token-counting) should be rechecked before future price/model changes.

| Submitted dimensions | high-detail estimate | low-detail estimate |
|---|---:|---:|
| 1125×1600 | 1105 | 85 |
| 900×1280 | 1105 | 85 |
| 720×1024 | 765 | 85 |
| 540×768 | 765 | 85 |
| 360×512 | 255 | 85 |
| 550×1600 | 1445 | 85 |
| 440×1280 | 595 | 85 |

Thus reducing 1600 to 1280 does not necessarily save a single image token. No separate image-token field is invented from total usage.

## Available corpus and reproducibility

`node scripts/prepare-vision-corpus.mjs` uses actual `preprocessImageFile` and the public `FlowersImg` catalog only. Optional `PLANTIE_VISION_CORPUS_DIR` selects the local artifact directory. It emits JPEGs and a manifest of source hashes, original/submitted dimensions, bytes, detail/profile, processing time and estimated tiles. Profiles: 1600/high,1280/high,1024/high,768/high,512/low,existing-normalized/low. Every profile starts from the same source, never a previously resized candidate; no upscaling/stretching.

Portrait is the existing Ficus photo (1125×1600); landscape is 1600×1560; square is a centered three-row crop of a 1597×1600 public photo; extreme is an explicitly derived 1125×140 (approximately 8:1) horizontal strip of the Ficus. Cropping is solely a geometry fixture. QR-mixed adds a synthetic non-private QR to the public Ficus for high/low safety evaluation. Source catalog labels have not been botanist reviewed. Agent visual inspection confirmed these fixtures contain no personal user images. Derived fixtures cannot establish natural-photo diagnostic performance.

Comparable geometry calls use one fixed Boolean contains-plant prompt/schema and 32-token output limit, the configured GPT-4o model and standard tier. This isolates input geometry at low cost. Valid Boolean output is **not diagnostic accuracy**. Safety pairs use the current full classifier with its unchanged output cap and a separate evaluation namespace. No lower-detail identification/diagnosis conclusion can be drawn from the probe. Provider usage, caching, output variation and latency must be reported separately.

One private approved run caps **all** Step 3 actors' normal journeys and benchmark work together at 50 attempts/$0.40, with pending reservations and unknown exposure included. The existing conservative full-context Step 2 reservation can stop evaluation before measured spend reaches $0.40. Never reduce that reservation, clear unknown costs or reset the run to complete the matrix. No unmetered provider/token-count endpoint is used.

## Baseline and attribution

Historical Step 2 smoke: 9 attempts; input 13,530, cached 1,280, output 1,637, total 15,167; $0.048595; returned `gpt-4o-2024-08-06`, default tier. That is a synthetic sample, not cost per complete scan or representative subscriber behavior. Four safety-reusing uploads were already free of extra inference.

The activated client optimization preserves provider bytes/prompts and therefore makes **no claimed model-cost reduction**. Candidate token savings are measured potential, conditional on an unverified diagnostic/safety gate. Current production costs cannot be claimed lower based on probes. Complete-journey measurements and final experiment rows are recorded in the release evidence below when available.

## Projections

Keep the product target **€0.20 average monthly AI spend per Premium subscriber** visible. Project `monthly USD = N × (mix_add × cost_complete_add + mix_unwell × cost_complete_unwell + mix_refresh × cost_refresh + mix_replace × cost_replace) + retries/failures/expired-safety cost`. A saved diagnosis adds no inference within the reuse window. Repeated completed requests add no attempts; uncertain failures retain exposure and must not be modeled as zero. Multiply measured journey costs by 10,30,100,300,1000,3000 only as explicit scenarios, not subscriber forecasts. A credible forecast needs observed journey mix, cache/expiry/retry/failure frequencies and a stated USD/EUR conversion; subscription revenue also has tax/store/payment/backend costs. No profitability or achievement of the €0.20 target is established here.
`
## Actual hosted experiment — 2026-11-15

Execution 2026-11-15T15:53:59.515Z to 2026-11-15T16:00:49.707Z. All 32 actual provider attempts (six normal journey attempts,24 geometry probes,two safety evaluations) were recorded as MEASURED: input **24,638**, cached **0**, output **1,168**, total **25,806**, cost **$0.073275000000**. Every returned model was gpt-4o-2024-08-06, standard tier. No unknown usage/exposure, failed provider attempt or automatic provider retry occurred. Both the 50-attempt and $0.40 ceilings were respected; conservative admission remained unchanged. Evaluation is now disabled, actor allowlist cleared and synthetic accounts/households/photos cleaned up. Financial records remain.

All 24 probe outputs were structurally valid and said containsPlant=true. That 100% Boolean completion rate does not establish identification, symptom, recommendation or abstention quality. All cached-input counts were zero and all probe output counts were seven, so these paired input/cost comparisons have no observed cache or output-length confounder. One call per configuration is insufficient to compare latency statistically.

The following are **actual provider total input/output and billed costs**, not separate image-token measurements. Detail h=high,l=low; provider ms includes the adapter's provider-response processing interval; operation ms is caller-observed hosted request plus ledger verification. Profile letters refer to the six configurations above. Diagnostic quality and symptom-feature retention are NOT VERIFIED for every row.

| Source/profile | Submitted px | Bytes | Detail | Input | Cached | Output | Actual USD | Provider ms | Operation ms |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|
| qr_mixed_baseline_1600_high | 1125×1600 | 152523 | high | 1507 | 0 | 75 | 0.0045175 | 1441 | 2427 |
| qr_mixed_e_original_low | 1125×1600 | 152523 | low | 487 | 0 | 71 | 0.0019275 | 2065 | 2816 |
| portrait_baseline_1600_high | 1125×1600 | 131447 | high | 1147 | 0 | 7 | 0.0029375 | 1275 | 1892 |
| portrait_a_1280_high | 900×1280 | 106973 | high | 1147 | 0 | 7 | 0.0029375 | 1671 | 2337 |
| portrait_b_1024_high | 720×1024 | 76941 | high | 807 | 0 | 7 | 0.0020875 | 717 | 1847 |
| portrait_c_768_high | 540×768 | 49068 | high | 807 | 0 | 7 | 0.0020875 | 1319 | 1945 |
| portrait_d_512_low | 360×512 | 26464 | low | 127 | 0 | 7 | 0.0003875 | 647 | 1416 |
| portrait_e_original_low | 1125×1600 | 131447 | low | 127 | 0 | 7 | 0.0003875 | 728 | 1608 |
| landscape_baseline_1600_high | 1600×1560 | 263497 | high | 807 | 0 | 7 | 0.0020875 | 1134 | 3451 |
| landscape_a_1280_high | 1280×1248 | 208270 | high | 807 | 0 | 7 | 0.0020875 | 2074 | 6618 |
| landscape_b_1024_high | 1024×998 | 148987 | high | 807 | 0 | 7 | 0.0020875 | 913 | 2489 |
| landscape_c_768_high | 768×749 | 93992 | high | 807 | 0 | 7 | 0.0020875 | 2065 | 2855 |
| landscape_d_512_low | 512×499 | 49870 | low | 127 | 0 | 7 | 0.0003875 | 684 | 1402 |
| landscape_e_original_low | 1600×1560 | 263497 | low | 127 | 0 | 7 | 0.0003875 | 1080 | 1822 |
| square_baseline_1600_high | 1597×1597 | 174282 | high | 807 | 0 | 7 | 0.0020875 | 1227 | 2062 |
| square_a_1280_high | 1280×1280 | 125193 | high | 807 | 0 | 7 | 0.0020875 | 2443 | 3069 |
| square_b_1024_high | 1024×1024 | 89814 | high | 807 | 0 | 7 | 0.0020875 | 893 | 1544 |
| square_c_768_high | 768×768 | 57185 | high | 807 | 0 | 7 | 0.0020875 | 1348 | 1984 |
| square_d_512_low | 512×512 | 31093 | low | 127 | 0 | 7 | 0.0003875 | 1038 | 1966 |
| square_e_original_low | 1597×1597 | 174282 | low | 127 | 0 | 7 | 0.0003875 | 981 | 1816 |
| extreme_baseline_1600_high | 1125×140 | 19521 | high | 637 | 0 | 7 | 0.0016625 | 1045 | 1746 |
| extreme_a_1280_high | 1125×140 | 19521 | high | 637 | 0 | 7 | 0.0016625 | 994 | 2053 |
| extreme_b_1024_high | 1024×127 | 15910 | high | 467 | 0 | 7 | 0.0012375 | 729 | 1475 |
| extreme_c_768_high | 768×96 | 10939 | high | 467 | 0 | 7 | 0.0012375 | 839 | 1685 |
| extreme_d_512_low | 512×64 | 6052 | low | 127 | 0 | 7 | 0.0003875 | 766 | 1978 |
| extreme_e_original_low | 1125×140 | 19521 | low | 127 | 0 | 7 | 0.0003875 | 573 | 1399 |

Portrait high 1600→1280 measured **no** input/cost reduction. At1024/high it used1147→807 input tokens (340 fewer) and $0.0029375→$0.0020875 (difference $0.00085 per Boolean probe). Portrait low used127 input tokens and cost $0.0003875. Landscape and square used807 input tokens at **all four high-detail sizes**; low used127. Extreme high used637,637,467,467 and low127. These are measured experimental differences, not realized production savings. Overall subscriber/image defaults remain unchanged.

Both QR-mixed safety calls returned allowed=false: high1507 input/75 output/$0.0045175; low487/71/$0.0019275. Output lengths differ, so cost delta includes both image/prompt input and output. This is one restricted fixture with zero newly accepted cases, not a representative false-acceptance estimate. No inference was used to generate expert reference labels.

Agent visual comparison of the available Ficus at1125×1600 and360×512 retains gross plant/leaf/pot silhouette but removes much fine leaf/soil surface detail. It cannot demonstrate retention of mites, lesions or early symptoms absent reviewed visible examples. Public photos do not cover the required reviewed healthy/problem/pest/sensitive-content spectrum; diagnostic and safety non-inferiority remain **NOT VERIFIED**. Production keeps1600/high.

## Full API journeys — actual measurements

| Journey | New attempts | Input | Cached | Output | Actual USD | Elapsed ms | Completion |
|---|---:|---:|---:|---:|---:|---:|---|
| Add New Plant through persistence | 2 | 3043 | 0 | 324 | 0.0108475 | 14126 | PASS |
| Repeat lost-response/same-image and saved-result requests | 0 | 0 | 0 | 0 | 0.0000000 | 3039 | PASS |
| Photo replacement and session-refresh safety reuse | 0 | 0 | 0 | 0 | 0.0000000 | 2130 | PASS |
| Premium Plant Looks Unwell through diagnosis | 2 | 2970 | 0 | 208 | 0.0095050 | 6782 | PASS |
| Save existing diagnosis | 0 | 0 | 0 | 0 | 0.0000000 | 2135 | PASS |
| Premium manual care refresh | 1 | 1536 | 0 | 258 | 0.0064200 | 3736 | PASS |
| Free limits and household revocation deny without spend | 0 | 0 | 0 | 0 | 0.0000000 | 6097 | PASS |
| Natural expired-validation upload retry | 1 | 1507 | 0 | 64 | 0.0044075 | 4491 | PASS |

Three eligible uploads (initial save,replacement after session refresh,diagnosis save) performed zero additional safety inference. Same-image selection/completed care replay also added zero attempts. After a natural five-minute wait, expired-evidence upload added exactly one measured safety attempt. Those existing reuse savings are preserved Step 2 behavior, not new Step 3 savings. The combined unwell-through-saved-diagnosis cost is **$0.009505**, not an attempt mean; saving added zero. Photo replacement here reused the same exact photo; an unseen replacement requires safety and is not priced as zero.

These are instrumented API/storage/database journeys with real persistence and signed private JPEG readback, not a live authenticated production-browser usability test. Elapsed times include operator ledger queries and exclude user think time and prior browser normalization. Manifest preprocessing times are local browser measurements, not hosted-device timing. Failure/uncertain-cost production journeys were NOT EXECUTED deliberately; timeout storms/reconciliation/exposure retention were tested with mocked provider boundaries on real disposable PostgreSQL. No missing usage is priced as zero.

## Explicit monthly scenarios, not subscriber forecasts

Scenario A is100% cold unwell-through-saved-diagnosis at measured$0.009505/journey. Scenario B is20% new-plant,60% cold unwell,10% refresh,10% exact repeat at the measured sample costs: $0.0085145 per journey. Safety is included in cold add/unwell; identification and care are one combined call. Save/repeat cache hits add no inference. Neither scenario assumes an activated lower-detail candidate.

EUR columns use an **illustrative assumption of1 USD=0.90 EUR**, not a current exchange-rate quote. No tax, store/payment fees, backend cost or subscriber revenue is netted. EUR0.20 is a product target, not an achieved result.

| Monthly journeys | A USD | A illustrative EUR | B USD | B illustrative EUR | B +5% expired-safety USD | B +5% expiry and1% unknown-failure exposure USD |
|---:|---:|---:|---:|---:|---:|---:|
| 10 | 0.095050 | 0.085545 | 0.085145 | 0.076631 | 0.087349 | 0.120749 |
| 30 | 0.285150 | 0.256635 | 0.255435 | 0.229891 | 0.262046 | 0.362246 |
| 100 | 0.950500 | 0.855450 | 0.851450 | 0.766305 | 0.873487 | 1.207488 |
| 300 | 2.851500 | 2.566350 | 2.554350 | 2.298915 | 2.620462 | 3.622463 |
| 1000 | 9.505000 | 8.554500 | 8.514500 | 7.663050 | 8.734875 | 12.074875 |
| 3000 | 28.515000 | 25.663500 | 25.543500 | 22.989150 | 26.204625 | 36.224625 |

The final column is a conservative **spend-plus-held-exposure stress envelope**, not actual billing: one hypothetical additional unknown care attempt per100 journeys retains the existing full-context $0.334 reservation; costs must later be reconciled, not assumed free. The5% expiry/1% failure rates and journey mix are explicit assumptions, not observed production frequencies. Real costs require actual user mix, cache/rate/expiry/failure statistics and an updated FX quote. At30 journeys both sample scenarios already exceed the illustrative €0.20 target; Step3 does not establish profitable unlimited heavy use or achievement of the target. Activated model-cost savings are **NOT MEASURED** because ordinary provider inputs remain identical; measured candidate differences do not authorize rollout.
