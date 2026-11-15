# Trusted model routing

All ordinary users retain GPT-4o. `OPENAI_MODEL` stays the existing safe legacy/default value; it is not a rollout switch. The server registry defines sixteen immutable configurations for four purposes:

| Route | Active configuration | Disabled candidate hypothesis | Prompt / cap |
|---|---|---|---|
| image_safety |GPT-4o|No replacement registered|plant-image-safety-v1 /700|
| initial_care |GPT-4o|Luna none|plant-care-v1 /1400|
| care_refresh |GPT-4o|Luna none|plant-care-v1 /1400|
| diagnosis |GPT-4o|Terra low|plant-diagnosis-v1 /2400|

For each botanical purpose,the evaluator can compare GPT-4o,Luna none/low and Terra none/low. All use current v1 wording/schema,high detail,original output ceiling,default service tier and `store:false`. Medium is not selected without a measured reason. Configuration metadata records model,reasoning,prompt,price version,image profile,timeout30s,one attempt,cache TTL and immutable hash. `tests/fixtures/ai-model-manifest.json` pins every definition.

## Admission and replay

The existing `ai_claim_image_operation` signature remains compatible. Its new wrapper computes an effective fingerprint from the logical v1 input identity and trusted configuration hash. Logical identity excludes the current rollout choice. Under the existing global lock,it authorizes the current actor/household,looks up existing logical or historical v1 identity first,and returns that operation's replay/wait/stop decision before selecting a new route. A duplicate therefore cannot move to another model when configuration changes. New records bind their model/configuration/version at admission. Old fingerprints and unexpired results remain retrievable; historical metadata is not invented.

The original guarded claim/start/settlement functions remain service-only compatibility helpers. Step3/4 evaluator paths retain their original approved-run behavior. A new model-evaluation wrapper validates exact registered context/image/configuration before delegating admission. All provider requests still use `runAiOperation` and its one Responses fetch; settlement can retry safely,but inference cannot automatically repeat or escalate.

Ordinary provider JSON remains byte-equivalent when the selected route is GPT-4o. Candidate reasoning/cache parameters are added only after the trusted SQL configuration binding matches the compiled registry hash. Unknown or mismatched configuration fails before provider work. No frontend-supplied model,reasoning,ceiling,prompt,schema,household or rollout percentage can select a route.

## Default-off rollout and rollback

Private `model_routes` rows start disabled at0%. Their active configuration is constrained to GPT-4o. Enabling a candidate requires explicit quality-approval and bounded-input approval hashes. Stable household/route hashing assigns cohorts; no request-level random assignment is used. Permitted stages are0,5,10,25,50,100%,with no automatic advancement. Image safety has no candidate configuration and cannot join a canary through these rows.

Operational admission criteria are recorded before evaluation in `tests/fixtures/ai-model-acceptance-policy.json`: zero unauthorized/unmetered calls,zero unknown pricing before activation,zero critical treatment regressions,zero newly accepted high-risk safety cases,zero structured-contract failures in the qualification set,provider p95 at most30000ms,and an initial cohort at most5%. Botanical correctness/non-inferiority thresholds and specialist approval remain absent,so these technical conditions alone cannot activate a model.

Rollback is an operator update of the affected private route to `enabled=false,rollout_percent=0`. Fresh operations immediately select GPT-4o; admitted/in-flight work remains bound to its original model and settles normally. Completed results replay without a second paid call. For a financial/security incident,also close the campaign and use the existing global emergency pause if necessary. No fallback pays another model solely on self-reported confidence or a provider error. Do not enable legacy Netlify inference,reset databases,delete history or modify subscriptions.

Before restoring archived Step4 Edge bundles,disable candidate routes and close evaluations. Existing GPT-4o-compatible wrappers preserve old clients and guarded older deployments. Keep additive metadata/ledger history. Source parity,JWT flags and unchanged unrelated functions are release gates. The [release record](ai-step5-production-release.md) records actual deployment results.

## Shared Step5 campaign

`model_evaluation_runs` is separate from the immutable Step3/4 limits. One approved synthetic campaign caps all associated ordinary safety/care/diagnosis and experimental work at240 attempts/$4.00 measured+reserved+unknown exposure. Existing global concurrency,reasonable-use,Free/Premium and emergency limits still apply. No budget is per model.

Runs have unique task identities,at most five approved actors and at most two-hour expiry. Limits/expiry cannot be changed,actors can only be removed,and a stopped run cannot be reset. Registrations contain hashes/trusted scope only and cannot be edited. The first campaign/global financial denial rolls back its tentative claim and persists a campaign stop. Start checks the run again. Cleanup disables the run,removes actors/registrations/results and deletes only owned synthetic data;financial history remains.

`model-evaluation` requires JWT plus allowlist,active household membership and exact registration. It returns isolated experimental results,never an ordinary save or safety receipt. Initial-care payload probes use a care-refresh lease on an owned fixture plant because those provider payloads are identical;they do not create pending drafts or certify the full initial-add flow. The ordinary GPT-4o add/persistence flow is verified separately. This distinction preserves product limits and prevents speculative candidate records entering customer plants.
