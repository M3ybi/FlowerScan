create or replace function public.is_active_household_invite_for_email(
  target_household_id uuid, recipient_email text, raw_token text
)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_household_owner(target_household_id)
    and public.is_household_premium_at(target_household_id, now())
    and exists (
      select 1 from public.household_invites hi
      where hi.household_id = target_household_id
        and lower(btrim(hi.invitee_email)) = lower(btrim(recipient_email))
        and hi.token_hash = encode(extensions.digest(btrim(raw_token), 'sha256'), 'hex')
        and hi.used_at is null and hi.revoked_at is null
    );
$$;
revoke all on function public.is_active_household_invite_for_email(uuid, text, text) from public, anon, authenticated;
grant execute on function public.is_active_household_invite_for_email(uuid, text, text) to authenticated;
