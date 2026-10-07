-- Invitations reserve a household slot for seven days and belong to a verified
-- email, independent of whether that recipient already has a Plantie account.
-- Historical migrations retain the old enum label for signature compatibility;
-- these CHECKs and every current mutation allow only Owner and Viewer.
update public.household_members set role = 'viewer' where role = 'editor';
update public.household_invites set role = 'viewer' where role = 'editor';

alter table public.households
  add column household_type text generated always as
    (case when special_coowner_user_id is null then 'standard' else 'admin_special' end) stored,
  add column max_owner_count integer generated always as
    (case when special_coowner_user_id is null then 1 else 2 end) stored;

alter table public.household_invites
  add column expires_at timestamptz,
  add column declined_at timestamptz,
  add column expired_at timestamptz,
  add column used_by uuid references auth.users(id) on delete set null;
update public.household_invites set expires_at = created_at + interval '7 days';
alter table public.household_invites
  alter column expires_at set default (now() + interval '7 days'),
  alter column expires_at set not null;
update public.household_invites hi set used_by = hm.user_id
from public.household_members hm join auth.users au on au.id = hm.user_id
where hi.used_at is not null and hi.household_id = hm.household_id
  and lower(btrim(hi.invitee_email)) = lower(btrim(au.email));
update public.household_invites set expired_at = expires_at
where used_at is null and revoked_at is null and expires_at <= now();
update public.household_invites set invitee_email = lower(btrim(invitee_email));
alter table public.household_invites add constraint household_invites_normalized_email
  check (invitee_email = lower(btrim(invitee_email)));

drop index public.household_invites_active_email_idx;
create unique index household_invites_active_email_idx
  on public.household_invites (household_id, invitee_email)
  where used_at is null and revoked_at is null and declined_at is null and expired_at is null;
create index household_invites_recipient_pending_idx
  on public.household_invites (invitee_email, expires_at)
  where used_at is null and revoked_at is null and declined_at is null and expired_at is null;

create or replace function public.household_invitation_status(invitation public.household_invites)
returns text language sql stable security definer set search_path = public as $$
  select case
    when ($1).used_at is not null then 'accepted'
    when ($1).declined_at is not null then 'declined'
    when ($1).revoked_at is not null then 'revoked'
    when ($1).expired_at is not null or ($1).expires_at <= now() then 'expired'
    when not public.is_household_premium_at(($1).household_id, now()) then 'unavailable'
    else 'pending' end;
$$;
revoke all on function public.household_invitation_status(public.household_invites) from public, anon, authenticated;

create or replace function public.verified_invitation_email()
returns text language plpgsql stable security definer set search_path = public as $$
declare recipient_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select lower(btrim(au.email)) into recipient_email from auth.users au
  where au.id = auth.uid() and au.email_confirmed_at is not null;
  if recipient_email is null or recipient_email = '' then
    raise exception 'Verify your email before responding to a household invitation.' using errcode = '42501';
  end if;
  return recipient_email;
end;
$$;
revoke all on function public.verified_invitation_email() from public, anon, authenticated;

