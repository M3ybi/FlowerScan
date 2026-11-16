begin;
insert into ai_private.model_configurations(id,route,definition,configuration_hash) values('image_safety:gpt-6-luna:none:v2','image_safety','{"id":"image_safety:gpt-6-luna:none:v2","route":"image_safety","model":"gpt-6-luna","reasoning":"none","promptVersion":"plant-image-safety-luna-none-v2","outputLimit":700,"timeoutMs":30000,"priceVersion":"openai-multimodel-2026-11-15","detail":"high","profile":"normalized-jpeg-v1","maxAttempts":1,"cacheTtl":"30m","version":"model-config-v2","inputBoundPolicy":"provider-context-ceiling"}'::jsonb,'4c13602d582b5f8b30e33e8f732f1c53c6b0c831287f7c3a87a85b1d32883aad');
insert into ai_private.model_configurations(id,route,definition,configuration_hash) values('image_safety:gpt-6-luna:low:v2','image_safety','{"id":"image_safety:gpt-6-luna:low:v2","route":"image_safety","model":"gpt-6-luna","reasoning":"low","promptVersion":"plant-image-safety-luna-low-v2","outputLimit":700,"timeoutMs":30000,"priceVersion":"openai-multimodel-2026-11-15","detail":"high","profile":"normalized-jpeg-v1","maxAttempts":1,"cacheTtl":"30m","version":"model-config-v2","inputBoundPolicy":"provider-context-ceiling"}'::jsonb,'93f0d6f3c7a8301654ded336c9f4a5cad9337ca2a2c002b5ae1f5ba9c160c394');
-- Remove only the original restrictions replaced by an explicit approval mode.
do $$declare c record;begin
 for c in select conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid='ai_private.model_routes'::regclass and contype='c' loop
  if c.definition like '%active_configuration =%' or (c.definition like '%quality_approval_sha256%' and c.definition like '%enabled%') or c.definition like '%image_safety%' then
   execute format('alter table ai_private.model_routes drop constraint %I',c.conname);
  end if;
 end loop;
end $$;

-- A provider start is serialized with cutover, including old service RPCs.
-- Reconciliation updates old facts; it never needs a new provider attempt.
create function ai_private.guard_luna_provider_start() returns trigger language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
declare op ai_private.operations;
begin
 perform 1 from ai_private.control where singleton for update;
 select * into op from ai_private.operations where id=new.operation_id;
 if exists(select 1 from ai_private.model_configurations c join ai_private.model_routes r on r.route=c.route
  where c.id=op.model_configuration_id and r.route_paused) or exists(select 1 from ai_private.owner_stage_grants g
  join ai_private.owner_risk_acceptances a on a.id=g.acceptance_id where op.route_version='luna:'||g.id::text
   and (g.revoked_at is not null or a.revoked_at is not null)) then raise exception 'AI_CIRCUIT_OPEN';end if;
 if new.requested_model not in ('gpt-4o','gpt-6-luna')
  or (exists(select 1 from ai_private.luna_cutover where committed_at is not null) and new.requested_model<>'gpt-6-luna')
  or (op.model_campaign_id is not null and not exists(select 1 from ai_private.model_evaluation_runs r
   join ai_private.luna_campaign_approvals a on a.id=r.owner_campaign_approval_id
   where r.id=op.model_campaign_id and r.enabled and r.stopped_at is null and r.expires_at>now() and a.revoked_at is null)) then
  raise exception 'AI_CIRCUIT_OPEN';end if;
 return new;
end $$;
create trigger ai_luna_provider_start before insert on ai_private.attempts for each row execute function ai_private.guard_luna_provider_start();
create function ai_private.guard_luna_operation_insert() returns trigger language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
begin
 perform 1 from ai_private.control where singleton for update;
 if new.requested_model not in ('gpt-4o','gpt-6-luna') or
  (exists(select 1 from ai_private.luna_cutover where committed_at is not null) and new.requested_model<>'gpt-6-luna') then raise exception 'AI_CIRCUIT_OPEN';end if;
 return new;
end $$;
create trigger ai_luna_operation_insert before insert on ai_private.operations for each row execute function ai_private.guard_luna_operation_insert();

