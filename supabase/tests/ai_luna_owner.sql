do $$declare item record;begin
 if exists(select 1 from ai_private.owner_operators) or exists(select 1 from ai_private.owner_risk_acceptances)
  or exists(select 1 from ai_private.luna_campaign_approvals) or exists(select 1 from ai_private.luna_cutover where committed_at is not null) then
  raise exception 'Luna activation or owner enrollment must remain explicitly disabled on migration';end if;
 if exists(select 1 from ai_private.model_routes where approval_mode<>'NONE' or owner_acceptance_id is not null or route_paused
  or candidate_configuration not like '%:gpt-6-luna:%') then raise exception 'Luna defaults unsafe';end if;
 for item in select c.oid,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ai_private'
  and c.relname in ('owner_operators','luna_campaign_proposals','luna_campaign_approvals','luna_evidence','owner_risk_acceptances','owner_stage_grants','owner_configuration_events','luna_cutover') loop
  if not item.relrowsecurity or has_table_privilege('anon',item.oid,'SELECT') or has_table_privilege('authenticated',item.oid,'SELECT')
   or has_table_privilege('service_role',item.oid,'SELECT') or has_table_privilege('service_role',item.oid,'INSERT') then raise exception 'Owner table access unsafe';end if;
 end loop;
 for item in select p.oid,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and (p.proname like 'ai_owner_%' or p.proname='ai_resolve_safety_configuration') loop
  if not item.prosecdef or not item.proconfig @> array['search_path=pg_catalog, public, ai_private'] or has_function_privilege('anon',item.oid,'EXECUTE')
   or has_function_privilege('authenticated',item.oid,'EXECUTE') or not has_function_privilege('service_role',item.oid,'EXECUTE') then raise exception 'Owner RPC access unsafe';end if;
 end loop;
end $$;