-- Every capacity mutation locks the household first, including invite expiry.
create or replace function public.reconcile_household_access(target_household_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare premium boolean; active_count integer; available_slots integer; viewer_slots integer;
begin
  perform 1 from public.households h where h.id = target_household_id for update;
  if not found then raise exception 'Household not found.'; end if;
  update public.household_invites hi set expired_at = hi.expires_at
  where hi.household_id = target_household_id and hi.used_at is null and hi.revoked_at is null
    and hi.declined_at is null and hi.expired_at is null and hi.expires_at <= now();
  premium := public.is_household_premium_at(target_household_id, now());
  if not premium then
    insert into public.household_subscription_history (household_id, event_type, plan_key, source_subscription_id)
    select hs.household_id, 'switched_to_free', 'free', hs.source_subscription_id
    from public.household_subscriptions hs where hs.household_id = target_household_id
      and hs.source_subscription_id is not null and hs.current_period_end <= now()
    on conflict do nothing;
    update public.household_invites hi set revoked_at = now()
    where hi.household_id = target_household_id and public.household_invitation_status(hi) = 'unavailable';
    -- The configured special Owners remain active on Free. Only Viewers suspend.
    update public.household_members hm set status = 'suspended_plan_limit'
    where hm.household_id = target_household_id and hm.role = 'viewer' and hm.status = 'active';
    return;
  end if;
  select greatest(3 - count(*)::integer, 0) into viewer_slots
  from public.household_members hm where hm.household_id = target_household_id and hm.role = 'owner';
  update public.household_members hm set status = 'suspended_plan_limit'
  where (hm.household_id, hm.user_id) in (
    select m.household_id, m.user_id from public.household_members m
    where m.household_id = target_household_id and m.role = 'viewer' and m.status = 'active'
    order by m.created_at, m.user_id offset viewer_slots
  );
  select count(*)::integer into active_count from public.household_members hm
  where hm.household_id = target_household_id and hm.status = 'active';
  select count(*)::integer into available_slots from public.household_invites hi
  where hi.household_id = target_household_id and public.household_invitation_status(hi) = 'pending';
  available_slots := greatest(3 - active_count - available_slots, 0);
  update public.household_members hm set status = 'active'
  where (hm.household_id, hm.user_id) in (
    select m.household_id, m.user_id from public.household_members m
    where m.household_id = target_household_id and m.role = 'viewer' and m.status = 'suspended_plan_limit'
    order by m.created_at, m.user_id limit available_slots
  );
  select count(*)::integer into active_count from public.household_members hm
  where hm.household_id = target_household_id and hm.status = 'active';
  available_slots := greatest(3 - active_count, 0);
  update public.household_invites hi set revoked_at = now()
  where hi.household_id = target_household_id and public.household_invitation_status(hi) = 'pending'
    and hi.id not in (
      select pending.id from public.household_invites pending
      where pending.household_id = target_household_id and public.household_invitation_status(pending) = 'pending'
      order by pending.created_at, pending.id limit available_slots
    );
end;
$$;
revoke all on function public.reconcile_household_access(uuid) from public, anon, authenticated;

drop function public.create_household_invite(uuid, text, public.household_member_role);
create function public.create_household_invite(
  target_household_id uuid, invite_email text, invite_role public.household_member_role default 'viewer'
)
returns table (
  id uuid, household_id uuid, invitee_email text, role public.household_member_role,
  used_at timestamptz, revoked_at timestamptz, token text, created_at timestamptz, created_by uuid,
  expires_at timestamptz, declined_at timestamptz, expired_at timestamptz, status text
)
language plpgsql security definer set search_path = public as $$
declare normalized_email text := lower(btrim(coalesce(invite_email, '')));
  raw_token text; created_invite public.household_invites; used_slots integer;
begin
  if auth.uid() is null or not public.is_household_owner(target_household_id) then
    raise exception 'Only household owners can invite members.' using errcode = '42501';
  end if;
  if invite_role is distinct from 'viewer'::public.household_member_role then
    raise exception 'Invitations must be for viewers.' using errcode = '22023';
  end if;
  if length(normalized_email) > 254 or normalized_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' then
    raise exception 'Invalid invite email.' using errcode = '22023';
  end if;
  perform public.reconcile_household_access(target_household_id);
  if not public.is_household_premium_at(target_household_id, now()) then
    raise exception 'Household sharing requires Premium.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.household_members hm join auth.users au on au.id = hm.user_id
    where hm.household_id = target_household_id and hm.status = 'active'
      and lower(btrim(au.email)) = normalized_email
  ) then raise exception 'This email already belongs to the household.' using errcode = '23505'; end if;
  if exists (
    select 1 from public.household_invites hi where hi.household_id = target_household_id
      and hi.invitee_email = normalized_email and public.household_invitation_status(hi) = 'pending'
  ) then raise exception 'An active invite already exists for this email.' using errcode = '23505'; end if;
  select (select count(*) from public.household_members hm
    where hm.household_id = target_household_id and hm.status = 'active')
    + (select count(*) from public.household_invites hi
    where hi.household_id = target_household_id and public.household_invitation_status(hi) = 'pending') into used_slots;
  if used_slots >= 3 then raise exception 'Household member limit reached.' using errcode = '23514'; end if;
  raw_token := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  insert into public.household_invites (household_id, invitee_email, token_hash, role, created_by, expires_at)
  values (target_household_id, normalized_email, encode(extensions.digest(raw_token, 'sha256'), 'hex'),
    'viewer', auth.uid(), now() + interval '7 days') returning * into created_invite;
  update public.household_invites hi set token_secret_id = vault.create_secret(raw_token) where hi.id = created_invite.id;
  return query select created_invite.id, created_invite.household_id, created_invite.invitee_email,
    created_invite.role, created_invite.used_at, created_invite.revoked_at, raw_token,
    created_invite.created_at, created_invite.created_by, created_invite.expires_at,
    created_invite.declined_at, created_invite.expired_at, 'pending'::text;
