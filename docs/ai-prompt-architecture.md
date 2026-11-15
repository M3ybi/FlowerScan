# PlantieCare prompt architecture — Step 4

Starting local/remote main: `1682ddea7db67687d8ded7d8838b4ebff3812d7a`. See [release evidence](ai-step4-production-release.md) for deployed revisions, tests and limits. GPT-4o,1600px/high images,existing plans and financial controls are retained.

## Exact inventory

| Purpose | Active definition / schema / parser | Version | Output ceiling | Existing actual observations |
|---|---|---|---:|---|
| Identification + initial care | `_shared/productionBotanicalPrompts.ts:buildProductionCarePayload`; `plantCareContract.ts:careSchema,parseCare` | `plant-care-v1` | 1400 | Step2 initial output237–292; Step3 cold add combines safety/care:3043 input,324 output,$0.0108475 |
| Manual care | Same care factory/schema/parser; operation type `care_refresh` | `plant-care-v1` | 1400 | Step3:1536 input,258 output,$0.0064200 |
| Problem diagnosis | `productionBotanicalPrompts.ts:buildProductionDiagnosisPayload`; `plantDiagnosisContract.ts:diagnosisSchema,parseDiagnosis` | `plant-diagnosis-v1` | 2400 | Step2 output148–161; Step3 unwell combines safety/diagnosis:2970 input,208 output,$0.0095050 |
| Image safety / upload fallback | `imageSafetyPolicy.ts:imageSafetyPrompt,imageSafetySchema`; `plantImageValidation.ts:validateImageSafety` | `plant-image-safety-v1` | 700 | Step3 expired safety:1507 input,64 output,$0.0044075; eligible save adds zero attempts |
| Isolated image-geometry probe | `vision-token-benchmark/index.ts` | `vision-token-probe-v1` | 32 | Historical Step3 measurement only; not identification/diagnostic evidence; run disabled |

Paths above are under `supabase/functions/_shared` unless stated. All actual ordinary provider work passes `runAiOperation`, Auth, service-only SQL admission/start/settlement and existing budget/abuse rules. Legacy Netlify care/diagnosis are410; absent Netlify image handlers are404. They contain no alternative active prompt architecture. There is no Luna/Terra route.

Active provider JSON is byte-equivalent to the immutable Step3 source for valid responses across all five languages, including misleading/mixed-language Unicode input tests. This includes property order, schema, image position/detail, output ceiling, `service_tier=default` and `store=false`. Centralization alone therefore claims no token saving and requires no new v1 prompt identity.

## Role, data and language boundaries

V1 top-level `instructions` comes from `src/lib/onboarding.ts:buildAiLanguageInstruction`. It resolves the selected locale, defaults unsupported input to English, requests only that language for user-facing strings, preserves keys/enums/scientific names and overrides input/device/geographic language. Its wording is retained exactly.

V1 care user content contains the task instructions, supplied name (sanitized to90 characters), then one high-detail image. Diagnosis similarly includes task instructions,name,optional notes (600 characters),then image. These endpoints do not receive history/root/substrate measurements, retrieval or external tools. Names and notes are hypotheses, not verified evidence. V1 does not explicitly isolate instruction-like user content; that hardening is a behavioral candidate, not silently enabled.

Safety's current prompt/schema/decision threshold and authorization/reuse path are unchanged. This release does not add a safety call to ordinary generation. Storage still independently validates safety and household authorization; generation's existing direct-call safety boundary remains as documented in Step1/Step3.

## Contracts and all consumers

Care retains eleven required fields: `displayName`, `likelyName`, `identificationConfidence`, `shortCare`, `carePills`, `light`, `watering`, `wateringIntervalDays`, `soil`, `careTips`, `identificationNote`. Identification enum is `confident|likely|needs-confirmation`; watering is an integer2–60. Pills retain `label,value,tone`, with `green|amber|blue|rose` tones. Business parsing expects five distinct pills and three tips. Required schema arrays still have the original shapes; no field or enum is removed or reordered.

These fields feed `src/utils/customFlower.ts`, `features/plants/services/addPlant.ts`, `plantieRepository.ts`, creation/update RPCs and child tables. `PlantGrid`/`PlantDetailsPage`, `app/carePresentation.tsx`, QR/report/export and scheduling/notifications consume them. Watering interval affects reminders; its text must not imply an unconditional exact schedule. All fields have downstream uses; removal is unjustified. Labels remain model-produced for old-client compatibility; fixed-label substitution was not activated without multilingual/UI and measured cost evidence.

