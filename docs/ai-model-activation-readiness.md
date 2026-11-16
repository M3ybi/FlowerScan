> Current production: all four Luna none bindings completed100% cutover at 2026-11-16T16:50:51.831557Z under verified OWNER_ACCEPTED_UNREVIEWED_MIGRATION authority. See [actual release](ai-luna-complete-migration.md), [checks and limitations](ai-production-cutover.md) and [Luna-only recovery](ai-luna-only-recovery.md). The Step5.3 NO-GO below is the unchanged historical independent-review decision, not current production routing. No specialist approval was added; its GPT-4o rollback examples are forbidden after cutover.

# Historical independent-review activation readiness — Step 5.3

**NO-GO. Candidate routes remain disabled at0%; ordinary operations and image safety retain GPT-4o.** No approved botanical reviewer, language reviewer, threshold, signed worksheet or route/rollout approval exists. The existing acceptance policy remains benchmark_only/activationAllowed:false. Proposed numbers do not modify it.

## Route decisions

| Route | Technical evidence | Independent quality/safety/language | Accounting | Decision |
|---|---|---|---|---|
| Initial identification/care | Five historical payload profiles valid; candidate full Add/save untested | NOT VERIFIED for every profile | Successful generation measurements; no accepted denominator | All Luna/Terra none/low BLOCKED |
| Refresh | Five profiles across five current locale contexts; historical Luna400 retained | NOT VERIFIED for every profile | Current sample measured; historical applicable Luna numerator unknown | All Luna/Terra none/low BLOCKED |
| Diagnosis | Five profiles across ten contexts/five hashes;50/50 structure | NOT VERIFIED for every profile | Current50 measured | All Luna/Terra none/low BLOCKED |
| Image safety | Existing GPT-4o path retained | No replacement qualification performed | Existing metered safety unchanged | Keep GPT-4o |

Confidence is high for finite tested contracts and source parity, insufficient for biological/safety/language/non-inferiority conclusions. Higher Terra price and lower Luna price supply no quality approval. [Per-configuration comparison](ai-model-quality-comparison.md) records costs, failures, latency and limits.

## Independent-case gap and acquisition plan

The existing policy requires at least60 independently grouped reviewed cases per applicable route. Qualified count is0. Diagnosis outputs use five hashes; all111 outputs use six. If a human established five eligible independent diagnosis cases, at least55 more would be needed. Because that proof/reference review is absent, the defensible plan starts with60 independently established cases. The62-hash reference bank supplies neither unexecuted model outputs nor complete indoor treatment truth.

| Coverage needed | Reference material to establish before inference |
|---|---|
| Healthy indoor plants | Whole-plant/leaf views, independent identity and normal-condition confirmation |
| Similar-looking houseplants | Independently identified lookalikes with uncued names |
| Juvenile foliage | Known species/age provenance; physical identity/collection records |
| Overwatering/underwatering ambiguity | Documented wet/dry/indeterminate cases with substrate/root history |
| Brown tips | Indoor examples with characterized cultural alternatives |
| Yellowing | Normal old leaves and independently characterized cultural/disease alternatives |
| Sunburn | Documented exposure history and plausible alternatives |
| Fungal-looking lesions | Visible lesions with specialist/lab support where needed; unknown pathogen retained |
| Visible pests | Resolved underside/pest images and independent pest identification |
| Early symptoms | Documented progression/follow-up and uncertain-onset examples |
| Poor image quality | Real low-light/blur/partial views, not extra independent copies |
| Insufficient evidence | Missing roots/undersides/history with approved abstention targets |
| Contradictory notes | Adversarial context tied to an independently established physical case |
| Unsafe treatment prompts | Rights-cleared physical case plus unsafe request and approved safe-answer reference |
| Multiple plausible causes | Expert differential, follow-up and unresolved alternatives |

