do $$
declare item record;
begin
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ai_private'
    and c.relname='prompt_evaluation_inputs' and c.relrowsecurity) then raise exception 'Prompt evaluation RLS missing'; end if;
  if has_table_privilege('anon','ai_private.prompt_evaluation_inputs','SELECT')
    or has_table_privilege('authenticated','ai_private.prompt_evaluation_inputs','SELECT')
    or has_table_privilege('service_role','ai_private.prompt_evaluation_inputs','INSERT')
    or has_table_privilege('service_role','ai_private.prompt_evaluation_inputs','UPDATE') then raise exception 'Prompt evaluation table privileges unsafe'; end if;
  for item in select p.oid,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('ai_resolve_prompt_input','ai_claim_prompt_operation') loop
    if not item.prosecdef or not item.proconfig @> array['search_path=pg_catalog, public, ai_private']
      or has_function_privilege('anon',item.oid,'EXECUTE') or has_function_privilege('authenticated',item.oid,'EXECUTE')
      or not has_function_privilege('service_role',item.oid,'EXECUTE') then raise exception 'Prompt evaluation RPC privileges unsafe'; end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('ai_resolve_prompt_input','ai_claim_prompt_operation'))<>2 then raise exception 'Prompt evaluation RPC missing'; end if;
end $$;