end;
$$;
revoke all on function public.create_household_invite(uuid, text, public.household_member_role) from public, anon, authenticated;
grant execute on function public.create_household_invite(uuid, text, public.household_member_role) to authenticated;

drop function public.list_household_invites(uuid);
create function public.list_household_invites(target_household_id uuid)
returns table (
  id uuid, household_id uuid, invitee_email text, role public.household_member_role,
  used_at timestamptz, revoked_at timestamptz, created_at timestamptz, created_by uuid,
  expires_at timestamptz, declined_at timestamptz, expired_at timestamptz, status text
)
language sql stable security definer set search_path = public as $$
  select hi.id, hi.household_id, hi.invitee_email, hi.role, hi.used_at, hi.revoked_at,
    hi.created_at, hi.created_by, hi.expires_at, hi.declined_at, hi.expired_at, 'pending'::text
  from public.household_invites hi where hi.household_id = target_household_id
    and public.is_household_owner(target_household_id) and public.household_invitation_status(hi) = 'pending'
  order by hi.created_at desc, hi.id desc;
$$;
revoke all on function public.list_household_invites(uuid) from public, anon, authenticated;
grant execute on function public.list_household_invites(uuid) to authenticated;

-- An opaque token authorizes a minimal preview only. Database identifiers never
-- authorize anonymous lookups; recipient inbox lookups derive verified email.
create function public.get_household_invitation(raw_token text default null, target_invite_id uuid default null)
returns table (
  id uuid, household_id uuid, household_name text, invited_email text, inviter_email text,
  role public.household_member_role, status text, expires_at timestamptz,
  active_member_count integer, max_slots integer, is_member boolean
)
language plpgsql stable security definer set search_path = public as $$
declare invitation public.household_invites; recipient_email text;
begin
  if raw_token is not null then
    if btrim(raw_token) !~ '^[A-Za-z0-9_-]{32,128}$' then return; end if;
    select * into invitation from public.household_invites hi
    where hi.token_hash = encode(extensions.digest(btrim(raw_token), 'sha256'), 'hex');
  else
    recipient_email := public.verified_invitation_email();
    select * into invitation from public.household_invites hi
    where hi.id = target_invite_id and hi.invitee_email = recipient_email;
  end if;
  if invitation.id is null then return; end if;
  return query select invitation.id, invitation.household_id, h.name, invitation.invitee_email,
    au.email::text, invitation.role, public.household_invitation_status(invitation), invitation.expires_at,
    (select count(*)::integer from public.household_members hm where hm.household_id = h.id and hm.status = 'active'
      and (hm.role = 'owner' or public.is_household_premium_at(h.id, now()))),
    case when public.is_household_premium_at(h.id, now()) then 3 else h.max_owner_count end,
    public.is_household_member(h.id)
  from public.households h left join auth.users au on au.id = invitation.created_by where h.id = invitation.household_id;
end;
$$;
revoke all on function public.get_household_invitation(text, uuid) from public, anon, authenticated;
grant execute on function public.get_household_invitation(text, uuid) to anon, authenticated;

create function public.list_my_household_invitations()
returns table (
  id uuid, household_id uuid, household_name text, invited_email text, inviter_email text,
  role public.household_member_role, status text, expires_at timestamptz,
  active_member_count integer, max_slots integer, is_member boolean
)
language plpgsql stable security definer set search_path = public as $$
declare recipient_email text;
begin
  recipient_email := public.verified_invitation_email();
  return query select hi.id, hi.household_id, h.name, hi.invitee_email, au.email::text,
    hi.role, 'pending'::text, hi.expires_at,
    (select count(*)::integer from public.household_members hm where hm.household_id = h.id and hm.status = 'active'),
    3, false
  from public.household_invites hi join public.households h on h.id = hi.household_id
    left join auth.users au on au.id = hi.created_by
  where hi.invitee_email = recipient_email
    and hi.used_at is null and hi.revoked_at is null and hi.declined_at is null and hi.expired_at is null
    and hi.expires_at > now() and public.household_invitation_status(hi) = 'pending'
    and not exists (select 1 from public.household_members hm
      where hm.household_id = hi.household_id and hm.user_id = auth.uid() and hm.status = 'active')
  order by hi.created_at desc, hi.id desc;
