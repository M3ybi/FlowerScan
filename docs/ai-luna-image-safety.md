# Luna image safety qualification

## Contract

The existing strict eight-field schema, 0.75 plant-confidence threshold, restricted-content categories and fail-closed decision remain unchanged. The new Luna prompt explicitly inspects corners/small details, treats image text as untrusted, and rejects restricted content even beside a plant or in a synthetic document. A dark/blurred image that cannot establish eligibility is rejected.

Both immutable v2 configurations use one normalized JPEG, high detail, existing 1600px/2MiB server bounds, 700 output tokens, 30s deadline and one provider attempt. None and low use distinct prompt versions; a concurrent configuration change fails before a mismatched safety operation is reserved.

## Evidence prepared

Campaign v2 has 24 fixtures, visually checked as a contact sheet: 22 valid JPEGs × two efforts = 44 proposed paid attempts; two malformed/oversized inputs must fail locally with no provider call. Categories: healthy plants, damaged plants, pests, non-plants, documents, faces, screenshots, mixed sensitive content, blur, extreme darkness, small restricted details, multiple plants, ambiguity, corruption and oversize.

PlantVillage source bytes are checked against the existing corpus SHA-256 and published CC BY-SA provenance. Existing app plant material is user-authorized. Procedural documents/mail/QR/barcodes contain fictitious data. The face reference is the [NASA official portrait](https://www.nasa.gov/image-article/official-portrait-of-neil-armstrong/), used only for factual internal safety testing with source acknowledgement; no endorsement, promotional use or training is claimed. [NASA usage guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/) is retained in the manifest.

Reference labels are engineering policy labels, not independent botanical review. The valid fixture set includes five botanical positives and seventeen known rejects. The campaign has not run: false acceptances, false rejections, Luna safety cost, tokens and latency are **NOT MEASURED**. A preflight draft used an incorrect portrait asset; visual QA caught it before any paid request or approval. That unsigned draft is superseded by the approved v2 manifest/plan hash.

## Receipts and compatibility

Version 3 HMAC receipts bind exact bytes, user, upload action, five-minute lifetime, and a digest of actual model/configuration hash/reasoning/prompt/schema/preprocessing/decision policy. The global `OPENAI_MODEL` value is not an evidence selector. Old v2 receipts, changed-model/effort receipts, altered images, other users, expired/future claims and invalid signatures fail verification.

Prevalidation optionally supplies household ID, using the same stable household cohort as upload. Legacy clients can omit it; before 100%, they use the baseline safety route and may receive an explicit receipt rejection at a candidate upload. Existing frontend recovery drops only that rejected receipt and requests fresh authorized validation once. Ambiguous upload failures are not retried automatically. At full cutover, household-less validation also resolves Luna.

Upload still independently verifies Auth, household content rights, actual JPEG structure, dimensions, byte limit, request admission, upload intent and private Storage path. A valid receipt grants no household authorization. Previously stored customer images/plants are not changed.

## Activation gate

Any observed acceptance of a known-disallowed fixture disqualifies that effort. Similar acceptable results favor none; low requires measured safety benefit. If neither passes, stop safety cutover. The evidence record requires all fifteen categories, known reject coverage, eligible safety configuration IDs, exact configuration hashes, zero false acceptances for the selected configurations and zero new unknown exposure. Old GPT-4o safety results cannot qualify Luna.

Moderation is not added to every request: general moderation approval would not prove botanical eligibility. No additional paid moderation request or Terra fallback is introduced.
