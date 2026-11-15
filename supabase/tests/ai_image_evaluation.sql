-- Metadata/grants checked on both a clean stack and a production-shaped upgrade.
do $$
declare name text; item record;
begin
  foreach name in array array['vision_evaluation_runs','vision_evaluation_inputs'] loop
    if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='ai_private' and c.relname=name and c.relrowsecurity) then raise exception 'Evaluation RLS missing'; end if;
    if has_table_privilege('anon','ai_private.'||name,'SELECT') or has_table_privilege('authenticated','ai_private.'||name,'SELECT')
      or has_table_privilege('service_role','ai_private.'||name,'INSERT') or has_table_privilege('service_role','ai_private.'||name,'UPDATE') then
      raise exception 'Evaluation table privilege escalation';
    end if;
  end loop;
  for item in select p.oid,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('ai_resolve_vision_input','ai_claim_image_operation','ai_start_image_attempt') loop
    if not item.prosecdef or not item.proconfig @> array['search_path=pg_catalog, public, ai_private']
      or has_function_privilege('anon',item.oid,'EXECUTE') or has_function_privilege('authenticated',item.oid,'EXECUTE')
      or not has_function_privilege('service_role',item.oid,'EXECUTE') then raise exception 'Evaluation RPC privileges unsafe'; end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('ai_resolve_vision_input','ai_claim_image_operation','ai_start_image_attempt'))<>3 then raise exception 'Evaluation RPC missing'; end if;
end $$;
