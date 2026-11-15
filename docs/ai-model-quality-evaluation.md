# Model quality evidence and activation gates

**No Luna or Terra route is qualified for ordinary users.** Published labels improve the available evidence,but no model output or model confidence is treated as independent ground truth.

## Corpus and provenance

`tests/fixtures/botanical-model-corpus.json` contains76 cases:60 pinned PlantVillage photographs across20 published crop classes,plus16 unreviewed context scenarios using existing authorized PlantieCare photos. There are62 distinct image hashes. Distinct files do not prove distinct physical leaves;the publisher warns about leaf grouping. No statistical independence or general houseplant accuracy is claimed.

The primary [publisher dataset card](https://huggingface.co/datasets/mohanty/PlantVillage) specifies CC BY-SA3.0. The [author repository](https://github.com/spMohanty/PlantVillage-Dataset) is pinned at `7f7ecc7e1eaca78107e3affe7cb5abd9427e139a`; each downloaded blob matched its Git hash and SHA-256. Source,license,attribution,reference crop/disease label,taxonomic specificity,uncertainty,review status and language are recorded per case. [Hughes and Salathé's collection paper](https://arxiv.org/abs/1511.08060) provides independent dataset-label provenance. This does not supply per-image treatment or multilingual review.

Run `node scripts/prepare-model-corpus.mjs` to retrieve the approved pinned subset into ignored local files. It validates origins,hashes,JPEG/byte contracts and writes attribution. No private customer photograph is copied. Existing catalog references are user-authorized evaluation material;no new public license for those photos is invented.

| Evidence category | Cases | Review boundary |
|---|---:|---|
| Published healthy crop-leaf label |30|Label applies to collected leaf,not a complete houseplant-health examination|
| Published disease class |24|No per-image symptom or treatment annotation|
| Published spider-mite class |3|Does not establish that a pest itself is visibly resolved|
| Published yellowing/virus class |3|Class label is not permission for image-only causal certainty|
| Houseplant/context/adversarial scenarios |16|Conditions and labels unreviewed;some reuse the same photograph|
| Fully independently reviewed PlantieCare cases |0|The60-case qualification target is not met|

Language assignments: en16;sk15;de15;fr15;es15. Case categories and reviewed-category counts are computed separately by `summarizeModelCorpus`. Requested contexts include lookalikes,juvenile/partial views,yellowing,brown tips,water/light/nutrient uncertainty,spots,early symptoms,poor photos,misleading names,contradictory notes and unsupported treatments. These are unreviewed scenarios,not proof that every condition is visible in the photograph. Independently reviewed visible-pest and sensitive/non-plant safety coverage remains missing. Safety replacement is a separate future qualification and remains disabled.

Operator contact-sheet inspection confirmed crop-leaf content and a range of visible image conditions;it is not a botanist diagnosis. Unknown symptom/treatment/physical-leaf information remains explicitly UNKNOWN. Empty reference arrays do not mean healthy or no alternative explanation.

## Review policy

The versioned acceptance policy separates engineering review from independent botanical/localization approval. Technical thresholds are explicit;botanical minimums,non-inferiority margin and specialist approval are NOT APPROVED. The gate requires at least60 independently grouped reviewed cases,all five languages,complete independent dimension scores and approved thresholds. A critical treatment regression blocks qualification. The helper does not itself change routing.

Assess each model independently of price for identity specificity,visible observations,differentials,uncertainty,abstention,treatment safety,usefulness,hallucination,language and structural completeness. Published crop labels can support a limited label-reference comparison;they cannot certify root causes,chemical safety,pet safety,houseplant generalization or the appropriateness of every recommendation. A model judge cannot approve labels it invented. No quality percentage or statistically significant winner is declared from these unreviewed cases.

## Experiment boundary

Paired technical comparisons use the same v1 prompt/schema,image,name,notes,language,detail and output ceiling across GPT-4o,Luna none/low and Terra none/low. Initial care,refresh and diagnosis are separate route identities. Reasoning is included in the output ceiling;incomplete responses count as billed failures and are not retried with a larger cap. Safety remains GPT-4o. Actual attempted cases,language/structure observations and limitations are added after hosted execution in [the benchmark](ai-model-benchmark.md).

Identification,diagnosis,treatment safety,multilingual quality and cost per independently acceptable result remain **NOT VERIFIED** unless the missing reviews are supplied. Stage0 technical evaluation can ship while these gates stay closed.
