begin;

-- Private bookkeeping is not a client quota or a replacement entitlement source.
create schema ai_private;
revoke all on schema ai_private from public, anon, authenticated;
grant usage on schema ai_private to service_role;

create table ai_private.prices (
  version text not null,
  model text not null,
  service_tier text not null,
  effective_from timestamptz not null,
  input_usd_per_million numeric(16,8) not null check (input_usd_per_million >= 0),
  cached_usd_per_million numeric(16,8) not null check (cached_usd_per_million >= 0),
  output_usd_per_million numeric(16,8) not null check (output_usd_per_million >= 0),
  context_tokens integer not null check (context_tokens > 0),
  source_url text not null,
  primary key (version, model, service_tier)
);
-- Effective date is our verified registry date, not an invented provider change date.
insert into ai_private.prices
select 'openai-standard-2026-11-15', model, 'default', '2026-11-15T00:00:00Z',
  2.50, 1.25, 10.00, 128000, 'https://developers.openai.com/api/docs/models/gpt-4o'
from unnest(array['gpt-4o','gpt-4o-2024-08-06','gpt-4o-2024-11-20']) model;

create table ai_private.control (
  singleton boolean primary key default true check (singleton),
  paused boolean not null default false,
  account_concurrency integer not null default 1 check (account_concurrency between 1 and 10),
  household_concurrency integer not null default 2 check (household_concurrency between 1 and 20),
  global_concurrency integer not null default 8 check (global_concurrency between 1 and 100),
  account_per_minute integer not null default 10 check (account_per_minute between 1 and 100),
  pending_plants integer not null default 3 check (pending_plants between 1 and 20),
  max_attempts integer not null default 1 check (max_attempts between 1 and 3),
  inflight_limit_usd numeric(24,12) not null default 5 check (inflight_limit_usd > 0),
  daily_warning_usd numeric(24,12) not null default 5 check (daily_warning_usd > 0),
  daily_emergency_usd numeric(24,12) not null default 25 check (daily_emergency_usd > 0),
  monthly_emergency_usd numeric(24,12) not null default 100 check (monthly_emergency_usd > 0)
);
insert into ai_private.control(singleton) values (true);

create table ai_private.operations (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  household_id uuid references public.households(id) on delete set null,
  scope_key text not null,
  plant_id uuid references public.plants(id) on delete set null,
  pending_plant_id uuid,
  linked_plant_id uuid references public.plants(id) on delete set null,
  operation_type text not null check (operation_type in ('initial_care','care_refresh','diagnosis','image_validation','upload_validation')),
  idempotency_key text not null check (length(idempotency_key) between 1 and 160),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  image_hash text not null check (image_hash ~ '^[0-9a-f]{64}$'),
  state text not null check (state in ('RESERVED','PROCESSING','COMPLETED','FAILED','UNKNOWN','EXPIRED')),
  lease_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  lease_expires_at timestamptz not null default now() + interval '90 seconds',
  finished_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null check (max_attempts between 1 and 3),
  premium_at_claim boolean not null,
  reserved_usd numeric(24,12) not null check (reserved_usd >= 0),
  requested_model text not null,
  pricing_version text not null,
  prompt_version text not null check (length(prompt_version) between 1 and 80),
  max_output_tokens integer not null check (max_output_tokens between 1 and 4096),
  image_width integer not null check (image_width between 1 and 1600),
  image_height integer not null check (image_height between 1 and 1600),
  image_detail text not null default 'high' check (image_detail = 'high'),
  reservation_id uuid,
  free_care_day date,
  result jsonb,
  final_outcome text check (final_outcome in ('SUCCEEDED','SAFETY_REJECTED','FAILED','UNKNOWN','EXPIRED')),
  failure_category text check (failure_category ~ '^[A-Z_]{1,64}$'),
  check (result is null or octet_length(result::text) <= 65536)
);
create unique index ai_operation_key on ai_private.operations(actor_id, scope_key, operation_type, idempotency_key) where state <> 'EXPIRED';
create unique index ai_operation_fingerprint on ai_private.operations(actor_id, scope_key, operation_type, fingerprint) where state <> 'EXPIRED';
create unique index ai_free_care_slot on ai_private.operations(household_id, plant_id, free_care_day)
  where free_care_day is not null and state in ('RESERVED','PROCESSING','COMPLETED');