Proposal:60 physical cases per route,12 per language, at least48 realistic indoor cases and at least4 per category above, with overlap allowed. Use owner/collection images with explicit evaluation/redistribution rights, independent reference review and physical plant/leaf identifiers. A limited pinned CC BY-SA PlantVillage comparator preserves attribution/license; it cannot supply the indoor majority. Extension photographs are not automatically reusable. **No new photograph was acquired or declared rights-cleared in Step5.3.** Every prospective case must pass rights/independence review before registration. Near-duplicate screening is supportive rather than biological proof.

## Supplemental evaluation proposal — NOT AUTHORIZED

Prioritize diagnosis:60 physical cases × five immutable v1 configurations =300 generations. With one reusable GPT-4o safety validation per case, expect360 attempts. Conservative expiry/no-reuse planning permits300 safety +300 generation =600 attempts. No inference retries are proposed; unchanged maxAttempts=1, reservations and stop-on-unknown rules apply. Locale/notes variants do not add cases.

Review capacity:at least300 complete ten-dimension botanical assessments, language review across60 responses per locale, reference preparation and adjudication. At an explicitly assumed10–15minutes per botanical response, plan50–75hours plus language/reference work. This is not measured reviewer productivity.

Using each existing model's measured diagnosis mean separately,300 generations project$0.7710564. Mean observed safety$0.049775/15 gives$0.1991 for60 validations; composed expected total$0.9701564 (EUR0.87314076 at assumed0.90). Safety for every generation instead projects$1.7665564. These are forecasts from small, correlated/cache-observed samples, not funding limits, acceptable-outcome costs or future token/price guarantees.

Unchanged full-context reservations: GPT-4o diagnosis$0.344, Luna$0.2643, Terra$2.643; safety$0.327. Summing all600 worst-case request reservations gives$467.616, an intentionally conservative all-attempt exposure bound, not an expected charge or simultaneous exposure requirement. Sequential maximum fresh Terra reservation remains$2.643. Historical$0.26355 stays separately held within global controls. Never lower a reservation to fit a forecast.

One existing campaign permits at most100 attempts/$4. This360–600-attempt plan does not fit one campaign. It authorizes no run, reset, continuation, automatic campaign chain or schema increase. Future execution needs separate explicit study-wide attempt/exposure/time approval and compatible governance. An eight-case pilot could target40 paired generations,48 expected/80 worst-case attempts, but cannot satisfy the60-case minimum; it also requires separate authorization and inherits no unused Step5.2 funds.

Initial-care and refresh are separate route decisions. Each fresh60-case/five-profile matrix adds300 generations plus safety. Reusing a provider output across those routes needs independently approved exact-input/payload equivalence and review scope; no automatic credit is assumed. Do not execute more outputs before the independent review process and reference collection are ready.

## Canary preparation boundary

No positive activation artifact is issued. A future qualified route requires the exact registry configuration ID/hash, immutable v1 prompt/hash, pricing version, approved quality/statistical evidence and rubric/policy hashes, botanical/language approvals, bounded-input approval, accounting evidence and signed human route decision. Separate rollout approval must specify at most5%, stable household assignment, financial/error/schema/safety thresholds and monitoring window. Existing admitted operations remain pinned; GPT-4o fallback applies to fresh operations. No confidence/error-triggered second paid call is introduced.

Proposed operational discussion points, not applied settings:zero unauthorized/unmetered calls; zero model/schema mismatch; immediate stop for any new unknown accounting exposure or confirmed critical treatment harm; provider p95 <=30000ms with a specified minimum20-attempt window and small-sample handling. A canary exposure limit must admit unchanged reservations while respecting global limits. A cheap average cannot justify a sub-reservation ceiling. No canary budget is approved here.

For a future authorized rollback, disable only the affected approved route:

```sql
begin;
update ai_private.model_routes
set enabled=false, rollout_percent=0
where route='diagnosis';
commit;
```

Verify fresh operations select GPT-4o, admitted work settles/replays its original model and no second inference occurs. Existing disposable PostgreSQL/Edge suites cover selection, client override denial, pinning and rollback. A production candidate toggle/rollback is NOT EXECUTED. Financial/security incidents use existing pause/close controls while retaining ledger facts. Do not delete historical uncertainty, restore unmetered inference or change subscriptions.
