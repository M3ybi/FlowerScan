-- Keep invitation history, but permit only one actionable invitation per household/email.
update public.household_invites hi
set revoked_at = now()
where hi.used_at is null
  and hi.revoked_at is null
  and exists (
    select 1
    from public.household_members hm
    join auth.users au on au.id = hm.user_id
    where hm.household_id = hi.household_id
      and lower(btrim(au.email)) = lower(btrim(hi.invitee_email))
  );

with ranked as (
  select id,
    row_number() over (
      partition by household_id, lower(btrim(invitee_email))
      order by created_at desc, id desc
    ) as position
  from public.household_invites
  where used_at is null and revoked_at is null
)
update public.household_invites hi
set revoked_at = now()
from ranked
where hi.id = ranked.id and ranked.position > 1;

drop index if exists public.household_invites_active_email_idx;
create unique index household_invites_active_email_idx
  on public.household_invites (household_id, lower(btrim(invitee_email)))
  where used_at is null and revoked_at is null;

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
  normalized_email text;
  requested_role public.household_member_role;
  created_invite public.household_invites;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;
  if target_household_id is null then raise exception 'Household is required.'; end if;

  normalized_email := lower(btrim(coalesce(invite_email, '')));
  requested_role := coalesce(invite_role, 'editor');
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid invite email.';
  end if;

  if requested_role = 'owner' and not public.is_household_owner(target_household_id) then
    raise exception 'Only household owners can create owner invites.';
  end if;
  if requested_role <> 'owner' and not public.can_edit_household(target_household_id) then
    raise exception 'Editor or owner access is required to create invites.';
  end if;

  if exists (
    select 1 from public.household_members hm
    join auth.users au on au.id = hm.user_id
    where hm.household_id = target_household_id
      and lower(btrim(au.email)) = normalized_email
  ) then
    raise exception 'This email already belongs to the household.';
  end if;

  if exists (
    select 1 from public.household_invites hi
    where hi.household_id = target_household_id
      and lower(btrim(hi.invitee_email)) = normalized_email
      and hi.used_at is null and hi.revoked_at is null
  ) then
    raise exception 'An active invite already exists for this email.';
  end if;

  raw_token := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  insert into public.household_invites (household_id, invitee_email, token_hash, role, created_by)
  values (target_household_id, normalized_email, encode(extensions.digest(raw_token, 'sha256'), 'hex'), requested_role, auth.uid())
  returning * into created_invite;

  return query select created_invite.id, created_invite.household_id, created_invite.invitee_email,
    created_invite.role, created_invite.used_at, created_invite.revoked_at, raw_token,
    created_invite.created_at, created_invite.created_by;
exception when unique_violation then
  raise exception 'An active invite already exists for this email.';
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
  joining_email text;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if raw_token is null or length(btrim(raw_token)) < 32 then raise exception 'Invalid invite token.'; end if;

  select * into invite
  from public.household_invites
  where token_hash = encode(extensions.digest(btrim(raw_token), 'sha256'), 'hex')
  for update;

  if invite.id is null or invite.revoked_at is not null then
    raise exception 'Invite is invalid, used, or revoked.';
  end if;

  select * into existing_member from public.household_members
  where household_id = invite.household_id and user_id = auth.uid();

  if existing_member.household_id is null then
    if invite.used_at is not null then raise exception 'Invite is already used.'; end if;
    select lower(btrim(au.email)) into joining_email from auth.users au where au.id = auth.uid();
    if joining_email is distinct from lower(btrim(invite.invitee_email)) then
      raise exception 'Invite email does not match the signed-in account.';
    end if;

    insert into public.household_members (household_id, user_id, role)
    values (invite.household_id, auth.uid(), invite.role);

    update public.household_invites set used_at = now() where id = invite.id;
  end if;

  select * into joined_household from public.households where id = invite.household_id;
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
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  select * into invite from public.household_invites where id = invite_id for update;
  if invite.id is null then return; end if;

  if invite.role = 'owner' and not public.is_household_owner(invite.household_id) then
    raise exception 'Only owners can revoke owner invites.';
  end if;
  if invite.role <> 'owner' and not public.can_edit_household(invite.household_id) then
    raise exception 'Editor or owner access is required to revoke invites.';
  end if;
  if invite.used_at is not null then raise exception 'Invite is already used.'; end if;

  update public.household_invites set revoked_at = now()
  where id = invite_id and revoked_at is null;
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
  select hi.id, hi.household_id, hi.invitee_email, hi.role, hi.used_at,
    hi.revoked_at, hi.created_at, hi.created_by
  from public.household_invites hi
  where hi.household_id = target_household_id
    and public.can_edit_household(target_household_id)
    and hi.used_at is null and hi.revoked_at is null
    and not exists (
      select 1 from public.household_members hm
      join auth.users au on au.id = hm.user_id
      where hm.household_id = hi.household_id
        and lower(btrim(au.email)) = lower(btrim(hi.invitee_email))
    )
  order by hi.created_at desc, hi.id desc;
