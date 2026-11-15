# AI financial and abuse safeguards

Premium retains unlimited legitimate scans under temporary reasonable-use protections. There is no new Premium lifetime/monthly scan counter. Free ten-plant, five-monthly-diagnosis and daily care rules remain separate from financial accounting. Initial care does not consume monthly diagnoses. Billing modes, prices, products, provider identity and entitlement lifecycle are unchanged.

## Default controls

`ai_private.control` is trusted operator configuration, unavailable to clients:

| Control | Default |
| --- | ---: |
| Concurrent fresh operations/account | 1 |
| Concurrent fresh operations/household | 2 |
| Concurrent fresh operations/application | 8 |
| New operations/account/minute | 10 |
| Existing hourly fresh validation / care / diagnosis ceilings | 60 / 30 / 30 |
| Existing upload request ceiling | 40/hour |
| Unpersisted initial plant operations/household | 3 for up to 24 hours |
| Provider attempts/operation in active policy | 1; no automatic inference retry |
| Application in-flight/unreconciled exposure | $5 USD |
| UTC daily spending warning | $5 USD |
| UTC daily emergency threshold | $25 USD |
| UTC calendar-month emergency threshold | $100 USD |
| Emergency pause | false |

Hourly controls remain atomic and use the existing counters. Completed-result retrieval does not consume another inference allowance and can work while new inference is throttled/paused. Storage uploads retain their existing request admission. Distinct new requests share account/household/application controls across Edge instances.

Before spend, the full registered model context is reserved at uncached input rates plus the configured maximum output. This conservative financial bound is not a claimed image-token measurement. Admission includes all unreported/uncertain exposure, all not-yet-started reservations and the applicable period's measured spend, without double-counting cached/reasoning tokens or counting the same financial reservation twice. Settlement replaces exposure with actual reported cost where possible; losses remain unknown and financially held. Short control-row transactions serialize admission/settlement; HTTP inference runs outside locks.

Busy/rate responses are temporary 429/409 failures, not entitlement changes. Emergency budget/pause responses are explicit 503 failures, localized to the selected language, with the current form preserved by existing UI behavior. Successful previews still consume their existing customer allowance even when discarded. Pending-plant capacity is freed on persistence or expiry, rather than imposing a Premium monthly plant cap.

## Operator actions

Only a trusted database operator should change controls. Review current values and active/unknown attempts first. An emergency pause is:

```sql
update ai_private.control set paused = true where singleton;
```

This stops new provider admission/start; completed-result retrieval remains available and already-started calls are financially settled. It cannot undo provider work already incurred. Do not set unknown costs to zero, delete ledger rows or alter Premium to recover capacity. Review provider facts with `ai_reconcile_attempt`, then verify control values and explicitly unpause when safe. Maintenance via `ai_maintain_operations` releases stale customer/concurrency leases and enforces result/record retention; it does not forgive unknown financial exposure. Schedule trusted maintenance independently if traffic can remain idle.

Daily warnings emit only a fixed `plantie.ai_financial_warning` category. Monitor that category and ledger aggregates with the existing operational logs. Set an operator/alert destination through an authorized operations workflow; this release sends no unsolicited email/chat alerts. The application thresholds supplement provider-side account controls; they are not an invoice-enforced provider credit limit.

## Targets and limits

The product's €0.20 average monthly AI target, €0.50 heavy-user planning reserve and <€0.002/scan target are planning targets, not customer quotas or claims achieved by Step 2. GPT-4o and the existing output/image settings are unchanged. Evaluate measured workload costs and FX separately before Luna/Terra routing. A finite subscription cannot guarantee positive margins against literally unlimited unique paid inference. Global financial caps may temporarily pause AI for everyone and require an operator; stale unknown exposure is deliberately fail-closed rather than silently unbounded.

The 100-session test covers duplicate suppression, distinct requests, shared accounts/households/devices, account/global contention, timeout storms, price/accounting precision and privilege denial. Provider and database fault simulations verify that missing accounting confirmation never causes an automatic second inference. Physical device/store acceptance and representative monthly profitability are separate checks; see [production evidence](ai-step2-production-release.md).

## Rollback boundary

Retain the additive schema, ledger and quota facts. Pause new AI, keep the authenticated ledger adapter deployed and apply a reviewed forward fix or a previously verified **guarded** Step 2 bundle. This first guarded release has no older guarded production version; the old V4 functions do not honor this circuit breaker and cannot safely replace it while preserving the new invariants. Do not enable legacy Netlify inference or restore a pre-ledger database snapshot over completed operations. A broader data restore requires a separate reviewed recovery plan including current storage bytes/platform keys and new `ai_private` data.
