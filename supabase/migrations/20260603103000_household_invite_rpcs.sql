alter table public.household_invites
  add column if not exists revoked_at timestamptz,
  add column if not exists invitee_email text;

create index if not exists household_invites_active_email_idx
  on public.household_invites(household_id, invitee_email)
  where used_at is null and revoked_at is null;

drop function if exists public.create_household_invite(uuid, public.household_member_role, timestamptz);

create or replace function public.create_household_invite(
  target_household_id uuid,
  invite_email text,
  invite_role public.household_member_role default 'editor',
  invite_expires_at timestamptz default null
)
returns table (
  id uuid,
  household_id uuid,
  invitee_email text,
  role public.household_member_role,
  expires_at timestamptz,
  token text,
  created_at timestamptz
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

  if invite_expires_at is not null and invite_expires_at <= now() then
    raise exception 'Invite expiration must be in the future.';
  end if;

  if exists (
    select 1
    from public.household_invites hi
    where hi.household_id = target_household_id
      and hi.invitee_email = normalized_email
      and hi.used_at is null
      and hi.revoked_at is null
      and (hi.expires_at is null or hi.expires_at > now())
  ) then
    raise exception 'An active invite already exists for this email.';
  end if;

  raw_token := translate(rtrim(encode(gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  token_hash_value := encode(digest(raw_token, 'sha256'), 'hex');

  insert into public.household_invites (household_id, invitee_email, token_hash, role, expires_at, created_by)
  values (target_household_id, normalized_email, token_hash_value, coalesce(invite_role, 'editor'), invite_expires_at, auth.uid())
  returning * into created_invite;

  return query
  select
    created_invite.id,
    created_invite.household_id,
    created_invite.invitee_email,
    created_invite.role,
    created_invite.expires_at,
    raw_token,
    created_invite.created_at;
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
  where token_hash = encode(digest(trim(raw_token), 'sha256'), 'hex')
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if invite.id is null then
    raise exception 'Invite is invalid, expired, or revoked.';
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

create or replace function public.revoke_household_invite(invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  invite public.household_invites;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select *
  into invite
  from public.household_invites
  where id = invite_id;

  if invite.id is null then
    raise exception 'Invite not found.';
  end if;

  if invite.role = 'owner' and not public.is_household_owner(invite.household_id) then
    raise exception 'Only owners can revoke owner invites.';
  end if;

  if invite.role <> 'owner' and not public.can_edit_household(invite.household_id) then
    raise exception 'Editor or owner access is required to revoke invites.';
  end if;

  update public.household_invites
  set revoked_at = now()
  where id = invite_id
    and revoked_at is null;
end;
$function$;

create or replace function public.list_household_invites(target_household_id uuid)
returns table (
  id uuid,
  household_id uuid,
  invitee_email text,
  role public.household_member_role,
  expires_at timestamptz,
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
    hi.expires_at,
    hi.used_at,
    hi.revoked_at,
    hi.created_at,
    hi.created_by
  from public.household_invites hi
  where hi.household_id = target_household_id
    and public.can_edit_household(target_household_id)
  order by hi.created_at desc;
$function$;

create or replace function public.list_household_members(target_household_id uuid)
returns table (
  household_id uuid,
  user_id uuid,
  email text,
  role public.household_member_role,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $function$
  select
    hm.household_id,
    hm.user_id,
    au.email::text,
    hm.role,
    hm.created_at
  from public.household_members hm
  join auth.users au on au.id = hm.user_id
  where hm.household_id = target_household_id
    and public.is_household_member(target_household_id)
  order by hm.created_at asc, au.email asc;
$function$;

grant execute on function public.create_household_invite(uuid, text, public.household_member_role, timestamptz) to authenticated;
grant execute on function public.join_household_by_invite(text) to authenticated;
grant execute on function public.revoke_household_invite(uuid) to authenticated;
grant execute on function public.list_household_invites(uuid) to authenticated;
grant execute on function public.list_household_members(uuid) to authenticated;
