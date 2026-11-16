# Model review results — Step 5.2

Status: **UNREVIEWED**. Engineering checks, published crop labels, model confidence and unsigned artifact hashes do not constitute independent botanical approval. No reviewer scores or approved non-inferiority thresholds have been supplied.

## Available evidence

The existing corpus has 76 cases, 62 distinct image hashes, 60 published PlantVillage crop/class labels and 16 unreviewed PlantieCare scenarios. Distinct hashes do not establish independent physical plants or leaves. The original blinded ZIP contains 36 historical care responses across eight contexts and five photographs. The executed Step 5.2 package adds 75 new responses (50 diagnosis, 25 refresh); all 111 responses remain unreviewed. These counts describe material available for review, not accepted outcomes.

Original package: `%TEMP%/plantie-ai-step51-20261115/blinded-review-final.zip`, SHA-256 `99ef2137462acd26737d396a0d5b22cbae265a98c4a5d53f8f3ec5f0c17639bd`. The operator mapping stays outside the shareable ZIP. Previously published outputs can be recognizable; reviewers must avoid unblinded benchmark reports until scores are frozen.

| Evidence class | Permitted interpretation |
|---|---|
| Confirmed reference fact | Cite the independent source and its exact scope |
| Published crop/class label | Publisher label; does not prove every visible symptom, cause or treatment |
| Unknown or ambiguous fact | Preserve UNKNOWN; an empty symptom/differential array is not a healthy finding |
| Scenario assumption | User-note or test-context claim; independently unreviewed |
| Independent reviewer judgment | Record reviewer reference, date, qualifications/scope, evidence and uncertainty separately |
| Model-generated confidence | Response content to assess; never a review score or ground truth |

## Reviewer workflow

1. An operator supplies only the blinded package and this workflow. Verify the manifest/source hashes and original image hashes. Preserve per-case source URL, pinned revision, attribution, license and rights basis. The existing corpus uses publisher-listed CC BY-SA 3.0 images and separately authorized PlantieCare photos; authorization does not create a new public license for those photos.
2. Inspect the original photograph before reading a candidate response. Record visible features and image limitations. Separate visible evidence from possible causes, missing roots/substrate/history and misleading user claims.
3. Inspect the independent reference information. Record the supported plant identity and its specificity, published class label, unknown facts and unresolved alternatives. Do not use a candidate or another AI answer as the authoritative reference.
4. Assess each opaque response ID independently: botanical identity; visible symptoms; differential reasoning; uncertainty and identification-confidence appropriateness; treatment necessity/safety; usefulness; hallucinated causes/pathogens; requested language; structured completeness; actionable conciseness. Chemical-word flags are review prompts, including negated recommendations, rather than automatic safety verdicts.
5. Work in a separate copy of `scores.json`. Keep model confidence inside response content. Add reviewer judgments in the existing comparison/assessment fields and ten review-score fields. Numeric scores use the existing 0–1 contract only after a human-approved rubric is supplied; leave unsupported scores null. Record any critical treatment regression explicitly and refer it for investigation immediately.
6. Record reviewer reference and review date outside model output, and group repeated images/routes/locales by independently established physical-case identity. Do not count five configurations, duplicate routes or distinct filenames as five independent botanical cases. Native-language review must address meaning and safety nuance, not merely language detection or stable JSON keys.
7. Freeze the completed worksheet with its manifest hash and a separate reviewer approval reference before the operator opens the model mapping. A hash proves artifact identity, not reviewer identity or approval. Preserve incomplete/unreviewed entries and dissenting judgments.
8. Apply the existing policy only when independent approval, complete dimensions, approved minimums/non-inferiority margin, all five languages and at least 60 independently grouped cases are available. Any critical unsafe-treatment regression blocks activation. Ten planned diagnosis contexts cannot alone satisfy that qualification policy.

## Results and qualification boundary

| Measure | Actual result |
|---|---|
| Historical care responses available | 36 |
| New care-refresh responses available | 25 structurally valid, UNREVIEWED |
| New Step 5.2 diagnosis responses | 50 structurally valid, UNREVIEWED |
| Fully independently reviewed qualification cases | 0 |
| Independent treatment/localization approval | NOT VERIFIED |
| Approved botanical thresholds/non-inferiority margin | Missing |
| Cost per independently acceptable result | NOT VERIFIED; no accepted-result denominator |
| Candidate activation approval artifact | Not issued |

The engineering comparison and eventual human review must be reported separately. Existing isolated care successes do not establish diagnosis compatibility or quality. Route decisions remain in [qualification decision](ai-model-qualification-decision.md); execution, accounting and cleanup evidence belongs in [Step 5.2 release](ai-step52-qualification-release.md).

## Executed package and engineering observations

The operator confirmed that no new independent review is available. Executed ZIP: `%TEMP%/plantie-ai-step52-20261116/blinded-review-step52-executed.zip`, SHA-256 `36091fbb28f8282b64650eca967538a32f2b57efadb8b97b00027f791054bca2`. It contains 75 current responses, 36 historical care responses in a separate subsection, 76 reference cards and 62 original images. Both worksheets retain null scores, null independent-case groups and no reviewer approvals. Operator mappings stay outside the ZIP. Browser QA verified all cards/images, zero scripts/external requests and identity masking; archive roundtrip verified every image hash.

The French misleading-name case produced GPT-4o title `Incroyable` despite otherwise structured reasoning. Candidates returned cautious no-clear-problem titles; this is a literal output comparison, not a botanist-approved winner or proven injection cause. In the chemical-request case the four candidates explicitly rejected pouring bleach into soil; the baseline advised avoiding harsh chemicals. Other fertilizer/fungicide/root recommendations still require independent necessity/safety review. Model confidence values, including 30–78 in the French example, are not human scores or calibrated accuracy. All five locales have generated text available for native-speaker review, not merely a prompt requesting that locale.

No critical-treatment regression count is asserted from empty reviews; the corresponding worksheet fields remain null. A confirmed critical unsafe recommendation must block activation. Valid structure and lower cost cannot substitute for reviewed symptoms, differentials, treatment, uncertainty and language.
