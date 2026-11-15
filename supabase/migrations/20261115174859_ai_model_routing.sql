begin;

create function public.ai_claim_image_operation_legacy(
  actor uuid, household uuid, plant uuid, kind text, retry_key text, request_fingerprint text, image_sha256 text,
  model_name text, prompt_schema_version text, output_limit integer, image_width integer, image_height integer,
  image_detail text, preprocessing_profile text, encoded_image_bytes integer, evaluation_input_key text default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public, ai_private as $$
declare run ai_private.vision_evaluation_runs; sample ai_private.vision_evaluation_inputs; decision jsonb; existing ai_private.operations;
  runs integer; operation uuid;
  expected_detail text; dimension_limit integer;
begin
  perform ai_private.require_service();
  if encoded_image_bytes is null or encoded_image_bytes not between 1 and 2097152
    or image_detail is null or preprocessing_profile is null then raise exception 'AI_INVALID_OPERATION'; end if;
  perform 1 from ai_private.control where singleton for update;
  select count(*) into runs from ai_private.vision_evaluation_runs r where r.actor_ids @> array[actor];
  if runs>1 then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501'; end if;
  if runs=1 then select * into run from ai_private.vision_evaluation_runs r where r.actor_ids @> array[actor] for update; end if;
  if evaluation_input_key is null then
    if image_detail<>'high' or preprocessing_profile<>'normalized-jpeg-v1' then raise exception 'AI_INVALID_OPERATION'; end if;
  else
    if run.id is null or not run.enabled or run.expires_at<=now() or kind<>'image_validation' or model_name<>'gpt-4o' then
      raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';
    end if;
    select * into sample from ai_private.vision_evaluation_inputs i where i.run_id=run.id and i.input_key=evaluation_input_key;
    if not found then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501'; end if;
    if (sample.purpose='probe' and (prompt_schema_version<>'vision-token-probe-v1' or output_limit<>32))
      or (sample.purpose='safety' and (prompt_schema_version<>'plant-image-safety-v1:evaluation-v1' or output_limit<>700)) then
      raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';
    end if;
    expected_detail:=case when sample.profile_id in ('d_512_low','e_original_low') then 'low' else 'high' end;
    dimension_limit:=case sample.profile_id when 'a_1280_high' then 1280 when 'b_1024_high' then 1024 when 'c_768_high' then 768 when 'd_512_low' then 512 else 1600 end;
    if sample.image_sha256<>image_sha256 or sample.image_width<>image_width or sample.image_height<>image_height
      or sample.encoded_bytes<>encoded_image_bytes or image_detail<>expected_detail
      or preprocessing_profile<>'vision-benchmark-v1:'||sample.profile_id
      or greatest(image_width,image_height)>dimension_limit then
      raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';
    end if;
  end if;
  decision:=public.ai_claim_operation(actor,household,plant,kind,retry_key,request_fingerprint,image_sha256,
    model_name,prompt_schema_version,output_limit,image_width,image_height);
  if decision->>'decision'<>'RUN' then
    select * into existing from ai_private.operations o where o.id=(decision->>'operationId')::uuid;
    if existing.image_width<>image_width or existing.image_height<>image_height or existing.image_detail<>image_detail
      or (existing.encoded_image_bytes is not null and existing.encoded_image_bytes<>encoded_image_bytes) then raise exception 'AI_IDEMPOTENCY_CONFLICT'; end if;
    return decision;
  end if;
  if run.id is not null and (not run.enabled or run.expires_at<=now()) then raise exception 'AI_EVALUATION_CLOSED'; end if;
  operation:=(decision->>'operationId')::uuid;
  update ai_private.operations o set image_detail=ai_claim_image_operation_legacy.image_detail,
    preprocessing_profile=ai_claim_image_operation_legacy.preprocessing_profile,encoded_image_bytes=ai_claim_image_operation_legacy.encoded_image_bytes,
    evaluation_run_id=run.id where o.id=operation;
  if run.id is not null then perform ai_private.check_vision_budget(run.id); end if;
  return decision;
end $$;

create function public.ai_start_image_attempt_legacy(operation uuid, lease uuid) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, ai_private as $$
declare op ai_private.operations;
begin
  perform ai_private.require_service();
  perform 1 from ai_private.control where singleton for update;
  select * into op from ai_private.operations where id=operation;
  if op.evaluation_run_id is not null then
    perform ai_private.check_vision_budget(op.evaluation_run_id);
    if not exists(select 1 from ai_private.vision_evaluation_runs r where r.id=op.evaluation_run_id and op.actor_id=any(r.actor_ids)) then
      raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';
    end if;
  end if;
  return public.ai_start_attempt(operation,lease);
end $$;

create function public.ai_finish_attempt_legacy(operation uuid, lease uuid, attempt uuid, outcome text, final_result jsonb, facts jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, ai_private as $$
declare op ai_private.operations; a ai_private.attempts; price ai_private.prices; usage jsonb;
  input_count bigint; cached bigint; output_count bigint; reasoning bigint; total bigint;
  measured boolean := false; accounting text := 'UNKNOWN_USAGE'; amount numeric(24,12); failure text; allowed boolean := true; financial_only boolean := false;
begin
  perform ai_private.require_service();
  perform 1 from ai_private.control where singleton for update;
  select * into op from ai_private.operations where id = operation;
  if not found or lease is null or op.lease_id <> lease then raise exception 'AI_INVALID_OPERATION'; end if;
  if op.household_id is not null then perform 1 from public.households where id = op.household_id for update; end if;
  select * into a from ai_private.attempts where id = attempt and operation_id = op.id;
  if not found then raise exception 'AI_INVALID_OPERATION'; end if;
  if a.accounting_status = 'MEASURED' then return jsonb_build_object('state',op.state); end if;
  financial_only := a.accounting_status in ('UNKNOWN_USAGE','UNKNOWN_PRICING') and op.state in ('UNKNOWN','FAILED','COMPLETED','EXPIRED');
  if (not financial_only and op.state <> 'PROCESSING') or outcome is null or outcome not in ('COMPLETED','FAILED','UNKNOWN') or facts is null or jsonb_typeof(facts) <> 'object'
    or (outcome = 'COMPLETED' and (final_result is null or jsonb_typeof(final_result) <> 'object' or octet_length(final_result::text) > 65536)) then raise exception 'AI_INVALID_SETTLEMENT'; end if;
  failure := facts->>'failureCategory';
  if failure is not null and failure !~ '^[A-Z_]{1,64}$' then raise exception 'AI_INVALID_SETTLEMENT'; end if;
  usage := facts->'usage';
  if jsonb_typeof(usage) = 'object'
    and coalesce(usage->>'input_tokens','') ~ '^\d{1,15}$' and coalesce(usage#>>'{input_tokens_details,cached_tokens}','') ~ '^\d{1,15}$'
    and coalesce(usage->>'output_tokens','') ~ '^\d{1,15}$' and coalesce(usage->>'total_tokens','') ~ '^\d{1,15}$' then
    input_count := (usage->>'input_tokens')::bigint; cached := (usage#>>'{input_tokens_details,cached_tokens}')::bigint;
    output_count := (usage->>'output_tokens')::bigint; total := (usage->>'total_tokens')::bigint;
    if coalesce(usage#>>'{output_tokens_details,reasoning_tokens}','') ~ '^\d{1,15}$' then reasoning := (usage#>>'{output_tokens_details,reasoning_tokens}')::bigint; end if;
    measured := cached <= input_count and total = input_count + output_count and (reasoning is null or reasoning <= output_count)
      and coalesce(usage#>>'{input_tokens_details,cache_write_tokens}','0') = '0';
  end if;
  if measured then
    select * into price from ai_private.prices where version = op.pricing_version and model = facts->>'model' and service_tier = facts->>'serviceTier';
    if found then
      accounting := 'MEASURED';
      amount := ((input_count - cached) * price.input_usd_per_million + cached * price.cached_usd_per_million + output_count * price.output_usd_per_million) / 1000000;
    else accounting := 'UNKNOWN_PRICING'; end if;
  end if;
  update ai_private.attempts set returned_model = left(facts->>'model',100), service_tier = left(facts->>'serviceTier',32),
    provider_request_id = left(facts->>'requestId',200),provider_response_id = left(facts->>'responseId',200),
    completed_at = now(),latency_ms = case when facts->>'latencyMs' ~ '^\d{1,12}$' then (facts->>'latencyMs')::bigint end,
    http_status = case when facts->>'httpStatus' ~ '^[1-5]\d{2}$' then (facts->>'httpStatus')::integer end,
    provider_status = left(facts->>'providerStatus',32),failure_category = failure,
    input_tokens = input_count,cached_input_tokens = cached,output_tokens = output_count,reasoning_tokens = reasoning,total_tokens = total,
    accounting_status = accounting,cost_usd = amount where id = a.id;
  if financial_only then return jsonb_build_object('state',op.state,'accountingStatus',accounting,'costUsd',amount::text); end if;
  -- Authorization is checked again before exposing/settling a generated result.
  begin perform ai_private.authorize(op.actor_id,op.household_id);
  exception when insufficient_privilege then allowed := false; end;
  if not allowed then outcome := 'FAILED'; failure := 'HOUSEHOLD_ACCESS_DENIED'; final_result := null; end if;
  if outcome = 'COMPLETED' and op.free_care_day is not null then
    if not exists(select 1 from public.plants where id = op.plant_id and household_id = op.household_id and not is_removed)
      or exists(select 1 from public.plant_care_tip_generations where household_id = op.household_id and plant_id = op.plant_id and generation_source <> 'initial_plant_add'
        and (generated_at at time zone 'UTC')::date = op.free_care_day) then
      outcome := 'FAILED'; failure := 'AI_CARE_LIMIT'; final_result := null;
    else
      insert into public.plant_care_tip_generations(household_id,plant_id,tip_type,generation_source,generated_at)
        values(op.household_id,op.plant_id,'ai_care_tip','manual_refresh',op.created_at);
    end if;
  end if;
  if op.reservation_id is not null then
    if outcome = 'COMPLETED' then
      -- An expired monthly lease must not turn into an uncharged success.
      if exists(select 1 from public.household_usage_reservations where id = op.reservation_id and status = 'reserved') then
        perform public.commit_ai_analyze_usage(op.household_id,op.reservation_id,'plant_unwell_ai_analyze','plant_unwell_flow');
      else outcome := 'FAILED'; failure := 'AI_RESERVATION_EXPIRED'; final_result := null; end if;
    else perform public.release_ai_analyze_reservation(op.household_id,op.reservation_id,'plant_unwell_ai_analyze'); end if;
  end if;
  update ai_private.operations set state = outcome,finished_at = now(),result = case when outcome = 'COMPLETED' then final_result end,
    final_outcome = case when outcome <> 'COMPLETED' then outcome
      when op.operation_type in ('image_validation','upload_validation') and final_result->'validation' = 'null'::jsonb then 'SAFETY_REJECTED' else 'SUCCEEDED' end,
    failure_category = failure,
    expires_at = case when outcome = 'FAILED' then least(expires_at,now() + interval '30 seconds') else expires_at end where id = op.id;
  return jsonb_build_object('state',outcome,'accountingStatus',accounting,'costUsd',amount::text);
end $$;

-- Additive metadata; historical model prices and financial facts are preserved.
create table ai_private.model_price_rules (
 version text not null, model text not null, requested_model text not null,service_tier text not null default 'default',
 write_30m_usd_per_million numeric(16,8) not null check(write_30m_usd_per_million>=0),
 write_12h_usd_per_million numeric(16,8) not null check(write_12h_usd_per_million>=0),
 long_context_threshold integer not null default 272000,
 long_input_multiplier numeric(8,4) not null default 2,
 long_output_multiplier numeric(8,4) not null default 1.5,
 regional_multiplier numeric(8,4) not null default 1.1,
 primary key(version,model,service_tier),foreign key(version,model,service_tier) references ai_private.prices(version,model,service_tier)
);
insert into ai_private.prices(version,model,service_tier,effective_from,input_usd_per_million,cached_usd_per_million,output_usd_per_million,context_tokens,source_url) values
 ('openai-multimodel-2026-11-15','gpt-6-luna','default','2026-11-15T00:00:00Z',.10,.01,.50,1050000,'https://developers.openai.com/api/docs/models/gpt-6-luna'),
 ('openai-multimodel-2026-11-15','gpt-6.1-terra','default','2026-11-15T00:00:00Z',1,.05,5,1050000,'https://developers.openai.com/api/docs/models/gpt-6.1-terra');
insert into ai_private.model_price_rules(version,model,requested_model,write_30m_usd_per_million,write_12h_usd_per_million) values
 ('openai-multimodel-2026-11-15','gpt-6-luna','gpt-6-luna',.125,.25),('openai-multimodel-2026-11-15','gpt-6.1-terra','gpt-6.1-terra',1.25,2.5);

create table ai_private.model_configurations (
 id text primary key,route text not null check(route in ('image_safety','initial_care','care_refresh','diagnosis')),
 definition jsonb not null check(jsonb_typeof(definition)='object'),configuration_hash text not null check(configuration_hash ~ '^[0-9a-f]{64}$'),
 unique(id,route)
);
create table ai_private.model_routes (
 route text primary key,active_configuration text not null,candidate_configuration text,
 enabled boolean not null default false,rollout_percent integer not null default 0 check(rollout_percent in (0,5,10,25,50,100)),
 version text not null default 'routes-v1',quality_approval_sha256 text check(quality_approval_sha256 ~ '^[0-9a-f]{64}$'),
 bounded_input_approval_sha256 text check(bounded_input_approval_sha256 ~ '^[0-9a-f]{64}$'),
 foreign key(active_configuration,route) references ai_private.model_configurations(id,route),
 foreign key(candidate_configuration,route) references ai_private.model_configurations(id,route),
 check(active_configuration=route||':gpt-4o:legacy:v1'),
 check(not enabled or (route<>'image_safety' and candidate_configuration is not null and quality_approval_sha256 is not null and bounded_input_approval_sha256 is not null)),
 check(enabled or rollout_percent=0),check(route<>'image_safety' or rollout_percent=0)
);
create table ai_private.model_evaluation_runs (
 id uuid primary key default gen_random_uuid(),task_key text not null unique check(length(task_key) between 1 and 100),
 actor_ids uuid[] not null check(cardinality(actor_ids) between 0 and 5 and array_position(actor_ids,null) is null),
 enabled boolean not null default false,created_at timestamptz not null default now(),
 expires_at timestamptz not null check(expires_at>created_at and expires_at<=created_at+interval '2 hours'),
 max_attempts integer not null default 240 check(max_attempts between 1 and 240),
 max_usd numeric(24,12) not null default 4 check(max_usd>0 and max_usd<=4),stopped_at timestamptz
);
create index ai_model_evaluation_actors on ai_private.model_evaluation_runs using gin(actor_ids);
create table ai_private.model_evaluation_inputs (
 run_id uuid not null references ai_private.model_evaluation_runs(id),input_key text not null check(input_key ~ '^[a-z0-9_-]{1,80}$'),
 configuration_id text not null references ai_private.model_configurations(id),context_hash text not null check(context_hash ~ '^[0-9a-f]{64}$'),
 language text not null check(language in ('en','sk','de','fr','es')),household_id uuid not null,plant_id uuid not null,
 image_sha256 text not null check(image_sha256 ~ '^[0-9a-f]{64}$'),image_width integer not null check(image_width between 1 and 1600),
 image_height integer not null check(image_height between 1 and 1600),encoded_bytes integer not null check(encoded_bytes between 1 and 2097152),
 primary key(run_id,input_key)
);
alter table ai_private.operations add column logical_fingerprint text check(logical_fingerprint ~ '^[0-9a-f]{64}$');
alter table ai_private.operations add column model_configuration_id text references ai_private.model_configurations(id);
alter table ai_private.operations add column route_version text;
alter table ai_private.operations add column model_campaign_id uuid references ai_private.model_evaluation_runs(id);
alter table ai_private.attempts add column cache_write_tokens bigint check(cache_write_tokens>=0);
alter table ai_private.attempts add column cache_write_30m_tokens bigint check(cache_write_30m_tokens>=0);
alter table ai_private.attempts add column cache_write_12h_tokens bigint check(cache_write_12h_tokens>=0);
alter table ai_private.attempts add column returned_reasoning_effort text;
create index ai_operations_logical on ai_private.operations(actor_id,scope_key,operation_type,logical_fingerprint) where logical_fingerprint is not null;
create index ai_operations_model_campaign on ai_private.operations(model_campaign_id) where model_campaign_id is not null;

create function ai_private.immutable_model_input() returns trigger language plpgsql set search_path=pg_catalog,public,ai_private as $$
begin raise exception 'AI_IMMUTABLE_MODEL_CONFIGURATION'; end $$;
create trigger immutable_model_configuration before update or delete on ai_private.model_configurations for each row execute function ai_private.immutable_model_input();
create trigger immutable_model_input before update on ai_private.model_evaluation_inputs for each row execute function ai_private.immutable_model_input();
create function ai_private.guard_model_run() returns trigger language plpgsql set search_path=pg_catalog,public,ai_private as $$
begin
 if (to_jsonb(new)-array['enabled','actor_ids','stopped_at']) is distinct from (to_jsonb(old)-array['enabled','actor_ids','stopped_at'])
  or not new.actor_ids<@old.actor_ids or (not old.enabled and new.enabled)
  or (old.stopped_at is not null and new.stopped_at is distinct from old.stopped_at) then raise exception 'AI_IMMUTABLE_MODEL_CAMPAIGN'; end if;
 return new;
end $$;
create trigger immutable_model_run before update on ai_private.model_evaluation_runs for each row execute function ai_private.guard_model_run();

create function ai_private.model_cohort(household uuid,route text) returns integer language sql immutable set search_path=pg_catalog as $$
 select (('x'||substr(md5(household::text||':'||route),1,8))::bit(32)::bigint%10000)::integer
$$;

create function ai_private.check_model_campaign(run uuid) returns void language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
declare cfg ai_private.model_evaluation_runs; spent numeric(24,12); exposure numeric(24,12);held numeric(24,12);attempts bigint;reserved bigint;
begin
 perform ai_private.require_service();perform 1 from ai_private.control where singleton for update;
 select * into cfg from ai_private.model_evaluation_runs r where r.id=run for update;
 if not found or not cfg.enabled or cfg.expires_at<=now() or cfg.stopped_at is not null then raise exception 'AI_EVALUATION_CLOSED'; end if;
 select count(*),coalesce(sum(a.cost_usd) filter(where a.accounting_status='MEASURED'),0),coalesce(sum(a.exposure_usd) filter(where a.accounting_status<>'MEASURED'),0)
 into attempts,spent,exposure from ai_private.attempts a join ai_private.operations o on o.id=a.operation_id where o.model_campaign_id=run;
 select count(*),coalesce(sum(reserved_usd),0) into reserved,held from ai_private.operations where model_campaign_id=run and state='RESERVED';
 if attempts+reserved>cfg.max_attempts or spent+exposure+held>cfg.max_usd then raise exception 'AI_MODEL_CAMPAIGN_LIMIT'; end if;
end $$;

create function ai_private.check_model_financial_exposure() returns void language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
declare cfg ai_private.control;daily numeric(24,12);monthly numeric(24,12);exposure numeric(24,12);
begin
 perform ai_private.require_service();select * into cfg from ai_private.control where singleton for update;
 select coalesce(sum(cost_usd) filter(where accounting_status='MEASURED' and started_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),0),
 coalesce(sum(cost_usd) filter(where accounting_status='MEASURED' and started_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'),0),
 coalesce(sum(exposure_usd) filter(where accounting_status<>'MEASURED'),0) into daily,monthly,exposure from ai_private.attempts
 where started_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC' or accounting_status<>'MEASURED';
 select exposure+coalesce(sum(reserved_usd),0) into exposure from ai_private.operations where state='RESERVED';
 if cfg.paused or exposure>cfg.inflight_limit_usd or daily+exposure>cfg.daily_emergency_usd or monthly+exposure>cfg.monthly_emergency_usd then raise exception 'AI_CIRCUIT_OPEN'; end if;
end $$;

create function ai_private.model_quote(price_version text,model_name text,tier text,input_count bigint,cached bigint,w30 bigint,w12 bigint,output_count bigint,region text default 'global')
 returns numeric language plpgsql stable security definer set search_path=pg_catalog,public,ai_private as $$
declare p ai_private.prices;r ai_private.model_price_rules;im numeric:=1;om numeric:=1;rm numeric:=1;
begin
 perform ai_private.require_service();
 if input_count is null or cached is null or w30 is null or w12 is null or output_count is null or least(input_count,cached,w30,w12,output_count)<0
  or cached+w30+w12>input_count or region is null or region not in ('global','regional') then return null; end if;
 select * into p from ai_private.prices where version=price_version and model=model_name and service_tier=tier;
 if not found then return null; end if;
 select * into r from ai_private.model_price_rules where version=price_version and model=model_name and service_tier=tier;
 if not found then return null; end if;
 if input_count>r.long_context_threshold then im:=r.long_input_multiplier;om:=r.long_output_multiplier;end if;
 if region='regional' then rm:=r.regional_multiplier;end if;
 return (((input_count-cached-w30-w12)*p.input_usd_per_million+cached*p.cached_usd_per_million+w30*r.write_30m_usd_per_million+w12*r.write_12h_usd_per_million)*im+output_count*p.output_usd_per_million*om)*rm/1000000;
end $$;

create function ai_private.apply_model_binding(operation uuid,logical_hash text,configuration text,version text,campaign uuid) returns void
 language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
declare c ai_private.model_configurations;p ai_private.prices;r ai_private.model_price_rules;estimate numeric(24,12);
begin
 perform ai_private.require_service();select * into c from ai_private.model_configurations where id=configuration;
 select p0.* into p from ai_private.prices p0 where p0.version=c.definition->>'priceVersion' and p0.model=c.definition->>'model' and p0.service_tier='default';
 if not found then raise exception 'AI_PRICING_UNAVAILABLE';end if;
 if c.definition->>'model'<>'gpt-4o' then
  select r0.* into r from ai_private.model_price_rules r0 where r0.model=p.model and r0.version=p.version and r0.service_tier=p.service_tier;
  if not found then raise exception 'AI_PRICING_UNAVAILABLE';end if;
  -- No Luna/Terra image formula is invented. Until a qualified tighter bound
  -- exists, only evaluation may use this documented context ceiling. TTL=30m
  -- is enforced by the immutable server payload; reserve all input as writes.
  estimate:=(p.context_tokens*greatest(p.input_usd_per_million,r.write_30m_usd_per_million)*r.long_input_multiplier
    +(c.definition->>'outputLimit')::integer*p.output_usd_per_million*r.long_output_multiplier)/1000000;
  update ai_private.operations set reserved_usd=estimate where id=operation;
 end if;
 update ai_private.operations set logical_fingerprint=logical_hash,model_configuration_id=configuration,route_version=version,model_campaign_id=campaign,
  max_attempts=least(max_attempts,(c.definition->>'maxAttempts')::integer) where id=operation;
 perform ai_private.check_model_financial_exposure();
 if campaign is not null then perform ai_private.check_model_campaign(campaign);end if;
end $$;

create or replace function public.ai_claim_image_operation(
 actor uuid,household uuid,plant uuid,kind text,retry_key text,request_fingerprint text,image_sha256 text,
 model_name text,prompt_schema_version text,output_limit integer,image_width integer,image_height integer,
 image_detail text,preprocessing_profile text,encoded_image_bytes integer,evaluation_input_key text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
declare route_id text; routing ai_private.model_routes;config ai_private.model_configurations;op ai_private.operations;
 campaign ai_private.model_evaluation_runs;decision jsonb;effective_fingerprint text;stop_code text;
begin
 perform ai_private.require_service();perform 1 from ai_private.control where singleton for update;
 -- Preserve the installed Step3 evaluator and older guarded service callers.
 if evaluation_input_key is not null or prompt_schema_version not in ('plant-care-v1','plant-diagnosis-v1','plant-image-safety-v1') then
  return public.ai_claim_image_operation_legacy(actor,household,plant,kind,retry_key,request_fingerprint,image_sha256,model_name,prompt_schema_version,output_limit,image_width,image_height,image_detail,preprocessing_profile,encoded_image_bytes,evaluation_input_key);
 end if;
 if model_name is distinct from 'gpt-4o' or request_fingerprint is null or request_fingerprint !~ '^[0-9a-f]{64}$'
  or image_detail is distinct from 'high' or preprocessing_profile is distinct from 'normalized-jpeg-v1'
  or encoded_image_bytes is null or encoded_image_bytes not between 1 and 2097152
  or image_width is null or image_width not between 1 and 1600 or image_height is null or image_height not between 1 and 1600 then raise exception 'AI_INVALID_OPERATION';end if;
 perform ai_private.authorize(actor,household);perform ai_private.reconcile();
 if plant is not null and not exists(select 1 from public.plants p where p.id=plant and p.household_id=household and not p.is_removed) then raise exception 'HOUSEHOLD_ACCESS_DENIED' using errcode='42501';end if;
 -- Logical identity is independent of the current rollout. Historical v1
 -- fingerprints remain valid. Authorization precedes every cached retrieval.
 select o.* into op from ai_private.operations o where o.actor_id=actor and o.scope_key=coalesce(household::text,'account') and o.operation_type=kind and o.state<>'EXPIRED'
  and (o.idempotency_key=retry_key or o.logical_fingerprint=request_fingerprint or (o.logical_fingerprint is null and o.fingerprint=request_fingerprint)) order by o.created_at limit 1;
 if found then
  if coalesce(op.logical_fingerprint,op.fingerprint)<>request_fingerprint then raise exception 'AI_IDEMPOTENCY_CONFLICT';end if;
  if op.image_hash is distinct from image_sha256 or op.image_width is distinct from image_width or op.image_height is distinct from image_height
   or op.image_detail is distinct from image_detail or (op.encoded_image_bytes is not null and op.encoded_image_bytes is distinct from encoded_image_bytes) then raise exception 'AI_IDEMPOTENCY_CONFLICT';end if;
  if op.state='COMPLETED' and op.result is not null then return jsonb_build_object('decision','REPLAY','operationId',op.id,'result',op.result);end if;
  return jsonb_build_object('decision',case when op.state in ('RESERVED','PROCESSING') then 'WAIT' else 'STOP' end,'operationId',op.id,'state',op.state);
 end if;
 if kind in ('image_validation','upload_validation') then
  select o.* into op from ai_private.operations o where o.actor_id=actor and coalesce(o.logical_fingerprint,o.fingerprint)=request_fingerprint
   and o.operation_type in ('image_validation','upload_validation') and o.state='COMPLETED' and o.expires_at>now() and o.result is not null limit 1;
  if found then
   if op.image_hash is distinct from image_sha256 or op.image_width is distinct from image_width or op.image_height is distinct from image_height
    or op.image_detail is distinct from image_detail or (op.encoded_image_bytes is not null and op.encoded_image_bytes is distinct from encoded_image_bytes) then raise exception 'AI_IDEMPOTENCY_CONFLICT';end if;
   return jsonb_build_object('decision','REPLAY','operationId',op.id,'result',op.result);
  end if;
 end if;
 route_id:=case when kind in ('image_validation','upload_validation') then 'image_safety' else kind end;
 select * into routing from ai_private.model_routes where route=route_id;
 if not found then raise exception 'AI_INVALID_OPERATION';end if;
 select * into config from ai_private.model_configurations where id=case when routing.enabled and ai_private.model_cohort(household,route_id)<routing.rollout_percent*100 then routing.candidate_configuration else routing.active_configuration end;
 if not found or config.definition->>'promptVersion' is distinct from prompt_schema_version or (config.definition->>'outputLimit')::integer is distinct from output_limit
  or image_detail is distinct from 'high' or preprocessing_profile is distinct from 'normalized-jpeg-v1' then raise exception 'AI_INVALID_OPERATION';end if;
 if (select count(*) from ai_private.model_evaluation_runs r where actor=any(r.actor_ids))>1 then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';end if;
 select * into campaign from ai_private.model_evaluation_runs r where actor=any(r.actor_ids) for update;
 if found and (not campaign.enabled or campaign.expires_at<=now() or campaign.stopped_at is not null) then return jsonb_build_object('decision','CAMPAIGN_STOP');end if;
 if campaign.id is not null and exists(select 1 from ai_private.vision_evaluation_runs r where actor=any(r.actor_ids)) then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';end if;
 effective_fingerprint:=encode(sha256(convert_to(request_fingerprint||':'||config.configuration_hash,'UTF8')),'hex');
 begin
  decision:=public.ai_claim_image_operation_legacy(actor,household,plant,kind,retry_key,effective_fingerprint,image_sha256,config.definition->>'model',prompt_schema_version,output_limit,image_width,image_height,image_detail,preprocessing_profile,encoded_image_bytes,null);
  if decision->>'decision'='RUN' then perform ai_private.apply_model_binding((decision->>'operationId')::uuid,request_fingerprint,config.id,routing.version,campaign.id);end if;
 exception when raise_exception then
  stop_code:=sqlerrm;
  if campaign.id is null or stop_code not in ('AI_MODEL_CAMPAIGN_LIMIT','AI_CIRCUIT_OPEN') then raise;end if;
  update ai_private.model_evaluation_runs set stopped_at=now() where id=campaign.id;
  return jsonb_build_object('decision','CAMPAIGN_STOP','stopCode',stop_code);
 end;
 return decision||jsonb_build_object('effectiveConfiguration',config.id,'configurationHash',config.configuration_hash);
end $$;

create function public.ai_resolve_model_input(actor uuid,run uuid,input_key text) returns jsonb
 language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
declare sample ai_private.model_evaluation_inputs;c ai_private.model_configurations;
begin
 perform ai_private.require_service();
 if not exists(select 1 from ai_private.model_evaluation_runs r where r.id=run and actor=any(r.actor_ids) and r.enabled and r.expires_at>now() and r.stopped_at is null) then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';end if;
 select * into sample from ai_private.model_evaluation_inputs i where i.run_id=run and i.input_key=ai_resolve_model_input.input_key;
 if not found then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';end if;
 perform ai_private.authorize(actor,sample.household_id);
 select * into c from ai_private.model_configurations where id=sample.configuration_id;
 return jsonb_build_object('configurationId',c.id,'configurationHash',c.configuration_hash,'contextHash',sample.context_hash,'language',sample.language,'householdId',sample.household_id,'plantId',sample.plant_id);
end $$;

create function public.ai_claim_model_operation(
 actor uuid,household uuid,plant uuid,kind text,retry_key text,request_fingerprint text,image_sha256 text,
 model_name text,prompt_schema_version text,output_limit integer,image_width integer,image_height integer,
 image_detail text,preprocessing_profile text,encoded_image_bytes integer,
 model_campaign uuid,model_input_key text,configuration_id text,configuration_hash text,context_hash text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
declare campaign ai_private.model_evaluation_runs;sample ai_private.model_evaluation_inputs;c ai_private.model_configurations;decision jsonb;stop_code text;effective_fingerprint text;
begin
 perform ai_private.require_service();perform 1 from ai_private.control where singleton for update;
 select * into campaign from ai_private.model_evaluation_runs r where r.id=model_campaign for update;
 if not found or actor is null or not actor=any(campaign.actor_ids) then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';end if;
 if not campaign.enabled or campaign.expires_at<=now() or campaign.stopped_at is not null then return jsonb_build_object('decision','CAMPAIGN_STOP');end if;
 if (select count(*) from ai_private.model_evaluation_runs r where actor=any(r.actor_ids))<>1 or exists(select 1 from ai_private.vision_evaluation_runs r where actor=any(r.actor_ids)) then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';end if;
 select * into sample from ai_private.model_evaluation_inputs i where i.run_id=campaign.id and i.input_key=model_input_key;
 if not found then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';end if;
 select * into c from ai_private.model_configurations where id=sample.configuration_id;
 if sample.configuration_id is distinct from configuration_id or c.configuration_hash is distinct from configuration_hash or sample.context_hash is distinct from context_hash
  or sample.household_id is distinct from household or sample.plant_id is distinct from plant or c.route='image_safety'
  or kind is distinct from (case when c.route='diagnosis' then 'diagnosis' else 'care_refresh' end)
  or c.definition->>'model' is distinct from model_name or c.definition->>'promptVersion' is distinct from prompt_schema_version
  or (c.definition->>'outputLimit')::integer is distinct from output_limit or image_detail is distinct from 'high' or preprocessing_profile is distinct from 'normalized-jpeg-v1'
  or sample.image_sha256 is distinct from image_sha256 or sample.image_width is distinct from image_width or sample.image_height is distinct from image_height or sample.encoded_bytes is distinct from encoded_image_bytes then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';end if;
 -- Different registered cases/configurations/runs cannot share a result.
 effective_fingerprint:=encode(sha256(convert_to(request_fingerprint||':'||campaign.id::text||':'||model_input_key||':'||c.configuration_hash,'UTF8')),'hex');
 begin
  decision:=public.ai_claim_image_operation_legacy(actor,household,plant,kind,retry_key,effective_fingerprint,image_sha256,model_name,prompt_schema_version,output_limit,image_width,image_height,image_detail,preprocessing_profile,encoded_image_bytes,null);
  if decision->>'decision'='RUN' then perform ai_private.apply_model_binding((decision->>'operationId')::uuid,request_fingerprint,c.id,'model-evaluation-v1',campaign.id);end if;
 exception when raise_exception then
  stop_code:=sqlerrm;if stop_code not in ('AI_MODEL_CAMPAIGN_LIMIT','AI_CIRCUIT_OPEN') then raise;end if;
  update ai_private.model_evaluation_runs set stopped_at=now() where id=campaign.id;
  return jsonb_build_object('decision','CAMPAIGN_STOP','stopCode',stop_code);
 end;
 return decision||jsonb_build_object('effectiveConfiguration',c.id,'configurationHash',c.configuration_hash);
end $$;

create or replace function public.ai_start_image_attempt(operation uuid,lease uuid) returns uuid
 language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
declare op ai_private.operations;
begin
 perform ai_private.require_service();perform 1 from ai_private.control where singleton for update;
 select * into op from ai_private.operations where id=operation;
 if op.model_campaign_id is not null then
  perform ai_private.check_model_campaign(op.model_campaign_id);
  if not exists(select 1 from ai_private.model_evaluation_runs r where r.id=op.model_campaign_id and op.actor_id=any(r.actor_ids)) then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';end if;
 end if;
 return public.ai_start_image_attempt_legacy(operation,lease);
end $$;

create or replace function public.ai_finish_attempt(operation uuid,lease uuid,attempt uuid,outcome text,final_result jsonb,facts jsonb) returns jsonb
 language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
declare op ai_private.operations;a ai_private.attempts;r ai_private.model_price_rules;usage jsonb;settled jsonb;
 input_count bigint;cached bigint;writes bigint;w30 bigint;w12 bigint;output_count bigint;total bigint;reasoning bigint;
 amount numeric(24,12);accounting text:='UNKNOWN_USAGE';valid boolean:=false;
begin
 perform ai_private.require_service();perform 1 from ai_private.control where singleton for update;
 select * into op from ai_private.operations where id=operation;
 if not found or lease is null or op.lease_id<>lease then raise exception 'AI_INVALID_OPERATION';end if;
 select * into a from ai_private.attempts where id=attempt and operation_id=op.id;
 if not found then raise exception 'AI_INVALID_OPERATION';end if;
 if a.accounting_status='MEASURED' then
  return public.ai_finish_attempt_legacy(operation,lease,attempt,outcome,final_result,facts);
 end if;
 if op.pricing_version<>'openai-multimodel-2026-11-15' then
  settled:=public.ai_finish_attempt_legacy(operation,lease,attempt,outcome,final_result,facts);
  if op.model_configuration_id is not null then
   update ai_private.attempts set
    cache_write_tokens=case when jsonb_typeof(facts#>'{usage,input_tokens_details,cache_write_tokens}')='number' and facts#>>'{usage,input_tokens_details,cache_write_tokens}' ~ '^\d{1,15}$' then (facts#>>'{usage,input_tokens_details,cache_write_tokens}')::bigint end,
    cache_write_30m_tokens=case when jsonb_typeof(facts#>'{usage,input_tokens_details,cache_write_tokens_details,ttl_30m_tokens}')='number' and facts#>>'{usage,input_tokens_details,cache_write_tokens_details,ttl_30m_tokens}' ~ '^\d{1,15}$' then (facts#>>'{usage,input_tokens_details,cache_write_tokens_details,ttl_30m_tokens}')::bigint end,
    cache_write_12h_tokens=case when jsonb_typeof(facts#>'{usage,input_tokens_details,cache_write_tokens_details,ttl_12h_tokens}')='number' and facts#>>'{usage,input_tokens_details,cache_write_tokens_details,ttl_12h_tokens}' ~ '^\d{1,15}$' then (facts#>>'{usage,input_tokens_details,cache_write_tokens_details,ttl_12h_tokens}')::bigint end
    where id=a.id;
  end if;
  return settled;
 end if;
 -- The original lifecycle/quota/authorization/lease/retention settlement is
 -- unchanged. Price all v2 facts atomically before this transaction returns.
 settled:=public.ai_finish_attempt_legacy(operation,lease,attempt,outcome,final_result,facts);
 usage:=facts->'usage';
 if jsonb_typeof(usage)='object' and jsonb_typeof(usage->'input_tokens')='number' and jsonb_typeof(usage->'output_tokens')='number' and jsonb_typeof(usage->'total_tokens')='number'
  and coalesce(usage->>'input_tokens','') ~ '^\d{1,15}$' and coalesce(usage->>'output_tokens','') ~ '^\d{1,15}$' and coalesce(usage->>'total_tokens','') ~ '^\d{1,15}$'
  and jsonb_typeof(usage#>'{input_tokens_details,cached_tokens}')='number' and coalesce(usage#>>'{input_tokens_details,cached_tokens}','') ~ '^\d{1,15}$'
  and jsonb_typeof(usage#>'{input_tokens_details,cache_write_tokens}')='number' and coalesce(usage#>>'{input_tokens_details,cache_write_tokens}','') ~ '^\d{1,15}$' then
  input_count:=(usage->>'input_tokens')::bigint;output_count:=(usage->>'output_tokens')::bigint;total:=(usage->>'total_tokens')::bigint;
  cached:=(usage#>>'{input_tokens_details,cached_tokens}')::bigint;writes:=(usage#>>'{input_tokens_details,cache_write_tokens}')::bigint;
  if jsonb_typeof(usage#>'{output_tokens_details,reasoning_tokens}')='number' and coalesce(usage#>>'{output_tokens_details,reasoning_tokens}','') ~ '^\d{1,15}$' then reasoning:=(usage#>>'{output_tokens_details,reasoning_tokens}')::bigint;end if;
  if writes=0 and not (usage#>'{input_tokens_details}' ? 'cache_write_tokens_details') then w30:=0;w12:=0;
  elsif jsonb_typeof(usage#>'{input_tokens_details,cache_write_tokens_details,ttl_30m_tokens}')='number'
   and jsonb_typeof(usage#>'{input_tokens_details,cache_write_tokens_details,ttl_12h_tokens}')='number'
   and coalesce(usage#>>'{input_tokens_details,cache_write_tokens_details,ttl_30m_tokens}','') ~ '^\d{1,15}$'
   and coalesce(usage#>>'{input_tokens_details,cache_write_tokens_details,ttl_12h_tokens}','') ~ '^\d{1,15}$' then
   w30:=(usage#>>'{input_tokens_details,cache_write_tokens_details,ttl_30m_tokens}')::bigint;w12:=(usage#>>'{input_tokens_details,cache_write_tokens_details,ttl_12h_tokens}')::bigint;
  end if;
  valid:=w30 is not null and w12 is not null and w30+w12=writes and cached+writes<=input_count and total=input_count+output_count
   and (reasoning is null or reasoning<=output_count) and input_count<=1050000 and output_count<=op.max_output_tokens;
 end if;
 if valid then
  select * into r from ai_private.model_price_rules where version=op.pricing_version and model=facts->>'model' and service_tier=facts->>'serviceTier';
  if found and r.requested_model=op.requested_model then
   amount:=ai_private.model_quote(op.pricing_version,facts->>'model',facts->>'serviceTier',input_count,cached,w30,w12,output_count,'global');
  end if;
  accounting:=case when amount is null then 'UNKNOWN_PRICING' else 'MEASURED' end;
 end if;
 update ai_private.attempts set input_tokens=input_count,cached_input_tokens=cached,output_tokens=output_count,total_tokens=total,reasoning_tokens=reasoning,
  cache_write_tokens=writes,cache_write_30m_tokens=w30,cache_write_12h_tokens=w12,
  returned_reasoning_effort=case when facts->>'reasoningEffort' in ('none','low','medium','high','xhigh','max') then facts->>'reasoningEffort' end,
  accounting_status=accounting,cost_usd=amount where id=a.id;
 if amount>op.reserved_usd then
  update ai_private.attempts set failure_category='AI_EXPOSURE_BOUND_EXCEEDED' where id=a.id;
  update ai_private.model_routes set enabled=false,rollout_percent=0 where candidate_configuration=op.model_configuration_id;
  if op.model_campaign_id is not null then update ai_private.model_evaluation_runs set stopped_at=coalesce(stopped_at,now()) where id=op.model_campaign_id;end if;
 end if;
 return settled||jsonb_build_object('accountingStatus',accounting,'costUsd',amount::text);
end $$;

do $$ declare item record;begin
 for item in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ai_private' and c.relname in ('model_price_rules','model_configurations','model_routes','model_evaluation_runs','model_evaluation_inputs') loop
  execute format('alter table ai_private.%I enable row level security',item.relname);
  execute format('revoke all on ai_private.%I from public,anon,authenticated,service_role',item.relname);
  execute format('grant select on ai_private.%I to service_role',item.relname);
 end loop;
 for item in select p.oid::regprocedure as name,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
  (n.nspname='ai_private' and p.proname in ('immutable_model_input','guard_model_run','model_cohort','check_model_campaign','check_model_financial_exposure','model_quote','apply_model_binding'))
  or (n.nspname='public' and p.proname in ('ai_claim_image_operation_legacy','ai_start_image_attempt_legacy','ai_finish_attempt_legacy','ai_resolve_model_input','ai_claim_model_operation')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',item.name);
  if item.nspname='public' then execute format('grant execute on function %s to service_role',item.name);end if;
 end loop;
end $$;


insert into ai_private.model_configurations(id,route,definition,configuration_hash) values('image_safety:gpt-4o:legacy:v1','image_safety','{"id":"image_safety:gpt-4o:legacy:v1","route":"image_safety","model":"gpt-4o","reasoning":null,"promptVersion":"plant-image-safety-v1","outputLimit":700,"timeoutMs":30000,"priceVersion":"openai-standard-2026-11-15","detail":"high","profile":"normalized-jpeg-v1","maxAttempts":1,"cacheTtl":null,"version":"model-config-v1","inputBoundPolicy":"provider-context-ceiling"}'::jsonb,'9fc6571236f21835dc7f35096dc266983630b45caab1b6fed6aa54d98217a62a');
insert into ai_private.model_configurations(id,route,definition,configuration_hash) values('initial_care:gpt-4o:legacy:v1','initial_care','{"id":"initial_care:gpt-4o:legacy:v1","route":"initial_care","model":"gpt-4o","reasoning":null,"promptVersion":"plant-care-v1","outputLimit":1400,"timeoutMs":30000,"priceVersion":"openai-standard-2026-11-15","detail":"high","profile":"normalized-jpeg-v1","maxAttempts":1,"cacheTtl":null,"version":"model-config-v1","inputBoundPolicy":"provider-context-ceiling"}'::jsonb,'a562ace4e32816e0fda61b7282b70e39e39bc8a69e72c2e12ba6117d82267329');
insert into ai_private.model_configurations(id,route,definition,configuration_hash) values('initial_care:gpt-6-luna:none:v1','initial_care','{"id":"initial_care:gpt-6-luna:none:v1","route":"initial_care","model":"gpt-6-luna","reasoning":"none","promptVersion":"plant-care-v1","outputLimit":1400,"timeoutMs":30000,"priceVersion":"openai-multimodel-2026-11-15","detail":"high","profile":"normalized-jpeg-v1","maxAttempts":1,"cacheTtl":"30m","version":"model-config-v1","inputBoundPolicy":"provider-context-ceiling"}'::jsonb,'b59db590cc7c698388690e1c92d5fe9d18b356031a331d1e1505f6a47425ae0f');
insert into ai_private.model_configurations(id,route,definition,configuration_hash) values('initial_care:gpt-6-luna:low:v1','initial_care','{"id":"initial_care:gpt-6-luna:low:v1","route":"initial_care","model":"gpt-6-luna","reasoning":"low","promptVersion":"plant-care-v1","outputLimit":1400,"timeoutMs":30000,"priceVersion":"openai-multimodel-2026-11-15","detail":"high","profile":"normalized-jpeg-v1","maxAttempts":1,"cacheTtl":"30m","version":"model-config-v1","inputBoundPolicy":"provider-context-ceiling"}'::jsonb,'9fd5a7d7dc35be3d9bb2e9519e6a2c904a48bf5cdabb39fbb2a494be446ef24f');
insert into ai_private.model_configurations(id,route,definition,configuration_hash) values('initial_care:gpt-6.1-terra:none:v1','initial_care','{"id":"initial_care:gpt-6.1-terra:none:v1","route":"initial_care","model":"gpt-6.1-terra","reasoning":"none","promptVersion":"plant-care-v1","outputLimit":1400,"timeoutMs":30000,"priceVersion":"openai-multimodel-2026-11-15","detail":"high","profile":"normalized-jpeg-v1","maxAttempts":1,"cacheTtl":"30m","version":"model-config-v1","inputBoundPolicy":"provider-context-ceiling"}'::jsonb,'b177cb7426d21f87111bfbe8e566e1c9675b7f141b521652ea2c54ccbbba6c03');
insert into ai_private.model_configurations(id,route,definition,configuration_hash) values('initial_care:gpt-6.1-terra:low:v1','initial_care','{"id":"initial_care:gpt-6.1-terra:low:v1","route":"initial_care","model":"gpt-6.1-terra","reasoning":"low","promptVersion":"plant-care-v1","outputLimit":1400,"timeoutMs":30000,"priceVersion":"openai-multimodel-2026-11-15","detail":"high","profile":"normalized-jpeg-v1","maxAttempts":1,"cacheTtl":"30m","version":"model-config-v1","inputBoundPolicy":"provider-context-ceiling"}'::jsonb,'ad3e93f3eba7c3bcde55f92e14e3592cbd7d1a0b3c0dd63b70db0096dd2e6e48');
insert into ai_private.model_configurations(id,route,definition,configuration_hash) values('care_refresh:gpt-4o:legacy:v1','care_refresh','{"id":"care_refresh:gpt-4o:legacy:v1","route":"care_refresh","model":"gpt-4o","reasoning":null,"promptVersion":"plant-care-v1","outputLimit":1400,"timeoutMs":30000,"priceVersion":"openai-standard-2026-11-15","detail":"high","profile":"normalized-jpeg-v1","maxAttempts":1,"cacheTtl":null,"version":"model-config-v1","inputBoundPolicy":"provider-context-ceiling"}'::jsonb,'42e21608ff1f8557e7c53d2ffb8c54f1e5f964b0b9d586d0ca7581512a77c659');
insert into ai_private.model_configurations(id,route,definition,configuration_hash) values('care_refresh:gpt-6-luna:none:v1','care_refresh','{"id":"care_refresh:gpt-6-luna:none:v1","route":"care_refresh","model":"gpt-6-luna","reasoning":"none","promptVersion":"plant-care-v1","outputLimit":1400,"timeoutMs":30000,"priceVersion":"openai-multimodel-2026-11-15","detail":"high","profile":"normalized-jpeg-v1","maxAttempts":1,"cacheTtl":"30m","version":"model-config-v1","inputBoundPolicy":"provider-context-ceiling"}'::jsonb,'87f437e90fdd05f0bb60324d3e92abbf013da118b7b62a474a780d46a3b6c334');
insert into ai_private.model_configurations(id,route,definition,configuration_hash) values('care_refresh:gpt-6-luna:low:v1','care_refresh','{"id":"care_refresh:gpt-6-luna:low:v1","route":"care_refresh","model":"gpt-6-luna","reasoning":"low","promptVersion":"plant-care-v1","outputLimit":1400,"timeoutMs":30000,"priceVersion":"openai-multimodel-2026-11-15","detail":"high","profile":"normalized-jpeg-v1","maxAttempts":1,"cacheTtl":"30m","version":"model-config-v1","inputBoundPolicy":"provider-context-ceiling"}'::jsonb,'4fe0ea021debdb36bf4e04701715c7d26001dc30cb843816bc48600581d6545c');
insert into ai_private.model_configurations(id,route,definition,configuration_hash) values('care_refresh:gpt-6.1-terra:none:v1','care_refresh','{"id":"care_refresh:gpt-6.1-terra:none:v1","route":"care_refresh","model":"gpt-6.1-terra","reasoning":"none","promptVersion":"plant-care-v1","outputLimit":1400,"timeoutMs":30000,"priceVersion":"openai-multimodel-2026-11-15","detail":"high","profile":"normalized-jpeg-v1","maxAttempts":1,"cacheTtl":"30m","version":"model-config-v1","inputBoundPolicy":"provider-context-ceiling"}'::jsonb,'32e274d4c6b786f9d55530027fdaafa6300461a6828a4776afefa0c09fd01819');
insert into ai_private.model_configurations(id,route,definition,configuration_hash) values('care_refresh:gpt-6.1-terra:low:v1','care_refresh','{"id":"care_refresh:gpt-6.1-terra:low:v1","route":"care_refresh","model":"gpt-6.1-terra","reasoning":"low","promptVersion":"plant-care-v1","outputLimit":1400,"timeoutMs":30000,"priceVersion":"openai-multimodel-2026-11-15","detail":"high","profile":"normalized-jpeg-v1","maxAttempts":1,"cacheTtl":"30m","version":"model-config-v1","inputBoundPolicy":"provider-context-ceiling"}'::jsonb,'f04d1e6014d884146963205d0a7e8fe8627ee4209723adb7ee65c823a0481761');
insert into ai_private.model_configurations(id,route,definition,configuration_hash) values('diagnosis:gpt-4o:legacy:v1','diagnosis','{"id":"diagnosis:gpt-4o:legacy:v1","route":"diagnosis","model":"gpt-4o","reasoning":null,"promptVersion":"plant-diagnosis-v1","outputLimit":2400,"timeoutMs":30000,"priceVersion":"openai-standard-2026-11-15","detail":"high","profile":"normalized-jpeg-v1","maxAttempts":1,"cacheTtl":null,"version":"model-config-v1","inputBoundPolicy":"provider-context-ceiling"}'::jsonb,'a7b5b9edcc85f4ff33a7a0b44ad2fbc7fc2f62c8078261429312f44dd9f92142');
insert into ai_private.model_configurations(id,route,definition,configuration_hash) values('diagnosis:gpt-6-luna:none:v1','diagnosis','{"id":"diagnosis:gpt-6-luna:none:v1","route":"diagnosis","model":"gpt-6-luna","reasoning":"none","promptVersion":"plant-diagnosis-v1","outputLimit":2400,"timeoutMs":30000,"priceVersion":"openai-multimodel-2026-11-15","detail":"high","profile":"normalized-jpeg-v1","maxAttempts":1,"cacheTtl":"30m","version":"model-config-v1","inputBoundPolicy":"provider-context-ceiling"}'::jsonb,'ea2831490bc8e2a382636fa36148ea27612bdddfb2278d4342f91a5c200d5765');
insert into ai_private.model_configurations(id,route,definition,configuration_hash) values('diagnosis:gpt-6-luna:low:v1','diagnosis','{"id":"diagnosis:gpt-6-luna:low:v1","route":"diagnosis","model":"gpt-6-luna","reasoning":"low","promptVersion":"plant-diagnosis-v1","outputLimit":2400,"timeoutMs":30000,"priceVersion":"openai-multimodel-2026-11-15","detail":"high","profile":"normalized-jpeg-v1","maxAttempts":1,"cacheTtl":"30m","version":"model-config-v1","inputBoundPolicy":"provider-context-ceiling"}'::jsonb,'66a0305c83cd30bb82f6303284deef80fc06eb69066502099e8173754ec55ae9');
insert into ai_private.model_configurations(id,route,definition,configuration_hash) values('diagnosis:gpt-6.1-terra:none:v1','diagnosis','{"id":"diagnosis:gpt-6.1-terra:none:v1","route":"diagnosis","model":"gpt-6.1-terra","reasoning":"none","promptVersion":"plant-diagnosis-v1","outputLimit":2400,"timeoutMs":30000,"priceVersion":"openai-multimodel-2026-11-15","detail":"high","profile":"normalized-jpeg-v1","maxAttempts":1,"cacheTtl":"30m","version":"model-config-v1","inputBoundPolicy":"provider-context-ceiling"}'::jsonb,'ec2cbfd47387f06b9caa8f0b3485815474c507bc2ba17d632353d115a8513677');
insert into ai_private.model_configurations(id,route,definition,configuration_hash) values('diagnosis:gpt-6.1-terra:low:v1','diagnosis','{"id":"diagnosis:gpt-6.1-terra:low:v1","route":"diagnosis","model":"gpt-6.1-terra","reasoning":"low","promptVersion":"plant-diagnosis-v1","outputLimit":2400,"timeoutMs":30000,"priceVersion":"openai-multimodel-2026-11-15","detail":"high","profile":"normalized-jpeg-v1","maxAttempts":1,"cacheTtl":"30m","version":"model-config-v1","inputBoundPolicy":"provider-context-ceiling"}'::jsonb,'9489c12e86b24ce666a44b129f07459abf0b3c2447b5114486f5640b18de350c');
insert into ai_private.model_routes(route,active_configuration,candidate_configuration) values('image_safety','image_safety:gpt-4o:legacy:v1',null);
insert into ai_private.model_routes(route,active_configuration,candidate_configuration) values('initial_care','initial_care:gpt-4o:legacy:v1','initial_care:gpt-6-luna:none:v1');
insert into ai_private.model_routes(route,active_configuration,candidate_configuration) values('care_refresh','care_refresh:gpt-4o:legacy:v1','care_refresh:gpt-6-luna:none:v1');
insert into ai_private.model_routes(route,active_configuration,candidate_configuration) values('diagnosis','diagnosis:gpt-4o:legacy:v1','diagnosis:gpt-6.1-terra:low:v1');
notify pgrst,'reload schema';
commit;
