# Luna accounting and financial controls

## Preserved ledger

At 2026-11-16T11:18:56Z, a fresh read-only production checkpoint captured 218 attempts, $0.66296874 measured and $0.26355 unknown exposure. The earlier 217-attempt baseline remains historical evidence; one live customer attempt appeared during preparation. No migration campaign provider request had executed at this checkpoint.

The historical failed Luna request remains `UNKNOWN_USAGE`, NULL measured cost and $0.26355 exposure. It must not be zeroed, repriced or reconciled without authoritative evidence. Original attempt-row hashes, prices/rules, controls and sixteen customer-table row-hash sets are captured privately before deployment. New legitimate customer activity is not migration test spend.

Every call uses the installed operation claim/start/finish adapter, model binding, price version, leases, financial admission, product authorization, retries limited to accounting settlement, and sanitized diagnostics. Wrong/unregistered provider models or mismatched returned effort fail closed while still settling usage or holding unknown exposure. No error causes a second model call.

## Current registered prices

Official [Luna model/pricing documentation](https://developers.openai.com/api/docs/models/gpt-6-luna), checked 2026-11-16: per million tokens, standard global input $0.10, cached read $0.01, 30m write $0.125, 12h write $0.25, output $0.50. Above 272,000 input tokens: input/cache/write ×2, output ×1.5. Regional ×1.10 is separately represented; production requests use standard/default global pricing. Historical GPT-4o/Terra price records are unchanged.

No tighter Luna image formula is claimed. Reserve the documented 1,050,000-token context ceiling, all input at the enforced 30m cache-write price and long-context multiplier, plus maximum output:

| Purpose | Max output | Conservative USD reservation |
|---|---:|---:|
| Safety | 700 | 0.263025 |
| Initial care / refresh | 1,400 | 0.263550 |
| Diagnosis | 2,400 | 0.264300 |

Observed average expense never replaces these reservations. Cached reads/writes are disjoint input buckets. Reasoning tokens are included in output once, not added as another charge. Unknown usage/pricing retains exposure and NULL cost.

## Campaign

The original schema allows up to 240 attempts/$4/two hours. A prior document's description of a schema-wide 100-attempt cap was incorrect: 100 was the previous campaign's chosen limit. Those old immutable campaigns remain closed.

The new authenticated proposal adds a stricter 120-attempt/$4/60-minute cap, one run per approval, registered image/configuration hashes and synthetic actors. Ordinary synthetic journeys and evaluation requests share the same aggregate run. Any new settled unknown stops that run; later reconciliation does not reset it. No continuation/reset/automatic retry is authorized. Existing global controls and historical uncertainty remain in force.

## Owner metrics

The dashboard groups authoritative attempts by requested model, reasoning and route, including safety, measured/unknown exposure, input/cache/write/output/reasoning tokens, latency, operation costs, household distribution (including zero-spend households), current-status Free allocation and monthly trends. Evaluation traffic and failures are included and labelled.

Access entitlements are not collected revenue. Historical webhook environment is missing; new sanitized metadata retains it without modifying entitlement logic. Known production purchase events may support gross event amounts and paying-household evidence; Test Store/SANDBOX remain separate. Net collected receipts, VAT/fees/refund amounts, recognized annual revenue and actual cross-operation journey cost remain NULL where source evidence is absent. Projections are explicitly separate. No fake revenue or journey correlation is introduced.
