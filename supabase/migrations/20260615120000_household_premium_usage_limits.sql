alter table public.households
  add column if not exists plan_key text not null default 'free',
  add column if not exists premium_enabled boolean not null default false,
  add column if not exists premium_source text,
  add column if not exists premium_started_at timestamptz,
  add column if not exists premium_expires_at timestamptz;

alter table public.households
  add constraint households_plan_key_check check (plan_key in ('free', 'premium')) not valid;

do $$
begin
  begin
    alter table public.households validate constraint households_plan_key_check;
  exception
    when others then
      raise notice 'households_plan_key_check validation deferred: %', sqlerrm;
  end;
end $$;

create table if not exists public.household_usage_counters (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  usage_type text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  used_count integer not null default 0 check (used_count >= 0),
  reserved_count integer not null default 0 check (reserved_count >= 0),
  limit_count integer check (limit_count is null or limit_count >= 0),
  last_reset_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end > period_start),
  unique (household_id, usage_type, period_start)
);

create table if not exists public.household_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  usage_type text not null,
  period_start timestamptz not null,
  status text not null default 'reserved' check (status in ('reserved', 'committed', 'released')),
  source text not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plant_care_tip_generations (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null,
  household_id uuid not null,
  tip_type text not null default 'ai_care_tip',
  generation_source text not null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (plant_id, household_id) references public.plants(id, household_id) on delete cascade
);

create index if not exists household_usage_counters_household_idx on public.household_usage_counters(household_id);
create index if not exists household_usage_counters_type_period_idx on public.household_usage_counters(usage_type, period_start);
create index if not exists household_usage_reservations_household_idx on public.household_usage_reservations(household_id);
create index if not exists household_usage_reservations_status_idx on public.household_usage_reservations(status);
create index if not exists plant_care_tip_generations_plant_idx on public.plant_care_tip_generations(plant_id);
create index if not exists plant_care_tip_generations_household_idx on public.plant_care_tip_generations(household_id);
create index if not exists plant_care_tip_generations_generated_at_idx on public.plant_care_tip_generations(generated_at);

drop trigger if exists set_household_usage_counters_updated_at on public.household_usage_counters;
create trigger set_household_usage_counters_updated_at
  before update on public.household_usage_counters
  for each row execute function public.set_updated_at();

drop trigger if exists set_household_usage_reservations_updated_at on public.household_usage_reservations;
create trigger set_household_usage_reservations_updated_at
  before update on public.household_usage_reservations
  for each row execute function public.set_updated_at();

alter table public.household_usage_counters enable row level security;
alter table public.household_usage_reservations enable row level security;
alter table public.plant_care_tip_generations enable row level security;

drop policy if exists "household_usage_counters_select_members" on public.household_usage_counters;
create policy "household_usage_counters_select_members" on public.household_usage_counters
  for select to authenticated using (public.is_household_member(household_id));

drop policy if exists "household_usage_reservations_select_members" on public.household_usage_reservations;
create policy "household_usage_reservations_select_members" on public.household_usage_reservations
  for select to authenticated using (public.is_household_member(household_id));

drop policy if exists "plant_care_tip_generations_select_members" on public.plant_care_tip_generations;
create policy "plant_care_tip_generations_select_members" on public.plant_care_tip_generations
  for select to authenticated using (public.is_household_member(household_id));

grant select on public.household_usage_counters to authenticated;
grant select on public.household_usage_reservations to authenticated;
grant select on public.plant_care_tip_generations to authenticated;

create or replace function public.household_usage_period_start(reference_at timestamptz default now())
returns timestamptz
language sql
stable
as $$
  select case
    when reference_at >= date_trunc('month', reference_at) + interval '5 hours'
      then date_trunc('month', reference_at) + interval '5 hours'
    else date_trunc('month', reference_at - interval '1 month') + interval '5 hours'
  end;
$$;

create or replace function public.household_usage_period_end(reference_at timestamptz default now())
returns timestamptz
language sql
stable
as $$
  select public.household_usage_period_start(reference_at) + interval '1 month';
$$;

create or replace function public.assert_household_member(target_household_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_household_member(target_household_id) then
    raise exception 'Household membership is required.' using errcode = '42501';
  end if;
end;
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

create or replace function public.free_household_plants_limit()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select sp.plants_limit
    from public.subscription_plans sp
    where sp.plan_key = 'free'
  ), 10);
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
  return query select
    false,
    plant_count,
    plant_limit,
    greatest(plant_limit - plant_count, 0),
    used,
    5,
    greatest(5 - used - reserved, 0),
    current_period_start,
    current_period_end;
end;
$$;