$function$;

create or replace function public.remove_household_member(target_household_id uuid, target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  target_membership public.household_members;
  target_email text;
  fallback_household_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if target_household_id is null or target_user_id is null then raise exception 'Household and user are required.'; end if;
  if target_user_id = auth.uid() then raise exception 'Members cannot remove themselves through this action.'; end if;

  perform 1 from public.household_members hm
  where hm.household_id = target_household_id and hm.user_id = auth.uid() and hm.role = 'owner'
  for update;
  if not found then raise exception 'Only household owners can remove members.'; end if;

  select lower(btrim(au.email)) into target_email from auth.users au where au.id = target_user_id;
  if target_email is not null then
    update public.household_invites hi set revoked_at = now()
    where hi.household_id = target_household_id
      and lower(btrim(hi.invitee_email)) = target_email
      and hi.used_at is null and hi.revoked_at is null;
  end if;

  select * into target_membership from public.household_members hm
  where hm.household_id = target_household_id and hm.user_id = target_user_id
  for update;
  if target_membership.household_id is null then return null; end if;
  if target_membership.role = 'owner' then raise exception 'Household owners cannot be removed through this action.'; end if;

  delete from public.household_members hm
  where hm.household_id = target_household_id and hm.user_id = target_user_id and hm.role <> 'owner';

  select hm.household_id into fallback_household_id
  from public.household_members hm where hm.user_id = target_user_id
  order by hm.created_at asc limit 1;

  if fallback_household_id is null then
    insert into public.households (name, created_by)
    values ('Plantie household', target_user_id)
    returning id into fallback_household_id;
    insert into public.household_members (household_id, user_id, role)
    values (fallback_household_id, target_user_id, 'owner');
    insert into public.household_report_settings (household_id)
    values (fallback_household_id) on conflict (household_id) do nothing;
  end if;

  return fallback_household_id;
end;
$function$;

-- Keep older clients safe while they still call the viewer-specific RPC.
create or replace function public.remove_household_viewer(target_household_id uuid, target_user_id uuid)
returns uuid
language sql
security definer
set search_path = public
as $function$
  select public.remove_household_member(target_household_id, target_user_id);
$function$;

-- All membership/invitation writes go through authorization-checked RPCs.
revoke insert, update, delete on public.household_members, public.household_invites from public, authenticated;
revoke all on function public.create_household_invite(uuid, text, public.household_member_role) from public;
revoke all on function public.join_household_by_invite(text) from public;
revoke all on function public.revoke_household_invite(uuid) from public;
revoke all on function public.list_household_invites(uuid) from public;
revoke all on function public.remove_household_member(uuid, uuid) from public;
revoke all on function public.remove_household_viewer(uuid, uuid) from public;
grant execute on function public.create_household_invite(uuid, text, public.household_member_role) to authenticated;
grant execute on function public.join_household_by_invite(text) to authenticated;
grant execute on function public.revoke_household_invite(uuid) to authenticated;
grant execute on function public.list_household_invites(uuid) to authenticated;
grant execute on function public.remove_household_member(uuid, uuid) to authenticated;
grant execute on function public.remove_household_viewer(uuid, uuid) to authenticated;
