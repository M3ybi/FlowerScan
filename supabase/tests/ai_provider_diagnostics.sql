do $$ declare item record;safe jsonb;begin
 if not exists(select 1 from information_schema.columns where table_schema='ai_private' and table_name='attempts' and column_name='provider_diagnostics' and is_nullable='YES') then raise exception 'Nullable diagnostics missing';end if;
 safe:=ai_private.safe_provider_diagnostics('{"version":"provider-errors-v1","category":"PROVIDER_INVALID_REQUEST","code":"SECRET","type":"invalid_request_error","param":"reasoning.effort","responseAt":"2026-11-15T19:00:00.000Z","parseStatus":"PARSED","usageState":"MISSING","message":"SECRET"}');
 if safe->>'code'<>'OTHER' or safe ? 'message' or safe->>'param'<>'reasoning.effort' then raise exception 'Unsafe diagnostics';end if;
 if ai_private.safe_provider_diagnostics('[]') is not null or ai_private.safe_provider_diagnostics('{}') is not null then raise exception 'Malformed diagnostics accepted';end if;
 for item in select p.oid,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ai_private' and p.proname in ('safe_provider_diagnostics','finish_attempt_model_v1') loop
  if has_function_privilege('anon',item.oid,'EXECUTE') or has_function_privilege('authenticated',item.oid,'EXECUTE') or has_function_privilege('service_role',item.oid,'EXECUTE') then raise exception 'Private diagnostics helper exposed';end if;
 end loop;
end $$;