create or replace function public.assert_can_add_plant(target_household_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  plant_count integer;
  plant_limit integer;
begin
  perform public.assert_household_member(target_household_id);
  perform 1 from public.households where id = target_household_id for update;

  if public.is_household_premium(target_household_id) then
    return;
  end if;

  plant_limit := public.free_household_plants_limit();
  select count(*)::integer into plant_count
  from public.plants
  where household_id = target_household_id
    and is_removed = false;

  if plant_count >= plant_limit then
    raise exception 'Free households can have up to % plants. Upgrade to add unlimited plants.', plant_limit;
  end if;
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

  if used + reserved >= 5 then
    raise exception 'Free households can run 5 plant health AI analyzes per month.';
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

  insert into public.household_usage_counters (household_id, usage_type, period_start, period_end, reserved_count, limit_count, last_reset_at)
  values (target_household_id, analyze_type, current_period_start, current_period_end, 1, 5, current_period_start)
  on conflict (household_id, usage_type, period_start) do update set
    reserved_count = public.household_usage_counters.reserved_count + 1,
    limit_count = 5,
    period_end = excluded.period_end,
    updated_at = now();

  insert into public.household_usage_reservations (household_id, usage_type, period_start, source)
  values (target_household_id, analyze_type, current_period_start, generation_source)
  returning id into reservation_id;

  return reservation_id;
end;
$$;

create or replace function public.commit_ai_analyze_usage(target_household_id uuid, reservation_id uuid, analyze_type text, generation_source text default 'unknown')
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public.assert_household_member(target_household_id);
  if analyze_type <> 'plant_unwell_ai_analyze' then
    raise exception 'Unsupported AI analyze type.';
  end if;
  if public.is_household_premium(target_household_id) then
    return;
  end if;

  perform 1 from public.households where id = target_household_id for update;

  update public.household_usage_reservations
  set status = 'committed',
      source = generation_source,
      updated_at = now()
  where id = reservation_id
    and household_id = target_household_id
    and usage_type = analyze_type
    and status = 'reserved';

  if not found then
    raise exception 'AI analyze usage reservation is not available.';
  end if;

  update public.household_usage_counters
  set used_count = used_count + 1,
      reserved_count = greatest(reserved_count - 1, 0),
      updated_at = now()
  where household_id = target_household_id
    and usage_type = analyze_type
    and period_start = public.household_usage_period_start();
end;
$$;

create or replace function public.release_ai_analyze_reservation(target_household_id uuid, reservation_id uuid, analyze_type text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public.assert_household_member(target_household_id);
  if reservation_id is null or public.is_household_premium(target_household_id) then
    return;
  end if;

  perform 1 from public.households where id = target_household_id for update;

  update public.household_usage_reservations
  set status = 'released',
      updated_at = now()
  where id = reservation_id
    and household_id = target_household_id
    and usage_type = analyze_type
    and status = 'reserved';

  if found then
    update public.household_usage_counters
    set reserved_count = greatest(reserved_count - 1, 0),
        updated_at = now()
    where household_id = target_household_id
      and usage_type = analyze_type
      and period_start = public.household_usage_period_start();
  end if;
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

  insert into public.household_usage_counters (household_id, usage_type, period_start, period_end, used_count, limit_count, last_reset_at)
  values (target_household_id, analyze_type, current_period_start, current_period_end, 1, 5, current_period_start)
  on conflict (household_id, usage_type, period_start) do update set
    used_count = public.household_usage_counters.used_count + 1,
    limit_count = 5,
    period_end = excluded.period_end,
    updated_at = now();

  insert into public.household_usage_reservations (household_id, usage_type, period_start, status, source)
  values (target_household_id, analyze_type, current_period_start, 'committed', generation_source);
end;
$$;

create or replace function public.assert_can_generate_care_tip(target_household_id uuid, target_plant_id uuid, generation_source text default 'manual_refresh')
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  generations integer;
  refreshes_today integer;
begin
  perform public.assert_household_member(target_household_id);

  if not exists (
    select 1 from public.plants p
    where p.id = target_plant_id
      and p.household_id = target_household_id
      and p.is_removed = false
  ) then
    raise exception 'Plant is not available in this household.';
  end if;

  if public.is_household_premium(target_household_id) then
    return;
  end if;

  select count(*)::integer into generations
  from public.plant_care_tip_generations
  where household_id = target_household_id
    and plant_id = target_plant_id
    and tip_type = 'ai_care_tip';

  if generation_source = 'initial_plant_add' and generations > 0 then
    raise exception 'This plant already has generated AI care tips.';
  end if;

  if generation_source <> 'initial_plant_add' then
    select count(*)::integer into refreshes_today
    from public.plant_care_tip_generations
    where household_id = target_household_id
      and plant_id = target_plant_id
      and tip_type = 'ai_care_tip'
      and generation_source <> 'initial_plant_add'
      and generated_at >= date_trunc('day', now())
      and generated_at < date_trunc('day', now()) + interval '1 day';

    if refreshes_today >= 1 then
      raise exception 'Free households can refresh AI care tips once per plant per day.';
    end if;
  end if;
end;
$$;

create or replace function public.record_care_tip_generation(target_household_id uuid, target_plant_id uuid, generation_source text default 'manual_refresh')
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public.assert_can_generate_care_tip(target_household_id, target_plant_id, generation_source);

  if public.is_household_premium(target_household_id) then
    return;
  end if;

  insert into public.plant_care_tip_generations (household_id, plant_id, tip_type, generation_source)
  values (target_household_id, target_plant_id, 'ai_care_tip', generation_source);
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
  select h.id, 'plant_unwell_ai_analyze', current_period_start, current_period_end, 0, 0, 5, current_period_start
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

create or replace function public.enforce_household_plant_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.is_removed = false then
    perform public.assert_can_add_plant(new.household_id);
  elsif tg_op = 'UPDATE' and new.is_removed = false and old.is_removed = true then
    perform public.assert_can_add_plant(new.household_id);
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_household_plant_limit_before_write on public.plants;
create trigger enforce_household_plant_limit_before_write
  before insert or update of is_removed on public.plants
  for each row execute function public.enforce_household_plant_limit();

revoke all on function public.household_usage_period_start(timestamptz) from public;
revoke all on function public.household_usage_period_end(timestamptz) from public;
revoke all on function public.assert_household_member(uuid) from public;
revoke all on function public.is_household_premium(uuid) from public;
revoke all on function public.free_household_plants_limit() from public;
revoke all on function public.get_household_plan_usage(uuid) from public;
revoke all on function public.assert_can_add_plant(uuid) from public;
revoke all on function public.assert_can_run_ai_analyze(uuid, text) from public;
revoke all on function public.reserve_ai_analyze_usage(uuid, text, text) from public;
revoke all on function public.commit_ai_analyze_usage(uuid, uuid, text, text) from public;
revoke all on function public.release_ai_analyze_reservation(uuid, uuid, text) from public;
revoke all on function public.record_ai_analyze_usage(uuid, text, text) from public;
revoke all on function public.assert_can_generate_care_tip(uuid, uuid, text) from public;
revoke all on function public.record_care_tip_generation(uuid, uuid, text) from public;
revoke all on function public.reset_household_monthly_usage_counters(timestamptz) from public;

grant execute on function public.household_usage_period_start(timestamptz) to authenticated;
grant execute on function public.household_usage_period_end(timestamptz) to authenticated;
grant execute on function public.is_household_premium(uuid) to authenticated;
grant execute on function public.get_household_plan_usage(uuid) to authenticated;
grant execute on function public.assert_can_add_plant(uuid) to authenticated;
grant execute on function public.assert_can_run_ai_analyze(uuid, text) to authenticated;
grant execute on function public.reserve_ai_analyze_usage(uuid, text, text) to authenticated;
grant execute on function public.commit_ai_analyze_usage(uuid, uuid, text, text) to authenticated;
grant execute on function public.release_ai_analyze_reservation(uuid, uuid, text) to authenticated;
grant execute on function public.record_ai_analyze_usage(uuid, text, text) to authenticated;
grant execute on function public.assert_can_generate_care_tip(uuid, uuid, text) to authenticated;
grant execute on function public.record_care_tip_generation(uuid, uuid, text) to authenticated;

do $$
declare
  matched_count integer;
  updated_id uuid;
begin
  select count(*)::integer into matched_count
  from public.households
  where name = 'Petzvalova'
     or legacy_public_token = 'Petzvalova';

  if matched_count = 0 then
    raise warning 'Petzvalova household was not found; no premium grant was applied.';
  elsif matched_count > 1 then
    raise exception 'Petzvalova premium grant is ambiguous; % households matched.', matched_count;
  else
    update public.households
    set plan_key = 'premium',
        premium_enabled = true,
        premium_source = 'manual_admin_grant',
        premium_started_at = coalesce(premium_started_at, now()),
        premium_expires_at = null,
        updated_at = now()
    where name = 'Petzvalova'
       or legacy_public_token = 'Petzvalova'
    returning id into updated_id;

    raise notice 'Enabled unlimited premium for Petzvalova household %.', updated_id;
  end if;
end $$;
