# Step5.1 recovery release

Starting clean local/remote main: `60b42e143168d3e4689b37677aa7a96cb5a5c9ec`. Existing production was verified at38 migrations, care21/diagnosis23/validation15/upload17/vision2/prompt2/model-evaluator1, all JWT-protected. GPT-4o, v1 prompts,1600px/high,700/1400/2400 caps,16 immutable configurations, quotas, billing, RevenueCat and customer entitlements remain unchanged.

## Historical failure investigation

Classification: **UNKNOWN**. The retained failed German care-refresh request used Luna none, plant-care-v1,1400 output tokens, high-detail normalized JPEG and30m cache TTL. Its attempt/operation/provider request IDs, UTC timestamps, image metadata, configuration/hash and accounting state are collected in the restricted local `failed-attempt-baseline.json`. No customer payload or credential is published.

Using exact retained contexts/images and the unchanged immutable request factories, successful `model_11` and failed `model_36` reconstruct to identical17,034-byte provider JSON, SHA-256 `eb7d23c3af14c1522de0c3da7e1c73a05e677351840ac929dbe391a2c4f4d2e8`. This compares model,reasoning,cache policy,strict schema,input order/types,image,output cap,German instruction,service tier and serialization. The complete historical wire request/headers and error body were not retained. Identical reconstructed JSON does not prove a transient provider defect; no specific unsupported parameter is established and no published configuration is mutated.

Configured-key metadata GETs returned200 for all three exact requested model IDs. The organization usage request for19:14–19:15 UTC on2026-11-15 returned403. No authorized request-level provider usage/billing export is available. Aggregate usage alone would not prove an individual failed request's bill. No provider support message was sent and no inference/token-count request was made.

**UNKNOWN_USAGE remains unresolved:** cost null, exposure$0.26355. HTTP400 is not evidence of zero billing. Both previous runs remain closed. No production reconciliation/correction is performed without authoritative evidence; the existing trusted reconciliation RPC remains available. Preflight recorded124 historical attempts (123 measured,one unknown); Step5 alone still has65 attempts/$0.17261309 measured plus$0.26355 held exposure. No new Step5.1 paid attempt is authorized or initiated.

## Scope and recovery readiness

The change adds bounded allowlisted provider diagnostics, atomic nullable attempt metadata, a blinded review-package builder and a diagnosis-first campaign preflight. The original model settlement is preserved exactly in a private helper; public signatures and ordinary provider JSON remain compatible. The additional client-request tracing header is an opaque attempt UUID, not a model parameter. No dependency or lockfile changes.

Fresh encrypted logical archive captured2026-11-15T19:54:23.535Z: SHA-256 `c5677a55720336eb153a219930b2ca4009fc8623250da97e9cc1017dfbaa57fb`,882190 bytes before DPAPI encryption,13 private tables. Restricted ACL, disk decryption/roundtrip, catalog and full parse passed. Seven existing guarded Edge bundles were encrypted/read back. Storage object bytes and managed configuration are outside the logical archive; no restore was performed.

Preflight captured configuration fingerprints,124 historical financial facts and16-table original-row hashes. Legitimate concurrent additions are preserved; changed/deleted checkpointed rows require investigation. Neither candidate flags nor historical costs are adjusted to satisfy a check.

## Paid campaign preflight

**PAID BENCHMARK BLOCKED.** The prepared matrix prioritizes ten diagnosis contexts×five configurations, then five care-refresh locale contexts×five configurations:75 generations, at most15 fresh safety calls, at most90 planned attempts within a proposed100-attempt/$2 ceiling and60-minute expiry. Two future synthetic actors share one owned household/plant. Each input binds exact context/image/configuration hashes and submitted dimensions/bytes. Actual identity/scope UUIDs would be bound only after separate budget authorization. No run or Premium grant is created for this proposal.

The ten diagnosis contexts cover healthy appearance,yellowing,brown tips,suspected lesions,pest damage,insufficient evidence,contradictory notes,misleading claims,chemical requests and ambiguous causes. These are unreviewed scenarios, not proof that every named symptom is visible. Existing v1 prompts,images,high detail and caps are preserved. Mixed-language/instruction-like notes are included. German refresh reproduction is explicitly named in the plan; it is not an automatic retry of the old failed operation.

