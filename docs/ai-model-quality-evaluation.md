# Model quality evidence and activation gates

## Step 5.2 actual output evidence

The authorized campaign produced **75 structurally valid new responses: 50 diagnosis and 25 care refresh**, with complete five-profile pairs across all five locales. This closes the requested engineering comparison, not the independent quality gate. Ten diagnosis contexts reuse five photographs; the 76-case/62-hash framework still has zero fully independently reviewed qualification cases. The operator confirmed no new independent review is available.

The executed blinded package contains 111 unreviewed outputs (75 new plus 36 historical care), all 76 reference cards/62 original images, provenance/rights/unknowns and separate empty worksheets. Current and historical responses stay in separate sections to preserve repeated-context provenance. Operator mappings remain outside the package. Browser and archive QA passed; no score, specialist approval or independent case group was invented. [Reviewer workflow and observations](ai-model-review-results.md) distinguish literal model behavior from botanical truth.

Engineering inspection found an actual content issue despite valid schema: GPT-4o returned the French misleading-name case title `Incroyable`; the four candidates returned cautious no-clear-problem titles. This is a reviewable output difference, not a confirmed injection root cause or population accuracy result. In the chemical-request case, the candidates explicitly warned against pouring bleach into soil, while GPT-4o used a generic harsh-chemical warning. Neither example establishes treatment safety across the corpus. Model confidence remains model content, not a human grade; requested locale metadata and sampled localized text do not establish native fluency or clinical appropriateness.

No botanical minimums, non-inferiority margin, treatment/localization approval or sufficiently independent reviewed sample has been supplied. Cost per acceptable result remains NOT VERIFIED. All candidate routes remain NOT QUALIFIED despite measured lower generation costs. See [the release](ai-step52-qualification-release.md).

Step5.1 adds an offline blinded review package for36 existing care responses/eight contexts/five images and a diagnosis-first preparation plan. It adds no specialist scores or diagnosis outputs. Model/cost fields are withheld and the operator mapping is separate;previously published outputs can still be recognized. All botanical,treatment and localization gates remain unapproved. See [qualification decision](ai-model-qualification-decision.md).

**No Luna or Terra route is qualified for ordinary users.** Published labels improve the available evidence, but no model output or model confidence is treated as independent ground truth.

## Corpus and provenance

`tests/fixtures/botanical-model-corpus.json` contains76 cases:60 pinned PlantVillage photographs across20 published crop classes, plus16 unreviewed context scenarios using existing authorized PlantieCare photos. There are62 distinct image hashes. Distinct files do not prove distinct physical leaves; the publisher warns about leaf grouping. No statistical independence or general houseplant accuracy is claimed.

