-- Preserve cutover gates and satisfy production safe-update enforcement.
create or replace function public.ai_owner_commit_cutover(acceptance uuid,release_revision text) returns timestamptz language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
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
 update ai_private.model_routes set active_configuration=candidate_configuration,candidate_configuration=null,enabled=false,rollout_percent=0 where route=any(a.route_scope);
 update ai_private.luna_cutover set committed_at=clock_timestamp(),release_revision=ai_owner_commit_cutover.release_revision where singleton returning committed_at into stamp;
 insert into ai_private.owner_configuration_events(acceptance_id,actor_id,action) values(a.id,a.actor_id,'CUTOVER');
 return stamp;
end $$;

