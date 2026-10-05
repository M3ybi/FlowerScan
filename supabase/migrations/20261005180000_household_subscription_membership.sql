-- A provider purchase belongs to the purchaser's owned household. Existing manual
-- household grants remain valid; a member's personal purchase never upgrades an
-- unrelated household that they merely joined.
alter table public.household_members
  add column if not exists status text not null default 'active';
update public.household_members set role = 'viewer' where role = 'editor';
with ranked_owners as (
  select hm.household_id, hm.user_id,
    row_number() over (partition by hm.household_id
      order by (hm.user_id = h.created_by) desc, hm.created_at, hm.user_id) as position
  from public.household_members hm join public.households h on h.id = hm.household_id
  where hm.role = 'owner'
)
update public.household_members hm set role = 'viewer'
from ranked_owners ro
where hm.household_id = ro.household_id and hm.user_id = ro.user_id and ro.position > 1;
update public.household_invites set revoked_at = now()
  where role = 'owner' and used_at is null and revoked_at is null;
update public.household_invites set role = 'viewer' where role in ('owner', 'editor');
alter table public.household_members alter column role set default 'viewer';
alter table public.household_invites alter column role set default 'viewer';
alter table public.household_members add constraint household_members_supported_role
  check (role in ('owner', 'viewer'));
alter table public.household_invites add constraint household_invites_viewer_role
  check (role = 'viewer');
alter table public.household_members add constraint household_members_supported_status
  check (status in ('active', 'suspended_plan_limit'));
create unique index household_members_one_owner_idx on public.household_members (household_id)
  where role = 'owner';

create table public.household_subscriptions (
  household_id uuid primary key references public.households(id) on delete cascade,
  plan_key text not null check (plan_key in ('free', 'premium_monthly', 'premium_yearly')),
  status public.subscription_status not null,
  billing_period public.billing_period not null,
  provider public.subscription_platform not null,
  provider_user_id uuid references auth.users(id) on delete set null,
  source_subscription_id uuid references public.user_subscriptions(id) on delete set null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.household_subscription_history (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  event_type text not null check (event_type in (
    'subscription_started', 'upgraded', 'downgraded', 'renewed', 'cancelled',
    'resumed', 'expired', 'switched_to_free', 'payment_failed'
  )),
  plan_key text not null,
  source_subscription_id uuid references public.user_subscriptions(id) on delete set null,
  created_at timestamptz not null default now()
);
create index household_subscription_history_household_date_idx
  on public.household_subscription_history (household_id, created_at desc);
create unique index household_subscription_history_free_transition_idx
  on public.household_subscription_history (household_id, source_subscription_id)
  where event_type = 'switched_to_free' and source_subscription_id is not null;
create trigger set_household_subscriptions_updated_at before update on public.household_subscriptions
  for each row execute function public.set_updated_at();
alter table public.household_subscriptions enable row level security;
alter table public.household_subscription_history enable row level security;
create policy household_subscriptions_select_member on public.household_subscriptions
  for select to authenticated using (public.is_household_member(household_id));
create policy household_subscription_history_select_owner on public.household_subscription_history
  for select to authenticated using (public.is_household_owner(household_id));
revoke insert, update, delete on public.household_subscriptions, public.household_subscription_history from public, anon, authenticated;
-- Household creation and renaming use checked SECURITY DEFINER RPCs. Direct
-- table writes would allow a client to set premium_enabled or plan_key.
revoke insert, update on public.households from public, anon, authenticated;

-- Backfill owner purchases before changing the entitlement resolver.
insert into public.household_subscriptions (
  household_id, plan_key, status, billing_period, provider, provider_user_id,
  source_subscription_id, current_period_start, current_period_end, cancelled_at
)
select distinct on (hm.household_id)
  hm.household_id, us.plan_key, us.status, us.billing_period, us.platform,
  hm.user_id, us.id, us.current_period_start, coalesce(us.expires_at, us.current_period_end), us.cancelled_at
from public.household_members hm
join public.user_subscriptions us on us.user_id = hm.user_id
where hm.role = 'owner' and us.plan_key in ('premium_monthly', 'premium_yearly')
order by hm.household_id, coalesce(us.expires_at, us.current_period_end) desc nulls last, us.updated_at desc;
insert into public.household_subscription_history (household_id, event_type, plan_key, source_subscription_id, created_at)
select hs.household_id, 'subscription_started', hs.plan_key, hs.source_subscription_id,
  coalesce(hs.current_period_start, hs.created_at)
from public.household_subscriptions hs;

create or replace function public.is_household_premium_at(
  target_household_id uuid, reference_at timestamptz default now()
)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.households h
    where h.id = target_household_id and h.premium_enabled and h.plan_key = 'premium'
      and (h.premium_expires_at is null or h.premium_expires_at > reference_at)
  ) or exists (
    select 1 from public.household_subscriptions hs
    where hs.household_id = target_household_id
      and hs.plan_key in ('premium_monthly', 'premium_yearly')
      and hs.status in ('active', 'trialing', 'cancelled', 'grace_period')
      and hs.current_period_end > reference_at
  );
