-- The immutable owner-approved completion plan declares exact fixtures rather
-- than the original imageHashes projection. Never modify that approved plan.
create or replace function ai_private.validate_luna_registration() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
declare p ai_private.luna_campaign_proposals;c ai_private.model_configurations;image_approved boolean;
begin
 select p0.* into p from ai_private.model_evaluation_runs r join ai_private.luna_campaign_approvals a on a.id=r.owner_campaign_approval_id
  join ai_private.luna_campaign_proposals p0 on p0.sha256=a.proposal_sha256 where r.id=new.run_id and a.revoked_at is null;
 select * into c from ai_private.model_configurations where id=new.configuration_id;
 -- An explicit imageHashes field remains authoritative, including an empty one.
 -- The alternative accepts only an exact ALLOW fixture in the signed proposal.
 image_approved:=case when p.plan ? 'imageHashes' then p.plan->'imageHashes' ? new.image_sha256
  else jsonb_typeof(p.plan->'fixtures')='array' and p.plan->'fixtures' @>
   jsonb_build_array(jsonb_build_object('sha256',new.image_sha256,'expected','ALLOW')) end;
 if p.sha256 is null or c.definition->>'model' is distinct from 'gpt-6-luna' or c.definition->>'reasoning' not in ('none','low')
  or p.plan->'configurationHashes'->>c.id is distinct from c.configuration_hash
  or not coalesce(image_approved,false) then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';end if;
 return new;
end $$;