create index ai_operations_active on ai_private.operations(state, lease_expires_at) where state in ('RESERVED','PROCESSING');
create index ai_operations_actor_time on ai_private.operations(actor_id, created_at);
create index ai_operations_household on ai_private.operations(household_id, operation_type, created_at);
create index ai_operations_expiry on ai_private.operations(expires_at) where result is not null or state in ('COMPLETED','FAILED','UNKNOWN');
create index ai_operations_pending on ai_private.operations(household_id,expires_at) where operation_type='initial_care' and linked_plant_id is null and state in ('RESERVED','PROCESSING','COMPLETED','UNKNOWN');
create index ai_operations_safety on ai_private.operations(actor_id, fingerprint, expires_at) where operation_type in ('image_validation','upload_validation');

create table ai_private.attempts (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references ai_private.operations(id),
  attempt_number integer not null check (attempt_number > 0),
  requested_model text not null,
  returned_model text,
  service_tier text,
  provider_request_id text,
  provider_response_id text,
  pricing_version text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  latency_ms bigint check (latency_ms >= 0),
  http_status integer check (http_status between 100 and 599),
  provider_status text,
  failure_category text check (failure_category ~ '^[A-Z_]{1,64}$'),
  input_tokens bigint check (input_tokens >= 0),
  cached_input_tokens bigint check (cached_input_tokens >= 0),
  output_tokens bigint check (output_tokens >= 0),
  reasoning_tokens bigint check (reasoning_tokens >= 0),
  total_tokens bigint check (total_tokens >= 0),
  accounting_status text not null default 'IN_FLIGHT' check (accounting_status in ('IN_FLIGHT','MEASURED','UNKNOWN_USAGE','UNKNOWN_PRICING')),
  cost_usd numeric(24,12) check (cost_usd >= 0),
  exposure_usd numeric(24,12) not null check (exposure_usd >= 0),
  unique(operation_id, attempt_number),
  check (cost_usd is null or accounting_status = 'MEASURED')
);
create index ai_attempts_financial on ai_private.attempts(started_at, accounting_status);
create index ai_attempts_unreconciled on ai_private.attempts(accounting_status) where accounting_status <> 'MEASURED';

