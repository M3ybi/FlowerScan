# €3.99 household economics

## Calculation and scope

`src/lib/householdProfitability.ts` calculates 56 rows per cost set: 10, 30, 100, 300, 500, 750, 1,000 and 3,000 monthly actions × seven scenarios. It does not alter Free allowances, Premium entitlements, provider admission or reasonable-use controls.

| Scenario | Initial calls/action | Refresh | Diagnosis | Fresh safety |
|---|---:|---:|---:|---:|
| Cold diagnosis | 0 | 0 | 1 | 1 |
| New plant identification/save | 1 | 0 | 0 | 1 |
| Mixed household | .4 | .2 | .4 | .8 |
| Mostly refresh | .1 | .8 | .1 | .2 |
| 90% identical-result replay / 90% safety reuse | .01 | .07 | .02 | .1 |
| 30% extra charged failures/replacements | .52 | .26 | .52 | 1.04 |
| Unique heavy-use stress | .5 | .5 | 1 | 1.5 |

These coefficients are explicit scenarios, not observed subscriber behavior or an automatic retry policy. Replays require identical authorized operation identity. Failed/replacement calls require the existing authorization/accounting controls.

The owner view compares historical GPT-4o, Luna none/low generation with historical safety, and all-Luna none/low cost sets using separate measured means. Current-month means include mixed evaluation/product traffic and are not a controlled equal-image benchmark. Costs for a safety effort remain unknown until measured; every final-Luna projection depending on unmeasured safety stays NULL. A cheaper classifier is not automatically eligible for activation.

## Assumptions

Default illustration: €3.99 gross/month, 23% VAT assumption, 30% store commission, 1% RevenueCat on gross sales, 3% refund rate, USD1.10/EUR, €0.10 infrastructure, €0.05 Free-tier allocation and €0.05 support per paying household. These are assumptions, not verified customer-specific deductions or a live FX quote.

Available contribution before AI = gross excluding assumed VAT × (1 − commission) × (1 − refunds), minus gross-based processing/RevenueCat fees, fixed processing fees and allocations. Convert actual USD AI cost through the explicitly supplied USD/EUR assumption. Break-even is floor(available contribution in USD / projected cost per action); unknown or zero unit cost does not produce an invented finite threshold.

The calculator accepts alternative store/web/refund/FX/allocation inputs. Compare 15% and 30% store scenarios and an illustrative web processing scenario separately. Current official references: [Apple small-business eligibility and rates](https://developer.apple.com/app-store/small-business-program/), [Google subscription service fees](https://support.google.com/paymentscenter/answer/112622?hl=en), [Stripe Slovakia pricing](https://stripe.com/en-sk/pricing), [RevenueCat pricing](https://www.revenuecat.com/pricing). Rates depend on actual programs, channel, card type and contracts. RevenueCat's free threshold must not be mistaken for a marginal 1% fee on only revenue above that threshold.

Actual net collected revenue is unavailable in the current database. No actual household profit is claimed. Annual receipts cannot be treated as twelve monthly payments without a recognition schedule; sandbox grants produce no revenue. The app's current billing mode is not changed to invent paying customers.

## Operating targets

Average AI target €0.20, heavy-use target €0.50, warning €1 and elevated review €1.50 are monitoring targets. USD ledger distribution is labelled USD and must be converted with a stated FX assumption before comparing with EUR targets. They are not new scan quotas.

Finite €3.99 revenue cannot guarantee profit for arbitrarily many unique paid inference requests. Heavy scenarios can have negative contribution. Support, tax, infrastructure and Free allocations are explicit assumptions; the result is contribution, not audited net profit. Any stricter product cap would require a separate product-policy approval.

Preparation verification: deterministic tests execute all 56 scenarios, retain unknown safety cost, verify fee/FX/break-even arithmetic, reject malformed financial inputs and demonstrate negative heavy-use contribution. Final numerical all-Luna results remain pending actual safety measurements.
