create or replace function public.is_household_premium_at(
  target_household_id uuid,
  reference_at timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.households h
    where h.id = target_household_id
      and h.premium_enabled
      and h.plan_key = 'premium'
      and (h.premium_expires_at is null or h.premium_expires_at > reference_at)
  ) or exists (
    select 1
    from public.household_members hm
    join public.user_entitlements ue on ue.user_id = hm.user_id
    where hm.household_id = target_household_id
      and ue.is_premium
      and ue.plan_key in ('premium_monthly', 'premium_yearly')
      and (ue.valid_until is null or ue.valid_until > reference_at)
  );
$$;

revoke all on function public.is_household_premium_at(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.is_household_premium(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_household_member(target_household_id)
    and public.is_household_premium_at(target_household_id, now());
$$;

create or replace function public.reset_household_monthly_usage_counters(reference_at timestamptz default now())
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  current_period_start timestamptz := public.household_usage_period_start(reference_at);
  current_period_end timestamptz := public.household_usage_period_end(reference_at);
  inserted_count integer;
begin
  insert into public.household_usage_counters (household_id, usage_type, period_start, period_end, used_count, reserved_count, limit_count, last_reset_at)
  select h.id, 'plant_unwell_ai_analyze', current_period_start, current_period_end, 0, 0, public.free_household_ai_analyzes_monthly_limit(), current_period_start
  from public.households h
  where not public.is_household_premium_at(h.id, reference_at)
  on conflict (household_id, usage_type, period_start) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.is_household_premium(uuid) from public;
revoke all on function public.reset_household_monthly_usage_counters(timestamptz) from public;
grant execute on function public.is_household_premium(uuid) to authenticated;
