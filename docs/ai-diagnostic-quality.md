# Diagnostic quality and activation gates

**Botanical identification,diagnosis and treatment safety: NOT VERIFIED for new prompt behavior.** The available public catalog is not an independently reviewed symptom/treatment corpus. No quality percentage is inferred from model confidence,JSON validity or catalog names. The user confirmed no additional reviewed corpus is available; this step uses available PlantieCare material.

## Reproducible framework

`tests/fixtures/botanical-evaluation-cases.json` records approved public image paths,rights basis,weak reference identities,reference visible symptoms,acceptable differentials,unsafe recommendation examples,insufficiency and human-review status. Initial cases cover a catalog plant,misleading plant-name/language/treatment injection,and a Unicode/mixed-language unseen-roots claim. All are explicitly unreviewed. Empty reference symptom/differential arrays mean **unknown ground truth**, not evidence of a healthy plant or no disease.

`scripts/lib/promptEvaluation.mjs` validates approval/path/provenance and requires independent human review,complete dimension scores and approved thresholds before a review gate can pass. A critical treatment regression blocks it. An LLM may organize outputs but cannot supply authoritative missing labels. The review summary is not a deployment switch. Evaluation artifacts record case,prompt/model versions,image SHA/configuration,language,provider status/tokens/cost/timing,structural validation and review status.

Review dimensions: identification,visible symptoms,differential reasoning,uncertainty,treatment safety,usefulness,hallucination,language,structured validity and actionable conciseness. The framework supports reviewed local/rights-cleared material; no ordinary customer photo is copied for evaluation. Raw synthetic outputs stay in restricted local artifacts/short-lived private results,not public documentation or customer plant records.

## Candidate intended behavior

Care candidates treat the supplied name as a hypothesis,consider lookalikes/juvenile or partial views,prefer the supported taxon and use `needs-confirmation` for insufficient species evidence. Scientific names and enums stay unchanged. Watering remains a2–60-day reminder and should be qualified by substrate moisture,season,pot,temperature and light. Five pills and three tips remain required and should agree across fields.

Diagnostic candidates separate visible signs from user assertions and differential causes. They consider relevant watering,aging,light,nutrient,root,environmental,injury,pest and infectious possibilities without listing unsupported diseases. They must not invent invisible mites/pathogens or conclusive root disease. Reversible checks/additional observations precede chemicals,root pruning,repotting or abrupt watering/light changes; uncertainty and risk to people/pets remain explicit. These are candidate instructions,not verified improvements in botanical performance.

`botanicalConsistencySignals` finds explicit watering interval contradictions across five languages and candidate confidence-band mismatches. The score bands are a candidate display convention,not scientifically calibrated probability. These signals are **review aids only**; they neither approve treatment nor replace a reviewer. Absence of a regex signal is not semantic correctness. Production v1 does not acquire a new arbitrary confidence threshold or recommendation filter.

## Deterministic and adversarial verification boundaries

Tests cover valid contracts and malformed/missing/truncated/refused output; exact enums/cardinalities; invalid numeric-string/list coercion; misleading score/interval signals; all five selected language instructions; mixed-language/Unicode/instruction-like names and notes; and JSON keys/scientific-name preservation. Candidate trusted instructions contain no interpolated user context. A malicious note cannot choose the server model,schema,detail,ceiling,household or candidate definition. Live empirical injection resistance and five-language diagnostic correctness remain separate evidence requirements.

The existing frontend language/diagnosis/care presentation tests remain mandatory. An English model mock under a Slovak instruction is a plumbing fixture,not proof of Slovak generation. Real generations may demonstrate limited language adherence but cannot verify all tasks in all five languages or botanical safety within this small budget.

## Activation decision

Category A can ship: byte-equivalent v1 definition/schema centralization,strict rejection of schema-invalid types,distinct failure telemetry,immutable version controls and default-off evaluation instrumentation,after compatibility/security/financial tests and production smoke.

Category B remains **NO-GO**: altered task instructions,shortened language wording,changed differential/uncertainty/treatment guidance or materially smaller output caps. Category C candidates remain authorized-actor-only. Ordinary customers retain `plant-care-v1`, `plant-diagnosis-v1`,current output ceilings,GPT-4o and1600/high images.

Required before activation/Step5 model routing: independently reviewed healthy/affected/ambiguous/lookalike/small-feature/sensitive-content cases; explicit approved per-dimension thresholds; paired same-input baselines; multilingual review; no critical treatment regression; correct abstention and useful recommendations; complete ledger/fault/authorization validation; measured cost per successful full journey; rollback flags and monitoring. No reviewed threshold or clinical/botanical accuracy score has been invented. This release does not establish Luna/Terra readiness.