Diagnosis retains `{ diagnosis: ... }` and `diagnosis_title,confidence,confidence_label,reasoning_summary,observed_symptoms,recommended_steps,risk_level,disclaimer`. Score remains integer0–100; label/risk enums remain `low|medium|high`. `src/utils/diagnostics.ts` normalizes the draft; repository RPCs map confidence labels into existing database values. Saved diagnosis UI renders title,score,label,risk,evidence,reasoning,steps and disclaimer. Confidence is not calibrated accuracy. Server character caps remain title140,reasoning800,disclaimer240,symptom160,step220; frontend further limits title120,reasoning700,disclaimer220. Prompt requests up to five symptoms/steps while existing parsers allow eight. These known differences are retained rather than changing installed-client contracts speculatively.

Structural hardening rejects schema-invalid numeric-string watering and non-string list items instead of coercing/filtering them into a success. The immutable Step3 handler reproduces the numeric-string acceptance; new tests verify rejection with usage retained. Valid schema-conforming responses remain unchanged. Refused/incomplete/failed/cancelled responses now have distinct financial failure categories and use existing public errors, with no automatic inference retry.

## Centralized candidates, disabled for ordinary traffic

`botanicalPromptCandidates.ts` defines immutable baseline/concise/quality/balanced care and diagnosis definitions. Baselines use `plant-care-v1`/`plant-diagnosis-v1`; new versions are `plant-{care|diagnosis}-{concise|quality|balanced}-v2`. `tests/fixtures/botanical-prompt-manifest.json` pins eight definition hashes over all five language payloads and schemas. A material change requires a new version, not rewriting a published identity. Production handlers import only `productionBotanicalPrompts.ts`; they do not import candidate selection.

| Candidate | Changes | Expected risk / reason disabled |
|---|---|---|
| A baseline | Current exact prompt/schema/ceiling | Control; no new quality claim |
| B concise | Shorter localization/task instructions; trusted instruction/data separation | May omit useful nuance or change response/language behavior |
| C quality | Visible evidence vs assumptions, lookalikes, environmental differentials, conservative treatment and explicit insufficiency | Materially changes diagnostic reasoning/recommendations; can increase tokens |
| D balanced | Concise actionable wording plus quality principles | Not assumed superior; requires paired cost and reviewed quality evidence |

Shared principles,identification,care,diagnosis,language and output schema remain separate components. No universal task prompt replaces their specific requirements. Candidates use trusted top-level instructions and JSON-quoted context in a user message. Image text remains untrusted. The same schemas and high-detail image are used. The code never accepts client-supplied prompts,schemas,models or arbitrary ceilings. Approved lower-ceiling experiments are separate registered configurations; lowering a ceiling alone is not a billed saving.

Evaluation version identity includes immutable definition version,language,ceiling and expiring run UUID, and participates in the existing fingerprint/idempotency/ledger. The namespace cannot replay into ordinary v1 results or another run. Exact provider-returned model,image/context hashes and configuration are required for reproducible inputs; stochastic output is not promised to be identical. Historical v1 records remain compatible.

## Evaluation isolation and caching

`prompt-evaluation` requires JWT plus a private approved run and exact registered definition/context/image/configuration. New `prompt_evaluation_inputs` stores hashes and trusted configuration only, never raw notes or images. `ai_resolve_prompt_input` and `ai_claim_prompt_operation` are service-only fixed-search-path RPCs. They delegate unchanged Step2 claim and the existing shared evaluation budget; start/settlement remain unchanged. All ordinary smoke calls by registered actors consume the same run budget. Experiments use authorized synthetic Premium care-refresh/diagnosis scopes, not ordinary customer records. Results remain in the existing short-lived private operation cache and are cleared on cleanup.

Runs retain the existing50/$0.40 constraints,full-context reservations,unknown-exposure retention,global circuit breaker and concurrency. No accounting/control row,plan,price,entitlement,model or image setting changes. Default state is disabled; no ordinary cohort flag is enabled. See [quality gates](ai-diagnostic-quality.md) and [measurements](ai-prompt-token-benchmark.md).

The [official prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching) distinguishes older-model implicit caching from newer-family breakpoint/prewarm controls. We do not add those newer-model parameters,extend retention,pad a prompt,change provider storage or introduce personal long-term caching. V1 stable prefixes and actual cached tokens are measured. Candidate stable trusted instructions precede request-specific data. No guaranteed cache hit or saving is assumed.
