begin;

-- Synthetic registrations contain hashes/configuration only, never photos,
-- notes or customer prompt text. Existing run caps/control rows are unchanged.
create table ai_private.prompt_evaluation_inputs (
  run_id uuid not null references ai_private.vision_evaluation_runs(id),
  input_key text not null check (input_key ~ '^[a-z0-9_-]{1,80}$'),
  definition_id text not null check (definition_id in ('care_baseline','care_concise','care_quality','care_balanced','diagnosis_baseline','diagnosis_concise','diagnosis_quality','diagnosis_balanced')),
  definition_hash text not null check (definition_hash ~ '^[0-9a-f]{64}$'),
  context_hash text not null check (context_hash ~ '^[0-9a-f]{64}$'),
  language text not null check (language in ('en','sk','de','fr','es')),
  prompt_version text not null check (length(prompt_version) between 1 and 80),
  household_id uuid not null,
  plant_id uuid,
  operation_type text not null check (operation_type in ('care_refresh','diagnosis')),
  output_limit integer not null,
  image_sha256 text not null check (image_sha256 ~ '^[0-9a-f]{64}$'),
  image_width integer not null check (image_width between 1 and 1600),
  image_height integer not null check (image_height between 1 and 1600),
  encoded_bytes integer not null check (encoded_bytes between 1 and 2097152),
  primary key(run_id,input_key),
  check ((operation_type='care_refresh' and definition_id like 'care_%' and plant_id is not null and output_limit in (1400,700,512,256))
    or (operation_type='diagnosis' and definition_id like 'diagnosis_%' and output_limit in (2400,1200,700,512,256)))
);
alter table ai_private.prompt_evaluation_inputs enable row level security;
revoke all on ai_private.prompt_evaluation_inputs from public,anon,authenticated,service_role;
grant select on ai_private.prompt_evaluation_inputs to service_role;

create function public.ai_resolve_prompt_input(actor uuid, run uuid, input_key text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, ai_private as $$
declare sample ai_private.prompt_evaluation_inputs;
begin
  perform ai_private.require_service();
  if not exists(select 1 from ai_private.vision_evaluation_runs r where r.id=run and actor=any(r.actor_ids)
    and r.enabled and r.expires_at>now()) then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501'; end if;
  select i.* into sample from ai_private.prompt_evaluation_inputs i where i.run_id=run and i.input_key=ai_resolve_prompt_input.input_key;
  if not found then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501'; end if;
  perform ai_private.authorize(actor,sample.household_id);
  return jsonb_build_object('definitionId',sample.definition_id,'definitionHash',sample.definition_hash,'contextHash',sample.context_hash,
    'language',sample.language,'promptVersion',sample.prompt_version,'householdId',sample.household_id,'plantId',sample.plant_id,
    'kind',sample.operation_type,'outputLimit',sample.output_limit);
end $$;

create function public.ai_claim_prompt_operation(
  actor uuid, household uuid, plant uuid, kind text, retry_key text, request_fingerprint text, image_sha256 text,
  model_name text, prompt_schema_version text, output_limit integer, image_width integer, image_height integer,
  image_detail text, preprocessing_profile text, encoded_image_bytes integer,
  evaluation_run uuid, evaluation_input_key text, definition_hash text, context_hash text
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public, ai_private as $$
declare run ai_private.vision_evaluation_runs; sample ai_private.prompt_evaluation_inputs; decision jsonb;
  existing ai_private.operations; operation uuid;
begin
  perform ai_private.require_service();
  perform 1 from ai_private.control where singleton for update;
  select * into run from ai_private.vision_evaluation_runs r where r.id=evaluation_run for update;
  if not found or not run.enabled or run.expires_at<=now() or actor is null or not actor=any(run.actor_ids)
    or (select count(*) from ai_private.vision_evaluation_runs r where r.actor_ids @> array[actor])<>1 then
    raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';
  end if;
  select i.* into sample from ai_private.prompt_evaluation_inputs i where i.run_id=run.id and i.input_key=evaluation_input_key;
  if not found or model_name is distinct from 'gpt-4o' or image_detail is distinct from 'high'
    or preprocessing_profile is distinct from 'normalized-jpeg-v1'
    or sample.household_id is distinct from household or sample.plant_id is distinct from plant
    or sample.operation_type is distinct from kind or sample.prompt_version is distinct from prompt_schema_version
    or sample.definition_hash is distinct from definition_hash or sample.context_hash is distinct from context_hash
    or sample.output_limit is distinct from output_limit or sample.image_sha256 is distinct from image_sha256
    or sample.image_width is distinct from image_width or sample.image_height is distinct from image_height
    or sample.encoded_bytes is distinct from encoded_image_bytes then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501'; end if;
  decision:=public.ai_claim_operation(actor,household,plant,kind,retry_key,request_fingerprint,image_sha256,
    model_name,prompt_schema_version,output_limit,image_width,image_height);
  if decision->>'decision'<>'RUN' then
    select * into existing from ai_private.operations o where o.id=(decision->>'operationId')::uuid;
    if existing.evaluation_run_id is distinct from run.id or existing.image_width is distinct from image_width
      or existing.image_height is distinct from image_height or existing.encoded_image_bytes is distinct from encoded_image_bytes
      or existing.image_detail<>'high' then raise exception 'AI_IDEMPOTENCY_CONFLICT'; end if;
    return decision;
  end if;
  operation:=(decision->>'operationId')::uuid;
  update ai_private.operations o set evaluation_run_id=run.id,encoded_image_bytes=ai_claim_prompt_operation.encoded_image_bytes where o.id=operation;
  -- Includes all this run's ordinary safety/care/diagnosis work, unknown
  -- attempts and full-context pending reservations. Denial rolls back claim.
  perform ai_private.check_vision_budget(run.id);
  return decision;
end $$;

revoke all on function public.ai_resolve_prompt_input(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.ai_claim_prompt_operation(uuid,uuid,uuid,text,text,text,text,text,text,integer,integer,integer,text,text,integer,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.ai_resolve_prompt_input(uuid,uuid,text) to service_role;
grant execute on function public.ai_claim_prompt_operation(uuid,uuid,uuid,text,text,text,text,text,text,integer,integer,integer,text,text,integer,uuid,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