create table ai_private.image_bindings (
  path text primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  image_hash text not null check (image_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index ai_image_bindings_expiry on ai_private.image_bindings(created_at);

alter table ai_private.prices enable row level security;
alter table ai_private.control enable row level security;
alter table ai_private.operations enable row level security;
alter table ai_private.attempts enable row level security;
alter table ai_private.image_bindings enable row level security;
revoke all on all tables in schema ai_private from public, anon, authenticated, service_role;
grant select on all tables in schema ai_private to service_role;

create function ai_private.require_service() returns void language plpgsql set search_path = pg_catalog as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Trusted AI service required' using errcode = '42501'; end if;
end $$;

create function ai_private.authorize(actor uuid, household uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public, ai_private as $$
begin
  if actor is null or not exists(select 1 from auth.users where id = actor) then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if household is not null and not exists (
    select 1 from public.household_members m where m.household_id = household and m.user_id = actor
      and m.status = 'active' and (m.role = 'owner' or public.is_household_premium_at(household, now()))
  ) then raise exception 'HOUSEHOLD_ACCESS_DENIED' using errcode = '42501'; end if;
end $$;

-- Called under the singleton lock. Unknown spend remains financially reserved;
-- only customer quota/concurrency leases are released after a lost worker.
create function ai_private.reconcile() returns void
language plpgsql security definer set search_path = pg_catalog, public, ai_private as $$
declare op ai_private.operations;
begin
  for op in select * from ai_private.operations where state in ('RESERVED','PROCESSING') and lease_expires_at <= now() order by household_id nulls first, id loop
    if op.household_id is not null then
      perform 1 from public.households where id = op.household_id for update skip locked;
      if not found then continue; end if;
    end if;
    if op.reservation_id is not null then
      perform public.release_ai_analyze_reservation(op.household_id, op.reservation_id, 'plant_unwell_ai_analyze');
    end if;
    update ai_private.attempts set accounting_status = 'UNKNOWN_USAGE', failure_category = 'WORKER_EXPIRED', completed_at = now()
      where operation_id = op.id and accounting_status = 'IN_FLIGHT';
    update ai_private.operations set state = case when attempt_count > 0 then 'UNKNOWN' else 'EXPIRED' end,
      final_outcome = case when attempt_count > 0 then 'UNKNOWN' else 'EXPIRED' end,
      failure_category = 'WORKER_EXPIRED', finished_at = now(), result = null where id = op.id;
  end loop;
  with expired as (
    select id from ai_private.operations where expires_at <= now()
      and (state in ('FAILED','UNKNOWN') or (state = 'COMPLETED' and (free_care_day is null or free_care_day < (now() at time zone 'UTC')::date))) for update skip locked
  ) update ai_private.operations o set state = 'EXPIRED',result = null from expired e where o.id=e.id;
  -- Results have short retention; accounting/tombstones remain for 90 days.
  with expired_results as (
    select id from ai_private.operations where expires_at <= now() and result is not null for update skip locked
  ) update ai_private.operations o set result=null from expired_results e where o.id=e.id;
  delete from ai_private.image_bindings where created_at < now() - interval '2 days';
end $$;

create function public.ai_claim_operation(
  actor uuid, household uuid, plant uuid, kind text, retry_key text, request_fingerprint text, image_sha256 text,
  model_name text, prompt_schema_version text, output_limit integer, image_width integer, image_height integer
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public, ai_private as $$
declare
  cfg ai_private.control; op ai_private.operations; price ai_private.prices; premium boolean := false;
  estimate numeric(24,12); exposure numeric(24,12); daily numeric(24,12); monthly numeric(24,12);
  scope text := coalesce(household::text, 'account'); pending integer; used integer; held integer; period timestamptz; reservation uuid;
  request_operation text; request_limit integer; admitted integer;
begin
  perform ai_private.require_service();
  if kind not in ('initial_care','care_refresh','diagnosis','image_validation','upload_validation')
    or request_fingerprint is null or request_fingerprint !~ '^[0-9a-f]{64}$'
    or image_sha256 is null or image_sha256 !~ '^[0-9a-f]{64}$'
    or retry_key is null or retry_key !~ '^[A-Za-z0-9:_-]{1,160}$'
    or prompt_schema_version is null or length(prompt_schema_version) not between 1 and 80
    or output_limit is null or output_limit not between 1 and 4096
    or image_width is null or image_width not between 1 and 1600
    or image_height is null or image_height not between 1 and 1600
    or (kind <> 'image_validation' and household is null) then raise exception 'AI_INVALID_OPERATION'; end if;
  select * into cfg from ai_private.control where singleton for update;
  if household is not null then perform 1 from public.households where id = household for update; end if;
  perform ai_private.reconcile();
  perform ai_private.authorize(actor, household);
  if (kind = 'care_refresh' or plant is not null) and not exists(select 1 from public.plants where id = plant and household_id = household and not is_removed) then
    raise exception 'HOUSEHOLD_ACCESS_DENIED' using errcode = '42501';
  end if;
  select * into op from ai_private.operations where actor_id = actor and scope_key = scope and operation_type = kind
    and state <> 'EXPIRED' and (idempotency_key = retry_key or fingerprint = request_fingerprint) order by created_at limit 1;
  if found then
    if op.fingerprint <> request_fingerprint then raise exception 'AI_IDEMPOTENCY_CONFLICT'; end if;
    if op.state = 'COMPLETED' and op.result is not null then return jsonb_build_object('decision','REPLAY','operationId',op.id,'result',op.result); end if;
    return jsonb_build_object('decision',case when op.state in ('RESERVED','PROCESSING') then 'WAIT' else 'STOP' end,
      'operationId',op.id,'state',op.state,'failure',coalesce(op.failure_category,'AI_RESULT_UNCERTAIN'));
  end if;
  -- A safety result can be reused by upload without a client receipt/secret.
  -- Authorization above still applies to the target household on every request.
  if kind in ('image_validation','upload_validation') then
    select * into op from ai_private.operations where actor_id = actor and fingerprint = request_fingerprint
      and operation_type in ('image_validation','upload_validation') and state = 'COMPLETED' and expires_at > now() and result is not null limit 1;
    if found then return jsonb_build_object('decision','REPLAY','operationId',op.id,'result',op.result); end if;
  end if;
  if cfg.paused then raise exception 'AI_CIRCUIT_OPEN'; end if;
  if (select count(*) from ai_private.operations where actor_id = actor and state in ('RESERVED','PROCESSING')) >= cfg.account_concurrency
    or (household is not null and (select count(*) from ai_private.operations where household_id = household and state in ('RESERVED','PROCESSING')) >= cfg.household_concurrency)
    or (select count(*) from ai_private.operations where state in ('RESERVED','PROCESSING')) >= cfg.global_concurrency then raise exception 'AI_BUSY'; end if;
  if (select count(*) from ai_private.operations where actor_id = actor and created_at > now() - interval '1 minute') >= cfg.account_per_minute then raise exception 'AI_RATE_LIMITED'; end if;
  -- Existing hourly anti-abuse ceilings apply to fresh inference, not retrieval
  -- of a completed result. Upload's existing request gate also covers Storage.
  if kind <> 'upload_validation' then
    request_operation := case kind when 'image_validation' then 'validation' when 'diagnosis' then 'diagnosis' else 'care' end;
    request_limit := case request_operation when 'validation' then 60 else 30 end;
    insert into public.image_operation_limits as limits(user_id,operation,requests) values(actor,request_operation,1)
      on conflict(user_id,operation) do update set
        requests = case when limits.window_started <= now() - interval '1 hour' then 1 else limits.requests + 1 end,
        window_started = case when limits.window_started <= now() - interval '1 hour' then now() else limits.window_started end
      where limits.window_started <= now() - interval '1 hour' or limits.requests < request_limit returning requests into admitted;
    if admitted is null then raise exception 'IMAGE_RATE_LIMITED'; end if;
  end if;
  select * into price from ai_private.prices where model = model_name and service_tier = 'default' and effective_from <= now() order by effective_from desc limit 1;
  if not found then raise exception 'AI_PRICING_UNAVAILABLE'; end if;
  -- Reserve the entire model context at uncached rates, not a byte/token guess.
  estimate := (price.context_tokens * price.input_usd_per_million + output_limit * price.output_usd_per_million) / 1000000;
  select coalesce(sum(cost_usd)
      filter(where accounting_status = 'MEASURED' and started_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),0),
    coalesce(sum(cost_usd)
      filter(where accounting_status = 'MEASURED' and started_at >= date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'),0),
    coalesce(sum(exposure_usd) filter(where accounting_status <> 'MEASURED'),0)
    into daily, monthly, exposure from ai_private.attempts
    where started_at >= date_trunc('month',now() at time zone 'UTC') at time zone 'UTC' or accounting_status <> 'MEASURED';
  -- RESERVED operations have not yet created their provider attempt row.
  select exposure + coalesce(sum(reserved_usd),0) into exposure from ai_private.operations where state = 'RESERVED';
  if exposure + estimate > cfg.inflight_limit_usd or daily + exposure + estimate > cfg.daily_emergency_usd
    or monthly + exposure + estimate > cfg.monthly_emergency_usd then raise exception 'AI_CIRCUIT_OPEN'; end if;
  if household is not null then premium := public.is_household_premium_at(household,now()); end if;
  if kind = 'initial_care' then
    select count(*) into pending from ai_private.operations where household_id = household and operation_type = 'initial_care'
      and linked_plant_id is null and expires_at > now() and state in ('RESERVED','PROCESSING','COMPLETED','UNKNOWN');
    if pending >= cfg.pending_plants then raise exception 'AI_PENDING_PLANTS'; end if;
    if not premium and (select count(*) from public.plants where household_id = household and not is_removed) + pending >= public.free_household_plants_limit() then raise exception 'AI_PLANT_LIMIT'; end if;
  elsif kind = 'care_refresh' and not premium then
    if exists(select 1 from public.plant_care_tip_generations where household_id = household and plant_id = plant and generation_source <> 'initial_plant_add'
      and generated_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')
      or exists(select 1 from ai_private.operations where household_id = household and plant_id = plant and free_care_day = (now() at time zone 'UTC')::date
        and state in ('RESERVED','PROCESSING','COMPLETED')) then raise exception 'AI_CARE_LIMIT'; end if;
  elsif kind = 'diagnosis' and not premium then
    perform public.expire_ai_analyze_reservations(household);
    period := public.household_usage_period_start();
    select coalesce(c.used_count,0),coalesce(c.reserved_count,0) into used,held from (select 1) s
      left join public.household_usage_counters c on c.household_id = household and c.usage_type = 'plant_unwell_ai_analyze' and c.period_start = period;
    if used + held >= public.free_household_ai_analyzes_monthly_limit() then raise exception 'AI_DIAGNOSIS_LIMIT'; end if;
    insert into public.household_usage_counters(household_id,usage_type,period_start,period_end,reserved_count,limit_count,last_reset_at)
      values(household,'plant_unwell_ai_analyze',period,public.household_usage_period_end(),1,public.free_household_ai_analyzes_monthly_limit(),period)
      on conflict(household_id,usage_type,period_start) do update set reserved_count = public.household_usage_counters.reserved_count + 1, updated_at = now();
    insert into public.household_usage_reservations(household_id,usage_type,period_start,source)
      values(household,'plant_unwell_ai_analyze',period,'plant_unwell_flow') returning id into reservation;
  end if;
  insert into ai_private.operations(actor_id,household_id,scope_key,plant_id,pending_plant_id,operation_type,idempotency_key,fingerprint,image_hash,state,
    expires_at,max_attempts,premium_at_claim,reserved_usd,requested_model,pricing_version,prompt_version,max_output_tokens,image_width,image_height,reservation_id,free_care_day)
    values(actor,household,scope,plant,case when kind = 'initial_care' then gen_random_uuid() end,kind,retry_key,request_fingerprint,image_sha256,'RESERVED',
      now() + case when kind in ('image_validation','upload_validation') then interval '5 minutes' when kind = 'diagnosis' then interval '15 minutes' else interval '24 hours' end,
      cfg.max_attempts,premium,estimate,model_name,price.version,prompt_schema_version,output_limit,image_width,image_height,reservation,
      case when kind = 'care_refresh' and not premium then (now() at time zone 'UTC')::date end) returning * into op;
  return jsonb_build_object('decision','RUN','operationId',op.id,'leaseId',op.lease_id,'warning',daily + estimate >= cfg.daily_warning_usd);
end $$;

create function public.ai_start_attempt(operation uuid, lease uuid) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, ai_private as $$
declare op ai_private.operations; attempt uuid;
begin
  perform ai_private.require_service();
  perform 1 from ai_private.control where singleton for update;
  select * into op from ai_private.operations where id = operation;
  if not found then raise exception 'AI_INVALID_OPERATION'; end if;
  if op.household_id is not null then perform 1 from public.households where id = op.household_id for update; end if;
  perform ai_private.authorize(op.actor_id,op.household_id);
  if (select paused from ai_private.control where singleton) then raise exception 'AI_CIRCUIT_OPEN'; end if;
  if lease is null or op.lease_id <> lease or op.state <> 'RESERVED' or op.lease_expires_at <= now() or op.attempt_count >= op.max_attempts then raise exception 'AI_OPERATION_UNAVAILABLE'; end if;
  if op.household_id is not null and op.premium_at_claim is distinct from public.is_household_premium_at(op.household_id,now()) then raise exception 'AI_OPERATION_UNAVAILABLE'; end if;
  if op.operation_type = 'initial_care' and not op.premium_at_claim and (select count(*) from public.plants where household_id = op.household_id and not is_removed) >= public.free_household_plants_limit() then raise exception 'AI_PLANT_LIMIT'; end if;
  if op.operation_type = 'care_refresh' and not exists(select 1 from public.plants where id = op.plant_id and household_id = op.household_id and not is_removed) then raise exception 'HOUSEHOLD_ACCESS_DENIED'; end if;
  insert into ai_private.attempts(operation_id,attempt_number,requested_model,pricing_version,exposure_usd)
    values(op.id,op.attempt_count + 1,op.requested_model,op.pricing_version,op.reserved_usd) returning id into attempt;
  update ai_private.operations set state = 'PROCESSING', attempt_count = attempt_count + 1 where id = op.id;
  return attempt;
end $$;

-- Usage and prices are calculated here; callers cannot submit a dollar amount.
create function public.ai_finish_attempt(operation uuid, lease uuid, attempt uuid, outcome text, final_result jsonb, facts jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, ai_private as $$
declare op ai_private.operations; a ai_private.attempts; price ai_private.prices; usage jsonb;
  input_count bigint; cached bigint; output_count bigint; reasoning bigint; total bigint;
  measured boolean := false; accounting text := 'UNKNOWN_USAGE'; amount numeric(24,12); failure text; allowed boolean := true; financial_only boolean := false;
begin
  perform ai_private.require_service();
  perform 1 from ai_private.control where singleton for update;
  select * into op from ai_private.operations where id = operation;
  if not found or lease is null or op.lease_id <> lease then raise exception 'AI_INVALID_OPERATION'; end if;
  if op.household_id is not null then perform 1 from public.households where id = op.household_id for update; end if;
  select * into a from ai_private.attempts where id = attempt and operation_id = op.id;
  if not found then raise exception 'AI_INVALID_OPERATION'; end if;
  if a.accounting_status = 'MEASURED' then return jsonb_build_object('state',op.state); end if;
  financial_only := a.accounting_status in ('UNKNOWN_USAGE','UNKNOWN_PRICING') and op.state in ('UNKNOWN','FAILED','COMPLETED','EXPIRED');
  if (not financial_only and op.state <> 'PROCESSING') or outcome is null or outcome not in ('COMPLETED','FAILED','UNKNOWN') or facts is null or jsonb_typeof(facts) <> 'object'
    or (outcome = 'COMPLETED' and (final_result is null or jsonb_typeof(final_result) <> 'object' or octet_length(final_result::text) > 65536)) then raise exception 'AI_INVALID_SETTLEMENT'; end if;
  failure := facts->>'failureCategory';
  if failure is not null and failure !~ '^[A-Z_]{1,64}$' then raise exception 'AI_INVALID_SETTLEMENT'; end if;
  usage := facts->'usage';
  if jsonb_typeof(usage) = 'object'
    and coalesce(usage->>'input_tokens','') ~ '^\d{1,15}$' and coalesce(usage#>>'{input_tokens_details,cached_tokens}','') ~ '^\d{1,15}$'
    and coalesce(usage->>'output_tokens','') ~ '^\d{1,15}$' and coalesce(usage->>'total_tokens','') ~ '^\d{1,15}$' then
    input_count := (usage->>'input_tokens')::bigint; cached := (usage#>>'{input_tokens_details,cached_tokens}')::bigint;
    output_count := (usage->>'output_tokens')::bigint; total := (usage->>'total_tokens')::bigint;
    if coalesce(usage#>>'{output_tokens_details,reasoning_tokens}','') ~ '^\d{1,15}$' then reasoning := (usage#>>'{output_tokens_details,reasoning_tokens}')::bigint; end if;
    measured := cached <= input_count and total = input_count + output_count and (reasoning is null or reasoning <= output_count)
      and coalesce(usage#>>'{input_tokens_details,cache_write_tokens}','0') = '0';
  end if;
  if measured then
    select * into price from ai_private.prices where version = op.pricing_version and model = facts->>'model' and service_tier = facts->>'serviceTier';
    if found then
      accounting := 'MEASURED';
      amount := ((input_count - cached) * price.input_usd_per_million + cached * price.cached_usd_per_million + output_count * price.output_usd_per_million) / 1000000;
    else accounting := 'UNKNOWN_PRICING'; end if;
  end if;
  update ai_private.attempts set returned_model = left(facts->>'model',100), service_tier = left(facts->>'serviceTier',32),
    provider_request_id = left(facts->>'requestId',200),provider_response_id = left(facts->>'responseId',200),
    completed_at = now(),latency_ms = case when facts->>'latencyMs' ~ '^\d{1,12}$' then (facts->>'latencyMs')::bigint end,
    http_status = case when facts->>'httpStatus' ~ '^[1-5]\d{2}$' then (facts->>'httpStatus')::integer end,
    provider_status = left(facts->>'providerStatus',32),failure_category = failure,
    input_tokens = input_count,cached_input_tokens = cached,output_tokens = output_count,reasoning_tokens = reasoning,total_tokens = total,
    accounting_status = accounting,cost_usd = amount where id = a.id;
  if financial_only then return jsonb_build_object('state',op.state,'accountingStatus',accounting,'costUsd',amount::text); end if;
  -- Authorization is checked again before exposing/settling a generated result.
  begin perform ai_private.authorize(op.actor_id,op.household_id);
  exception when insufficient_privilege then allowed := false; end;
  if not allowed then outcome := 'FAILED'; failure := 'HOUSEHOLD_ACCESS_DENIED'; final_result := null; end if;
  if outcome = 'COMPLETED' and op.free_care_day is not null then
    if not exists(select 1 from public.plants where id = op.plant_id and household_id = op.household_id and not is_removed)
      or exists(select 1 from public.plant_care_tip_generations where household_id = op.household_id and plant_id = op.plant_id and generation_source <> 'initial_plant_add'
        and (generated_at at time zone 'UTC')::date = op.free_care_day) then
      outcome := 'FAILED'; failure := 'AI_CARE_LIMIT'; final_result := null;
    else
      insert into public.plant_care_tip_generations(household_id,plant_id,tip_type,generation_source,generated_at)
        values(op.household_id,op.plant_id,'ai_care_tip','manual_refresh',op.created_at);
    end if;
  end if;
  if op.reservation_id is not null then
    if outcome = 'COMPLETED' then
      -- An expired monthly lease must not turn into an uncharged success.
      if exists(select 1 from public.household_usage_reservations where id = op.reservation_id and status = 'reserved') then
        perform public.commit_ai_analyze_usage(op.household_id,op.reservation_id,'plant_unwell_ai_analyze','plant_unwell_flow');
      else outcome := 'FAILED'; failure := 'AI_RESERVATION_EXPIRED'; final_result := null; end if;
    else perform public.release_ai_analyze_reservation(op.household_id,op.reservation_id,'plant_unwell_ai_analyze'); end if;
  end if;
  update ai_private.operations set state = outcome,finished_at = now(),result = case when outcome = 'COMPLETED' then final_result end,
    final_outcome = case when outcome <> 'COMPLETED' then outcome
      when op.operation_type in ('image_validation','upload_validation') and final_result->'validation' = 'null'::jsonb then 'SAFETY_REJECTED' else 'SUCCEEDED' end,
    failure_category = failure,
    expires_at = case when outcome = 'FAILED' then least(expires_at,now() + interval '30 seconds') else expires_at end where id = op.id;
  return jsonb_build_object('state',outcome,'accountingStatus',accounting,'costUsd',amount::text);
end $$;

create function public.ai_reconcile_attempt(attempt uuid, verified_facts jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, ai_private as $$
declare op ai_private.operations; reconciled jsonb;
begin
  perform ai_private.require_service();
  select o.* into op from ai_private.operations o join ai_private.attempts a on a.operation_id = o.id where a.id = attempt;
  if not found or op.state in ('RESERVED','PROCESSING') then raise exception 'AI_RECONCILIATION_UNAVAILABLE'; end if;
  reconciled := public.ai_finish_attempt(op.id,op.lease_id,attempt,'UNKNOWN',null,verified_facts);
  if reconciled->>'accountingStatus' = 'MEASURED' and op.state = 'UNKNOWN' then
    update ai_private.operations set state = 'EXPIRED',result = null,expires_at = now() where id = op.id and state = 'UNKNOWN';
  end if;
  return reconciled;
end $$;

create function public.ai_bind_uploaded_image(actor uuid, household uuid, object_path text, image_sha256 text) returns void
language plpgsql security definer set search_path = pg_catalog, public, ai_private as $$
begin
  perform ai_private.require_service();
  perform ai_private.authorize(actor,household);
  if object_path not like household::text || '/plants/%/original.jpg' or image_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'AI_INVALID_OPERATION'; end if;
  insert into ai_private.image_bindings(path,household_id,actor_id,image_hash) values(object_path,household,actor,image_sha256)
    on conflict(path) do update set image_hash = excluded.image_hash,actor_id = excluded.actor_id,created_at = now();
end $$;

create function ai_private.link_created_plant() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, ai_private as $$
declare operation uuid;
begin
  select o.id into operation from ai_private.operations o join ai_private.image_bindings b
    on b.path = new.image_path and b.household_id = new.household_id and b.image_hash = o.image_hash and b.actor_id = o.actor_id
    where o.household_id = new.household_id and o.operation_type = 'initial_care' and o.state = 'COMPLETED' and o.linked_plant_id is null
    and o.expires_at > now() order by o.created_at limit 1;
  if operation is not null then update ai_private.operations set linked_plant_id = new.id where id = operation and linked_plant_id is null; end if;
  return new;
end $$;
create trigger ai_link_created_plant after insert on public.plants for each row execute function ai_private.link_created_plant();

-- Trusted maintenance preserves unknown exposure until a reviewed reconciliation.
-- No timer may guess that an unreported attempt was free.
create function public.ai_maintain_operations() returns void language plpgsql security definer set search_path = pg_catalog, public, ai_private as $$
begin
  perform ai_private.require_service();
  perform 1 from ai_private.control where singleton for update;
  perform ai_private.reconcile();
  delete from ai_private.attempts a using ai_private.operations o where a.operation_id = o.id
    and o.created_at < now() - interval '90 days' and o.state in ('COMPLETED','FAILED','EXPIRED') and a.accounting_status = 'MEASURED';
  delete from ai_private.operations o where o.created_at < now() - interval '90 days' and o.state in ('COMPLETED','FAILED','EXPIRED')
    and not exists(select 1 from ai_private.attempts a where a.operation_id = o.id);
end $$;

revoke all on all functions in schema ai_private from public, anon, authenticated, service_role;
revoke all on function public.ai_claim_operation(uuid,uuid,uuid,text,text,text,text,text,text,integer,integer,integer) from public,anon,authenticated;
revoke all on function public.ai_start_attempt(uuid,uuid) from public,anon,authenticated;
revoke all on function public.ai_finish_attempt(uuid,uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.ai_bind_uploaded_image(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.ai_maintain_operations() from public,anon,authenticated;
revoke all on function public.ai_reconcile_attempt(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ai_claim_operation(uuid,uuid,uuid,text,text,text,text,text,text,integer,integer,integer) to service_role;
grant execute on function public.ai_start_attempt(uuid,uuid) to service_role;
grant execute on function public.ai_finish_attempt(uuid,uuid,uuid,text,jsonb,jsonb) to service_role;
grant execute on function public.ai_bind_uploaded_image(uuid,uuid,text,text) to service_role;
grant execute on function public.ai_maintain_operations() to service_role;
grant execute on function public.ai_reconcile_attempt(uuid,jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
