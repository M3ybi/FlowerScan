-- New invitation tokens are encrypted in Vault so either household Owner can
-- retry delivery without rotating the active link or consuming another slot.
create extension if not exists supabase_vault with schema vault;

alter table public.household_invites add column if not exists token_secret_id uuid;

create or replace function public.create_household_invite(
  target_household_id uuid, invite_email text,
  invite_role public.household_member_role default 'viewer'
)
returns table (
  id uuid, household_id uuid, invitee_email text, role public.household_member_role,
  used_at timestamptz, revoked_at timestamptz, token text, created_at timestamptz, created_by uuid
)
language plpgsql security definer set search_path = public as $$
declare
  normalized_email text := lower(btrim(coalesce(invite_email, '')));
  raw_token text;
  created_invite public.household_invites;
  used_slots integer;
begin
  if auth.uid() is null or not public.is_household_owner(target_household_id) then
    raise exception 'Only household owners can invite members.' using errcode = '42501';
  end if;
  if invite_role <> 'viewer' then raise exception 'Invitations must be for viewers.'; end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid invite email.';
  end if;
  perform public.reconcile_household_access(target_household_id);
  if not public.is_household_premium_at(target_household_id, now()) then
    raise exception 'Household sharing requires Premium.';
  end if;
  if exists (
    select 1 from public.household_members hm join auth.users au on au.id = hm.user_id
    where hm.household_id = target_household_id and lower(btrim(au.email)) = normalized_email
  ) then raise exception 'This email already belongs to the household.'; end if;
  if exists (
    select 1 from public.household_invites hi where hi.household_id = target_household_id
      and lower(btrim(hi.invitee_email)) = normalized_email
      and hi.used_at is null and hi.revoked_at is null
  ) then raise exception 'An active invite already exists for this email.'; end if;
  select
    (select count(*) from public.household_members hm
      where hm.household_id = target_household_id and hm.status = 'active')
    + (select count(*) from public.household_invites hi
      where hi.household_id = target_household_id and hi.used_at is null and hi.revoked_at is null)
  into used_slots;
  if used_slots >= 3 then raise exception 'Household member limit reached.'; end if;
  raw_token := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  insert into public.household_invites (household_id, invitee_email, token_hash, role, created_by)
  values (target_household_id, normalized_email, encode(extensions.digest(raw_token, 'sha256'), 'hex'), 'viewer', auth.uid())
  returning * into created_invite;
  update public.household_invites hi set token_secret_id = vault.create_secret(raw_token)
    where hi.id = created_invite.id;
  return query select created_invite.id, created_invite.household_id, created_invite.invitee_email,
    created_invite.role, created_invite.used_at, created_invite.revoked_at, raw_token,
    created_invite.created_at, created_invite.created_by;
exception when unique_violation then
  raise exception 'An active invite already exists for this email.';
end;
$$;

create or replace function public.get_household_invite_delivery(target_invite_id uuid)
returns table (invite_id uuid, household_id uuid, household_name text, invitee_email text, token text)
language plpgsql security definer set search_path = public, vault as $$
declare
  active_invite public.household_invites;
  recovered_token text;
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select * into active_invite from public.household_invites hi where hi.id = target_invite_id;
  if active_invite.id is null or not public.is_household_owner(active_invite.household_id) then
    raise exception 'Only household owners can manage invites.' using errcode = '42501';
  end if;
  perform public.reconcile_household_access(active_invite.household_id);
  select * into active_invite from public.household_invites hi where hi.id = target_invite_id;
  if active_invite.used_at is not null or active_invite.revoked_at is not null
      or not public.is_household_premium_at(active_invite.household_id, now()) then
    raise exception 'Invite is invalid or revoked.';
  end if;
  if active_invite.token_secret_id is null then
    raise exception 'Invite link cannot be recovered; revoke and invite again.';
  end if;
  select ds.decrypted_secret into recovered_token
    from vault.decrypted_secrets ds where ds.id = active_invite.token_secret_id;
  if recovered_token is null or active_invite.token_hash <> encode(extensions.digest(recovered_token, 'sha256'), 'hex') then
    raise exception 'Invite link cannot be recovered; revoke and invite again.';
  end if;
  return query select active_invite.id, active_invite.household_id, h.name::text,
    active_invite.invitee_email, recovered_token
    from public.households h where h.id = active_invite.household_id;
end;
$$;

revoke all on function public.get_household_invite_delivery(uuid) from public, anon, authenticated;
grant execute on function public.get_household_invite_delivery(uuid) to authenticated;
