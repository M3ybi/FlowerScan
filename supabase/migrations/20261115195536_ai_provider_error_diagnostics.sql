begin;
-- Nullable metadata only; no historical backfill, repricing or usage invention.
alter table ai_private.attempts add column provider_diagnostics jsonb;
create function ai_private.safe_provider_diagnostics(value jsonb) returns jsonb
language plpgsql immutable set search_path=pg_catalog as $$
begin
 if value is null or jsonb_typeof(value)<>'object' or octet_length(value::text)>2048 or value->>'version' is distinct from 'provider-errors-v1' then return null;end if;
 return jsonb_build_object('version','provider-errors-v1',
 'category',case when value->>'category'=any(array['PROVIDER_INVALID_REQUEST','PROVIDER_UNSUPPORTED_CONFIGURATION','PROVIDER_AUTHENTICATION','PROVIDER_PERMISSION','PROVIDER_RATE_LIMIT','PROVIDER_INTERNAL','PROVIDER_HTTP_ERROR','PROVIDER_TIMEOUT','PROVIDER_TRANSPORT','PROVIDER_RESULT_INVALID','PROVIDER_MISSING_USAGE','PROVIDER_INCOMPLETE','PROVIDER_CANCELLED','PROVIDER_FAILED','PROVIDER_REFUSED']) then value->>'category' else 'PROVIDER_HTTP_ERROR' end,
 'code',case when value->>'code' is null then null when value->>'code'=any(array['invalid_request_error','invalid_request','invalid_value','invalid_type','missing_required_parameter','unsupported_parameter','unsupported_value','unsupported_model','model_not_found','context_length_exceeded','invalid_image','invalid_image_format','invalid_image_url','invalid_base64_image','image_parse_error','image_too_large','invalid_api_key','permission_denied','insufficient_quota','rate_limit_exceeded','billing_hard_limit_reached','server_error','service_unavailable','slow_down','server_is_overloaded','content_policy_violation','OTHER']) then value->>'code' else 'OTHER' end,'type',case when value->>'type' is null then null when value->>'type'=any(array['invalid_request_error','authentication_error','permission_error','rate_limit_error','server_error','api_error','insufficient_quota','OTHER']) then value->>'type' else 'OTHER' end,'param',case when value->>'param' is null then null when value->>'param'=any(array['model','reasoning','reasoning.effort','reasoning.mode','prompt_cache_options','prompt_cache_options.ttl','prompt_cache_options.mode','text','text.format','text.format.schema','text.format.name','text.format.strict','max_output_tokens','service_tier','store','input','input[].content[].image_url','input[].content[].detail','input[].content[].type','input[].content[].text','OTHER']) then value->>'param' else 'OTHER' end,
 'responseAt',case when jsonb_typeof(value->'responseAt')='string' and value->>'responseAt' ~ '^\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d{3}Z$' then value->>'responseAt' else null end,
 'parseStatus',case when value->>'parseStatus' in ('NOT_RECEIVED','PARSED','MALFORMED','OVERSIZED','INTERRUPTED') then value->>'parseStatus' else 'MALFORMED' end,
 'usageState',case when value->>'usageState'='REPORTED' then 'REPORTED' else 'MISSING' end);
end $$;
alter table ai_private.attempts add constraint provider_diagnostics_allowlist check(provider_diagnostics is null or
 (ai_private.safe_provider_diagnostics(provider_diagnostics) is not null and provider_diagnostics=ai_private.safe_provider_diagnostics(provider_diagnostics)));
create function ai_private.finish_attempt_model_v1(operation uuid,lease uuid,attempt uuid,outcome text,final_result jsonb,facts jsonb) returns jsonb
 language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
declare op ai_private.operations;a ai_private.attempts;r ai_private.model_price_rules;usage jsonb;settled jsonb;
 input_count bigint;cached bigint;writes bigint;w30 bigint;w12 bigint;output_count bigint;total bigint;reasoning bigint;
 amount numeric(24,12);accounting text:='UNKNOWN_USAGE';valid boolean:=false;
