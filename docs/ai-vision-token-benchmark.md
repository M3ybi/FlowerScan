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

Portrait is the existing Ficus photo (1125×1600); landscape is 1600×1560; square is a centered three-row crop of a 1597×1600 public photo; extreme is an explicitly derived 8:1 horizontal strip of the Ficus. Cropping is solely a geometry fixture. QR-mixed adds a synthetic non-private QR to the public Ficus for high/low safety evaluation. Source catalog labels have not been botanist reviewed. Agent visual inspection confirmed these fixtures contain no personal user images. Derived fixtures cannot establish natural-photo diagnostic performance.

Comparable geometry calls use one fixed Boolean contains-plant prompt/schema and 32-token output limit, the configured GPT-4o model and standard tier. This isolates input geometry at low cost. Valid Boolean output is **not diagnostic accuracy**. Safety pairs use the current full classifier with its unchanged output cap and a separate evaluation namespace. No lower-detail identification/diagnosis conclusion can be drawn from the probe. Provider usage, caching, output variation and latency must be reported separately.

One private approved run caps **all** Step 3 actors' normal journeys and benchmark work together at 50 attempts/$0.40, with pending reservations and unknown exposure included. The existing conservative full-context Step 2 reservation can stop evaluation before measured spend reaches $0.40. Never reduce that reservation, clear unknown costs or reset the run to complete the matrix. No unmetered provider/token-count endpoint is used.

## Baseline and attribution

Historical Step 2 smoke: 9 attempts; input 13,530, cached 1,280, output 1,637, total 15,167; $0.048595; returned `gpt-4o-2024-08-06`, default tier. That is a synthetic sample, not cost per complete scan or representative subscriber behavior. Four safety-reusing uploads were already free of extra inference.

The activated client optimization preserves provider bytes/prompts and therefore makes **no claimed model-cost reduction**. Candidate token savings are measured potential, conditional on an unverified diagnostic/safety gate. Current production costs cannot be claimed lower based on probes. Complete-journey measurements and final experiment rows are recorded in the release evidence below when available.

## Projections

Keep the product target **€0.20 average monthly AI spend per Premium subscriber** visible. Project `monthly USD = N × (mix_add × cost_complete_add + mix_unwell × cost_complete_unwell + mix_refresh × cost_refresh + mix_replace × cost_replace) + retries/failures/expired-safety cost`. A saved diagnosis adds no inference within the reuse window. Repeated completed requests add no attempts; uncertain failures retain exposure and must not be modeled as zero. Multiply measured journey costs by 10,30,100,300,1000,3000 only as explicit scenarios, not subscriber forecasts. A credible forecast needs observed journey mix, cache/expiry/retry/failure frequencies and a stated USD/EUR conversion; subscription revenue also has tax/store/payment/backend costs. No profitability or achievement of the €0.20 target is established here.
