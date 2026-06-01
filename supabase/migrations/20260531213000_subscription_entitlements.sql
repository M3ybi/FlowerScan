create type public.subscription_platform as enum ('ios', 'android', 'web', 'manual');
create type public.subscription_status as enum ('active', 'trialing', 'cancelled', 'expired', 'grace_period', 'refunded');
create type public.billing_period as enum ('monthly', 'yearly', 'none');

create table public.subscription_plans (
  plan_key text primary key,
  name text not null,
  billing_period public.billing_period not null,
  ai_scans_monthly_limit integer check (ai_scans_monthly_limit is null or ai_scans_monthly_limit >= 0),
  plants_limit integer check (plants_limit is null or plants_limit >= 0),
  qr_labels_limit integer check (qr_labels_limit is null or qr_labels_limit >= 0),
  ai_diagnosis_enabled boolean not null default false,
  cloud_backup_enabled boolean not null default false,
  household_sharing_enabled boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_key text not null references public.subscription_plans(plan_key),
  platform public.subscription_platform not null,
  status public.subscription_status not null,
  billing_period public.billing_period not null,
  platform_customer_id text,
  platform_original_transaction_id text,
  platform_transaction_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  subscription_id uuid references public.user_subscriptions(id) on delete set null,
  platform public.subscription_platform not null,
  event_type text not null,
  event_id text unique,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_key text not null references public.subscription_plans(plan_key),
  is_premium boolean not null default false,
  ai_scans_monthly_limit integer check (ai_scans_monthly_limit is null or ai_scans_monthly_limit >= 0),
  plants_limit integer check (plants_limit is null or plants_limit >= 0),
  qr_labels_limit integer check (qr_labels_limit is null or qr_labels_limit >= 0),
  ai_diagnosis_enabled boolean not null default false,
  cloud_backup_enabled boolean not null default false,
  household_sharing_enabled boolean not null default false,
  source_subscription_id uuid references public.user_subscriptions(id) on delete set null,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.usage_counters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  counter_type text not null,
  period_start date not null,
  period_end date not null,
  value integer not null default 0 check (value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, counter_type, period_start)
);

insert into public.subscription_plans (
  plan_key,
  name,
  billing_period,
  ai_scans_monthly_limit,
  plants_limit,
  qr_labels_limit,
  ai_diagnosis_enabled,
  cloud_backup_enabled,
  household_sharing_enabled,
  sort_order
)
values
  ('free', 'Free', 'none', 10, 10, 10, false, false, false, 10),
  ('premium_monthly', 'Premium Monthly', 'monthly', null, null, null, true, true, true, 20),
  ('premium_yearly', 'Premium Yearly', 'yearly', null, null, null, true, true, true, 30)
on conflict (plan_key) do update set
  name = excluded.name,
  billing_period = excluded.billing_period,
  ai_scans_monthly_limit = excluded.ai_scans_monthly_limit,
  plants_limit = excluded.plants_limit,
  qr_labels_limit = excluded.qr_labels_limit,
  ai_diagnosis_enabled = excluded.ai_diagnosis_enabled,
  cloud_backup_enabled = excluded.cloud_backup_enabled,
  household_sharing_enabled = excluded.household_sharing_enabled,
  sort_order = excluded.sort_order,
  updated_at = now();

create index user_subscriptions_user_id_idx on public.user_subscriptions(user_id);
create index user_subscriptions_plan_key_idx on public.user_subscriptions(plan_key);
create index user_subscriptions_status_idx on public.user_subscriptions(status);
create index subscription_events_user_id_idx on public.subscription_events(user_id);
create index subscription_events_subscription_id_idx on public.subscription_events(subscription_id);
create index user_entitlements_plan_key_idx on public.user_entitlements(plan_key);
create index usage_counters_user_id_idx on public.usage_counters(user_id);
create index usage_counters_counter_type_idx on public.usage_counters(counter_type);
create index usage_counters_period_start_idx on public.usage_counters(period_start);

create trigger set_subscription_plans_updated_at before update on public.subscription_plans for each row execute function public.set_updated_at();
create trigger set_user_subscriptions_updated_at before update on public.user_subscriptions for each row execute function public.set_updated_at();
create trigger set_user_entitlements_updated_at before update on public.user_entitlements for each row execute function public.set_updated_at();
create trigger set_usage_counters_updated_at before update on public.usage_counters for each row execute function public.set_updated_at();

alter table public.subscription_plans enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.subscription_events enable row level security;
alter table public.user_entitlements enable row level security;
alter table public.usage_counters enable row level security;

create policy "subscription_plans_select_all" on public.subscription_plans for select to anon, authenticated using (is_active = true);
create policy "user_subscriptions_select_own" on public.user_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "subscription_events_select_own" on public.subscription_events for select to authenticated using (user_id = auth.uid());
create policy "user_entitlements_select_own" on public.user_entitlements for select to authenticated using (user_id = auth.uid());
create policy "usage_counters_select_own" on public.usage_counters for select to authenticated using (user_id = auth.uid());

