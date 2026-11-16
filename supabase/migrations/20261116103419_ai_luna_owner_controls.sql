begin;

-- Owner authorization is separate from household ownership and subscriptions.
-- Enrollment is an explicit operator action; the migration grants nobody access.
create table ai_private.owner_operators (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default true, authorization_reference text not null check(length(authorization_reference) between 1 and 500),
 created_at timestamptz not null default now()
);
create table ai_private.luna_campaign_proposals (
 sha256 text primary key check(sha256 ~ '^[a-f0-9]{64}$'), plan jsonb not null check(jsonb_typeof(plan)='object' and octet_length(plan::text)<=524288),
 max_attempts integer not null check(max_attempts between 1 and 120), max_usd numeric(24,12) not null check(max_usd>0 and max_usd<=4),
 duration_seconds integer not null check(duration_seconds between 1 and 3600), created_at timestamptz not null default now()
);
create table ai_private.luna_campaign_approvals (
 id uuid primary key default gen_random_uuid(), proposal_sha256 text not null references ai_private.luna_campaign_proposals(sha256),
 actor_id uuid not null, approved_at timestamptz not null default now(), revoked_at timestamptz,
 authentication text not null check(authentication='SUPABASE_AUTH_OWNER'), unique(proposal_sha256)
);
create table ai_private.luna_evidence (
 sha256 text primary key check(sha256 ~ '^[a-f0-9]{64}$'), release_revision text not null check(release_revision ~ '^[a-f0-9]{40}$'),
 configurations jsonb not null check(jsonb_typeof(configurations)='object'),
 safety_configuration_ids text[] not null check(cardinality(safety_configuration_ids) between 1 and 2),
 known_disallowed_cases integer not null check(known_disallowed_cases>=8), false_acceptances integer not null check(false_acceptances>=0),
 safety_fixture_manifest_sha256 text not null check(safety_fixture_manifest_sha256 ~ '^[a-f0-9]{64}$'),
 safety_categories text[] not null check(array['healthy_plant','damaged_plant','pests','non_plant','documents','faces','screenshots','mixed_sensitive','blurred','extremely_dark','small_restricted_details','multiple_plants','ambiguous','corrupted','oversized']::text[] <@ safety_categories),
 provider_attempts integer not null check(provider_attempts>0), measured_usd numeric(24,12) not null check(measured_usd>=0),
 new_unknown_exposure numeric(24,12) not null check(new_unknown_exposure>=0),
 engineering_checks_passed boolean not null, limitations text not null check(length(limitations) between 1 and 12000),
 created_at timestamptz not null default now()
);
create table ai_private.owner_risk_acceptances (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null,
 state text not null check(state='OWNER_ACCEPTED_UNREVIEWED_MIGRATION'),
 evidence_sha256 text not null references ai_private.luna_evidence(sha256),
 configuration_hashes jsonb not null check(jsonb_typeof(configuration_hashes)='object'),
 route_scope text[] not null check(cardinality(route_scope) between 1 and 4),
 maximum_canary_percent integer not null check(maximum_canary_percent=5),
 rollback_conditions text not null check(length(rollback_conditions) between 1 and 4000),
 accepted_at timestamptz not null default now(), revoked_at timestamptz,
 authentication text not null check(authentication='SUPABASE_AUTH_OWNER')
);
create table ai_private.owner_stage_grants (
 id uuid primary key default gen_random_uuid(), acceptance_id uuid not null references ai_private.owner_risk_acceptances(id),
 route text not null check(route in ('image_safety','initial_care','care_refresh','diagnosis')),
 stage integer not null check(stage in (5,10,25,50,100)), configuration_id text not null references ai_private.model_configurations(id),
 configuration_hash text not null check(configuration_hash ~ '^[a-f0-9]{64}$'),
 approved_at timestamptz not null default now(), applied_at timestamptz, revoked_at timestamptz,
 unique(acceptance_id,route,stage)
);
create table ai_private.luna_cutover (
 singleton boolean primary key default true check(singleton), committed_at timestamptz,
 release_revision text check(release_revision ~ '^[a-f0-9]{40}$')
);
insert into ai_private.luna_cutover(singleton) values(true);

alter table ai_private.model_routes add column approval_mode text not null default 'NONE'
 check(approval_mode in ('NONE','INDEPENDENTLY_REVIEWED','OWNER_ACCEPTED_UNREVIEWED_MIGRATION'));
alter table ai_private.model_routes add column owner_acceptance_id uuid references ai_private.owner_risk_acceptances(id);
alter table ai_private.model_routes add column route_paused boolean not null default false;
alter table ai_private.model_evaluation_runs add column owner_campaign_approval_id uuid references ai_private.luna_campaign_approvals(id);
create unique index ai_luna_one_campaign_per_approval on ai_private.model_evaluation_runs(owner_campaign_approval_id) where owner_campaign_approval_id is not null;
create index ai_luna_operation_stage on ai_private.operations(model_configuration_id,route_version,created_at) where model_configuration_id is not null;

