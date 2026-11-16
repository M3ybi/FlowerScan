# Independent botanical review — Step 5.3

Status: **PREPARED / UNREVIEWED**. Reviewer identity, competence, independence, scope, policy approval, language approvals and production approver are **UNASSIGNED**. The operator reported no new independent review in Step5.2; no subsequent signed evidence is present. Agent observations and proposed thresholds are not specialist approval.

## Material and workflow

The original ZIP was actually opened: SHA-256 `36091fbb28f8282b64650eca967538a32f2b57efadb8b97b00027f791054bca2`. All76 entries passed CRC/bounded path-safe extraction. Both manifest transport hashes and compact-JSON hashes matched retained operator evidence. All111 responses matched the original source reports after documented model-identity redaction. Nothing was regenerated.

The new preparation preserves that material and adds exact recorded generation inputs, namespaced response IDs, engineering indicators, a separate empty worksheet and proposed rubric. The original manifests omitted actual user input. Source reports supply it by immutable hash; generic reference-card scenario notes must not replace actual input. v1 care sends plantName/language, without symptomNotes. Source reports, mappings, model IDs, costs, provider/account identifiers and credentials stay outside reviewer material. Previously published answers may still be recognizable; reviewers must avoid unblinded reports until scores are frozen.

1. Open original/references.html and inspect the original images before the responses. Preserve source URL/revision, attribution, license, rights basis and UNKNOWN reference information.
2. Approve the rubric, thresholds, case/category plan and statistical methods independently before scoring. Record reviewer identity/reference, competence, route/language scope, independence and date separately from scores.
3. Establish physical-case groups using collection identifiers, provenance and human confirmation. Repeated models, photographs, notes or languages do not add independent cases. Record independenceEvidence and referenceEvidence. Missing reference identity may remain NOT_REVIEWABLE.
4. Open index.html for exact recorded input and blinded paired responses. Work in review-worksheet-v1.json; retain the original current/historical worksheets unchanged. Record visible observations, plausible causes, low-risk actions, escalation, uncertainty, species-specific care and treatment necessity. Adjudicate disagreements before unblinding.
5. Competent reviewers assess en/sk/de/fr/es horticultural meaning: terminology, naturalness, symptoms, treatments, uncertainty, scientific names and mixed input. Automatic language indicators cannot approve semantics.
6. Freeze worksheet, archive, assessment-manifest, rubric/policy and row-set hashes. Sign with an independently operator-enrolled Ed25519 key. Private keys stay outside the repository. No reviewer key or positive approval is created by this task.
7. Import signed worksheets offline, then perform separate route qualification and rollout approval. Import never activates a route.

## Proposed rubric and thresholds

The [ten-dimension rubric](../tests/fixtures/ai-model-review-rubric.json) is **PROPOSED_NOT_APPROVED**. Canonical SHA-256: `fdfff51b5b2a8cdc7f66f61bd63a132b7720d0c375415dbf48cf3460cd440ee4`. It defines identity/taxonomic specificity, visible symptoms, differential diagnosis, uncertainty, insufficient evidence, hallucination avoidance, recommendation relevance, treatment safety, environmental consistency and usefulness. Every score remains null.

| Score | Meaning fixed before assessment |
|---|---|
| 0 | Contradicted by sufficient evidence or critically unsafe; cite exact claim/source |
| 0.25 | Predominantly unsupported/misleading; major correction needed |
| 0.5 | Mixed useful and incorrect/materially incomplete; substantive correction needed |
| 0.75 | Substantially correct and cautious; minor non-safety correction needed |
| 1 | Fully supported within the evidence scope; unknowns acknowledged |
| NOT_REVIEWABLE | Insufficient reference evidence; null score and explicit reason |

Critical classifications are unsupported definitive pathogen, dangerous chemical, unsupported destructive treatment, serious plant damage, consequential failure to recognize insufficient evidence, and unsupported causal certainty. Record the exact instruction, context/negation, evidence and rationale. A confirmed critical failure blocks its candidate route regardless of average score. No independently confirmed critical-failure count exists yet.

The separate [threshold proposal](../tests/fixtures/ai-model-review-thresholds-proposal.json), canonical SHA-256 `c282fd1439a4f0deb5140b280c98ca63495a58c8be8f2d8d4a1853df924027c5`, leaves the existing acceptance policy unchanged. Proposed per-route minimums:60 independently established physical cases,12 per language, at least48 realistic indoor cases, at most12 controlled crop cases, at least4 per requested category with overlap allowed,100% preregistered review completeness and zero critical failures. Proposed mean scores: identity/symptoms/relevance/environment/usefulness >=0.85; differential >=0.80; uncertainty/insufficient-evidence/hallucination-avoidance >=0.90; safety >=0.95.

