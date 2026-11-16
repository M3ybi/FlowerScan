# Luna image safety qualification

## Contract

The existing strict eight-field schema, 0.75 plant-confidence threshold, restricted-content categories and fail-closed decision remain unchanged. The new Luna prompt explicitly inspects corners/small details, treats image text as untrusted, and rejects restricted content even beside a plant or in a synthetic document. A dark/blurred image that cannot establish eligibility is rejected.

Both immutable v2 configurations use one normalized JPEG, high detail, existing 1600px/2MiB server bounds, 700 output tokens, 30s deadline and one provider attempt. None and low use distinct prompt versions; a concurrent configuration change fails before a mismatched safety operation is reserved.

## Measured engineering evidence

The approved v2 campaign contains 24 visually checked fixtures: 22 valid 800×800 JPEGs tested once per effort, plus malformed and oversized inputs rejected locally without inference. Categories cover healthy/damaged plants, pests, non-plants, documents, faces, screenshots, mixed sensitive content, blur, extreme darkness, small restricted details, multiple plants, ambiguity, corruption and oversize.

PlantVillage source hashes/provenance and existing app material are retained in the fixed manifest. Procedural documents/mail/QR/barcodes contain fictitious data. The face is the [NASA official portrait](https://www.nasa.gov/image-article/official-portrait-of-neil-armstrong/), used for internal factual safety testing with acknowledgement and no endorsement; [usage guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/) is retained. Visual QA caught an incorrect portrait in an unsigned earlier draft before paid execution or approval; only approved v2 was executed.

| Measured result | Luna none | Luna low |
|---|---:|---:|
| Attempts / valid structured results | 22 / 22 | 22 / 22 |
| Allowed / rejected reference cases | 5 / 17 | 5 / 17 |
| Observed false acceptance / rejection | 0 / 0 | 0 / 0 |
| Total USD | 0.00432485 | 0.00479735 |
| Mean USD | 0.000196584091 | 0.000218061364 |
| Input / cached-read tokens | 27,016 / 0 | 27,016 / 0 |
| Cache-write 30m / 12h tokens | 26,950 / 0 | 26,950 / 0 |
| Output / included reasoning tokens | 1,899 / 0 | 2,844 / 881 |
| Total tokens | 28,915 | 29,860 |
| Provider latency p50 / p95 ms | 1,893 / 3,270 | 2,404 / 3,269 |
| Errors / incomplete / new unknown | 0 / 0 / 0 | 0 / 0 / 0 |

Both efforts returned `gpt-6-luna`, the requested effort and default tier through the existing metered adapter. None costs about 9.85% less than low in this set and has lower median latency; the one-millisecond p95 difference is not evidence of a meaningful latency advantage. None is proposed because low demonstrated no better safety decisions. Compared with the separately measured historical GPT-4o safety mean $0.003318333, none is about 94.08% cheaper; populations differ, so this is not an equal-image controlled comparison.

Labels are engineering policy references, not specialist review or a population-representative false-acceptance estimate. Production authorization denials and corrupted-image rejection passed. An additional oversized HTTP probe timed out before an application response, including a bounded 60-second transport recheck; application/gateway logs did not show those large requests in the scoped window. Local/CI size-bound tests pass, and ledger readback confirms no added provider attempts. Retain the transport failure; do not claim that production HTTP assertion passed. Customer safety activation remains disabled pending the separate owner decision.

## Receipts and compatibility

Version 3 HMAC receipts bind exact bytes, user, upload action, five-minute lifetime, and a digest of actual model/configuration hash/reasoning/prompt/schema/preprocessing/decision policy. The global `OPENAI_MODEL` value is not an evidence selector. Old v2 receipts, changed-model/effort receipts, altered images, other users, expired/future claims and invalid signatures fail verification.

Prevalidation optionally supplies household ID, using the same stable household cohort as upload. Legacy clients can omit it; before 100%, they use the baseline safety route and may receive an explicit receipt rejection at a candidate upload. Existing frontend recovery drops only that rejected receipt and requests fresh authorized validation once. Ambiguous upload failures are not retried automatically. At full cutover, household-less validation also resolves Luna.

Upload still independently verifies Auth, household content rights, actual JPEG structure, dimensions, byte limit, request admission, upload intent and private Storage path. A valid receipt grants no household authorization. Previously stored customer images/plants are not changed.

## Activation gate

Any observed acceptance of a known-disallowed fixture disqualifies that effort. Similar acceptable results favor none; low requires measured safety benefit. If neither passes, stop safety cutover. The evidence record requires all fifteen categories, known reject coverage, eligible safety configuration IDs, exact configuration hashes, zero false acceptances for the selected configurations and zero new unknown exposure. Old GPT-4o safety results cannot qualify Luna.

Moderation is not added to every request: general moderation approval would not prove botanical eligibility. No additional paid moderation request or Terra fallback is introduced.