end;
$$;
revoke all on function public.list_my_household_invitations() from public, anon, authenticated;
grant execute on function public.list_my_household_invitations() to authenticated;

create function public.accept_household_invitation(target_invite_id uuid)
returns public.households language plpgsql security definer set search_path = public as $$
declare invitation public.household_invites; joined_household public.households;
  recipient_email text; invitation_state text; active_count integer;
begin
  recipient_email := public.verified_invitation_email();
  select * into invitation from public.household_invites hi
  where hi.id = target_invite_id and hi.invitee_email = recipient_email;
  if invitation.id is null then
    raise exception 'Invitation is unavailable for this account.' using errcode = '42501';
  end if;
  perform public.reconcile_household_access(invitation.household_id);
  select * into invitation from public.household_invites hi where hi.id = target_invite_id for update;
  if invitation.used_at is not null and invitation.used_by = auth.uid()
    and public.is_household_member(invitation.household_id) then
    select * into joined_household from public.households h where h.id = invitation.household_id;
    return joined_household;
  end if;
  invitation_state := public.household_invitation_status(invitation);
  if invitation_state <> 'pending' then
    raise exception 'Household invitation is %.', invitation_state using errcode = '22023';
  end if;
  if exists (select 1 from public.household_members hm
    where hm.household_id = invitation.household_id and hm.user_id = auth.uid() and hm.status = 'active') then
    raise exception 'This account already belongs to the household.' using errcode = '23505';
  end if;
  select count(*)::integer into active_count from public.household_members hm
  where hm.household_id = invitation.household_id and hm.status = 'active';
  if active_count >= 3 then raise exception 'Household member limit reached.' using errcode = '23514'; end if;
  -- Mark consumed before adding membership: the reserved slot converts to an
  -- active slot in this transaction and no read can observe a fourth slot.
  update public.household_invites hi set used_at = now(), used_by = auth.uid() where hi.id = invitation.id;
  insert into public.household_members (household_id, user_id, role, status)
  values (invitation.household_id, auth.uid(), 'viewer', 'active')
  on conflict (household_id, user_id) do update set status = 'active'
    where public.household_members.role = 'viewer';
  select * into joined_household from public.households h where h.id = invitation.household_id;
  return joined_household;
end;
$$;
revoke all on function public.accept_household_invitation(uuid) from public, anon, authenticated;
grant execute on function public.accept_household_invitation(uuid) to authenticated;

create or replace function public.join_household_by_invite(raw_token text)
returns public.households language plpgsql security definer set search_path = public as $$
declare invitation_id uuid;
begin
  perform public.verified_invitation_email();
  if raw_token is null or btrim(raw_token) !~ '^[A-Za-z0-9_-]{32,128}$' then
    raise exception 'Invalid invite token.' using errcode = '22023';
  end if;
  select hi.id into invitation_id from public.household_invites hi
  where hi.token_hash = encode(extensions.digest(btrim(raw_token), 'sha256'), 'hex');
  if invitation_id is null then raise exception 'Invitation is unavailable.' using errcode = '22023'; end if;
  return public.accept_household_invitation(invitation_id);
end;
$$;