begin
 perform ai_private.require_service();perform 1 from ai_private.control where singleton for update;
 select * into op from ai_private.operations where id=operation;
 if not found or lease is null or op.lease_id<>lease then raise exception 'AI_INVALID_OPERATION';end if;
 select * into a from ai_private.attempts where id=attempt and operation_id=op.id;
 if not found then raise exception 'AI_INVALID_OPERATION';end if;
 if a.accounting_status='MEASURED' then
  return public.ai_finish_attempt_legacy(operation,lease,attempt,outcome,final_result,facts);
 end if;
 if op.pricing_version<>'openai-multimodel-2026-11-15' then
  settled:=public.ai_finish_attempt_legacy(operation,lease,attempt,outcome,final_result,facts);
  if op.model_configuration_id is not null then
   update ai_private.attempts set
    cache_write_tokens=case when jsonb_typeof(facts#>'{usage,input_tokens_details,cache_write_tokens}')='number' and facts#>>'{usage,input_tokens_details,cache_write_tokens}' ~ '^\d{1,15}$' then (facts#>>'{usage,input_tokens_details,cache_write_tokens}')::bigint end,
    cache_write_30m_tokens=case when jsonb_typeof(facts#>'{usage,input_tokens_details,cache_write_tokens_details,ttl_30m_tokens}')='number' and facts#>>'{usage,input_tokens_details,cache_write_tokens_details,ttl_30m_tokens}' ~ '^\d{1,15}$' then (facts#>>'{usage,input_tokens_details,cache_write_tokens_details,ttl_30m_tokens}')::bigint end,
    cache_write_12h_tokens=case when jsonb_typeof(facts#>'{usage,input_tokens_details,cache_write_tokens_details,ttl_12h_tokens}')='number' and facts#>>'{usage,input_tokens_details,cache_write_tokens_details,ttl_12h_tokens}' ~ '^\d{1,15}$' then (facts#>>'{usage,input_tokens_details,cache_write_tokens_details,ttl_12h_tokens}')::bigint end
    where id=a.id;
  end if;
  return settled;
 end if;
 -- The original lifecycle/quota/authorization/lease/retention settlement is
 -- unchanged. Price all v2 facts atomically before this transaction returns.
 settled:=public.ai_finish_attempt_legacy(operation,lease,attempt,outcome,final_result,facts);
 usage:=facts->'usage';
 if jsonb_typeof(usage)='object' and jsonb_typeof(usage->'input_tokens')='number' and jsonb_typeof(usage->'output_tokens')='number' and jsonb_typeof(usage->'total_tokens')='number'
  and coalesce(usage->>'input_tokens','') ~ '^\d{1,15}$' and coalesce(usage->>'output_tokens','') ~ '^\d{1,15}$' and coalesce(usage->>'total_tokens','') ~ '^\d{1,15}$'
  and jsonb_typeof(usage#>'{input_tokens_details,cached_tokens}')='number' and coalesce(usage#>>'{input_tokens_details,cached_tokens}','') ~ '^\d{1,15}$'
  and jsonb_typeof(usage#>'{input_tokens_details,cache_write_tokens}')='number' and coalesce(usage#>>'{input_tokens_details,cache_write_tokens}','') ~ '^\d{1,15}$' then
  input_count:=(usage->>'input_tokens')::bigint;output_count:=(usage->>'output_tokens')::bigint;total:=(usage->>'total_tokens')::bigint;
  cached:=(usage#>>'{input_tokens_details,cached_tokens}')::bigint;writes:=(usage#>>'{input_tokens_details,cache_write_tokens}')::bigint;
  if jsonb_typeof(usage#>'{output_tokens_details,reasoning_tokens}')='number' and coalesce(usage#>>'{output_tokens_details,reasoning_tokens}','') ~ '^\d{1,15}$' then reasoning:=(usage#>>'{output_tokens_details,reasoning_tokens}')::bigint;end if;
  if writes=0 and not (usage#>'{input_tokens_details}' ? 'cache_write_tokens_details') then w30:=0;w12:=0;
  elsif jsonb_typeof(usage#>'{input_tokens_details,cache_write_tokens_details,ttl_30m_tokens}')='number'
   and jsonb_typeof(usage#>'{input_tokens_details,cache_write_tokens_details,ttl_12h_tokens}')='number'
   and coalesce(usage#>>'{input_tokens_details,cache_write_tokens_details,ttl_30m_tokens}','') ~ '^\d{1,15}$'
   and coalesce(usage#>>'{input_tokens_details,cache_write_tokens_details,ttl_12h_tokens}','') ~ '^\d{1,15}$' then
   w30:=(usage#>>'{input_tokens_details,cache_write_tokens_details,ttl_30m_tokens}')::bigint;w12:=(usage#>>'{input_tokens_details,cache_write_tokens_details,ttl_12h_tokens}')::bigint;
  end if;
  valid:=w30 is not null and w12 is not null and w30+w12=writes and cached+writes<=input_count and total=input_count+output_count
   and (reasoning is null or reasoning<=output_count) and input_count<=1050000 and output_count<=op.max_output_tokens;
 end if;
 if valid then
  select * into r from ai_private.model_price_rules where version=op.pricing_version and model=facts->>'model' and service_tier=facts->>'serviceTier';
  if found and r.requested_model=op.requested_model then
   amount:=ai_private.model_quote(op.pricing_version,facts->>'model',facts->>'serviceTier',input_count,cached,w30,w12,output_count,'global');
  end if;
  accounting:=case when amount is null then 'UNKNOWN_PRICING' else 'MEASURED' end;
 end if;
 update ai_private.attempts set input_tokens=input_count,cached_input_tokens=cached,output_tokens=output_count,total_tokens=total,reasoning_tokens=reasoning,
  cache_write_tokens=writes,cache_write_30m_tokens=w30,cache_write_12h_tokens=w12,
  returned_reasoning_effort=case when facts->>'reasoningEffort' in ('none','low','medium','high','xhigh','max') then facts->>'reasoningEffort' end,
  accounting_status=accounting,cost_usd=amount where id=a.id;
 if amount>op.reserved_usd then
  update ai_private.attempts set failure_category='AI_EXPOSURE_BOUND_EXCEEDED' where id=a.id;
  update ai_private.model_routes set enabled=false,rollout_percent=0 where candidate_configuration=op.model_configuration_id;
  if op.model_campaign_id is not null then update ai_private.model_evaluation_runs set stopped_at=coalesce(stopped_at,now()) where id=op.model_campaign_id;end if;
 end if;
 return settled||jsonb_build_object('accountingStatus',accounting,'costUsd',amount::text);
end $$;
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
 return settled;
end $$;
revoke all on function ai_private.safe_provider_diagnostics(jsonb) from public,anon,authenticated,service_role;
revoke all on function ai_private.finish_attempt_model_v1(uuid,uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ai_finish_attempt(uuid,uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ai_finish_attempt(uuid,uuid,uuid,text,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
