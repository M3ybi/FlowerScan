-- Run inside BEGIN/ROLLBACK, after the matching migration. Synthetic accounts only.
do $test$
declare
  owner_id uuid := gen_random_uuid();
  member_id uuid := gen_random_uuid();
  stranger_id uuid := gen_random_uuid();
  home_id uuid := gen_random_uuid();
  free_id uuid := gen_random_uuid();
  plant jsonb;
  plant_id uuid;
  payload jsonb;
  reservation uuid;
  prior_period timestamptz;
  denied boolean;
  usage record;
  storage_name text;
begin
  insert into auth.users (id,aud,role,email,email_confirmed_at,created_at,updated_at)
  select id, 'authenticated', 'authenticated', 'plant-audit-' || id || '@example.invalid', now(),now(),now()
  from unnest(array[owner_id,member_id,stranger_id]) as id;
  insert into public.households (id,name,created_by,premium_enabled,plan_key,premium_source)
  values (home_id,'Plant audit premium',owner_id,true,'premium','manual_admin_grant'),
    (free_id,'Plant audit free',owner_id,false,'free',null);
  insert into public.household_members (household_id,user_id,role,status)
  values (home_id,owner_id,'owner','active'), (home_id,member_id,'viewer','active'),
    (free_id,owner_id,'owner','active');
  -- Metadata-only synthetic object: validates Storage RLS, creates no real file.
  storage_name := home_id || '/plants/' || gen_random_uuid() || '/original.jpg';
  insert into storage.objects(bucket_id,name) values('plant-images',storage_name);
  payload := jsonb_build_object('household_id',home_id,'source','custom','display_name','Audit plant',
    'likely_name','Audit plant','identification','confident','identification_note','Fixture',
    'short_care','Fixture','light','Fixture','watering','Fixture','soil','Fixture');
  perform set_config('request.jwt.claim.sub',member_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if not exists(select 1 from storage.objects where bucket_id='plant-images' and name=storage_name) then
    raise exception 'Active member cannot read a household image.';
  end if;
  denied := false;
  begin insert into storage.objects(bucket_id,name)
    values('plant-images',home_id || '/plants/' || gen_random_uuid() || '/original.jpg');
    exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Client bypassed validated upload service.'; end if;
  plant := public.create_household_plant(payload,'[{"label":"Light","value":"Indirect","tone":"green"}]','["Water when dry"]');
  plant_id := (plant->>'id')::uuid;
  if plant->>'image_path' is not null or jsonb_array_length(plant->'plant_care_tips') <> 1 then
    raise exception 'Member creation without image or care children failed.';
  end if;
  if plant->>'created_by' <> member_id::text then raise exception 'Creator audit identity was lost.'; end if;
  if public.is_household_owner(home_id) then raise exception 'Plant management granted billing authority.'; end if;
  plant := public.create_plant_diagnostic(jsonb_build_object('plant_id',plant_id,'legacy_id','diagnostic-ok',
    'diagnosis_title','Fixture','confidence',80,'confidence_label','stredna','reasoning_summary','Fixture',
    'risk_level','low','disclaimer','Fixture','user_confirmation','confirmed'),'["Dry leaf"]','["Check soil"]');
  if jsonb_array_length(plant->'diagnostic_observed_symptoms') <> 1 then raise exception 'Shared diagnosis did not persist symptoms.'; end if;
  denied := false;
  begin perform public.create_plant_diagnostic(plant || jsonb_build_object('legacy_id','diagnostic-atomic-fail'), '[null]', '[]');
    exception when not_null_violation then denied := true; end;
  if not denied or exists(select 1 from public.plant_diagnostics where household_id=home_id and legacy_id='diagnostic-atomic-fail') then
    raise exception 'Invalid diagnosis left a partial record.';
  end if;
  update public.plants set display_name='Updated by member' where id=plant_id;
  if not found then raise exception 'Member could not edit shared plant.'; end if;
  plant := public.update_household_plant(plant_id, '{"display_name":"Atomic update"}', null, '["Updated tip"]');
  denied := false;
  begin perform public.update_household_plant(plant_id, '{"display_name":"Must roll back"}',
    '[{"label":"Bad","value":"Bad","tone":"invalid"}]','[]');
    exception when invalid_text_representation then denied := true; end;
  if not denied or (select display_name from public.plants where id=plant_id) <> 'Atomic update'
    or (select count(*) from public.plant_care_tips t where t.plant_id=(plant->>'id')::uuid) <> 1 then
    raise exception 'Invalid update did not preserve the previous plant and care data.';
  end if;
  denied := false;
  begin
    perform public.create_household_plant(payload || '{"legacy_id":"atomic-failure"}',
      '[{"label":"Bad","value":"Bad","tone":"invalid"}]','[]');
  exception when invalid_text_representation then denied := true;
  end;
  if not denied or exists(select 1 from public.plants where household_id=home_id and legacy_id='atomic-failure') then
    raise exception 'Failed child insert left an incomplete plant.';
  end if;
  perform set_config('request.jwt.claim.sub',stranger_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',stranger_id,'role','authenticated')::text,true);
  if exists(select 1 from public.plants where id=plant_id) then raise exception 'Unrelated user read private plant.'; end if;
  if exists(select 1 from storage.objects where bucket_id='plant-images' and name=storage_name) then
    raise exception 'Unrelated user read private image.';
  end if;
  denied := false;
  begin perform public.create_household_plant(payload); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Unrelated user created a plant.'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  perform public.create_household_plant(payload);
  delete from public.plants where id=plant_id;
  if not found then raise exception 'Owner could not delete member plant.'; end if;
  -- A member also has DELETE, independently of who created the row.
  perform set_config('request.jwt.claim.sub',member_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
  delete from public.plants where household_id=home_id;
  if not found then raise exception 'Member could not delete owner plant.'; end if;
  -- Storage protects direct SQL deletion. The API cleanup is covered by the
  -- handler/repository tests; this object disappears with the outer ROLLBACK.
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  for i in 1..5 loop
    perform public.reserve_ai_analyze_usage(free_id,'plant_unwell_ai_analyze','fixture');
  end loop;
  denied := false;
  begin perform public.reserve_ai_analyze_usage(free_id,'plant_unwell_ai_analyze','sixth');
    exception when raise_exception then denied := true; end;
  if not denied then raise exception 'Concurrent outstanding reservations exceeded five.'; end if;
  select * into usage from public.get_household_plan_usage(free_id);
  if usage.ai_analyzes_monthly_limit <> 5 or usage.ai_analyzes_remaining <> 0 then raise exception 'Quota display disagrees with enforcement.'; end if;
  select id into reservation from public.household_usage_reservations where household_id=free_id limit 1;
  denied := false;
  begin perform public.release_ai_analyze_reservation(free_id,reservation,'plant_unwell_ai_analyze');
    exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Client released in-flight server quota.'; end if;
  plant := public.create_household_plant(payload || jsonb_build_object('household_id',free_id));
  perform public.record_care_tip_generation(free_id,(plant->>'id')::uuid,'manual_refresh');
  denied := false;
  begin perform public.record_care_tip_generation(free_id,(plant->>'id')::uuid,'manual_refresh');
    exception when raise_exception then denied := true; end;
  if not denied then raise exception 'Free daily care-tip quota was exceeded.'; end if;
  execute 'reset role';
  -- Reservation settlement must target the original month, even after reset.
  prior_period := public.household_usage_period_start() - interval '1 month';
  update public.household_usage_reservations set period_start=prior_period where id=reservation;
  update public.household_usage_counters set reserved_count=reserved_count-1
  where household_id=free_id and period_start=public.household_usage_period_start();
  insert into public.household_usage_counters (household_id,usage_type,period_start,period_end,reserved_count,limit_count)
  values (free_id,'plant_unwell_ai_analyze',prior_period,prior_period + interval '1 month',1,5);
  execute 'set local role service_role';
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform public.commit_ai_analyze_usage(free_id,reservation,'plant_unwell_ai_analyze','fixture');
  execute 'reset role';
  if not exists(select 1 from public.household_usage_counters where household_id=free_id and period_start=prior_period and used_count=1 and reserved_count=0) then
    raise exception 'Cross-month commit charged the wrong period.';
  end if;
  update public.household_usage_reservations set created_at=now()-interval '3 minutes'
  where household_id=free_id and status='reserved';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  select * into usage from public.get_household_plan_usage(free_id);
  if usage.ai_analyzes_remaining <> 5 then raise exception 'Stale reservations did not recover.'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',member_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  for i in 1..6 loop
    if public.reserve_ai_analyze_usage(home_id,'plant_unwell_ai_analyze','premium') is not null then
      raise exception 'Premium member received a Free quota reservation.';
    end if;
  end loop;
  execute 'reset role';
  perform set_config('TimeZone','Pacific/Honolulu',true);
  if public.household_usage_period_start('2026-07-01T04:59:59Z') <> '2026-06-01T05:00:00Z'::timestamptz
    or public.household_usage_period_start('2026-07-01T05:00:00Z') <> '2026-07-01T05:00:00Z'::timestamptz then
    raise exception 'Quota boundary changed with connection timezone.';
  end if;
  raise notice 'PASS: shared CRUD, no-image creation, atomic children, isolation, five reservations, trusted settlement, Premium bypass and UTC reset.';
end;
$test$;
