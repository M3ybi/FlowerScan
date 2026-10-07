-- New provider purchases use an immutable household customer instead of a
-- mutable purchaser -> selected household hint. Existing receipts keep their
-- original provider identity and household association.
create table public.household_billing_customers (
  household_id uuid primary key references public.households(id) on delete cascade,
  provider_customer_id text not null unique default ('hh_' || gen_random_uuid()::text),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.household_subscription_sources (
  source_subscription_id uuid primary key references public.user_subscriptions(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade
);
create table public.household_provider_transactions (
  provider public.subscription_platform not null,
  original_transaction_id text not null,
  household_id uuid not null references public.households(id) on delete cascade,
  primary key (provider, original_transaction_id)
);
alter table public.household_billing_customers enable row level security;
alter table public.household_subscription_sources enable row level security;
alter table public.household_provider_transactions enable row level security;
revoke all on public.household_billing_customers, public.household_subscription_sources,
  public.household_provider_transactions from public, anon, authenticated;
grant all on public.household_billing_customers, public.household_subscription_sources,
  public.household_provider_transactions to service_role;
alter table public.household_subscriptions add column provider_customer_id text;
alter table public.household_subscriptions add column provider_original_transaction_id text;
alter table public.household_subscriptions add column last_provider_event_at timestamptz;
alter table public.user_subscriptions add column last_provider_event_at timestamptz;

insert into public.household_subscription_sources (source_subscription_id, household_id)
select source_subscription_id, household_id from public.household_subscriptions
where source_subscription_id is not null on conflict do nothing;
insert into public.household_provider_transactions (provider, original_transaction_id, household_id)
select distinct on (us.platform, us.platform_original_transaction_id)
  us.platform, us.platform_original_transaction_id, hs.household_id
from public.household_subscriptions hs join public.user_subscriptions us on us.id = hs.source_subscription_id
where nullif(us.platform_original_transaction_id, '') is not null
order by us.platform, us.platform_original_transaction_id, hs.created_at, hs.household_id
on conflict do nothing;
update public.household_subscriptions hs set provider_customer_id = us.platform_customer_id,
  provider_original_transaction_id = us.platform_original_transaction_id
from public.user_subscriptions us where us.id = hs.source_subscription_id;

create or replace function public.get_household_billing_customer(target_household_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare customer_id text;
begin
  if auth.uid() is null or not public.is_household_owner(target_household_id) then
    raise exception 'Only household owners can manage billing.' using errcode = '42501';
  end if;
  perform 1 from public.households where id = target_household_id for update;
  -- Do not alias or transfer a pre-existing payer UUID subscription. Its payer
  -- can continue managing it; a coowner cannot impersonate that payer.
  select hs.provider_customer_id into customer_id from public.household_subscriptions hs
  where hs.household_id = target_household_id and hs.source_subscription_id is not null;
  if customer_id is not null then
    if exists (select 1 from public.household_subscriptions hs
      where hs.household_id = target_household_id and hs.provider_user_id = auth.uid()) then
      return customer_id;
    end if;
    raise exception 'Use the purchasing owner account to manage this existing subscription.' using errcode = '42501';
  end if;
  insert into public.household_billing_customers (household_id, created_by)
    values (target_household_id, auth.uid()) on conflict do nothing;
  select hbc.provider_customer_id into customer_id from public.household_billing_customers hbc
    where hbc.household_id = target_household_id;
  return customer_id;
end;
$$;
drop function public.begin_household_purchase(uuid);
create function public.begin_household_purchase(target_household_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare customer_id text;
begin
  customer_id := public.get_household_billing_customer(target_household_id);
  -- Retain a first legacy hint solely for old deployed clients still purchasing
  -- under the payer UUID. New customer callbacks never consult this mutable hint.
  insert into public.household_billing_bindings (user_id, household_id)
    values (auth.uid(), target_household_id) on conflict do nothing;
  return customer_id;
end;
$$;
create or replace function public.is_household_billing_bound(target_household_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_household_owner(target_household_id) and (
    exists (select 1 from public.household_billing_customers hbc
      where hbc.household_id = target_household_id)
    or exists (select 1 from public.household_subscriptions hs
      where hs.household_id = target_household_id and hs.provider_user_id = auth.uid())
  );
$$;
revoke all on function public.get_household_billing_customer(uuid), public.begin_household_purchase(uuid),
  public.is_household_billing_bound(uuid) from public, anon, authenticated;
grant execute on function public.get_household_billing_customer(uuid), public.begin_household_purchase(uuid),
  public.is_household_billing_bound(uuid) to authenticated;

create or replace function public.sync_owned_household_subscription()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owned_household uuid;
  source_row public.user_subscriptions;
  previous_row public.household_subscriptions;
  event_name text;
begin
  -- Trusted callbacks retain source_subscription_id even on expiry/refund.
  if new.source_subscription_id is null then return new; end if;
  select * into source_row from public.user_subscriptions
    where id = new.source_subscription_id and user_id = new.user_id for update;
  if source_row.id is null then return new; end if;
  select hss.household_id into owned_household from public.household_subscription_sources hss
    where hss.source_subscription_id = source_row.id;
  if owned_household is null then
    select binding.household_id into owned_household from public.household_billing_bindings binding
    join public.household_members hm on hm.household_id = binding.household_id
      and hm.user_id = binding.user_id and hm.role = 'owner' and hm.status = 'active'
    where binding.user_id = new.user_id;
  end if;
  if owned_household is null then return new; end if;
  perform 1 from public.households where id = owned_household for update;
  select * into previous_row from public.household_subscriptions where household_id = owned_household;
  if previous_row.source_subscription_id is distinct from source_row.id
    and previous_row.status in ('active', 'trialing', 'cancelled', 'grace_period')
    and previous_row.current_period_end > now() then return new; end if;
  insert into public.household_provider_transactions (provider, original_transaction_id, household_id)
    select source_row.platform, source_row.platform_original_transaction_id, owned_household
    where nullif(source_row.platform_original_transaction_id, '') is not null on conflict do nothing;
  if exists (select 1 from public.household_provider_transactions hpt
    where hpt.provider = source_row.platform and hpt.original_transaction_id = source_row.platform_original_transaction_id
      and hpt.household_id <> owned_household) then return new; end if;
  insert into public.household_subscription_sources (source_subscription_id, household_id)
    values (source_row.id, owned_household) on conflict do nothing;
  if exists (select 1 from public.household_subscription_sources hss
    where hss.source_subscription_id = source_row.id and hss.household_id <> owned_household) then return new; end if;
  insert into public.household_subscriptions (
    household_id, plan_key, status, billing_period, provider, provider_user_id, provider_customer_id,
    provider_original_transaction_id, source_subscription_id, current_period_start, current_period_end, cancelled_at,
    last_provider_event_at
  ) values (
    owned_household, source_row.plan_key, source_row.status, source_row.billing_period,
    source_row.platform, new.user_id, source_row.platform_customer_id, source_row.platform_original_transaction_id,
    source_row.id, source_row.current_period_start, coalesce(source_row.expires_at, source_row.current_period_end),
    source_row.cancelled_at, source_row.last_provider_event_at
  ) on conflict (household_id) do update set plan_key = excluded.plan_key, status = excluded.status,
    billing_period = excluded.billing_period, provider = excluded.provider, provider_user_id = excluded.provider_user_id,
    provider_customer_id = excluded.provider_customer_id, provider_original_transaction_id = excluded.provider_original_transaction_id,
    source_subscription_id = excluded.source_subscription_id, last_provider_event_at = excluded.last_provider_event_at,
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
  return new;
end;
$$;

create function public.apply_household_provider_event(
  customer_id text, provider_event_id text, provider_event_type text, event_plan_key text,
  event_status text, event_billing_period text, event_provider text, original_transaction_id text,
  period_start timestamptz, period_end timestamptz, event_occurred_at timestamptz, event_metadata jsonb,
  event_transaction_id text default null
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  target_household uuid;
  payer_user uuid;
  previous_row public.household_subscriptions;
  legacy_source public.user_subscriptions;
  source_id uuid;
  effective_plan text;
  legacy_customer boolean := false;
  event_name text;
  inserted_event uuid;
begin
  if nullif(provider_event_id, '') is null or nullif(provider_event_type, '') is null
    or nullif(original_transaction_id, '') is null
    or event_plan_key is null or event_plan_key not in ('premium_monthly', 'premium_yearly')
    or event_status is null or event_status not in ('active', 'trialing', 'cancelled', 'grace_period', 'expired', 'refunded')
    or event_billing_period is null or event_billing_period not in ('monthly', 'yearly')
    or event_provider is null or event_provider not in ('ios', 'android', 'web', 'manual')
    or event_occurred_at is null
    or (event_status not in ('expired', 'refunded') and period_end is null) then
    raise exception 'Invalid household subscription event.' using errcode = '22023';
  end if;
  select hbc.household_id, hbc.created_by into target_household, payer_user
    from public.household_billing_customers hbc where hbc.provider_customer_id = customer_id;
  if target_household is null and customer_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    legacy_customer := true;
    select au.id into payer_user from auth.users au where au.id = customer_id::uuid;
    if payer_user is not null then
      select * into legacy_source from public.user_subscriptions us
      where us.user_id = payer_user and us.platform = event_provider::public.subscription_platform
        and (us.platform_original_transaction_id = apply_household_provider_event.original_transaction_id
          or us.platform_customer_id = customer_id)
      order by (us.platform_original_transaction_id = apply_household_provider_event.original_transaction_id) desc nulls last,
        us.created_at desc, us.id limit 1 for update;
      select hss.household_id into target_household from public.household_subscription_sources hss
        where hss.source_subscription_id = legacy_source.id;
      if target_household is null then
        select binding.household_id into target_household from public.household_billing_bindings binding
        join public.household_members hm on hm.household_id = binding.household_id
          and hm.user_id = binding.user_id and hm.role = 'owner' and hm.status = 'active'
        where binding.user_id = payer_user;
      end if;
    end if;
  end if;
  if target_household is null then
    insert into public.subscription_events (event_id, event_type, platform, payload)
      values (provider_event_id, provider_event_type, event_provider::public.subscription_platform,
        coalesce(event_metadata, '{}'::jsonb)) on conflict (event_id) do nothing;
    return false;
  end if;
  perform 1 from public.households where id = target_household for update;
  insert into public.subscription_events (event_id, event_type, platform, payload, user_id)
    values (provider_event_id, provider_event_type, event_provider::public.subscription_platform,
      coalesce(event_metadata, '{}'::jsonb), payer_user)
    on conflict (event_id) do nothing returning id into inserted_event;
  if inserted_event is null then return false; end if;
  insert into public.household_provider_transactions (provider, original_transaction_id, household_id)
    values (event_provider::public.subscription_platform, original_transaction_id, target_household)
    on conflict do nothing;
  if exists (select 1 from public.household_provider_transactions hpt
    where hpt.provider = event_provider::public.subscription_platform
      and hpt.original_transaction_id = apply_household_provider_event.original_transaction_id
      and hpt.household_id <> target_household) then return false; end if;
  select * into previous_row from public.household_subscriptions where household_id = target_household;
  if previous_row.last_provider_event_at > event_occurred_at then return false; end if;
  if legacy_source.last_provider_event_at > event_occurred_at then return false; end if;
  if previous_row.current_period_end > now() and previous_row.status in ('active', 'trialing', 'cancelled', 'grace_period') then
    if not legacy_customer and previous_row.source_subscription_id is not null then return false; end if;
    if legacy_customer and previous_row.provider_customer_id is distinct from customer_id then return false; end if;
    if legacy_customer and previous_row.source_subscription_id is distinct from legacy_source.id then return false; end if;
    if event_status in ('expired', 'refunded', 'cancelled', 'grace_period')
      and previous_row.provider_original_transaction_id is distinct from apply_household_provider_event.original_transaction_id then return false; end if;
  end if;
  if period_end < previous_row.current_period_end and (
    event_status in ('expired', 'refunded') or period_start is null or previous_row.current_period_start is null
    or period_start <= previous_row.current_period_start) then return false; end if;
  if legacy_customer then
    source_id := coalesce(legacy_source.id, gen_random_uuid());
    insert into public.user_subscriptions (
      id, user_id, plan_key, platform, status, billing_period, platform_customer_id,
      platform_original_transaction_id, platform_transaction_id, current_period_start,
      current_period_end, expires_at, cancelled_at, metadata, last_provider_event_at
    ) values (
      source_id, payer_user, event_plan_key, event_provider::public.subscription_platform,
      event_status::public.subscription_status, event_billing_period::public.billing_period, customer_id,
      original_transaction_id, event_transaction_id, period_start, period_end, period_end,
      case when event_status = 'cancelled' then event_occurred_at else null end,
      coalesce(event_metadata, '{}'::jsonb), event_occurred_at
    ) on conflict (id) do update set plan_key = excluded.plan_key, status = excluded.status,
      billing_period = excluded.billing_period, platform_original_transaction_id = excluded.platform_original_transaction_id,
      platform_transaction_id = excluded.platform_transaction_id, current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end, expires_at = excluded.expires_at,
      cancelled_at = excluded.cancelled_at, metadata = excluded.metadata, last_provider_event_at = excluded.last_provider_event_at;
    insert into public.household_subscription_sources (source_subscription_id, household_id)
      values (source_id, target_household) on conflict do nothing;
    effective_plan := case when event_status in ('expired', 'refunded') then 'free' else event_plan_key end;
    insert into public.user_entitlements (
      user_id, plan_key, is_premium, source_subscription_id, valid_until,
      ai_scans_monthly_limit, plants_limit, qr_labels_limit, ai_diagnosis_enabled,
      cloud_backup_enabled, household_sharing_enabled
    ) select payer_user, effective_plan, effective_plan <> 'free', source_id,
      case when effective_plan <> 'free' then period_end else null end,
      sp.ai_scans_monthly_limit, sp.plants_limit, sp.qr_labels_limit, sp.ai_diagnosis_enabled,
      sp.cloud_backup_enabled, sp.household_sharing_enabled from public.subscription_plans sp where sp.plan_key = effective_plan
    on conflict (user_id) do update set plan_key = excluded.plan_key, is_premium = excluded.is_premium,
      source_subscription_id = excluded.source_subscription_id, valid_until = excluded.valid_until,
      ai_scans_monthly_limit = excluded.ai_scans_monthly_limit, plants_limit = excluded.plants_limit,
      qr_labels_limit = excluded.qr_labels_limit, ai_diagnosis_enabled = excluded.ai_diagnosis_enabled,
      cloud_backup_enabled = excluded.cloud_backup_enabled, household_sharing_enabled = excluded.household_sharing_enabled;
    insert into public.usage_counters (user_id, counter_type, period_start, period_end, value)
    values (payer_user, 'ai_scan', date_trunc('month', now() at time zone 'UTC')::date,
      (date_trunc('month', now() at time zone 'UTC') + interval '1 month - 1 day')::date, 0)
    on conflict do nothing;
    update public.subscription_events set subscription_id = source_id where id = inserted_event;
    return true;
  end if;
  insert into public.household_subscriptions (
    household_id, plan_key, status, billing_period, provider, provider_user_id, provider_customer_id, provider_original_transaction_id,
    current_period_start, current_period_end, cancelled_at, last_provider_event_at
  ) values (
    target_household, event_plan_key, event_status::public.subscription_status,
    event_billing_period::public.billing_period, event_provider::public.subscription_platform,
    payer_user, customer_id, original_transaction_id, period_start, period_end,
    case when event_status = 'cancelled' then event_occurred_at else null end, event_occurred_at
  ) on conflict (household_id) do update set plan_key = excluded.plan_key, status = excluded.status,
    billing_period = excluded.billing_period, provider = excluded.provider, provider_user_id = excluded.provider_user_id,
    provider_customer_id = excluded.provider_customer_id, provider_original_transaction_id = excluded.provider_original_transaction_id,
    source_subscription_id = null,
    current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
    cancelled_at = excluded.cancelled_at, last_provider_event_at = excluded.last_provider_event_at;
  event_name := case
    when previous_row.household_id is null then 'subscription_started'
    when event_status = 'expired' and previous_row.status <> 'expired' then 'expired'
    when event_status = 'refunded' and previous_row.status <> 'refunded' then 'switched_to_free'
    when event_status = 'cancelled' and previous_row.status <> 'cancelled' then 'cancelled'
    when event_status = 'grace_period' and previous_row.status <> 'grace_period' then 'payment_failed'
    when previous_row.status = 'cancelled' and event_status = 'active' then 'resumed'
    when previous_row.plan_key <> event_plan_key and event_plan_key = 'premium_yearly' then 'upgraded'
    when previous_row.plan_key <> event_plan_key then 'downgraded'
    when previous_row.current_period_end is distinct from period_end then 'renewed'
    else null end;
  if event_name is not null then
    insert into public.household_subscription_history (household_id, event_type, plan_key)
      values (target_household, event_name, event_plan_key);
  end if;
  perform public.reconcile_household_access(target_household);
  return true;
end;
$$;
revoke all on function public.apply_household_provider_event(text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, jsonb, text) from public, anon, authenticated;
grant execute on function public.apply_household_provider_event(text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, jsonb, text) to service_role;