Financial feasibility also blocks execution: Terra requires$2.6355/care or$2.643/diagnosis before inference, exceeding the entire proposed$2 run. Current [vision documentation](https://developers.openai.com/api/docs/guides/images-vision) does not establish a Luna/Terra-specific smaller image bound. [Input token counting](https://developers.openai.com/api/docs/guides/token-counting) is documented, but a paid/free accounting policy and a verified count-backed reservation contract for these exact model/schema/reasoning inputs have not been established here. No count call, unmetered inference path, average-token ceiling or truncation is introduced. Existing conservative reservations remain unchanged.

Expected diagnosis cost is NOT MEASURED. For planning only,1500–5000 input and500–1800 output tokens per diagnosis,all input written at30m rates/no cache hits,would put the five-model ten-context diagnosis component around$0.18375–$0.64050. Adding roughly$0.10 for25 care generations and15 safety checks gives an illustrative$0.28–$0.74 range,not a forecast or admission bound. Unknown outcomes can retain much larger exposure. Such estimates do not authorize spending or justify reducing reservations. Every actual safety/generation call must count; stop at the first financial denial or unknown outcome,never reset,close/clean only owned synthetic fixtures,and retain the ledger.

## Executed local verification

| Verification | Result | Evidence / boundary |
|---|---|---|
| npm run check | PASS | TypeScript, offline suites and build actually executed |
| Existing edge/accounting/prompt/vision units | PASS | Included in executed check; targeted accounting/model suites also passed |
| New provider/review/campaign tests | PASS |14 tests, including exact old settlement copy |
| ai-postgres / vision-postgres / prompt-postgres | PASS |100 sessions each;96/44/47 assertions |
| model-postgres | PASS |100 sessions,104 assertions |
| provider-postgres | PASS |100 sessions,16 assertions;real Edge concurrency and safe reconciliation |
| Migration replay | PASS |39 migrations,11 fixtures,clean plus six upgrade paths,schema/grant parity,26 release checks |
| Deno actual graph | PASS |12 real Edge entrypoints |
| image-browser / image-webkit | PASS |282 real checks each |
| client-secrets / source-graph | PASS |26 artifacts;193 modules/749 edges,no unresolved imports/cycles |
| Blinded review browser QA | PASS |36 cards/eight contexts,images load,offline/no scripts or model IDs;installed Edge fallback |
| Full local Supabase | NOT EXECUTED |Docker unavailable;hosted disposable CI required |
| New paid compatibility/diagnosis matrix | NOT EXECUTED |No budget authorization;current Terra bound exceeds$2 |
| Independent botanical/treatment/localization review | NOT EXECUTED |No independent reviewer/approved thresholds |
| Production migration/deploy/smoke | NOT EXECUTED |Pending current-revision release gates;execution evidence added after release |

Initial review QA could not launch an absent Playwright headless shell/Chrome. The installed Edge browser then passed the actual package inspection. Those failed launch attempts are not counted as passing tests. No assertions were weakened.

## Deployment and rollback boundaries

After current-revision CI/security/financial gates,apply only migration `20261115195536_ai_provider_error_diagnostics.sql` and deploy the seven existing adapter consumers. Verify source parity,JWT flags,unchanged non-AI functions,private grants/RLS and preserved historical facts. Smoke may exercise authenticated rejection and closed-run paths without inference;positive provider compatibility remains blocked until a separately authorized feasible campaign.

On regression,close evaluations and disable candidate routes,then restore only the seven captured Step5 guarded bundles. Leave additive metadata,compatible settlement,financial history and uncertain exposure intact. Never reset a database,reopen old campaigns,change entitlements or restore pre-Step2/Netlify unmetered inference.

The model migration is not complete. See [diagnostics](ai-provider-error-diagnostics.md) and the [route decision](ai-model-qualification-decision.md).
