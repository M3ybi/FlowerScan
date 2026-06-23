create or replace function public.free_household_ai_analyzes_monthly_limit()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select sp.ai_scans_monthly_limit
    from public.subscription_plans sp
    where sp.plan_key = 'free'
  ), 10);
$$;

create or replace function public.is_household_premium(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select h.premium_enabled
      and h.plan_key = 'premium'
      and (h.premium_expires_at is null or h.premium_expires_at > now())
    from public.households h
    where h.id = target_household_id
      and public.is_household_member(h.id)
  ), false);
$$;

create or replace function public.get_household_plan_usage(target_household_id uuid)
returns table (
  is_premium boolean,
  plants_used integer,
  plants_limit integer,
  plants_remaining integer,
  ai_analyzes_used integer,
  ai_analyzes_monthly_limit integer,
  ai_analyzes_remaining integer,
  period_start timestamptz,
  period_end timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  premium boolean;
  plant_count integer;
  plant_limit integer;
  ai_limit integer;
  current_period_start timestamptz := public.household_usage_period_start();
  current_period_end timestamptz := public.household_usage_period_end();
  used integer;
  reserved integer;
begin
  perform public.assert_household_member(target_household_id);
  premium := public.is_household_premium(target_household_id);

  select count(*)::integer
    into plant_count
  from public.plants p
  where p.household_id = target_household_id
    and p.is_removed = false;

  select coalesce(uc.used_count, 0), coalesce(uc.reserved_count, 0)
    into used, reserved
  from (select 1) seed
  left join public.household_usage_counters uc
    on uc.household_id = target_household_id
    and uc.usage_type = 'plant_unwell_ai_analyze'
    and uc.period_start = current_period_start;

  if premium then
    return query select true, plant_count, null::integer, null::integer, used, null::integer, null::integer, current_period_start, current_period_end;
  end if;

  plant_limit := public.free_household_plants_limit();
  ai_limit := public.free_household_ai_analyzes_monthly_limit();
  return query select
    false,
    plant_count,
    plant_limit,
    greatest(plant_limit - plant_count, 0),
    used,
    ai_limit,
    greatest(ai_limit - used - reserved, 0),
    current_period_start,
    current_period_end;
end;
$$;

create or replace function public.assert_can_run_ai_analyze(target_household_id uuid, analyze_type text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  current_period_start timestamptz := public.household_usage_period_start();
  ai_limit integer;
  used integer;
  reserved integer;
begin
  perform public.assert_household_member(target_household_id);

  if analyze_type <> 'plant_unwell_ai_analyze' then
    raise exception 'Unsupported AI analyze type.';
  end if;

  if public.is_household_premium(target_household_id) then
    return;
  end if;

  select coalesce(uc.used_count, 0), coalesce(uc.reserved_count, 0)
    into used, reserved
  from (select 1) seed
  left join public.household_usage_counters uc
    on uc.household_id = target_household_id
    and uc.usage_type = analyze_type
    and uc.period_start = current_period_start;

  ai_limit := public.free_household_ai_analyzes_monthly_limit();
  if used + reserved >= ai_limit then
    raise exception 'Free households can run % plant health AI analyzes per month.', ai_limit;
  end if;
end;
$$;

create or replace function public.reserve_ai_analyze_usage(target_household_id uuid, analyze_type text, generation_source text default 'unknown')
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  current_period_start timestamptz := public.household_usage_period_start();
  current_period_end timestamptz := public.household_usage_period_end();
  ai_limit integer;
  reservation_id uuid;
begin
  perform public.assert_household_member(target_household_id);
  if analyze_type <> 'plant_unwell_ai_analyze' then
    raise exception 'Unsupported AI analyze type.';
  end if;
  if public.is_household_premium(target_household_id) then
    return null;
  end if;

  perform 1 from public.households where id = target_household_id for update;
  perform public.assert_can_run_ai_analyze(target_household_id, analyze_type);
  ai_limit := public.free_household_ai_analyzes_monthly_limit();

  insert into public.household_usage_counters (household_id, usage_type, period_start, period_end, reserved_count, limit_count, last_reset_at)
  values (target_household_id, analyze_type, current_period_start, current_period_end, 1, ai_limit, current_period_start)
  on conflict (household_id, usage_type, period_start) do update set
    reserved_count = public.household_usage_counters.reserved_count + 1,
    limit_count = ai_limit,
    period_end = excluded.period_end,
    updated_at = now();

  insert into public.household_usage_reservations (household_id, usage_type, period_start, source)
  values (target_household_id, analyze_type, current_period_start, generation_source)
  returning id into reservation_id;

  return reservation_id;
end;
$$;

create or replace function public.record_ai_analyze_usage(target_household_id uuid, analyze_type text, generation_source text default 'unknown')
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  current_period_start timestamptz := public.household_usage_period_start();
  current_period_end timestamptz := public.household_usage_period_end();
  ai_limit integer;
begin
  perform public.assert_household_member(target_household_id);
  if analyze_type <> 'plant_unwell_ai_analyze' then
    raise exception 'Unsupported AI analyze type.';
  end if;
  if public.is_household_premium(target_household_id) then
    return;
  end if;

  perform 1 from public.households where id = target_household_id for update;
  perform public.assert_can_run_ai_analyze(target_household_id, analyze_type);
  ai_limit := public.free_household_ai_analyzes_monthly_limit();

  insert into public.household_usage_counters (household_id, usage_type, period_start, period_end, used_count, limit_count, last_reset_at)
  values (target_household_id, analyze_type, current_period_start, current_period_end, 1, ai_limit, current_period_start)
  on conflict (household_id, usage_type, period_start) do update set
    used_count = public.household_usage_counters.used_count + 1,
    limit_count = ai_limit,
    period_end = excluded.period_end,
    updated_at = now();

  insert into public.household_usage_reservations (household_id, usage_type, period_start, status, source)
  values (target_household_id, analyze_type, current_period_start, 'committed', generation_source);
end;
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
  where not (
    h.premium_enabled
    and h.plan_key = 'premium'
    and (h.premium_expires_at is null or h.premium_expires_at > reference_at)
  )
  on conflict (household_id, usage_type, period_start) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.free_household_ai_analyzes_monthly_limit() from public;
revoke all on function public.is_household_premium(uuid) from public;
revoke all on function public.get_household_plan_usage(uuid) from public;
revoke all on function public.assert_can_run_ai_analyze(uuid, text) from public;
revoke all on function public.reserve_ai_analyze_usage(uuid, text, text) from public;
revoke all on function public.record_ai_analyze_usage(uuid, text, text) from public;
revoke all on function public.reset_household_monthly_usage_counters(timestamptz) from public;

grant execute on function public.is_household_premium(uuid) to authenticated;
grant execute on function public.get_household_plan_usage(uuid) to authenticated;
grant execute on function public.assert_can_run_ai_analyze(uuid, text) to authenticated;
grant execute on function public.reserve_ai_analyze_usage(uuid, text, text) to authenticated;
grant execute on function public.record_ai_analyze_usage(uuid, text, text) to authenticated;