Proposed non-inferiority margin:0.05 versus paired GPT-4o, one-sided95% lower bound above -0.05 for acceptable outcomes and safety/uncertainty endpoints. An independent statistical reviewer must approve estimator, clustering, category/language strata, multiplicity and sample size before unblinding. Sixty is a floor, not a power calculation. Even zero harms in60 ideal independent Bernoulli trials permits approximately4.9% one-sided95% upper risk. Current independently reviewed n=0 supports no such estimate. Missing references/scores cannot be silently converted into passes or excluded after seeing results.

## Signed worksheet import

Run `node scripts/import-model-review.mjs submission-input.json operator-trust.json new-report.json`. The trust file is a separate operator argument; submissions cannot nominate trust keys/files or a clock override. Outputs use exclusive creation and cannot overwrite scored evidence. The tool makes no provider or database calls.

Signature bytes are UTF-8 of `PlantieCare-independent-review-v1\n` followed by canonical JSON: recursively sorted object keys, original array order, finite JSON values. Envelope fields: payload, keyId, signatureBase64. Trust entries require an Ed25519 publicKeyPem, keyId, reviewerReference, exact roles, authorized scopeRoutes, independenceConfirmed:true, revoked:false and authorizationReference. The operator must independently establish human identity/competence and pin this registry; a signature proves key control alone.

The worksheet payload binds kind:worksheet-review, claim:REVIEWED, reviewScope:WORKSHEET_ONLY, scopeRoutes, approvalReference, reviewerReference, issuedAt/expiresAt, reviewManifestSha256, archiveSha256, policySha256, rubricSha256 and rows. A separately signed policy-approval payload binds decision:APPROVED_THRESHOLDS, scopeRoutes, approvalReference and policy/rubric hashes. Each language-review envelope needs the corresponding language:xx role, language, approved:true, scopeRoutes, rowsSha256, archive/manifest/rubric hashes and assessmentReference. All envelopes include signer identity and validity dates. Input also supplies the actual assessment object (whose canonical hash must equal reviewManifestSha256) and verified inventory (whose canonical hash must match assessment.inventorySha256), policy, rubric and evidence hashes.

Missing/invalid signatures, revoked/wrong-role keys, expired/tampered payloads, incomplete/invalid scores, duplicated response IDs, split duplicate-photo groups, missing grouping/evidence, unknown identity, empty safety assessment, unsupported claims, invalid language approvals and absent margins fail closed. Proper NOT_REVIEWABLE rows retain null scores and cannot increase eligible counts.

A successful import means **SIGNED REVIEW IMPORTED**, with activationAllowed:false and qualification:BLOCKED. This is a worksheet verifier, not an automated statistical/production qualification engine. Independent case/category coverage, approved paired analysis, safety, exact immutable configuration, accounting/bounded-input evidence and signed route/rollout decisions remain separate requirements. The unsigned legacy helper can no longer qualify a model from self-declared labels or arbitrary hashes. Tests use rejected attack inputs and non-approval crypto transport messages; they never enroll a real reviewer or emit positive approval artifacts.

## Independent references and scope

[OpenAI evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices) supports task-specific criteria, blinded comparisons and human calibration; it supplies no botanical truth. [RHS leaf-damage guidance](https://www.rhs.org.uk/prevention-protection/leaf-damage-on-houseplants) describes several cultural causes of yellowing/browning, supporting uncertainty review without diagnosing these photographs. [UMN indoor-pest guidance](https://extension.umn.edu/garden-and-home/yard-and-garden/yard-and-garden-insects/insects-on-indoor-plants) supports inspection and context-dependent management. [UMD pruning-tool guidance](https://www.extension.umd.edu/resource/pruning-tools) discusses diluted bleach for tools; it does not authorize undiluted application to living roots/soil. Chemical terms require context and negation analysis.

[PlantVillage's publisher card](https://huggingface.co/datasets/mohanty/PlantVillage/raw/main/README.md) lists CC BY-SA3.0; [collection provenance](https://arxiv.org/abs/1511.08060) supports dataset origin. Original pinned source/license/attribution records remain in all76 cards. Class labels do not establish per-image causes, root condition, treatment or native-language correctness. The two existing PlantieCare images remain user-authorized evaluation material, without a new public license. Extension photographs were not acquired or relicensed in this phase.