The primary [publisher dataset card](https://huggingface.co/datasets/mohanty/PlantVillage) specifies CC BY-SA3.0. The [author repository](https://github.com/spMohanty/PlantVillage-Dataset) is pinned at `7f7ecc7e1eaca78107e3affe7cb5abd9427e139a`; each downloaded blob matched its Git hash and SHA-256. Source, license, attribution, reference crop/disease label, taxonomic specificity, uncertainty, review status and language are recorded per case. [Hughes and Salathé's collection paper](https://arxiv.org/abs/1511.08060) provides independent dataset-label provenance. This does not supply per-image treatment or multilingual review.

Run `node scripts/prepare-model-corpus.mjs` to retrieve the approved pinned subset into ignored local files. It validates origins, hashes, JPEG/byte contracts and writes attribution. No private customer photograph is copied. Existing catalog references are user-authorized evaluation material; no new public license for those photos is invented.

| Evidence category | Cases | Review boundary |
|---|---:|---|
| Published healthy crop-leaf label |30|Label applies to collected leaf, not a complete houseplant-health examination|
| Published disease class |24|No per-image symptom or treatment annotation|
| Published spider-mite class |3|Does not establish that a pest itself is visibly resolved|
| Published yellowing/virus class |3|Class label is not permission for image-only causal certainty|
| Houseplant/context/adversarial scenarios |16|Conditions and labels unreviewed; some reuse the same photograph|
| Fully independently reviewed PlantieCare cases |0|The60-case qualification target is not met|

Language assignments: en16; sk15; de15; fr15; es15. Case categories and reviewed-category counts are computed separately by `summarizeModelCorpus`. Requested contexts include lookalikes, juvenile/partial views, yellowing, brown tips, water/light/nutrient uncertainty, spots, early symptoms, poor photos, misleading names, contradictory notes and unsupported treatments. These are unreviewed scenarios, not proof that every condition is visible in the photograph. Independently reviewed visible-pest and sensitive/non-plant safety coverage remains missing. Safety replacement is a separate future qualification and remains disabled.

Operator contact-sheet inspection confirmed crop-leaf content and a range of visible image conditions; it is not a botanist diagnosis. Unknown symptom/treatment/physical-leaf information remains explicitly UNKNOWN. Empty reference arrays do not mean healthy or no alternative explanation.

## Review policy

The versioned acceptance policy separates engineering review from independent botanical/localization approval. Technical thresholds are explicit; botanical minimums, non-inferiority margin and specialist approval are NOT APPROVED. The gate requires at least60 independently grouped reviewed cases, all five languages, complete independent dimension scores and approved thresholds. A critical treatment regression blocks qualification. The helper does not itself change routing.

Assess each model independently of price for identity specificity, visible observations, differentials, uncertainty, abstention, treatment safety, usefulness, hallucination, language and structural completeness. Published crop labels can support a limited label-reference comparison; they cannot certify root causes, chemical safety, pet safety, houseplant generalization or the appropriateness of every recommendation. A model judge cannot approve labels it invented. No quality percentage or statistically significant winner is declared from these unreviewed cases.

## Experiment boundary

Paired technical comparisons use the same v1 prompt/schema, image, name, notes, language, detail and output ceiling across GPT-4o, Luna none/low and Terra none/low. Initial care, refresh and diagnosis are separate route identities. Reasoning is included in the output ceiling; incomplete responses count as billed failures and are not retried with a larger cap. Safety remains GPT-4o. Actual attempted cases, language/structure observations and limitations are added after hosted execution in [the benchmark](ai-model-benchmark.md).

Identification, diagnosis, treatment safety, multilingual quality and cost per independently acceptable result remain **NOT VERIFIED** unless the missing reviews are supplied. Stage0 technical evaluation can ship while these gates stay closed.

## Executed output evidence

37 model generations were attempted in 8 case/route/language contexts. 7 contexts completed all five configurations. The planned primary set reuses five images across three routes; five further diagnosis contexts cover ambiguity/adversarial scenarios. Actual execution reached only five initial-care contexts and three refresh contexts, using five distinct photographs. No diagnosis context executed. Repeated route uses and reused houseplant photographs are not independent cases. Plant names often supplied the reference crop identity, so identity agreement is **not blinded visual identification accuracy**. No claim of60 independent reviewed examples, statistical significance or a winning model follows.

The actual responses below are **model claims**, not accepted labels. Full raw synthetic outputs remain in the local evidence report; private server result caches were removed. Scientific name differences and self-reported confidence are displayed without treating either as a quality score.

| Case / locale | Model / effort | Returned likely identity | Self-reported confidence |
|---|---|---|---|
| houseplant_01 / en | gpt-4o:legacy | Ficus microcarpa | likely |
| houseplant_01 / en | gpt-6-luna:none | Ficus microcarpa (ginseng ficus bonsai) | confident |
| houseplant_01 / en | gpt-6-luna:low | Ficus microcarpa | likely |
| houseplant_01 / en | gpt-6.1-terra:none | Ficus microcarpa | confident |
| houseplant_01 / en | gpt-6.1-terra:low | Ficus microcarpa | confident |
| pv_001 / sk | gpt-4o:legacy | Malus domestica | confident |
| pv_001 / sk | gpt-6-luna:none | Jabloň domáca (Malus domestica) | needs-confirmation |
| pv_001 / sk | gpt-6-luna:low | Jabloň domáca (Malus domestica) | likely |
| pv_001 / sk | gpt-6.1-terra:none | Malus domestica | likely |
| pv_001 / sk | gpt-6.1-terra:low | Malus domestica | likely |
| pv_034 / de | gpt-4o:legacy | Malus domestica | likely |
| pv_034 / de | gpt-6-luna:none | Malus domestica | likely |
| pv_034 / de | gpt-6-luna:low | Malus domestica | likely |
| pv_034 / de | gpt-6.1-terra:none | Malus domestica | likely |
| pv_034 / de | gpt-6.1-terra:low | Kulturapfel (Malus domestica) | likely |
| pv_055 / fr | gpt-4o:legacy | Solanum lycopersicum | likely |
| pv_055 / fr | gpt-6-luna:none | Tomate (Solanum lycopersicum) | likely |
| pv_055 / fr | gpt-6-luna:low | Solanum lycopersicum | likely |
| pv_055 / fr | gpt-6.1-terra:none | Tomate (Solanum lycopersicum) | likely |
| pv_055 / fr | gpt-6.1-terra:low | Solanum lycopersicum | likely |
| pv_058 / es | gpt-4o:legacy | Solanum lycopersicum | likely |
| pv_058 / es | gpt-6-luna:none | Solanum lycopersicum | needs-confirmation |
| pv_058 / es | gpt-6-luna:low | Peperomia caperata | needs-confirmation |
| pv_058 / es | gpt-6.1-terra:none | Solanum lycopersicum | needs-confirmation |
| pv_058 / es | gpt-6.1-terra:low | Solanum lycopersicum | needs-confirmation |

Diagnosis, adversarial treatment and poor-photo comparisons were **NOT EXECUTED** after the accounting stop. There are no candidate diagnosis/treatment outputs to assess. All25 initial-care outputs passed the existing structured/business contract; 11 refresh outputs passed and one request failed without usage. These observations do not qualify any model for botanical accuracy or safety.

A concrete published-label disagreement occurred on `pv_058`:the source crop label is Tomato, but Luna low returned `Peperomia caperata` with needs-confirmation. The other four profiles returned tomato identities. This is a reference-label mismatch, not a specialist judgment about every visible feature or a statistical accuracy rate. It is evidence against assuming that low reasoning always improves identification. Named-input cueing, isolated leaves and absent full review still limit all five configurations.


These excerpts make model differences reviewable. A crop disease label alone cannot validate a diagnosis title, causal reasoning, pesticide suggestion or first-step safety. The corpus supplies no independent treatment decisions for these photographs. The misleading-name, contradictory-note and chemical-request cases reuse authorized houseplant images; they test response behavior, not disease truth.

| Requested locale | Generations | Valid contract | Review boundary |
|---|---|---|---|
| en | 10 | 10 | No independent localization review |
| sk | 10 | 10 | No independent localization review |
| de | 7 | 6 | No independent localization review |
| fr | 5 | 5 | No independent localization review |
| es | 5 | 5 | No independent localization review |

Engineering inspection can observe the requested language and stable keys/enums, including mixed-language notes. It does not establish fluent localized horticultural advice or preserve every safety nuance. There was no independent native-speaker assessment. Language gate remains NOT VERIFIED.

Safety stayed on GPT-4o. The separate technical safety checks, if executed, were NOT EXECUTED. They are unreviewed technical fixtures; no replacement-safety accuracy or sensitive-image qualification is claimed. Actual candidate safety overrides or automatic second-model calls were not introduced.

**Decision:** corpus PARTIAL; identification, diagnosis, treatment safety, multilingual quality and cost per independently acceptable result NOT VERIFIED. All candidate flags remain closed even when responses are valid and cheaper. Obtain independently reviewed visible symptoms, differentials, treatments, uncertainty and locale scores, an approved non-inferiority policy and adequate independent category coverage before any at-most5% canary.
