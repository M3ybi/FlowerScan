begin;

-- Default-off, operator-approved synthetic evaluations; never a customer plan.
create table ai_private.vision_evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  task_key text not null unique check (length(task_key) between 1 and 100),
  actor_ids uuid[] not null check (cardinality(actor_ids) between 0 and 5 and array_position(actor_ids,null) is null),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at > created_at),
  max_attempts integer not null default 50 check (max_attempts between 1 and 50),
  max_usd numeric(24,12) not null default 0.40 check (max_usd > 0 and max_usd <= 0.40)
);
create index ai_vision_evaluation_actors on ai_private.vision_evaluation_runs using gin(actor_ids);

create table ai_private.vision_evaluation_inputs (
  run_id uuid not null references ai_private.vision_evaluation_runs(id),
  input_key text not null check (input_key ~ '^[a-z0-9_-]{1,80}$'),
  source_key text not null check (source_key ~ '^[a-z0-9_-]{1,80}$'),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_width integer not null check (source_width > 0),
  source_height integer not null check (source_height > 0),
  profile_id text not null check (profile_id in ('baseline_1600_high','a_1280_high','b_1024_high','c_768_high','d_512_low','e_original_low')),
  purpose text not null default 'probe' check (purpose in ('probe','safety')),
  image_sha256 text not null check (image_sha256 ~ '^[0-9a-f]{64}$'),
  image_width integer not null check (image_width between 1 and 1600),
  image_height integer not null check (image_height between 1 and 1600),
  encoded_bytes integer not null check (encoded_bytes between 1 and 2097152),
  primary key(run_id,input_key)
);
alter table ai_private.vision_evaluation_runs enable row level security;
alter table ai_private.vision_evaluation_inputs enable row level security;
revoke all on ai_private.vision_evaluation_runs,ai_private.vision_evaluation_inputs from public,anon,authenticated,service_role;
grant select on ai_private.vision_evaluation_runs,ai_private.vision_evaluation_inputs to service_role;

alter table ai_private.operations drop constraint operations_image_detail_check;
alter table ai_private.operations add constraint operations_image_detail_check check (image_detail in ('high','low'));
alter table ai_private.operations add column preprocessing_profile text not null default 'normalized-jpeg-v1'
  check (preprocessing_profile ~ '^[a-z0-9:_-]{1,80}$');
-- Historical bytes/profile measurements are not reconstructed from tokens.
alter table ai_private.operations add column encoded_image_bytes integer check (encoded_image_bytes between 1 and 2097152);
alter table ai_private.operations add column evaluation_run_id uuid references ai_private.vision_evaluation_runs(id);
create index ai_operations_evaluation on ai_private.operations(evaluation_run_id) where evaluation_run_id is not null;

create function ai_private.check_vision_budget(run uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public, ai_private as $$
declare cfg ai_private.vision_evaluation_runs; spent numeric(24,12); exposure numeric(24,12);
  held numeric(24,12); attempts bigint; reserved bigint;
begin
  perform ai_private.require_service();
  perform 1 from ai_private.control where singleton for update;
  select * into cfg from ai_private.vision_evaluation_runs r where r.id=run for update;
  if not found or not cfg.enabled or cfg.expires_at<=now() then raise exception 'AI_EVALUATION_CLOSED'; end if;
  select count(*),coalesce(sum(a.cost_usd) filter(where a.accounting_status='MEASURED'),0),
    coalesce(sum(a.exposure_usd) filter(where a.accounting_status<>'MEASURED'),0)
    into attempts,spent,exposure from ai_private.attempts a join ai_private.operations o on o.id=a.operation_id where o.evaluation_run_id=run;
  select count(*),coalesce(sum(o.reserved_usd),0) into reserved,held from ai_private.operations o
    where o.evaluation_run_id=run and o.state='RESERVED';
  if attempts+reserved>cfg.max_attempts or spent+exposure+held>cfg.max_usd then raise exception 'AI_EVALUATION_LIMIT'; end if;
end $$;
revoke all on function ai_private.check_vision_budget(uuid) from public,anon,authenticated,service_role;

create function public.ai_resolve_vision_input(actor uuid, run uuid, input_key text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, ai_private as $$
declare sample ai_private.vision_evaluation_inputs;
begin
  perform ai_private.require_service();
  perform ai_private.authorize(actor,null);
  if not exists(select 1 from ai_private.vision_evaluation_runs r where r.id=run and actor=any(r.actor_ids)
    and r.enabled and r.expires_at>now()) then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501'; end if;
  select i.* into sample from ai_private.vision_evaluation_inputs i where i.run_id=run and i.input_key=ai_resolve_vision_input.input_key;
  if not found then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501'; end if;
  return jsonb_build_object('detail',case when sample.profile_id in ('d_512_low','e_original_low') then 'low' else 'high' end,
    'preprocessingProfile','vision-benchmark-v1:'||sample.profile_id,'inputKey',sample.input_key,'purpose',sample.purpose);
end $$;

-- The existing Step 2 routine remains intact and callable by old guarded
-- releases. This wrapper adds image metadata and a separate evaluation budget.
create function public.ai_claim_image_operation(
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
  update ai_private.operations o set image_detail=ai_claim_image_operation.image_detail,
    preprocessing_profile=ai_claim_image_operation.preprocessing_profile,encoded_image_bytes=ai_claim_image_operation.encoded_image_bytes,
    evaluation_run_id=run.id where o.id=operation;
  if run.id is not null then perform ai_private.check_vision_budget(run.id); end if;
  return decision;
end $$;

create function public.ai_start_image_attempt(operation uuid, lease uuid) returns uuid
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

revoke all on function public.ai_resolve_vision_input(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.ai_claim_image_operation(uuid,uuid,uuid,text,text,text,text,text,text,integer,integer,integer,text,text,integer,text) from public,anon,authenticated;
revoke all on function public.ai_start_image_attempt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ai_resolve_vision_input(uuid,uuid,text) to service_role;
grant execute on function public.ai_claim_image_operation(uuid,uuid,uuid,text,text,text,text,text,text,integer,integer,integer,text,text,integer,text) to service_role;
grant execute on function public.ai_start_image_attempt(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