create table ai_private.owner_configuration_events (
 id uuid primary key default gen_random_uuid(), acceptance_id uuid not null references ai_private.owner_risk_acceptances(id),
 actor_id uuid, route text, action text not null check(action in ('STAGE','RECOVERY','CUTOVER')),
 configuration_id text references ai_private.model_configurations(id), stage integer, previous_route_version text,
 created_at timestamptz not null default now()
);
alter table ai_private.owner_configuration_events enable row level security;
revoke all on ai_private.owner_configuration_events from public,anon,authenticated,service_role;
create trigger immutable_owner_configuration_event before update or delete on ai_private.owner_configuration_events for each row execute function ai_private.guard_luna_evidence();

create function public.ai_owner_apply_stage(grant_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
declare g ai_private.owner_stage_grants;a ai_private.owner_risk_acceptances;r ai_private.model_routes;c ai_private.model_configurations;previous_stage integer;
begin
 perform ai_private.require_service();perform 1 from ai_private.control where singleton for update;
 select * into g from ai_private.owner_stage_grants where id=grant_id for update;
 select * into a from ai_private.owner_risk_acceptances where id=g.acceptance_id;
 select * into r from ai_private.model_routes where route=g.route;
 select * into c from ai_private.model_configurations where id=g.configuration_id;
 if g.id is null or g.revoked_at is not null or a.revoked_at is not null or g.applied_at is not null
  or c.configuration_hash is distinct from g.configuration_hash or a.configuration_hashes->>c.id is distinct from c.configuration_hash
  or c.definition->>'model'<>'gpt-6-luna' or exists(select 1 from ai_private.luna_cutover where committed_at is not null) then raise exception 'AI_QUALIFICATION_EVIDENCE_REQUIRED';end if;
 previous_stage:=case g.stage when 5 then 0 when 10 then 5 when 25 then 10 when 50 then 25 when 100 then 50 end;
 if r.rollout_percent<>previous_stage or (previous_stage>0 and (r.owner_acceptance_id is distinct from a.id
  or not exists(select 1 from ai_private.operations o join ai_private.attempts t on t.operation_id=o.id
   where o.route_version=r.version and o.model_configuration_id=c.id and o.state='COMPLETED' and o.final_outcome='SUCCEEDED'
    and t.accounting_status='MEASURED' and t.returned_model='gpt-6-luna' and o.created_at>=a.accepted_at))) then raise exception 'AI_STAGE_EVIDENCE_REQUIRED';end if;
 if exists(select 1 from ai_private.attempts t where t.started_at>=a.accepted_at and t.requested_model='gpt-6-luna' and t.accounting_status<>'MEASURED') then raise exception 'AI_FINANCIAL_EVIDENCE_REQUIRED';end if;
 update ai_private.model_routes set candidate_configuration=c.id,enabled=true,rollout_percent=g.stage,
  approval_mode='OWNER_ACCEPTED_UNREVIEWED_MIGRATION',owner_acceptance_id=a.id,route_paused=false,
  version='luna:'||g.id::text where route=g.route;
 update ai_private.owner_stage_grants set applied_at=now() where id=g.id;
 insert into ai_private.owner_configuration_events(acceptance_id,actor_id,route,action,configuration_id,stage,previous_route_version)
  values(a.id,a.actor_id,g.route,'STAGE',c.id,g.stage,r.version);
 return jsonb_build_object('route',g.route,'stage',g.stage,'configurationId',c.id,'version','luna:'||g.id::text);
end $$;

create function public.ai_owner_commit_cutover(acceptance uuid,release_revision text) returns timestamptz language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
declare a ai_private.owner_risk_acceptances;stamp timestamptz;
begin
 perform ai_private.require_service();perform 1 from ai_private.control where singleton for update;perform ai_private.reconcile();
 select * into a from ai_private.owner_risk_acceptances where id=acceptance;
 if a.id is null or a.revoked_at is not null or release_revision is null or release_revision !~ '^[a-f0-9]{40}$'
  or exists(select 1 from ai_private.luna_cutover where committed_at is not null)
  or (select count(*) from ai_private.model_routes r join ai_private.model_configurations c on c.id=r.candidate_configuration
   where r.owner_acceptance_id=a.id and r.enabled and r.rollout_percent=100 and not r.route_paused
    and c.definition->>'model'='gpt-6-luna' and exists(select 1 from ai_private.operations o join ai_private.attempts t on t.operation_id=o.id
     where o.route_version=r.version and o.model_configuration_id=c.id and o.state='COMPLETED' and o.final_outcome='SUCCEEDED'
      and t.accounting_status='MEASURED' and t.returned_model='gpt-6-luna'))<>4
  or exists(select 1 from ai_private.operations where state in ('RESERVED','PROCESSING') and requested_model<>'gpt-6-luna')
  or exists(select 1 from ai_private.attempts where started_at>=a.accepted_at and accounting_status<>'MEASURED') then raise exception 'AI_CUTOVER_EVIDENCE_REQUIRED';end if;
 update ai_private.model_routes set active_configuration=candidate_configuration,candidate_configuration=null,enabled=false,rollout_percent=0;
 update ai_private.luna_cutover set committed_at=clock_timestamp(),release_revision=ai_owner_commit_cutover.release_revision returning committed_at into stamp;
 insert into ai_private.owner_configuration_events(acceptance_id,actor_id,action) values(a.id,a.actor_id,'CUTOVER');
 return stamp;
end $$;

create function public.ai_owner_recover_luna(actor uuid,acceptance uuid,configuration_id text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
declare a ai_private.owner_risk_acceptances;c ai_private.model_configurations;r ai_private.model_routes;event_id uuid:=gen_random_uuid();
begin
 perform ai_private.require_owner(actor);perform 1 from ai_private.control where singleton for update;
 select * into a from ai_private.owner_risk_acceptances where id=acceptance;
 select * into c from ai_private.model_configurations where id=configuration_id;
 select * into r from ai_private.model_routes where route=c.route;
 if a.id is null or a.revoked_at is not null or c.id is null or c.definition->>'model'<>'gpt-6-luna' or c.definition->>'reasoning' not in ('none','low')
  or a.configuration_hashes->>c.id is distinct from c.configuration_hash or not c.route=any(a.route_scope)
  or not exists(select 1 from ai_private.luna_cutover where committed_at is not null) then raise exception 'AI_QUALIFICATION_EVIDENCE_REQUIRED';end if;
 update ai_private.model_routes set active_configuration=c.id,candidate_configuration=null,enabled=false,rollout_percent=0,
  route_paused=false,owner_acceptance_id=a.id,approval_mode='OWNER_ACCEPTED_UNREVIEWED_MIGRATION',version='luna-recovery:'||event_id where route=c.route;
 insert into ai_private.owner_configuration_events(id,acceptance_id,actor_id,route,action,configuration_id,previous_route_version)
  values(event_id,a.id,actor,c.route,'RECOVERY',c.id,r.version);
 return jsonb_build_object('route',c.route,'configurationId',c.id,'newOperationsOnly',true);
end $$;
alter table ai_private.model_routes add constraint ai_luna_active_model check(active_configuration like route||':gpt-6-luna:%' or active_configuration=route||':gpt-4o:legacy:v1');
alter table ai_private.model_routes add constraint ai_luna_explicit_approval check(not enabled or
 (approval_mode='INDEPENDENTLY_REVIEWED' and route<>'image_safety' and quality_approval_sha256 is not null and bounded_input_approval_sha256 is not null)
 or (approval_mode='OWNER_ACCEPTED_UNREVIEWED_MIGRATION' and owner_acceptance_id is not null));
alter table ai_private.model_routes add constraint ai_luna_active_approval check(active_configuration=route||':gpt-4o:legacy:v1' or
 (approval_mode='OWNER_ACCEPTED_UNREVIEWED_MIGRATION' and owner_acceptance_id is not null)
 or (approval_mode='INDEPENDENTLY_REVIEWED' and quality_approval_sha256 is not null and bounded_input_approval_sha256 is not null));
update ai_private.model_routes set candidate_configuration=case when route='image_safety' then 'image_safety:gpt-6-luna:none:v2' else route||':gpt-6-luna:none:v1' end;
alter table ai_private.model_routes add constraint ai_luna_candidate_model check(candidate_configuration is null or candidate_configuration like route||':gpt-6-luna:%');

create function ai_private.resolve_model_route(household uuid,route_id text) returns text language plpgsql stable security definer set search_path=pg_catalog,public,ai_private as $$
declare r ai_private.model_routes;c ai_private.model_configurations;
begin
 select * into r from ai_private.model_routes where route=route_id;
 if not found or r.route_paused then raise exception 'AI_CIRCUIT_OPEN';end if;
 if r.approval_mode='OWNER_ACCEPTED_UNREVIEWED_MIGRATION' and not exists(select 1 from ai_private.owner_risk_acceptances a
  where a.id=r.owner_acceptance_id and a.revoked_at is null) then raise exception 'AI_CIRCUIT_OPEN';end if;
 select * into c from ai_private.model_configurations where id=case when r.enabled and
  (r.rollout_percent=100 or (household is not null and ai_private.model_cohort(household,route_id)<r.rollout_percent*100)) then r.candidate_configuration else r.active_configuration end;
 if c.id is null or c.definition->>'model' not in ('gpt-4o','gpt-6-luna')
  or (exists(select 1 from ai_private.luna_cutover where committed_at is not null) and c.definition->>'model'<>'gpt-6-luna') then raise exception 'AI_CIRCUIT_OPEN';end if;
 if c.definition->>'model'='gpt-6-luna' and r.approval_mode='OWNER_ACCEPTED_UNREVIEWED_MIGRATION' and not exists(
  select 1 from ai_private.owner_risk_acceptances a where a.id=r.owner_acceptance_id and a.revoked_at is null
   and a.configuration_hashes->>c.id=c.configuration_hash and c.route=any(a.route_scope)) then raise exception 'AI_CIRCUIT_OPEN';end if;
 return c.id;
end $$;
create function public.ai_resolve_safety_configuration(actor uuid,household uuid default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
declare c ai_private.model_configurations;
begin
 perform ai_private.require_service();perform ai_private.authorize(actor,household);
 select * into c from ai_private.model_configurations where id=ai_private.resolve_model_route(household,'image_safety');
 return jsonb_build_object('id',c.id,'hash',c.configuration_hash);
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
 -- Retired paid evaluators cannot bypass this route binder.
 if evaluation_input_key is not null then
  if exists(select 1 from ai_private.luna_cutover where committed_at is not null) then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';end if;
  return public.ai_claim_image_operation_legacy(actor,household,plant,kind,retry_key,request_fingerprint,image_sha256,model_name,prompt_schema_version,output_limit,image_width,image_height,image_detail,preprocessing_profile,encoded_image_bytes,evaluation_input_key);
 end if;
 if model_name is null or model_name not in ('gpt-4o','gpt-6-luna') or request_fingerprint is null or request_fingerprint !~ '^[0-9a-f]{64}$'
  or image_detail is distinct from 'high' or preprocessing_profile is distinct from 'normalized-jpeg-v1'
  or encoded_image_bytes is null or encoded_image_bytes not between 1 and 2097152
  or image_width is null or image_width not between 1 and 1600 or image_height is null or image_height not between 1 and 1600 then raise exception 'AI_INVALID_OPERATION';end if;
 perform ai_private.authorize(actor,household);perform ai_private.reconcile();
 if plant is not null and not exists(select 1 from public.plants p where p.id=plant and p.household_id=household and not p.is_removed) then raise exception 'HOUSEHOLD_ACCESS_DENIED' using errcode='42501';end if;
 if kind in ('image_validation','upload_validation') then
  select * into config from ai_private.model_configurations where id=ai_private.resolve_model_route(household,'image_safety');
  if config.definition->>'promptVersion' is distinct from prompt_schema_version then raise exception 'AI_INVALID_OPERATION';end if;
 end if;
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
 if not found or routing.route_paused then raise exception 'AI_CIRCUIT_OPEN';end if;
 select * into config from ai_private.model_configurations where id=ai_private.resolve_model_route(household,route_id);
 if not found or config.definition->>'promptVersion' is distinct from prompt_schema_version or (config.definition->>'outputLimit')::integer is distinct from output_limit
  or image_detail is distinct from 'high' or preprocessing_profile is distinct from 'normalized-jpeg-v1' then raise exception 'AI_INVALID_OPERATION';end if;
 if (select count(*) from ai_private.model_evaluation_runs r where actor=any(r.actor_ids))>1 then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';end if;
 select * into campaign from ai_private.model_evaluation_runs r where actor=any(r.actor_ids) for update;
 if found and (not campaign.enabled or campaign.expires_at<=now() or campaign.stopped_at is not null) then return jsonb_build_object('decision','CAMPAIGN_STOP');end if;
 if campaign.id is not null and (campaign.owner_campaign_approval_id is null or config.definition->>'model'<>'gpt-6-luna'
  or not exists(select 1 from ai_private.luna_campaign_approvals a where a.id=campaign.owner_campaign_approval_id and a.revoked_at is null)
  or not exists(select 1 from ai_private.model_evaluation_inputs i where i.run_id=campaign.id and i.configuration_id=config.id
   and i.household_id=household and (plant is null or i.plant_id=plant) and i.image_sha256=ai_claim_image_operation.image_sha256
   and i.image_width=ai_claim_image_operation.image_width and i.image_height=ai_claim_image_operation.image_height and i.encoded_bytes=encoded_image_bytes)) then
  raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';end if;
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


create or replace function public.ai_claim_model_operation(
 actor uuid,household uuid,plant uuid,kind text,retry_key text,request_fingerprint text,image_sha256 text,
 model_name text,prompt_schema_version text,output_limit integer,image_width integer,image_height integer,
 image_detail text,preprocessing_profile text,encoded_image_bytes integer,
 model_campaign uuid,model_input_key text,configuration_id text,configuration_hash text,context_hash text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
declare campaign ai_private.model_evaluation_runs;sample ai_private.model_evaluation_inputs;c ai_private.model_configurations;decision jsonb;stop_code text;effective_fingerprint text;existing ai_private.operations;
begin
 perform ai_private.require_service();perform 1 from ai_private.control where singleton for update;
 select * into campaign from ai_private.model_evaluation_runs r where r.id=model_campaign for update;
 if not found or actor is null or not actor=any(campaign.actor_ids) then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';end if;
 if campaign.owner_campaign_approval_id is null or not exists(select 1 from ai_private.luna_campaign_approvals a
  where a.id=campaign.owner_campaign_approval_id and a.revoked_at is null) then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';end if;
 if not campaign.enabled or campaign.expires_at<=now() or campaign.stopped_at is not null then return jsonb_build_object('decision','CAMPAIGN_STOP');end if;
 if (select count(*) from ai_private.model_evaluation_runs r where actor=any(r.actor_ids))<>1 or exists(select 1 from ai_private.vision_evaluation_runs r where actor=any(r.actor_ids)) then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';end if;
 select * into sample from ai_private.model_evaluation_inputs i where i.run_id=campaign.id and i.input_key=model_input_key;
 if not found then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';end if;
 select * into c from ai_private.model_configurations where id=sample.configuration_id;
 if sample.configuration_id is distinct from configuration_id or c.configuration_hash is distinct from configuration_hash or sample.context_hash is distinct from context_hash
  or retry_key is distinct from 'eval_'||encode(sha256(convert_to(campaign.id::text||':'||model_input_key,'UTF8')),'hex')
  or sample.household_id is distinct from household or sample.plant_id is distinct from plant or c.definition->>'model' is distinct from 'gpt-6-luna' or c.definition->>'reasoning' not in ('none','low')
  or kind is distinct from (case when c.route='diagnosis' then 'diagnosis' when c.route='image_safety' then 'image_validation' else 'care_refresh' end)
  or c.definition->>'model' is distinct from model_name or c.definition->>'promptVersion' is distinct from prompt_schema_version
  or (c.definition->>'outputLimit')::integer is distinct from output_limit or image_detail is distinct from 'high' or preprocessing_profile is distinct from 'normalized-jpeg-v1'
  or sample.image_sha256 is distinct from image_sha256 or sample.image_width is distinct from image_width or sample.image_height is distinct from image_height or sample.encoded_bytes is distinct from encoded_image_bytes then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';end if;
 -- Different registered cases/configurations/runs cannot share a result.
 effective_fingerprint:=encode(sha256(convert_to(request_fingerprint||':'||campaign.id::text||':'||model_input_key||':'||c.configuration_hash,'UTF8')),'hex');
 perform ai_private.authorize(actor,household);
 if not exists(select 1 from public.plants p where p.id=plant and p.household_id=household and not p.is_removed) then raise exception 'HOUSEHOLD_ACCESS_DENIED' using errcode='42501';end if;
 -- Expiring a result cannot purchase another attempt for a registered case.
 select * into existing from ai_private.operations o where o.model_campaign_id=campaign.id and o.idempotency_key=retry_key and o.model_configuration_id=c.id order by o.created_at limit 1;
 if found then
  if existing.state='COMPLETED' and existing.expires_at>now() and existing.result is not null then
   return jsonb_build_object('decision','REPLAY','operationId',existing.id,'result',existing.result);end if;
  return jsonb_build_object('decision',case when existing.state in ('RESERVED','PROCESSING') then 'WAIT' else 'STOP' end,'operationId',existing.id,'state',existing.state);
 end if;
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

-- New protected work requires a concrete, authenticated spending approval.
create or replace function public.ai_finish_attempt(operation uuid,lease uuid,attempt uuid,outcome text,final_result jsonb,facts jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
declare settled jsonb;first_settlement boolean;
begin
 perform ai_private.require_service();perform 1 from ai_private.control where singleton for update;
 select a.completed_at is null into first_settlement from ai_private.attempts a join ai_private.operations o on o.id=a.operation_id
 where a.id=attempt and o.id=operation and o.lease_id=lease;
 if not found then raise exception 'AI_INVALID_OPERATION';end if;
 settled:=ai_private.finish_attempt_model_v1(operation,lease,attempt,outcome,final_result,facts);
 if first_settlement then
  update ai_private.attempts set provider_diagnostics=ai_private.safe_provider_diagnostics(facts->'providerDiagnostics') where id=attempt;
 end if;
 -- Test/campaign exposure is never recycled by a later reconciliation.
 update ai_private.model_evaluation_runs r set stopped_at=coalesce(r.stopped_at,now())
  from ai_private.operations o join ai_private.attempts a on a.operation_id=o.id
  where o.id=operation and a.id=attempt and r.id=o.model_campaign_id and r.owner_campaign_approval_id is not null
   and a.completed_at is not null and a.accounting_status<>'MEASURED';
 return settled;
end $$;

create or replace function ai_private.validate_luna_campaign_approval() returns trigger language plpgsql security definer
set search_path=pg_catalog,public,ai_private as $$
declare a ai_private.luna_campaign_approvals;p ai_private.luna_campaign_proposals;
begin
 if new.owner_campaign_approval_id is null then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';end if;
 select * into a from ai_private.luna_campaign_approvals where id=new.owner_campaign_approval_id for update;
 select * into p from ai_private.luna_campaign_proposals where sha256=a.proposal_sha256;
 if a.id is null or a.revoked_at is not null or new.created_at<a.approved_at or new.max_attempts>p.max_attempts
  or new.max_usd>p.max_usd or new.expires_at>new.created_at+make_interval(secs=>p.duration_seconds)
  or new.created_at>a.approved_at+interval '1 day' then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';end if;
 return new;
end $$;

create function ai_private.validate_luna_registration() returns trigger language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
declare p ai_private.luna_campaign_proposals;c ai_private.model_configurations;
begin
 select p0.* into p from ai_private.model_evaluation_runs r join ai_private.luna_campaign_approvals a on a.id=r.owner_campaign_approval_id
  join ai_private.luna_campaign_proposals p0 on p0.sha256=a.proposal_sha256 where r.id=new.run_id and a.revoked_at is null;
 select * into c from ai_private.model_configurations where id=new.configuration_id;
 if p.sha256 is null or c.definition->>'model' is distinct from 'gpt-6-luna' or c.definition->>'reasoning' not in ('none','low')
  or p.plan->'configurationHashes'->>c.id is distinct from c.configuration_hash
  or not coalesce(p.plan->'imageHashes' ? new.image_sha256,false) then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';end if;
 return new;
end $$;
create trigger ai_luna_registration before insert on ai_private.model_evaluation_inputs for each row execute function ai_private.validate_luna_registration();

do $$declare item record;begin
 for item in select p.oid::regprocedure signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
  (n.nspname='public' and p.proname in ('ai_resolve_safety_configuration','ai_owner_apply_stage','ai_owner_commit_cutover','ai_owner_recover_luna'))
  or (n.nspname='ai_private' and p.proname in ('resolve_model_route','guard_luna_provider_start','guard_luna_operation_insert','validate_luna_registration')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',item.signature);
  if item.nspname='public' then execute format('grant execute on function %s to service_role',item.signature);end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
