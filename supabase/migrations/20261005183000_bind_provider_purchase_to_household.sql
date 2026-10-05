-- RevenueCat identifies the purchaser by user ID. Record which of their owned
-- households is purchasing so one provider entitlement cannot fan out to all.
create table public.household_billing_bindings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_household_billing_bindings_updated_at before update on public.household_billing_bindings
  for each row execute function public.set_updated_at();
alter table public.household_billing_bindings enable row level security;
revoke all on public.household_billing_bindings from public, anon, authenticated;

insert into public.household_billing_bindings (user_id, household_id)
select distinct on (hs.provider_user_id) hs.provider_user_id, hs.household_id
from public.household_subscriptions hs
where hs.provider_user_id is not null
order by hs.provider_user_id, hs.current_period_end desc nulls last, hs.updated_at desc;

-- Earlier versions could have copied one purchase to more than one owned
-- household. Retain only its selected binding, then reconcile the others.
delete from public.household_subscriptions hs
using public.household_billing_bindings binding
where hs.provider_user_id = binding.user_id and hs.household_id <> binding.household_id;

create or replace function public.begin_household_purchase(target_household_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_household_owner(target_household_id) then
    raise exception 'Only the household owner can manage its subscription.' using errcode = '42501';
  end if;
  perform 1 from public.households where id = target_household_id for update;
  if exists (
    select 1 from public.household_subscriptions hs
    where hs.provider_user_id = auth.uid() and hs.household_id <> target_household_id
      and hs.status in ('active', 'trialing', 'cancelled', 'grace_period')
      and hs.current_period_end > now()
  ) then
    raise exception 'An active subscription is already linked to another household.';
  end if;
  insert into public.household_billing_bindings (user_id, household_id)
    values (auth.uid(), target_household_id)
    on conflict (user_id) do update set household_id = excluded.household_id;
end;
$$;
revoke all on function public.begin_household_purchase(uuid) from public, anon, authenticated;
grant execute on function public.begin_household_purchase(uuid) to authenticated;

create or replace function public.sync_owned_household_subscription()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owned_household uuid;
  source_row public.user_subscriptions;
  previous_row public.household_subscriptions;
  event_name text;
begin
  select binding.household_id into owned_household
  from public.household_billing_bindings binding
  join public.household_members hm on hm.household_id = binding.household_id
    and hm.user_id = binding.user_id and hm.role = 'owner'
  where binding.user_id = new.user_id;
  if owned_household is null then
    select hm.household_id into owned_household
    from public.household_members hm join public.households h on h.id = hm.household_id
    where hm.user_id = new.user_id and hm.role = 'owner'
    order by (h.created_by = new.user_id) desc, hm.created_at, hm.household_id limit 1;
  end if;
  if owned_household is null then return new; end if;

  perform 1 from public.households where id = owned_household for update;
  select * into previous_row from public.household_subscriptions where household_id = owned_household;
  if new.source_subscription_id is not null then
    select * into source_row from public.user_subscriptions where id = new.source_subscription_id;
  else
    select * into source_row from public.user_subscriptions
      where user_id = new.user_id order by updated_at desc limit 1;
  end if;
  if source_row.id is null then return new; end if;

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
  return new;
end;
$$;

do $$ declare household uuid; begin
  for household in select id from public.households order by id loop
    perform public.reconcile_household_access(household);
  end loop;
end $$;
