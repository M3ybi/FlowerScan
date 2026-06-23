drop function if exists public.create_household_invite(uuid, text, public.household_member_role, timestamptz);
drop function if exists public.create_household_invite(uuid, text, public.household_member_role);
drop function if exists public.list_household_invites(uuid);

create or replace function public.create_household_invite(
  target_household_id uuid,
  invite_email text,
  invite_role public.household_member_role default 'editor'
)
returns table (
  id uuid,
  household_id uuid,
  invitee_email text,
  role public.household_member_role,
  used_at timestamptz,
  revoked_at timestamptz,
  token text,
  created_at timestamptz,
  created_by uuid
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  raw_token text;
  token_hash_value text;
  normalized_email text;
  created_invite public.household_invites;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  normalized_email := lower(trim(coalesce(invite_email, '')));

  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid invite email.';
  end if;

  if invite_role = 'owner' and not public.is_household_owner(target_household_id) then
    raise exception 'Only household owners can create owner invites.';
  end if;

  if invite_role <> 'owner' and not public.can_edit_household(target_household_id) then
    raise exception 'Editor or owner access is required to create invites.';
  end if;

  if exists (
    select 1
    from public.household_invites hi
    where hi.household_id = target_household_id
      and hi.invitee_email = normalized_email
      and hi.used_at is null
      and hi.revoked_at is null
  ) then
    raise exception 'An active invite already exists for this email.';
  end if;

  raw_token := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  token_hash_value := encode(extensions.digest(raw_token, 'sha256'), 'hex');

  insert into public.household_invites (household_id, invitee_email, token_hash, role, created_by)
  values (target_household_id, normalized_email, token_hash_value, coalesce(invite_role, 'editor'), auth.uid())
  returning * into created_invite;

  return query
  select
    created_invite.id,
    created_invite.household_id,
    created_invite.invitee_email,
    created_invite.role,
    created_invite.used_at,
    created_invite.revoked_at,
    raw_token,
    created_invite.created_at,
    created_invite.created_by;
end;
$function$;

create or replace function public.join_household_by_invite(raw_token text)
returns public.households
language plpgsql
security definer
set search_path = public
as $function$
declare
  invite public.household_invites;
  existing_member public.household_members;
  joined_household public.households;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if raw_token is null or length(trim(raw_token)) < 32 then
    raise exception 'Invalid invite token.';
  end if;

  select *
  into invite
  from public.household_invites
  where token_hash = encode(extensions.digest(trim(raw_token), 'sha256'), 'hex')
    and revoked_at is null
  limit 1;

  if invite.id is null then
    raise exception 'Invite is invalid, used, or revoked.';
  end if;

  select *
  into existing_member
  from public.household_members
  where household_id = invite.household_id
    and user_id = auth.uid();

  if existing_member.household_id is null then
    if invite.used_at is not null then
      raise exception 'Invite is already used.';
    end if;

    insert into public.household_members (household_id, user_id, role)
    values (invite.household_id, auth.uid(), invite.role);

    update public.household_invites
    set used_at = now()
    where id = invite.id;
  end if;

  select *
  into joined_household
  from public.households
  where id = invite.household_id;

  return joined_household;
end;
$function$;

create or replace function public.list_household_invites(target_household_id uuid)
returns table (
  id uuid,
  household_id uuid,
  invitee_email text,
  role public.household_member_role,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz,
  created_by uuid
)
language sql
stable
security definer
set search_path = public
as $function$
  select
    hi.id,
    hi.household_id,
    hi.invitee_email,
    hi.role,
    hi.used_at,
    hi.revoked_at,
    hi.created_at,
    hi.created_by
  from public.household_invites hi
  where hi.household_id = target_household_id
    and public.can_edit_household(target_household_id)
  order by hi.created_at desc;
$function$;

create or replace function public.remove_household_viewer(target_household_id uuid, target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  target_membership public.household_members;
  fallback_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if target_household_id is null or target_user_id is null then
    raise exception 'Household and user are required.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'Owners cannot remove themselves through viewer removal.';
  end if;

  perform 1
  from public.household_members hm
  where hm.household_id = target_household_id
    and hm.user_id = auth.uid()
    and hm.role = 'owner'
  for update;

  if not found then
    raise exception 'Only household owners can remove viewers.';
  end if;

  select *
  into target_membership
  from public.household_members hm
  where hm.household_id = target_household_id
    and hm.user_id = target_user_id
  for update;

  if target_membership.household_id is null then
    raise exception 'Viewer membership not found.';
  end if;

  if target_membership.role <> 'viewer' then
    raise exception 'Only viewer members can be removed through this action.';
  end if;

  delete from public.household_members hm
  where hm.household_id = target_household_id
    and hm.user_id = target_user_id
    and hm.role = 'viewer';

  select hm.household_id
  into fallback_household_id
  from public.household_members hm
  where hm.user_id = target_user_id
  order by hm.created_at asc
  limit 1;

  if fallback_household_id is null then
    insert into public.households (name, created_by)
    values ('Plantie household', target_user_id)
    returning id into fallback_household_id;

    insert into public.household_members (household_id, user_id, role)
    values (fallback_household_id, target_user_id, 'owner');

    insert into public.household_report_settings (household_id)
    values (fallback_household_id)
    on conflict (household_id) do nothing;
  end if;

  return fallback_household_id;
end;
$function$;

create or replace function public.rename_household(target_household_id uuid, household_name text)
returns public.households
language plpgsql
security definer
set search_path = public
as $function$
declare
  normalized_name text;
  updated_household public.households;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if target_household_id is null then
    raise exception 'Household is required.';
  end if;

  if not public.is_household_owner(target_household_id) then
    raise exception 'Only household owners can rename this household.';
  end if;

  normalized_name := trim(coalesce(household_name, ''));

  if normalized_name = '' then
    raise exception 'Household name is required.';
  end if;

  if length(normalized_name) > 80 then
    raise exception 'Household name must be 80 characters or fewer.';
  end if;

  update public.households
  set name = normalized_name
  where id = target_household_id
  returning * into updated_household;

  if updated_household.id is null then
    raise exception 'Household not found.';
  end if;

  return updated_household;
end;
$function$;

alter table public.household_invites
  drop column if exists expires_at;

revoke all on function public.create_household_invite(uuid, text, public.household_member_role) from public;
revoke all on function public.list_household_invites(uuid) from public;
revoke all on function public.remove_household_viewer(uuid, uuid) from public;
revoke all on function public.rename_household(uuid, text) from public;

grant execute on function public.create_household_invite(uuid, text, public.household_member_role) to authenticated;
grant execute on function public.join_household_by_invite(text) to authenticated;
grant execute on function public.revoke_household_invite(uuid) to authenticated;
grant execute on function public.list_household_invites(uuid) to authenticated;
grant execute on function public.list_household_members(uuid) to authenticated;
grant execute on function public.remove_household_viewer(uuid, uuid) to authenticated;
grant execute on function public.rename_household(uuid, text) to authenticated;
