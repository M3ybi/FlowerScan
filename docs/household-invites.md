# Household invitations

Premium households have three occupied slots. Active members and actionable pending invitations each occupy one slot. Free households have one slot and cannot invite; the single configured administrative household retains its two designated Owners on Free. Only Owners can create, resend, copy or revoke invitations; new members join as Viewers. Owners and active Viewers have equal plant and care permissions. `reconcile_household_access` revokes pending invitations when Premium ends and suspends Viewers without deleting membership or plant data.

Invitations belong to normalized email (`trim().toLowerCase()`), so recipients do not need an existing account. A new invitation expires exactly seven days after creation. `expires_at`, `declined_at`, `expired_at`, `revoked_at` and `used_at` determine its current state. Timestamp-based filtering excludes expiry immediately, even before reconciliation materializes `expired_at`. Accepted, declined, revoked and expired records remain history and never consume a slot. Resending retains the original token and expiry. A new invitation after expiry or decline creates a new seven-day reservation.

Recipient acceptance requires an authenticated user whose `auth.users.email_confirmed_at` is set and whose normalized email matches the invitation. OAuth uses the same database email check; a different Google account cannot accept. Token possession authorizes only a minimal preview. Existing household memberships, plants, care history and subscriptions stay unchanged. Acceptance creates a Viewer relationship and marks the reserved invitation consumed in one locked database transaction. Retrying the same accepted invitation by the same member is idempotent. Household selection is a client preference: acceptance must retain a usable current household until the user explicitly chooses the new household.

The browser calls `create_household_invite` once per recipient, then passes only the invitation ID to `send-household-invite-email`. The Edge Function loads the active invitation through `get_household_invite_delivery`, which checks the signed-in Owner and Premium status. The database stores the token hash for validation and the new token encrypted in Supabase Vault so either Owner can resend the same link. The Edge Function constructs the URL and sends through Resend. It never trusts the recipient, household name, URL or token from the browser.

Recipient RPCs:

- `get_household_invitation(raw_token, target_invite_id)` returns the household name, recipient and inviter email, Viewer role, current status, expiry and capacity. Anonymous callers need the opaque token. Identifier lookups require the authenticated verified matching email. Invalid tokens or unrelated identifiers return no row.
- `list_my_household_invitations()` derives the verified email from the authenticated user; it accepts no client email and returns only actionable invitations without raw tokens.
- `accept_household_invitation(target_invite_id)` and the compatibility `join_household_by_invite(raw_token)` validate the matching verified recipient and return the joined household.
- `decline_household_invitation(target_invite_id)` records a recipient decline without changing memberships; repeated declines are harmless.
- `list_my_households()` returns only the user's currently usable active memberships.

The inbox refreshes after authentication, verification, invitation changes and returning focus. Authentication callbacks carry invitation context, including the identifier, so registration and verification resume the review screen rather than accepting automatically. Supabase Auth confirmation emails use separate SMTP configuration from this invitation Edge Function.

Set these **Supabase Edge Function secrets** before deploying:

```text
RESEND_API_KEY=<server-side Resend API key>
RESEND_FROM_EMAIL=Plantie <invites@your-verified-domain.example>
APP_PUBLIC_URL=https://your-production-site.example
```

The sender domain must be verified in Resend and permitted to send to arbitrary recipients. `onboarding@resend.dev` is intentionally rejected by the function because it is limited to test recipients. `APP_PUBLIC_URL` is the controlled site origin or base path; production requires HTTPS. Local development may use `http://localhost:5173`. The invite route is `#/join?invite=<token>`. Never put the provider key in `VITE_*` or browser code.

The hosted Plantie project uses `APP_PUBLIC_URL=https://plantiecare.com` and `RESEND_FROM_EMAIL=Plantie <invites@plantiecare.com>`. Keep the public URL aligned with the production web domain when changing domains. The sending domain was verified in Resend on 2026-10-07; this configuration does not by itself prove that an invitation email was delivered.

The function returns `{ invitationCreated: true, emailSent: true }` when Resend accepts the message, or `{ invitationCreated: true, emailSent: false, errorCode }` for a provider/configuration failure. A failed email leaves the pending invite and occupied slot intact. Owners can retry and copy from the pending row even when capacity is full; retry does not create another invite. Backend logs include invitation ID, household ID, provider status/category, recipient domain and timestamp, never a token or API key.

Invites created **before** `20261006113000_recoverable_household_invites.sql` have only a token hash. Their raw token cannot be recovered mathematically. If the original link is unavailable, the Owner must revoke that old pending invite and create a new one. Revocation frees its slot and invalidates the old link.

Deploy `20261007120000_household_invitation_lifecycle.sql` before the Edge Function and web build. This adds return fields to existing RPCs while preserving argument names and the existing household result shape. It backfills historical expiry from `created_at + 7 days`; accepted and revoked history remain intact. The generated `household_type` and `max_owner_count` metadata derive from the existing unique designated coowner configuration rather than household names.

Applied historical migrations and the old `editor` enum label remain for PostgreSQL function signature compatibility. Current database constraints, RPCs, TypeScript and UI support only `owner` and `viewer`; no Editor membership or invitation can be persisted. Rebuilding the PostgreSQL enum would require replacing every dependent policy and function and is deliberately avoided.

`supabase/tests/household_invitation_lifecycle.sql` exercises real database authorization and lifecycle behavior with synthetic users and households. Run the migration and test inside an explicit `BEGIN`/`ROLLBACK` transaction in a controlled database; the fixture sends no emails and never modifies production memberships. For troubleshooting, inspect Supabase Edge Function logs for `send-household-invite-email` and Resend Emails/Logs. HTTP 502 from the older function only indicated that Resend rejected a request; it did not include the provider reason in logs. Confirm the actual sender/domain and recipient restriction in Resend before treating delivery as fixed.

Viewer removals acquire a per-recipient advisory transaction lock in namespace `76271` before locking a household. This serializes fallback selection when different Owners remove the same recipient from different households. The rollback fixture verifies the lock remains held, preserves a recipient's other Viewer membership, and creates exactly one standalone Free Owner household after their last membership is removed. Combined lifecycle and billing fixtures passed against PostgreSQL. A separate two-session lock handshake could not run through concurrent Supabase CLI connections because temporary login-role password initialization conflicted; simultaneous removal transactions remain a local PostgreSQL concurrency check, not a claimed passing remote test.