create function ai_private.require_owner(actor uuid) returns void language plpgsql security definer
set search_path=pg_catalog,public,ai_private as $$
begin
 perform ai_private.require_service();
 if actor is null or not exists(select 1 from ai_private.owner_operators o join auth.users u on u.id=o.user_id
  where o.user_id=actor and o.enabled and u.email_confirmed_at is not null) then
  raise exception 'OWNER_ACCESS_DENIED' using errcode='42501';
 end if;
end $$;

create function public.ai_owner_access(actor uuid) returns boolean language plpgsql security definer
set search_path=pg_catalog,public,ai_private as $$
begin
 perform ai_private.require_service();
 return exists(select 1 from ai_private.owner_operators o join auth.users u on u.id=o.user_id
  where o.user_id=actor and o.enabled and u.email_confirmed_at is not null);
end $$;

create function public.ai_owner_approve_campaign(actor uuid,proposal_sha256 text) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,ai_private as $$
declare p ai_private.luna_campaign_proposals; approval ai_private.luna_campaign_approvals;
begin
 perform ai_private.require_owner(actor);
 select * into p from ai_private.luna_campaign_proposals where sha256=proposal_sha256 for update;
 if not found then raise exception 'AI_INVALID_OPERATION';end if;
 insert into ai_private.luna_campaign_approvals(proposal_sha256,actor_id,authentication)
 values(p.sha256,actor,'SUPABASE_AUTH_OWNER') returning * into approval;
 return jsonb_build_object('id',approval.id,'proposalSha256',p.sha256,'approvedAt',approval.approved_at,
  'maxAttempts',p.max_attempts,'maxUsd',p.max_usd,'durationSeconds',p.duration_seconds);
end $$;

create function ai_private.validate_luna_campaign_approval() returns trigger language plpgsql security definer
set search_path=pg_catalog,public,ai_private as $$
declare a ai_private.luna_campaign_approvals;p ai_private.luna_campaign_proposals;
begin
 if new.owner_campaign_approval_id is null then return new;end if;
 select * into a from ai_private.luna_campaign_approvals where id=new.owner_campaign_approval_id for update;
 select * into p from ai_private.luna_campaign_proposals where sha256=a.proposal_sha256;
 if a.id is null or a.revoked_at is not null or new.created_at<a.approved_at or new.max_attempts>p.max_attempts
  or new.max_usd>p.max_usd or new.expires_at>new.created_at+make_interval(secs=>p.duration_seconds)
  or new.created_at>a.approved_at+interval '1 day' then raise exception 'AI_EVALUATION_FORBIDDEN' using errcode='42501';end if;
 return new;
end $$;
create trigger ai_luna_campaign_approval before insert on ai_private.model_evaluation_runs for each row execute function ai_private.validate_luna_campaign_approval();