create or replace function public.current_usage_period_start()
returns date
language sql
stable
as $$
  select date_trunc('month', now())::date;
$$;

create or replace function public.current_usage_period_end()
returns date
language sql
stable
as $$
  select (date_trunc('month', now()) + interval '1 month - 1 day')::date;
$$;

create or replace function public.get_my_entitlement()
returns table (
  plan_key text,
  is_premium boolean,
  ai_scans_monthly_limit integer,
  plants_limit integer,
  qr_labels_limit integer,
  ai_diagnosis_enabled boolean,
  cloud_backup_enabled boolean,
  household_sharing_enabled boolean,
  ai_scans_used integer,
  ai_scans_remaining integer
)
language sql
stable
security definer
set search_path = public
as $$
  with selected_entitlement as (
    select
      0 as priority,
      ue.plan_key,
      ue.is_premium,
      ue.ai_scans_monthly_limit,
      ue.plants_limit,
      ue.qr_labels_limit,
      ue.ai_diagnosis_enabled,
      ue.cloud_backup_enabled,
      ue.household_sharing_enabled
    from public.user_entitlements ue
    where ue.user_id = auth.uid()
      and (ue.valid_until is null or ue.valid_until > now())
    union all
    select
      1 as priority,
      sp.plan_key,
      sp.plan_key <> 'free' as is_premium,
      sp.ai_scans_monthly_limit,
      sp.plants_limit,
      sp.qr_labels_limit,
      sp.ai_diagnosis_enabled,
      sp.cloud_backup_enabled,
      sp.household_sharing_enabled
    from public.subscription_plans sp
    where sp.plan_key = 'free'
    order by priority
    limit 1
  ),
  usage as (
    select coalesce(uc.value, 0) as ai_scans_used
    from (select 1) seed
    left join public.usage_counters uc
      on uc.user_id = auth.uid()
      and uc.counter_type = 'ai_scan'
      and uc.period_start = public.current_usage_period_start()
  )
  select
    selected_entitlement.plan_key,
    selected_entitlement.is_premium,
    selected_entitlement.ai_scans_monthly_limit,
    selected_entitlement.plants_limit,
    selected_entitlement.qr_labels_limit,
    selected_entitlement.ai_diagnosis_enabled,
    selected_entitlement.cloud_backup_enabled,
    selected_entitlement.household_sharing_enabled,
    usage.ai_scans_used,
    case
      when selected_entitlement.ai_scans_monthly_limit is null then null
      else greatest(selected_entitlement.ai_scans_monthly_limit - usage.ai_scans_used, 0)
    end as ai_scans_remaining
  from selected_entitlement, usage
  limit 1;
$$;

create or replace function public.can_use_feature(feature_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  entitlement record;
begin
  if auth.uid() is null then
    return false;
  end if;

  select * into entitlement from public.get_my_entitlement();

  if feature_key = 'ai_scan' then
    return entitlement.ai_scans_monthly_limit is null or entitlement.ai_scans_used < entitlement.ai_scans_monthly_limit;
  elsif feature_key = 'ai_diagnosis' then
    return entitlement.ai_diagnosis_enabled;
  elsif feature_key = 'cloud_backup' then
    return entitlement.cloud_backup_enabled;
  elsif feature_key = 'household_sharing' then
    return entitlement.household_sharing_enabled;
  elsif feature_key = 'plant' then
    return entitlement.plants_limit is null;
  elsif feature_key = 'qr_label' then
    return entitlement.qr_labels_limit is null;
  end if;

  return false;
end;
$$;

create or replace function public.increment_usage_counter(counter_type text)
returns public.usage_counters
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  updated_counter public.usage_counters;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if counter_type not in ('ai_scan') then
    raise exception 'Unsupported counter type.';
  end if;

  insert into public.usage_counters (user_id, counter_type, period_start, period_end, value)
  values (auth.uid(), counter_type, public.current_usage_period_start(), public.current_usage_period_end(), 1)
  on conflict (user_id, counter_type, period_start) do update set
    value = public.usage_counters.value + 1,
    updated_at = now()
  returning * into updated_counter;

  return updated_counter;
end;
$$;

create or replace function public.reset_monthly_usage_counters()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  archived_count integer;
begin
  update public.usage_counters
  set updated_at = now()
  where period_end < public.current_usage_period_start();

  get diagnostics archived_count = row_count;
  return archived_count;
end;
$$;

revoke all on function public.get_my_entitlement() from public;
revoke all on function public.can_use_feature(text) from public;
revoke all on function public.increment_usage_counter(text) from public;
revoke all on function public.reset_monthly_usage_counters() from public;

grant execute on function public.get_my_entitlement() to authenticated;
grant execute on function public.can_use_feature(text) to authenticated;
grant execute on function public.increment_usage_counter(text) to authenticated;
