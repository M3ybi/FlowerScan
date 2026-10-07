# Household system audit and release — 2026-10-07

## Resulting model

Households own their entitlement and billing identity. Active Owners and Viewers have identical plant and care permissions. Only Owners administer household names, invitations, Viewer removal and billing. Membership and plant access remain enforced by Supabase authorization and RLS.

Standard households retain one Owner. The existing administrative metadata identifies the special two-Owner household; runtime code does not compare household names. Configured Owners remain active after Premium expires. This intentionally preserves both special Owners on Free, while sharing and Viewer access are suspended.

Only Owner and Viewer are valid current membership/invitation values. Existing Editor rows migrate to Viewer. The historical PostgreSQL enum label remains for compatibility with existing function signatures and historical migrations; current CHECK constraints and mutation functions reject it.

## Invitation and authentication path

1. An Owner creates an email-first Viewer invitation with a normalized email and seven-day expiry. Active members plus valid pending invitations may occupy at most three Premium slots.
2. A secure token hash authorizes a minimal link preview. Recoverable tokens are stored in Vault and are available only through Owner-authorized delivery/copy functions. Retries reuse the existing invitation. Email failure leaves its reservation intact.
3. Registered and new recipients authenticate with the invited email. A bounded invitation UUID context preserves the review through password signup, confirmation, Google login and supported native callbacks; raw invite tokens are not added to authentication redirects.
4. The global inbox derives the verified recipient email from the authenticated server session. It refreshes after identity changes, focus and mutations, and removes locally expired invitations without polling.
5. Acceptance requires the matching verified email and commits invitation consumption and Viewer membership together. Repeated acceptance by the same recipient is idempotent. Existing homes, plants, care records and subscriptions remain unchanged.
6. Joining refreshes the household directory immediately and keeps the existing selection. The recipient explicitly chooses Stay or Switch. Only a successfully loaded directory proving no prior active home permits first-household selection.

Supabase confirmation/recovery messages now have a signed Resend Send Email Auth Hook, separate from the household invitation sender. Unsigned requests fail before parsing or sending. See [authentication email delivery](auth-email-hook.md) and [invitation operations](household-invites.md).

## Household isolation and subscription lifecycle

The directory contains only currently authorized active memberships. A selected inaccessible household cannot silently read another home's data. Account changes and household switches invalidate caches and pending continuations, clear scoped interface state, and resolve the appropriate entitlement and quotas. An expired or removed selection refreshes the directory and falls back through authorized memberships.

New provider purchases use a stable server-allocated household customer. Existing payer UUIDs and receipt associations are preserved. Signed webhooks apply supported billing updates, event deduplication, provider timestamp ordering, history and membership reconciliation in one transaction. A receipt cannot grant another household access. Cancellation retains Premium until the paid period ends; expiry invalidates pending invitations and suspends Viewers without deleting their records or plants.

The legacy public-token Netlify APIs and old scheduled jobs now default to disabled. A client build flag cannot enable them. The server-only rollback flag is documented for internal compatibility use; it must remain unset in the production membership-based system. Legacy storage is preserved.

See [billing identity and rollout](revenuecat-billing.md) and [subscription configuration](revenuecat-subscriptions.md).

## Validation and operational limits

Before deployment, the linked database had three households and five memberships, including the correctly configured special household. No ownerless homes or unsupported active role rows were found. Synthetic SQL fixtures run both migrations and recipient, capacity, access, expiry, removal and billing scenarios inside a transaction followed by rollback. Production counts and the absence of synthetic users are checked afterward.

Validation passed: all 415 tests in the repository runner, TypeScript, the production Vite build, Deno checks for all three changed Edge entry points, the combined PostgreSQL rollback fixtures, and Android debug assembly after Capacitor synchronization. It includes regression checks for duplicate/idempotent acceptance, wrong accounts, verification return context, occupied slots, stale async reads, active membership permissions, subscription ordering and the disabled legacy boundary. The initial Android attempt used the machine's Java 8 default and failed; rebuilding with Android Studio's bundled JDK succeeded without changing project configuration.

Both migrations and the three updated Edge Functions were deployed to the linked project. Post-migration checks retained three households and five memberships, zero unsupported role rows, zero ownerless households, zero synthetic users and zero retained test locks. Anonymous inbox enumeration and authenticated invocation of the trusted billing RPC remain denied. The separate simultaneous-removal test could not run through concurrent CLI calls because their temporary database login initialization conflicted; actual removal branches and the held advisory lock are covered by the rollback fixture.

Browser automation is unavailable in this environment. Component rendering and responsive CSS are checked, but actual browser/device interaction and visual layout are not certified. No real signup, recipient email, store purchase, restore or cancellation is sent by the fixtures. A native compile validates packaging but does not prove device authentication or store behavior.

RevenueCat's restore policy must be **Keep with original App User ID** before enabling new household native billing. Database receipt checks cannot stop a transfer within RevenueCat itself. New household native purchase/change/restore stays disabled until the documented configuration flag is enabled after verifying this policy. Existing legacy-payer handling and web customer refresh retain their supported paths. Production web checkout also requires an intentionally configured live Web Billing key; the supplied sandbox setup does not establish live billing.

## Release order

1. Deploy the signed auth-email function, its secrets and the matching Supabase Send Email hook, preserving existing Auth providers and redirect allowlists.
2. Apply the invitation lifecycle migration, then the billing identity migration.
3. Deploy both updated invitation and RevenueCat Edge Functions.
4. Deploy the coordinated frontend and Netlify functions; confirm HTTP health, current assets and disabled legacy responses.
5. Complete authorized recipient-email and real-device/store sandbox checks before enabling native household billing or live checkout.

The migrations preserve existing production data and historical membership/subscription records. Rollback is coordinated: retain schema compatibility, disable new billing entry points first, and preserve the secure membership authorization boundary. Re-enabling public-token endpoints is not a production access-control rollback.
