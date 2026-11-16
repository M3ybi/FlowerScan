# Authenticated owner risk acceptance

## Separate authority

A household Owner/Viewer is not a global product operator. `ai_private.owner_operators` is empty on migration; explicit enrollment of the user-identified confirmed Auth account is an operator action outside committed source. No email, account UUID, credential or user-editable metadata grants authority in the browser.

JWT-protected `ai-owner-control` calls existing `requireUser`/Auth `getUser`, binds actor to that verified subject, then checks the private allowlist. Ordinary users receive only their own access boolean; global state, money, approvals and actions are denied. New private tables have RLS and no client/service-role table privileges. Public RPCs are service-only SECURITY DEFINER with fixed search paths. Only trusted Edge code forwards verified actors.

## Spending approval

The user authorized the exact immutable proposal SHA-256 `0a956fc2fd4348ba1df36556ea129236834cc96810f3f240f730108b00463bad`. On 2026-11-16 at 12:14:52Z, a normal pre-existing signed-in owner session recorded approval in the production owner UI; database readback confirmed `SUPABASE_AUTH_OWNER`, exact proposal hash and no revocation. No Admin-generated link/token or SQL-inserted approval impersonated the owner.

The one approved campaign began at 12:16:44Z with a 13:16:44Z expiry, 120 attempts/$4/one in flight, registered hashes/configurations and three scoped synthetic actors. At the safety checkpoint it has 44 measured attempts costing $0.00912220, zero pending/new unknown exposure. One proposal gets one approval and one immutable run; no reset or continuation.

Factual evidence was registered with SHA-256 `f4be0ded5a094ce82f203f2efc6942f3404a6c5e39b0d7e781110e5821073f9a`, tested source revision `18aa79931f210f63a249988c8c7cc9ecadea8470`, both exact safety configurations, seventeen known rejected cases per effort, zero observed false acceptances/rejections, all fifteen safety categories and explicit limitations. The evidence file also retains actual token/cost/latency aggregates and the archived engineering evidence basis. This is not botanical approval.

## Quality risk state

`OWNER_ACCEPTED_UNREVIEWED_MIGRATION` is distinct from `INDEPENDENTLY_REVIEWED`. Existing independent-review/signature/policy controls are not filled with fake approvals or relaxed. Independent botanical reviews remain zero.

Operator-registered factual evidence must include the tested release revision, exact configuration hash map, eligible safety IDs, fixture-manifest SHA, all fifteen safety categories, known-disallowed cases/false acceptances, provider attempts, measured spending, new unknown exposure, engineering result and explicit limitations. Client assertions cannot create passing evidence.

The actual owner reviews that evidence, primary/recovery configurations, known uncertainty and rollback conditions. Acceptance records exact route scope/hashes, timestamp, maximum initial canary 5%, authentication method and revocation. The explicit UI consent also lists and grants **each** stage 5/10/25/50/100 for each selected route. These grants permit advancement only when corresponding operating-evidence gates pass; elapsed time is not approval or evidence.

No safety configuration with a known false acceptance or any new unknown exposure is accepted. Recovery configurations must appear in the same accepted exact-hash evidence; unsafe/unqualified low reasoning is excluded.

## Application and revocation

Service-only stage application consumes the owner's existing grant; it does not impersonate a new owner decision. Exact order, current hash, unrevoked acceptance and measured successful previous-stage traffic are required. Every application/recovery/cutover produces an immutable event.

Revocation is authenticated and monotonic. Before cutover it disables the candidate. After cutover it pauses affected routes; it never selects GPT-4o/Terra. Already processing attempts still settle financial facts. Revoked/paused reserved work cannot start another provider charge. Qualified Luna recovery is an explicit owner action for new operations only.

Current state: **owner enrolled; authenticated spending approval VERIFIED; measured safety evidence registered; exact-hash quality risk acceptance NOT RECORDED; customer canary DISABLED**. The separate decision is pending in the user session.
