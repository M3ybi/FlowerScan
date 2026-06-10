# Supabase household invites

Plantie uses Supabase-native invite tokens for new authenticated household sharing. Legacy household links are still supported only as an explicit migration or fallback path and are not silently converted.

## Architecture

Migration:

```text
supabase/migrations/20260603103000_household_invite_rpcs.sql
```

RPCs:

```text
create_household_invite(household_id, role, expires_at)
join_household_by_invite(token)
revoke_household_invite(invite_id)
list_household_invites(household_id)
```

Frontend repository calls live in `src/lib/plantieRepository.ts`:

```text
createHouseholdInvite(householdId, role, expiresAt)
listHouseholdInvites(householdId)
revokeHouseholdInvite(inviteId)
joinHouseholdByInvite(token)
```

Menu has the Household / Family UI for creating email-style family invites, copying the one-time invite link, listing pending invites, and revoking active invites.

## Security model

- Raw invite tokens are generated with 32 random bytes.
- The database stores only `token_hash`, using SHA-256.
- The raw token is returned only by `create_household_invite` and only once.
- `list_household_invites` never returns raw tokens or token hashes.
- Owners can create owner, editor, and viewer invites.
- Editors can create editor and viewer invites.
- Viewers cannot create or revoke invites.
- Invites are one-time for new members.
- If the authenticated user is already a member, joining with a still-valid invite is idempotent.
- Expired, revoked, invalid, or already-used invites fail closed for non-members.
- All RPCs require `auth.uid()` and run against Supabase Auth/RLS context. No service role key is used by the frontend.

## Join URL

Use this format:

```text
#/join?invite=<raw-token>
```

Full app URLs are also accepted, for example:

```text
https://example.com/#/join?invite=<raw-token>
```

If the user is signed out, Plantie stores the pending invite token locally and sends the user through authentication. After successful sign-in, the invite screen lets the user accept or decline the invite.

Manual household joining is not exposed in the production menu. Users join through valid invite links only.

## Manual Supabase SQL step

Apply the migration before enabling Supabase invite sharing in production:

```bash
supabase db push
```

Or run the SQL from:

```text
supabase/migrations/20260603103000_household_invite_rpcs.sql
```

Verify that `household_invites.revoked_at` exists and the four RPCs are executable by `authenticated`.

## Migration notes

- Existing legacy household links remain available only through the legacy compatibility path.
- New mobile users should use Supabase invite links instead of legacy household public tokens.
- Do not copy raw invite tokens into logs, support tickets, analytics, or database rows.
- Revoking an invite sets `revoked_at`; it does not delete historical invite metadata.
