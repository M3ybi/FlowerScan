-- Keep the deployed UTC reset boundary independent of connection timezone.
create or replace function public.household_usage_period_start(reference_at timestamptz default now())
returns timestamptz language sql stable set search_path = public as $$
  select (date_trunc('month', (reference_at at time zone 'UTC') - interval '5 hours')
    + interval '5 hours') at time zone 'UTC';
$$;
create or replace function public.household_usage_period_end(reference_at timestamptz default now())
returns timestamptz language sql stable set search_path = public as $$
  select ((public.household_usage_period_start(reference_at) at time zone 'UTC')
    + interval '1 month') at time zone 'UTC';
$$;

-- Version the previously untracked quota helper; one server-side product limit.
update public.subscription_plans set ai_scans_monthly_limit = 5 where plan_key = 'free';
create or replace function public.free_household_ai_analyzes_monthly_limit()
returns integer language sql stable security definer set search_path = public as $$
  select coalesce((select ai_scans_monthly_limit from public.subscription_plans where plan_key = 'free'), 5);
$$;
revoke all on function public.free_household_ai_analyzes_monthly_limit() from public, anon, authenticated;

-- AI requests time out after 30 seconds. Recover reservations left behind by
-- a terminated worker or failed cleanup, with a conservative two-minute lease.
create or replace function public.expire_ai_analyze_reservations(target_household_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform 1 from public.households where id = target_household_id for update;
  with expired as (
    update public.household_usage_reservations set status = 'released', updated_at = now()
    where household_id = target_household_id and status = 'reserved'
      and usage_type = 'plant_unwell_ai_analyze' and created_at < now() - interval '2 minutes'
    returning usage_type, period_start
  ), totals as (
    select usage_type, period_start, count(*)::integer as amount from expired group by usage_type, period_start
  )
  update public.household_usage_counters c set reserved_count = greatest(c.reserved_count - t.amount, 0), updated_at = now()
  from totals t where c.household_id = target_household_id and c.usage_type = t.usage_type and c.period_start = t.period_start;
end;
$$;
revoke all on function public.expire_ai_analyze_reservations(uuid) from public, anon, authenticated;

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
volatile
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
  perform public.expire_ai_analyze_reservations(target_household_id);
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
    public.free_household_ai_analyzes_monthly_limit(),
    greatest(public.free_household_ai_analyzes_monthly_limit() - used - reserved, 0),
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
  used integer;
  reserved integer;
begin
  perform public.assert_household_member(target_household_id);
  perform public.expire_ai_analyze_reservations(target_household_id);

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

  if used + reserved >= public.free_household_ai_analyzes_monthly_limit() then
    raise exception 'Free households can run % plant health AI analyzes per month.', public.free_household_ai_analyzes_monthly_limit();
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
  values (target_household_id, analyze_type, current_period_start, current_period_end, 1, public.free_household_ai_analyzes_monthly_limit(), current_period_start)
  on conflict (household_id, usage_type, period_start) do update set
    reserved_count = public.household_usage_counters.reserved_count + 1,
    limit_count = public.free_household_ai_analyzes_monthly_limit(),
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
  values (target_household_id, analyze_type, current_period_start, current_period_end, 1, public.free_household_ai_analyzes_monthly_limit(), current_period_start)
  on conflict (household_id, usage_type, period_start) do update set
    used_count = public.household_usage_counters.used_count + 1,
    limit_count = public.free_household_ai_analyzes_monthly_limit(),
    period_end = excluded.period_end,
    updated_at = now();

  insert into public.household_usage_reservations (household_id, usage_type, period_start, status, source)
  values (target_household_id, analyze_type, current_period_start, 'committed', generation_source);
end;
$$;

create or replace function public.commit_ai_analyze_usage(target_household_id uuid, reservation_id uuid, analyze_type text, generation_source text default 'unknown')
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare reserved_period timestamptz;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted AI service required.' using errcode = '42501';
  end if;
  if analyze_type <> 'plant_unwell_ai_analyze' then
    raise exception 'Unsupported AI analyze type.';
  end if;

  perform 1 from public.households where id = target_household_id for update;

  update public.household_usage_reservations
  set status = 'committed',
      source = generation_source,
      updated_at = now()
  where id = reservation_id
    and household_id = target_household_id
    and usage_type = analyze_type
    and status = 'reserved'
  returning period_start into reserved_period;

  if not found then
    raise exception 'AI analyze usage reservation is not available.';
  end if;

  update public.household_usage_counters
  set used_count = used_count + 1,
      reserved_count = greatest(reserved_count - 1, 0),
      updated_at = now()
  where household_id = target_household_id
    and usage_type = analyze_type
    and period_start = reserved_period;
end;
$$;

create or replace function public.release_ai_analyze_reservation(target_household_id uuid, reservation_id uuid, analyze_type text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare reserved_period timestamptz;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted AI service required.' using errcode = '42501';
  end if;
  if reservation_id is null then
    return;
  end if;

  perform 1 from public.households where id = target_household_id for update;

  update public.household_usage_reservations
  set status = 'released',
      updated_at = now()
  where id = reservation_id
    and household_id = target_household_id
    and usage_type = analyze_type
    and status = 'reserved'
  returning period_start into reserved_period;

  if found then
    update public.household_usage_counters
    set reserved_count = greatest(reserved_count - 1, 0),
        updated_at = now()
    where household_id = target_household_id
      and usage_type = analyze_type
      and period_start = reserved_period;
  end if;
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
  from public.plant_care_tip_generations g
  where household_id = target_household_id
    and plant_id = target_plant_id
    and tip_type = 'ai_care_tip';

  if generation_source = 'initial_plant_add' and generations > 0 then
    raise exception 'This plant already has generated AI care tips.';
  end if;

  if generation_source <> 'initial_plant_add' then
    select count(*)::integer into refreshes_today
    from public.plant_care_tip_generations g
    where household_id = target_household_id
      and plant_id = target_plant_id
      and tip_type = 'ai_care_tip'
      and g.generation_source <> 'initial_plant_add'
      and generated_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
      and generated_at < (date_trunc('day', now() at time zone 'UTC') + interval '1 day') at time zone 'UTC';

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
  perform public.assert_household_member(target_household_id);
  perform 1 from public.households where id = target_household_id for update;
  perform public.assert_can_generate_care_tip(target_household_id, target_plant_id, generation_source);

  if public.is_household_premium(target_household_id) then
    return;
  end if;

  insert into public.plant_care_tip_generations (household_id, plant_id, tip_type, generation_source)
  values (target_household_id, target_plant_id, 'ai_care_tip', generation_source);
end;
$$;

-- Existing coowner assignments remain historical data. Shared plant operations
-- must never depend on creating another administrative Owner.
-- No email/account-specific branch is added by this migration.

-- The trigger must check household moves as well as restores/inserts.
create or replace function public.enforce_household_plant_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not new.is_removed then perform public.assert_can_add_plant(new.household_id); end if;
  elsif not new.is_removed and (old.is_removed or new.household_id <> old.household_id) then
    perform public.assert_can_add_plant(new.household_id);
  end if;
  return new;
end;
$$;
drop trigger enforce_household_plant_limit_before_write on public.plants;
create trigger enforce_household_plant_limit_before_write before insert or update of is_removed, household_id
on public.plants for each row execute function public.enforce_household_plant_limit();

-- Invoker rights preserve all existing RLS, FK and quota checks. Any child
-- failure rolls back the whole statement, rather than compensating over HTTP.
create or replace function public.create_household_plant(plant_input jsonb, care_pills jsonb default '[]', care_tips jsonb default '[]')
returns jsonb language plpgsql security invoker set search_path = public as $$
declare saved public.plants;
begin
  if jsonb_typeof(plant_input) is distinct from 'object'
    or jsonb_typeof(care_pills) is distinct from 'array'
    or jsonb_typeof(care_tips) is distinct from 'array'
    or jsonb_array_length(care_pills) > 20 or jsonb_array_length(care_tips) > 20
    or nullif(btrim(plant_input->>'display_name'), '') is null then
    raise exception 'Invalid plant input.' using errcode = '22023';
  end if;
  insert into public.plants (
    household_id, catalog_plant_id, legacy_id, source, display_name, likely_name,
    identification, identification_note, image_path, short_care, light, watering,
    watering_interval_days, notifications_enabled, soil, created_by
  ) values (
    (plant_input->>'household_id')::uuid, (plant_input->>'catalog_plant_id')::uuid,
    plant_input->>'legacy_id', (plant_input->>'source')::public.plant_source,
    plant_input->>'display_name', plant_input->>'likely_name',
    (plant_input->>'identification')::public.identification_status,
    plant_input->>'identification_note', plant_input->>'image_path',
    plant_input->>'short_care', plant_input->>'light', plant_input->>'watering',
    (plant_input->>'watering_interval_days')::integer,
    coalesce((plant_input->>'notifications_enabled')::boolean, true), plant_input->>'soil', auth.uid()
  ) returning * into saved;
  insert into public.plant_care_pills (plant_id, label, value, tone, position)
  select saved.id, item->>'label', item->>'value', (item->>'tone')::public.care_pill_tone, (position - 1)::integer
  from jsonb_array_elements(care_pills) with ordinality as entries(item, position);
  insert into public.plant_care_tips (plant_id, tip, position)
  select saved.id, item #>> '{}', (position - 1)::integer
  from jsonb_array_elements(care_tips) with ordinality as entries(item, position);
  if jsonb_array_length(care_tips) > 0 then
    perform public.record_care_tip_generation(saved.household_id, saved.id, 'initial_plant_add');
  end if;
  return to_jsonb(saved) || jsonb_build_object(
    'plant_care_pills', (select coalesce(jsonb_agg(to_jsonb(p) order by p.position), '[]') from public.plant_care_pills p where p.plant_id = saved.id),
    'plant_care_tips', (select coalesce(jsonb_agg(to_jsonb(t) order by t.position), '[]') from public.plant_care_tips t where t.plant_id = saved.id)
  );
end;
$$;
revoke all on function public.create_household_plant(jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.create_household_plant(jsonb,jsonb,jsonb) to authenticated;

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

-- A client must not release an in-flight server request to bypass its quota.
revoke execute on function public.commit_ai_analyze_usage(uuid,uuid,text,text) from public, anon, authenticated;
revoke execute on function public.release_ai_analyze_reservation(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.commit_ai_analyze_usage(uuid,uuid,text,text) to service_role;
grant execute on function public.release_ai_analyze_reservation(uuid,uuid,text) to service_role;

create or replace function public.update_household_plant(target_plant_id uuid, plant_patch jsonb, care_pills jsonb default null, care_tips jsonb default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare saved public.plants; patched public.plants;
begin
  select * into saved from public.plants where id = target_plant_id for update;
  if not found then raise exception 'Plant is unavailable.' using errcode = '42501'; end if;
  if jsonb_typeof(plant_patch) is distinct from 'object'
    or (care_pills is not null and (jsonb_typeof(care_pills) <> 'array' or jsonb_array_length(care_pills) > 20))
    or (care_tips is not null and (jsonb_typeof(care_tips) <> 'array' or jsonb_array_length(care_tips) > 20)) then
    raise exception 'Invalid plant input.' using errcode = '22023';
  end if;
  -- Only the explicit mutable columns below are persisted from the patch.
  patched := jsonb_populate_record(saved, plant_patch);
  update public.plants set catalog_plant_id = patched.catalog_plant_id, legacy_id = patched.legacy_id,
    source = patched.source, display_name = patched.display_name, likely_name = patched.likely_name,
    identification = patched.identification, identification_note = patched.identification_note,
    image_path = patched.image_path, short_care = patched.short_care, light = patched.light,
    watering = patched.watering, watering_interval_days = patched.watering_interval_days,
    notifications_enabled = patched.notifications_enabled, soil = patched.soil, is_removed = patched.is_removed
  where id = target_plant_id returning * into saved;
  if not found then raise exception 'Plant is unavailable.' using errcode = '42501'; end if;
  if care_pills is not null then
    delete from public.plant_care_pills where plant_id = target_plant_id;
    insert into public.plant_care_pills (plant_id,label,value,tone,position)
    select target_plant_id,item->>'label',item->>'value',(item->>'tone')::public.care_pill_tone,(position-1)::integer
    from jsonb_array_elements(care_pills) with ordinality as entries(item,position);
  end if;
  if care_tips is not null then
    delete from public.plant_care_tips where plant_id = target_plant_id;
    insert into public.plant_care_tips (plant_id,tip,position)
    select target_plant_id,item #>> '{}',(position-1)::integer
    from jsonb_array_elements(care_tips) with ordinality as entries(item,position);
  end if;
  return to_jsonb(saved) || jsonb_build_object(
    'plant_care_pills', (select coalesce(jsonb_agg(to_jsonb(p) order by p.position), '[]') from public.plant_care_pills p where p.plant_id = saved.id),
    'plant_care_tips', (select coalesce(jsonb_agg(to_jsonb(t) order by t.position), '[]') from public.plant_care_tips t where t.plant_id = saved.id)
  );
end;
$$;
revoke all on function public.update_household_plant(uuid,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.update_household_plant(uuid,jsonb,jsonb,jsonb) to authenticated;

create or replace function public.create_plant_diagnostic(diagnostic_input jsonb, observed_symptoms jsonb, recommended_steps jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare saved public.plant_diagnostics; target_household uuid;
begin
  if jsonb_typeof(diagnostic_input) is distinct from 'object'
    or jsonb_typeof(observed_symptoms) is distinct from 'array'
    or jsonb_typeof(recommended_steps) is distinct from 'array'
    or jsonb_array_length(observed_symptoms) > 8 or jsonb_array_length(recommended_steps) > 8 then
    raise exception 'Invalid diagnosis input.' using errcode = '22023';
  end if;
  select household_id into target_household from public.plants
  where id = (diagnostic_input->>'plant_id')::uuid and not is_removed;
  if not found then raise exception 'Plant is unavailable.' using errcode = '42501'; end if;
  insert into public.plant_diagnostics (
    household_id,plant_id,legacy_id,image_path,diagnosis_title,confidence,confidence_label,
    reasoning_summary,risk_level,disclaimer,user_confirmation,user_note,created_by
  ) values (
    target_household,(diagnostic_input->>'plant_id')::uuid,diagnostic_input->>'legacy_id',
    diagnostic_input->>'image_path',diagnostic_input->>'diagnosis_title',(diagnostic_input->>'confidence')::integer,
    (diagnostic_input->>'confidence_label')::public.diagnosis_confidence_label,
    diagnostic_input->>'reasoning_summary',(diagnostic_input->>'risk_level')::public.diagnosis_risk_level,
    diagnostic_input->>'disclaimer',(diagnostic_input->>'user_confirmation')::public.diagnosis_confirmation,
    coalesce(diagnostic_input->>'user_note',''),auth.uid()
  ) returning * into saved;
  insert into public.diagnostic_observed_symptoms(diagnostic_id,symptom,position)
  select saved.id,item #>> '{}',(position-1)::integer
  from jsonb_array_elements(observed_symptoms) with ordinality as entries(item,position);
  insert into public.diagnostic_recommended_steps(diagnostic_id,step,position)
  select saved.id,item #>> '{}',(position-1)::integer
  from jsonb_array_elements(recommended_steps) with ordinality as entries(item,position);
  return to_jsonb(saved) || jsonb_build_object(
    'diagnostic_observed_symptoms',(select coalesce(jsonb_agg(to_jsonb(s) order by s.position),'[]') from public.diagnostic_observed_symptoms s where s.diagnostic_id=saved.id),
    'diagnostic_recommended_steps',(select coalesce(jsonb_agg(to_jsonb(s) order by s.position),'[]') from public.diagnostic_recommended_steps s where s.diagnostic_id=saved.id)
  );
end;
$$;
revoke all on function public.create_plant_diagnostic(jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.create_plant_diagnostic(jsonb,jsonb,jsonb) to authenticated;
