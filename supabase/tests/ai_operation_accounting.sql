-- Disposable replay/upgrade fixture only; never a linked production mutation.
do $$
declare item record;
begin
  for item in select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='ai_private' and c.relkind='r' loop
    if not item.relrowsecurity then raise exception 'AI accounting table lacks RLS: %',item.relname; end if;
  end loop;
  if has_schema_privilege('anon','ai_private','USAGE') or has_schema_privilege('authenticated','ai_private','USAGE') then
    raise exception 'Client can access private AI schema';
  end if;
  for item in select p.oid,p.proname,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'ai_%' loop
    if has_function_privilege('anon',item.oid,'EXECUTE') or has_function_privilege('authenticated',item.oid,'EXECUTE')
      or not has_function_privilege('service_role',item.oid,'EXECUTE') then raise exception 'AI RPC grants invalid: %',item.proname; end if;
    if not item.proconfig @> array['search_path=pg_catalog, public, ai_private'] then raise exception 'AI RPC search path invalid: %',item.proname; end if;
  end loop;
  if not exists(select 1 from ai_private.prices where model='gpt-4o' and service_tier='default'
    and version='openai-standard-2026-11-15' and input_usd_per_million=2.50 and cached_usd_per_million=1.25 and output_usd_per_million=10) then
    raise exception 'Verified standard GPT-4o price missing';
  end if;
  if not exists(select 1 from ai_private.control where singleton and max_attempts=1 and account_concurrency=1 and household_concurrency=2
    and global_concurrency=8 and inflight_limit_usd>0 and daily_warning_usd<daily_emergency_usd and daily_emergency_usd<=monthly_emergency_usd) then
    raise exception 'Financial safeguard defaults invalid';
  end if;
end $$;