create function public.decline_household_invitation(target_invite_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare invitation public.household_invites; recipient_email text;
begin
  recipient_email := public.verified_invitation_email();
  select * into invitation from public.household_invites hi
  where hi.id = target_invite_id and hi.invitee_email = recipient_email;
  if invitation.id is null then
    raise exception 'Invitation is unavailable for this account.' using errcode = '42501';
  end if;
  perform public.reconcile_household_access(invitation.household_id);
  select * into invitation from public.household_invites hi where hi.id = target_invite_id for update;
  if invitation.declined_at is not null then return; end if;
  if public.household_invitation_status(invitation) <> 'pending' then
    raise exception 'Invitation is no longer pending.' using errcode = '22023';
  end if;
  update public.household_invites hi set declined_at = now() where hi.id = invitation.id;
end;
$$;
revoke all on function public.decline_household_invitation(uuid) from public, anon, authenticated;
grant execute on function public.decline_household_invitation(uuid) to authenticated;

drop function public.get_household_invite_delivery(uuid);
create function public.get_household_invite_delivery(target_invite_id uuid)
returns table (invite_id uuid, household_id uuid, household_name text, invitee_email text, token text, expires_at timestamptz)
language plpgsql security definer set search_path = public, vault as $$
declare active_invite public.household_invites; recovered_token text;
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select * into active_invite from public.household_invites hi where hi.id = target_invite_id;
  if active_invite.id is null or not public.is_household_owner(active_invite.household_id) then
    raise exception 'Only household owners can manage invites.' using errcode = '42501';
  end if;
  perform public.reconcile_household_access(active_invite.household_id);
  select * into active_invite from public.household_invites hi where hi.id = target_invite_id;
  if public.household_invitation_status(active_invite) <> 'pending' then
    raise exception 'Invitation is no longer pending.' using errcode = '22023';
  end if;
  select ds.decrypted_secret into recovered_token from vault.decrypted_secrets ds where ds.id = active_invite.token_secret_id;
  if recovered_token is null or active_invite.token_hash <> encode(extensions.digest(recovered_token, 'sha256'), 'hex') then
    raise exception 'Invite link cannot be recovered; revoke and invite again.';
  end if;
  return query select active_invite.id, active_invite.household_id, h.name,
    active_invite.invitee_email, recovered_token, active_invite.expires_at
  from public.households h where h.id = active_invite.household_id;
end;
$$;
revoke all on function public.get_household_invite_delivery(uuid) from public, anon, authenticated;
grant execute on function public.get_household_invite_delivery(uuid) to authenticated;

create or replace function public.is_active_household_invite_for_email(
  target_household_id uuid, recipient_email text, raw_token text
)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_household_owner(target_household_id) and exists (
    select 1 from public.household_invites hi where hi.household_id = target_household_id
      and hi.invitee_email = lower(btrim(recipient_email))
      and hi.token_hash = encode(extensions.digest(btrim(raw_token), 'sha256'), 'hex')
      and public.household_invitation_status(hi) = 'pending'
  );
$$;

create or replace function public.revoke_household_invite(invite_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare invitation public.household_invites;
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select * into invitation from public.household_invites hi where hi.id = invite_id;
  if invitation.id is null then return; end if;
  if not public.is_household_owner(invitation.household_id) then
    raise exception 'Only household owners can revoke invites.' using errcode = '42501';
  end if;
  perform public.reconcile_household_access(invitation.household_id);
  update public.household_invites hi set revoked_at = now()
  where hi.id = invite_id and public.household_invitation_status(hi) = 'pending';
end;
$$;

create or replace function public.list_household_members(target_household_id uuid)
returns table (household_id uuid, user_id uuid, email text, role public.household_member_role, created_at timestamptz, status text)
language sql stable security definer set search_path = public as $$
  select hm.household_id, hm.user_id, au.email::text, hm.role, hm.created_at, hm.status
  from public.household_members hm join auth.users au on au.id = hm.user_id
  where hm.household_id = target_household_id and public.is_household_member(target_household_id)
    and hm.status = 'active' and (hm.role = 'owner' or public.is_household_premium_at(target_household_id, now()))
  order by hm.created_at, hm.user_id;
$$;

create function public.list_my_households()
returns setof public.households language sql stable security definer set search_path = public as $$
  select h.* from public.households h join public.household_members hm on hm.household_id = h.id
  where hm.user_id = auth.uid() and hm.status = 'active'
    and (hm.role = 'owner' or public.is_household_premium_at(h.id, now()))
  order by hm.created_at, h.id;
$$;
revoke all on function public.list_my_households() from public, anon, authenticated;
grant execute on function public.list_my_households() to authenticated;

drop function public.get_household_entitlement(uuid);
create function public.get_household_entitlement(target_household_id uuid)
returns table (
  plan_key text, is_premium boolean, status text, valid_until timestamptz,
  max_members integer, invitations_enabled boolean, active_member_count integer,
  pending_invite_count integer, suspended_member_count integer, role public.household_member_role,
  billing_interval text, renewal_date timestamptz, cancel_at_period_end boolean, used_capacity integer,
  previous_plan_key text, previous_valid_until timestamptz, household_type text, max_owner_count integer
)
language plpgsql security definer set search_path = public as $$
declare premium boolean; provider_premium boolean;
begin
  if not public.is_household_member(target_household_id) then
    raise exception 'Household membership is required.' using errcode = '42501';
  end if;
  perform public.reconcile_household_access(target_household_id);
  premium := public.is_household_premium_at(target_household_id, now());
  select exists (select 1 from public.household_subscriptions hs
    where hs.household_id = target_household_id and hs.plan_key in ('premium_monthly', 'premium_yearly')
      and hs.status in ('active', 'trialing', 'cancelled', 'grace_period') and hs.current_period_end > now())
    into provider_premium;
  return query select
    case when provider_premium then hs.plan_key when premium then 'premium' else 'free' end,
    premium, case when provider_premium then hs.status::text when premium then 'active' else 'free' end,
    case when provider_premium then hs.current_period_end when premium then h.premium_expires_at else null end,
    case when premium then 3 else h.max_owner_count end, premium,
    counts.active_count, counts.pending_count, counts.suspended_count, hm.role,
    case when provider_premium then case hs.billing_period::text when 'monthly' then 'monthly' when 'yearly' then 'yearly' else null end else null end,
    case when provider_premium and hs.cancelled_at is null and hs.status <> 'cancelled' then hs.current_period_end else null end,
    provider_premium and coalesce(hs.cancelled_at is not null or hs.status = 'cancelled', false),
    counts.active_count + counts.pending_count,
    case when not premium then hs.plan_key else null end,
    case when not premium then coalesce(hs.current_period_end, h.premium_expires_at) else null end,
    h.household_type, h.max_owner_count
  from public.households h left join public.household_subscriptions hs on hs.household_id = h.id
    join public.household_members hm on hm.household_id = h.id and hm.user_id = auth.uid()
    cross join lateral (
      select (select count(*)::integer from public.household_members m where m.household_id = h.id and m.status = 'active') active_count,
        (select count(*)::integer from public.household_invites hi where hi.household_id = h.id and public.household_invitation_status(hi) = 'pending') pending_count,
        (select count(*)::integer from public.household_members m where m.household_id = h.id and m.status = 'suspended_plan_limit') suspended_count
    ) counts where h.id = target_household_id;
end;
$$;
revoke all on function public.get_household_entitlement(uuid) from public, anon, authenticated;
grant execute on function public.get_household_entitlement(uuid) to authenticated;

create or replace function public.remove_household_member(target_household_id uuid, target_user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_membership public.household_members; target_email text; fallback_household_id uuid;
begin
  if auth.uid() is null or not public.is_household_owner(target_household_id) then
    raise exception 'Only household owners can remove members.' using errcode = '42501';
  end if;
  if target_user_id is null or target_user_id = auth.uid() then
    raise exception 'Members cannot remove themselves through this action.' using errcode = '22023';
  end if;
  -- Serialize fallback selection across all households for this recipient.
  -- Namespace 76271 is reserved for Viewer removal; no auth.users row locks
  -- interfere with billing or membership foreign-key checks.
  perform pg_advisory_xact_lock(76271, hashtext(target_user_id::text));
  perform public.reconcile_household_access(target_household_id);
  select * into target_membership from public.household_members hm
  where hm.household_id = target_household_id and hm.user_id = target_user_id for update;
  if target_membership.household_id is null then return null; end if;
  if target_membership.role <> 'viewer' then
    raise exception 'Household owners cannot be removed through this action.' using errcode = '42501';
  end if;
  select lower(btrim(au.email)) into target_email from auth.users au where au.id = target_user_id;
  update public.household_invites hi set revoked_at = now()
  where hi.household_id = target_household_id and hi.invitee_email = target_email
    and public.household_invitation_status(hi) = 'pending';
  delete from public.household_members hm where hm.household_id = target_household_id
    and hm.user_id = target_user_id and hm.role = 'viewer';
  -- A different existing active household is the fallback; its data and plan
  -- stay unchanged. Suspended memberships do not provide usable access.
  select hm.household_id into fallback_household_id from public.household_members hm
  where hm.user_id = target_user_id and hm.status = 'active'
    and (hm.role = 'owner' or public.is_household_premium_at(hm.household_id, now()))
  order by hm.created_at, hm.household_id limit 1;
  if fallback_household_id is null then
    insert into public.households (name, created_by) values ('Plantie household', target_user_id)
      returning id into fallback_household_id;
    insert into public.household_members (household_id, user_id, role, status)
      values (fallback_household_id, target_user_id, 'owner', 'active');
    insert into public.household_report_settings (household_id) values (fallback_household_id)
      on conflict (household_id) do nothing;
  end if;
  return fallback_household_id;
end;
$$;

-- Owner-based administration remains distinct from full active-member plant
-- rights. New invitation functions cannot be used to write roles or billing.
revoke insert, update, delete on public.household_members, public.household_invites from public, anon, authenticated;
