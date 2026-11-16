do $$ declare item record;begin
 for item in select c.oid,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ai_private' and c.relname in ('model_price_rules','model_configurations','model_routes','model_evaluation_runs','model_evaluation_inputs') loop
  if not item.relrowsecurity or has_table_privilege('anon',item.oid,'SELECT') or has_table_privilege('authenticated',item.oid,'SELECT')
   or has_table_privilege('service_role',item.oid,'INSERT') or has_table_privilege('service_role',item.oid,'UPDATE') then raise exception 'Model table access unsafe';end if;
 end loop;
 if (select count(*) from ai_private.model_configurations)<>18 or (select count(*) from ai_private.model_configurations where definition->>'version'='model-config-v1')<>16 or (select count(*) from ai_private.model_routes)<>4
  or exists(select 1 from ai_private.model_routes where enabled or rollout_percent<>0 or active_configuration<>route||':gpt-4o:legacy:v1') then raise exception 'Model registry defaults unsafe';end if;
 for item in select p.oid,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('ai_resolve_model_input','ai_claim_model_operation','ai_claim_image_operation_legacy','ai_start_image_attempt_legacy','ai_finish_attempt_legacy') loop
  if not item.prosecdef or not item.proconfig @> array['search_path=pg_catalog, public, ai_private'] or has_function_privilege('anon',item.oid,'EXECUTE')
   or has_function_privilege('authenticated',item.oid,'EXECUTE') or not has_function_privilege('service_role',item.oid,'EXECUTE') then raise exception 'Model RPC access unsafe';end if;
 end loop;
 if (select count(*) from ai_private.prices where version='openai-standard-2026-11-15')<>3 then raise exception 'Historical GPT4o pricing missing';end if;
end $$;