create function public.ai_owner_accept_risk(actor uuid,evidence_sha256 text,configuration_ids text[],approved_stages integer[],rollback_conditions text,recovery_configuration_ids text[] default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
declare e ai_private.luna_evidence;c ai_private.model_configurations; acceptance uuid; hashes jsonb:='{}';routes text[]:='{}';stage integer;item text;
begin
 perform ai_private.require_owner(actor);perform 1 from ai_private.control where singleton for update;
 select * into e from ai_private.luna_evidence where sha256=evidence_sha256;
 if e.sha256 is null or not e.engineering_checks_passed or e.false_acceptances<>0 or e.new_unknown_exposure<>0
  or configuration_ids is null or cardinality(configuration_ids) not between 1 and 4
  or (select count(distinct x) from unnest(configuration_ids) x)<>cardinality(configuration_ids)
  or approved_stages is distinct from array[5,10,25,50,100] or rollback_conditions is null or length(rollback_conditions) not between 1 and 4000 then
  raise exception 'AI_QUALIFICATION_EVIDENCE_REQUIRED';end if;
 foreach item in array configuration_ids loop
  select * into c from ai_private.model_configurations where id=item;
  if c.id is null or c.definition->>'model'<>'gpt-6-luna' or c.definition->>'reasoning' not in ('none','low')
   or e.configurations->>c.id is distinct from c.configuration_hash
   or (c.route='image_safety' and not c.id=any(e.safety_configuration_ids)) or c.route=any(routes) then raise exception 'AI_QUALIFICATION_EVIDENCE_REQUIRED';end if;
  hashes:=hashes||jsonb_build_object(c.id,c.configuration_hash);routes:=array_append(routes,c.route);
 end loop;
 if recovery_configuration_ids is null or cardinality(recovery_configuration_ids)>4 then raise exception 'AI_INVALID_OPERATION';end if;
 foreach item in array recovery_configuration_ids loop
  select * into c from ai_private.model_configurations where id=item;
  if c.id is null or not c.route=any(routes) or c.definition->>'model'<>'gpt-6-luna' or c.definition->>'reasoning' not in ('none','low')
   or e.configurations->>c.id is distinct from c.configuration_hash
   or (c.route='image_safety' and not c.id=any(e.safety_configuration_ids)) then raise exception 'AI_QUALIFICATION_EVIDENCE_REQUIRED';end if;
  hashes:=hashes||jsonb_build_object(c.id,c.configuration_hash);
 end loop;
 insert into ai_private.owner_risk_acceptances(actor_id,state,evidence_sha256,configuration_hashes,route_scope,maximum_canary_percent,rollback_conditions,authentication)
 values(actor,'OWNER_ACCEPTED_UNREVIEWED_MIGRATION',e.sha256,hashes,routes,5,rollback_conditions,'SUPABASE_AUTH_OWNER') returning id into acceptance;
 foreach item in array configuration_ids loop
  select * into c from ai_private.model_configurations where id=item;
  foreach stage in array approved_stages loop
   insert into ai_private.owner_stage_grants(acceptance_id,route,stage,configuration_id,configuration_hash) values(acceptance,c.route,stage,c.id,c.configuration_hash);
  end loop;
 end loop;
 return jsonb_build_object('id',acceptance,'state','OWNER_ACCEPTED_UNREVIEWED_MIGRATION','independentReview',false,'approvedStages',approved_stages,'routes',routes);
end $$;

create function public.ai_owner_revoke(actor uuid,acceptance uuid) returns void language plpgsql security definer
set search_path=pg_catalog,public,ai_private as $$
begin
 perform ai_private.require_owner(actor);perform 1 from ai_private.control where singleton for update;
 update ai_private.owner_risk_acceptances set revoked_at=coalesce(revoked_at,now()) where id=acceptance;
 update ai_private.owner_stage_grants set revoked_at=coalesce(revoked_at,now()) where acceptance_id=acceptance;
 if exists(select 1 from ai_private.luna_cutover where committed_at is not null) then
  update ai_private.model_routes set route_paused=true where owner_acceptance_id=acceptance;
 else
  update ai_private.model_routes set enabled=false,rollout_percent=0 where owner_acceptance_id=acceptance;
 end if;
end $$;

-- Approvals and factual evidence are append-only, except explicit revocation
-- and consuming a previously approved stage. No specialist review is invented.
create function ai_private.guard_luna_evidence() returns trigger language plpgsql set search_path=pg_catalog,public,ai_private as $$
begin raise exception 'AI_IMMUTABLE_LUNA_EVIDENCE';end $$;
create trigger immutable_luna_proposal before update or delete on ai_private.luna_campaign_proposals for each row execute function ai_private.guard_luna_evidence();
create trigger immutable_luna_evidence before update or delete on ai_private.luna_evidence for each row execute function ai_private.guard_luna_evidence();
create function ai_private.guard_owner_approval() returns trigger language plpgsql set search_path=pg_catalog,public,ai_private as $$
begin
 if tg_op='DELETE' then raise exception 'AI_IMMUTABLE_OWNER_APPROVAL';end if;
 if (to_jsonb(new)-array['revoked_at','applied_at']) is distinct from (to_jsonb(old)-array['revoked_at','applied_at'])
  or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at)
  or (to_jsonb(old)->>'applied_at' is not null and to_jsonb(new)->>'applied_at' is distinct from to_jsonb(old)->>'applied_at') then raise exception 'AI_IMMUTABLE_OWNER_APPROVAL';end if;
 return new;
end $$;
create trigger immutable_luna_campaign_approval before update or delete on ai_private.luna_campaign_approvals for each row execute function ai_private.guard_owner_approval();
create trigger immutable_owner_risk before update or delete on ai_private.owner_risk_acceptances for each row execute function ai_private.guard_owner_approval();
create trigger immutable_owner_stage before update or delete on ai_private.owner_stage_grants for each row execute function ai_private.guard_owner_approval();

do $$ declare item record;begin
 for item in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ai_private'
  and c.relname in ('owner_operators','luna_campaign_proposals','luna_campaign_approvals','luna_evidence','owner_risk_acceptances','owner_stage_grants','luna_cutover') loop
  execute format('alter table ai_private.%I enable row level security',item.relname);
  execute format('revoke all on ai_private.%I from public,anon,authenticated,service_role',item.relname);
 end loop;
 for item in select p.oid::regprocedure signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
  (n.nspname='public' and p.proname in ('ai_owner_access','ai_owner_approve_campaign','ai_owner_accept_risk','ai_owner_revoke'))
  or (n.nspname='ai_private' and p.proname in ('require_owner','validate_luna_campaign_approval','guard_luna_evidence','guard_owner_approval')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',item.signature);
  if item.nspname='public' then execute format('grant execute on function %s to service_role',item.signature);end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
