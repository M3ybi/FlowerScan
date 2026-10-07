# Household billing history

This change is limited to the existing Billing & history section and the facts it reads. Current-plan cards, available plans, purchase/cancel controls, entitlements, household limits and navigation retain their existing behavior.

The section presents meaningful subscription and billing events newest first, grouped by local month/year. All, Billing, Plan changes and Renewal filters operate on loaded history without requesting data on each chip click. Fifteen events are initially visible; Show older activity reveals loaded events and requests another bounded page when necessary. Loading, empty, filtered-empty and retryable error states are separate.

History is scoped to the authenticated account and selected household. Owner and active Viewer membership permits informational history access; history rows contain no billing management actions. Changing households immediately masks the old result and cancels its ability to update the displayed history. Provider customer IDs, transaction IDs, raw payloads and internal identifiers are never rendered.

Descriptions use event-time plan and period facts. A legacy row without a previous plan or billing period receives a generic accurate description. The current household plan is never used to reconstruct historical transitions. Cards are informational rather than clickable when there is no additional useful detail.

## Duplicate audit and historical accuracy

A read-only audit found four renewals on October 6, 2026, around 19:00, 19:05, 19:10 and 19:15 UTC. Their stored provider events have distinct successive five-minute billing periods. They are separate renewals and must remain separate in the timeline. The retained provider payload does not identify the environment, so the audit does not establish whether these were sandbox/test events. An observed switch to Free followed by a delayed renewal also represents separate recorded lifecycle observations.

Deduplication uses stable provider event identity and, where available, the same receipt and renewal period. It never collapses events merely because their title, plan or timestamps look similar. Internal sync/reconciliation noise is excluded from the presentation; real lifecycle transitions remain visible.

## Rollout and verification

Deploy the additive history migration before the frontend that selects its fields. Existing rows retain their stored plan and time, with unavailable historical facts left unknown. The migration adds event facts and informational read access; it does not rewrite purchase, cancellation, entitlement or membership decisions.

Behavioral tests cover normalization, ordering, grouping, categories, duplicates versus legitimate periods, historical plan text, sensitive-field exclusion and household request isolation. An isolated browser fixture uses the production timeline and stylesheet to check filters, mobile overflow and clearance above the existing bottom navigation. Its external data boundaries are mocked; it does not prove a real payment or provider delivery.

Validated on October 7, 2026: the full suite passed 450 tests, followed by the final 13 history UI and 15 model/query/controller tests after the last focused adjustments. Type checking, production build and Android debug assembly passed. The browser fixture passed 22 DOM checks in each of 10 desktop/mobile scenes, including a true 390px CSS viewport and final-card clearance above the unchanged production navigation. This uses programmatic input and substituted repository/auth boundaries; physical-device safe areas and live checkout were not exercised.

The existing household billing fixture and the new history fixture passed together with the migration in a single rolled-back database transaction. The migration was then deployed, and a read-only check confirmed all eight fact columns, three deduplication indexes and the member read policy, with no missing event times or retained synthetic history users.