$$;

create or replace function public.is_household_member(target_household_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = target_household_id and hm.user_id = auth.uid()
      and hm.status = 'active'
      and (hm.role = 'owner' or public.is_household_premium_at(target_household_id, now()))
  );
$$;
create or replace function public.has_household_role(
  target_household_id uuid, allowed_roles public.household_member_role[]
)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_household_member(target_household_id) and exists (
    select 1 from public.household_members hm
    where hm.household_id = target_household_id and hm.user_id = auth.uid()
      and hm.role = any(allowed_roles)
  );
$$;
create or replace function public.can_edit_household(target_household_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_household_owner(target_household_id);
$$;
create or replace function public.is_household_premium(target_household_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_household_member(target_household_id)
    and public.is_household_premium_at(target_household_id, now());
$$;

-- Reconciliation is also called by reads, so clock-based expiry works even when
-- a provider webhook arrives late. The row lock serializes all capacity changes.
create or replace function public.reconcile_household_access(target_household_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  premium boolean;
  active_count integer;
  available_slots integer;
begin
  perform 1 from public.households where id = target_household_id for update;
  if not found then raise exception 'Household not found.'; end if;
  premium := public.is_household_premium_at(target_household_id, now());
  if not premium then
    insert into public.household_subscription_history (household_id, event_type, plan_key, source_subscription_id)
    select hs.household_id, 'switched_to_free', 'free', hs.source_subscription_id
    from public.household_subscriptions hs
    where hs.household_id = target_household_id and hs.source_subscription_id is not null
      and hs.current_period_end <= now()
    on conflict do nothing;
    update public.household_invites set revoked_at = now()
      where household_id = target_household_id and used_at is null and revoked_at is null;
    update public.household_members set status = 'suspended_plan_limit'
      where household_id = target_household_id and role = 'viewer' and status = 'active';
    return;
  end if;

  update public.household_members hm set status = 'suspended_plan_limit'
    where (hm.household_id, hm.user_id) in (
      select household_id, user_id from public.household_members
      where household_id = target_household_id and role = 'viewer' and status = 'active'
      order by created_at, user_id offset 2
    );

  select count(*)::integer into active_count from public.household_members
    where household_id = target_household_id and status = 'active';
  available_slots := greatest(3 - active_count, 0);
  update public.household_members hm set status = 'active'
    where (hm.household_id, hm.user_id) in (
      select household_id, user_id from public.household_members
      where household_id = target_household_id and role = 'viewer' and status = 'suspended_plan_limit'
      order by created_at, user_id limit available_slots
    );

  select count(*)::integer into active_count from public.household_members
    where household_id = target_household_id and status = 'active';
  available_slots := greatest(3 - active_count, 0);
  update public.household_invites hi set revoked_at = now()
    where hi.household_id = target_household_id and hi.used_at is null and hi.revoked_at is null
      and hi.id not in (
        select id from public.household_invites
        where household_id = target_household_id and used_at is null and revoked_at is null
        order by created_at, id limit available_slots
      );
end;
$$;

-- This trigger runs only on trusted provider writes to user_entitlements.
create or replace function public.sync_owned_household_subscription()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owned_household uuid;
  source_row public.user_subscriptions;
  previous_row public.household_subscriptions;
  event_name text;
begin
  for owned_household in
    select hm.household_id from public.household_members hm
    where hm.user_id = new.user_id and hm.role = 'owner'
    order by hm.household_id
  loop
    perform 1 from public.households where id = owned_household for update;
    select * into previous_row from public.household_subscriptions where household_id = owned_household;
    if new.source_subscription_id is not null then
      select * into source_row from public.user_subscriptions where id = new.source_subscription_id;
    else
      select * into source_row from public.user_subscriptions
      where user_id = new.user_id order by updated_at desc limit 1;
    end if;
    if source_row.id is null then continue; end if;

    insert into public.household_subscriptions (
      household_id, plan_key, status, billing_period, provider, provider_user_id,
      source_subscription_id, current_period_start, current_period_end, cancelled_at
    ) values (
      owned_household, source_row.plan_key, source_row.status, source_row.billing_period,
      source_row.platform, new.user_id, source_row.id, source_row.current_period_start,
      coalesce(source_row.expires_at, source_row.current_period_end), source_row.cancelled_at
    ) on conflict (household_id) do update set
      plan_key = excluded.plan_key, status = excluded.status,
      billing_period = excluded.billing_period, provider = excluded.provider,
      provider_user_id = excluded.provider_user_id, source_subscription_id = excluded.source_subscription_id,
      current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
      cancelled_at = excluded.cancelled_at;

    event_name := case
      when previous_row.household_id is null then 'subscription_started'
      when source_row.status = 'expired' and previous_row.status <> 'expired' then 'expired'
      when source_row.status = 'refunded' and previous_row.status <> 'refunded' then 'switched_to_free'
      when source_row.status = 'cancelled' and previous_row.status <> 'cancelled' then 'cancelled'
      when source_row.status = 'grace_period' and previous_row.status <> 'grace_period' then 'payment_failed'
      when previous_row.status = 'cancelled' and source_row.status = 'active' then 'resumed'
      when previous_row.plan_key <> source_row.plan_key and source_row.plan_key = 'premium_yearly' then 'upgraded'
      when previous_row.plan_key <> source_row.plan_key then 'downgraded'
      when previous_row.current_period_end is distinct from coalesce(source_row.expires_at, source_row.current_period_end) then 'renewed'
      else null end;
    if event_name is not null then
      insert into public.household_subscription_history (household_id, event_type, plan_key, source_subscription_id)
      values (owned_household, event_name, source_row.plan_key, source_row.id);
    end if;
    perform public.reconcile_household_access(owned_household);
    source_row := null;
  end loop;
  return new;
end;
$$;
create trigger sync_owned_household_subscription_after_entitlement
  after insert or update on public.user_entitlements
  for each row execute function public.sync_owned_household_subscription();

create or replace function public.get_household_entitlement(target_household_id uuid)
returns table (
  plan_key text, is_premium boolean, status text, valid_until timestamptz,
  max_members integer, invitations_enabled boolean, active_member_count integer,
  pending_invite_count integer, suspended_member_count integer, role public.household_member_role
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_household_member(target_household_id) then
    raise exception 'Household membership is required.' using errcode = '42501';
  end if;
  perform public.reconcile_household_access(target_household_id);
  return query
  select
    case when public.is_household_premium_at(target_household_id, now())
      then coalesce(hs.plan_key, 'premium') else 'free' end,
    public.is_household_premium_at(target_household_id, now()),
    case when public.is_household_premium_at(target_household_id, now())
      then coalesce(hs.status::text, 'active') else 'free' end,
    case when public.is_household_premium_at(target_household_id, now())
      then coalesce(hs.current_period_end, h.premium_expires_at) else null end,
    case when public.is_household_premium_at(target_household_id, now()) then 3 else 1 end,
    public.is_household_premium_at(target_household_id, now()),
    (select count(*)::integer from public.household_members hm
      where hm.household_id = target_household_id and hm.status = 'active'),
    (select count(*)::integer from public.household_invites hi
      where hi.household_id = target_household_id and hi.used_at is null and hi.revoked_at is null),
    (select count(*)::integer from public.household_members hm
      where hm.household_id = target_household_id and hm.status = 'suspended_plan_limit'),
    (select hm.role from public.household_members hm
      where hm.household_id = target_household_id and hm.user_id = auth.uid())
  from public.households h left join public.household_subscriptions hs on hs.household_id = h.id
  where h.id = target_household_id;
end;
$$;

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
    (select count(*) from public.household_members where household_id = target_household_id and status = 'active')
    + (select count(*) from public.household_invites where household_id = target_household_id
      and used_at is null and revoked_at is null)
  into used_slots;
  if used_slots >= 3 then raise exception 'Household member limit reached.'; end if;
  raw_token := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  insert into public.household_invites (household_id, invitee_email, token_hash, role, created_by)
  values (target_household_id, normalized_email, encode(extensions.digest(raw_token, 'sha256'), 'hex'), 'viewer', auth.uid())
  returning * into created_invite;
  return query select created_invite.id, created_invite.household_id, created_invite.invitee_email,
    created_invite.role, created_invite.used_at, created_invite.revoked_at, raw_token,
    created_invite.created_at, created_invite.created_by;
exception when unique_violation then
  raise exception 'An active invite already exists for this email.';
end;
$$;

create or replace function public.join_household_by_invite(raw_token text)
returns public.households language plpgsql security definer set search_path = public as $$
declare
  invite public.household_invites;
  joined_household public.households;
  joining_email text;
  active_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if raw_token is null or length(btrim(raw_token)) < 32 then raise exception 'Invalid invite token.'; end if;
  select * into invite from public.household_invites
    where token_hash = encode(extensions.digest(btrim(raw_token), 'sha256'), 'hex');
  if invite.id is null then raise exception 'Invite is invalid or revoked.'; end if;
  perform public.reconcile_household_access(invite.household_id);
  select * into invite from public.household_invites where id = invite.id for update;
  if invite.revoked_at is not null or invite.used_at is not null then
    raise exception 'Invite is invalid, used, or expired.';
  end if;
  if not public.is_household_premium_at(invite.household_id, now()) then
    raise exception 'Household sharing requires Premium.';
  end if;
  select lower(btrim(au.email)) into joining_email from auth.users au where au.id = auth.uid();
  if joining_email is distinct from lower(btrim(invite.invitee_email)) then
    raise exception 'Invite email does not match the signed-in account.';
  end if;
  if exists (select 1 from public.household_members where household_id = invite.household_id and user_id = auth.uid()) then
    raise exception 'This account already belongs to the household.';
  end if;
  select count(*)::integer into active_count from public.household_members
    where household_id = invite.household_id and status = 'active';
  if active_count >= 3 then raise exception 'Household member limit reached.'; end if;
  insert into public.household_members (household_id, user_id, role, status)
  values (invite.household_id, auth.uid(), 'viewer', 'active');
  update public.household_invites set used_at = now() where id = invite.id;
  perform public.reconcile_household_access(invite.household_id);
  select * into joined_household from public.households where id = invite.household_id;
  return joined_household;
end;
$$;

create or replace function public.revoke_household_invite(invite_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare invite public.household_invites;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  select * into invite from public.household_invites where id = invite_id;
  if invite.id is null then return; end if;
  if not public.is_household_owner(invite.household_id) then
    raise exception 'Only household owners can revoke invites.' using errcode = '42501';
  end if;
  perform 1 from public.households where id = invite.household_id for update;
  update public.household_invites set revoked_at = now()
    where id = invite_id and used_at is null and revoked_at is null;
end;
$$;

create or replace function public.list_household_invites(target_household_id uuid)
returns table (
  id uuid, household_id uuid, invitee_email text, role public.household_member_role,
  used_at timestamptz, revoked_at timestamptz, created_at timestamptz, created_by uuid
)
language sql stable security definer set search_path = public as $$
  select hi.id, hi.household_id, hi.invitee_email, hi.role, hi.used_at,
    hi.revoked_at, hi.created_at, hi.created_by
  from public.household_invites hi
  where hi.household_id = target_household_id
    and public.is_household_owner(target_household_id)
    and public.is_household_premium_at(target_household_id, now())
    and hi.used_at is null and hi.revoked_at is null
  order by hi.created_at desc;
$$;

drop function if exists public.list_household_members(uuid);
create function public.list_household_members(target_household_id uuid)
returns table (
  household_id uuid, user_id uuid, email text, role public.household_member_role,
  created_at timestamptz, status text
)
language sql stable security definer set search_path = public as $$
  select hm.household_id, hm.user_id, au.email::text, hm.role, hm.created_at, hm.status
  from public.household_members hm join auth.users au on au.id = hm.user_id
  where hm.household_id = target_household_id
    and public.is_household_member(target_household_id)
    and (hm.status = 'active' or public.is_household_owner(target_household_id))
  order by hm.created_at, hm.user_id;
$$;

-- The pre-existing RPC already rejects owner self-removal and deletes only the
-- relationship; its target is now guaranteed to be a Viewer by the role check.
revoke all on function public.reconcile_household_access(uuid) from public, anon, authenticated;
revoke all on function public.sync_owned_household_subscription() from public, anon, authenticated;
revoke all on function public.get_household_entitlement(uuid) from public, anon, authenticated;
grant execute on function public.get_household_entitlement(uuid) to authenticated;
grant execute on function public.list_household_members(uuid) to authenticated;
drop function if exists public.create_household_invite(uuid, text, public.household_member_role, timestamptz);
do $$ declare household uuid; begin
  for household in select id from public.households order by id loop
    perform public.reconcile_household_access(household);
  end loop;
end $$;
