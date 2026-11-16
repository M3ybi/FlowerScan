begin;

create function public.ai_owner_state(actor uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
declare result jsonb;
begin
 perform ai_private.require_owner(actor);
 select jsonb_build_object(
  'proposals',(select coalesce(jsonb_agg(jsonb_build_object('sha256',p.sha256,'plan',p.plan,'maxAttempts',p.max_attempts,'maxUsd',p.max_usd,'durationSeconds',p.duration_seconds,
   'approved',exists(select 1 from ai_private.luna_campaign_approvals a where a.proposal_sha256=p.sha256 and a.revoked_at is null)) order by p.created_at desc),'[]') from ai_private.luna_campaign_proposals p),
  'evidence',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]') from ai_private.luna_evidence e),
  'acceptances',(select coalesce(jsonb_agg(to_jsonb(a)-'actor_id' order by a.accepted_at desc),'[]') from ai_private.owner_risk_acceptances a),
  'stages',(select coalesce(jsonb_agg(to_jsonb(g) order by g.route,g.stage),'[]') from ai_private.owner_stage_grants g),
  'routes',(select jsonb_agg(to_jsonb(r) order by r.route) from ai_private.model_routes r),
  'cutover',(select to_jsonb(c) from ai_private.luna_cutover c)
 ) into result;
 return result;
end $$;

create function public.ai_owner_finops(actor uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,ai_private as $$
declare start_at timestamptz:=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';result jsonb;
begin
 perform ai_private.require_owner(actor);
 with ledger as (
  select a.*,o.household_id,o.operation_type,o.state operation_state,o.final_outcome,o.premium_at_claim,o.model_campaign_id,c.definition->>'reasoning' requested_reasoning,
   case when o.operation_type in ('image_validation','upload_validation') then 'image_safety' else o.operation_type end route
  from ai_private.attempts a join ai_private.operations o on o.id=a.operation_id left join ai_private.model_configurations c on c.id=o.model_configuration_id
 ), spending as (
  select household_id,coalesce(sum(cost_usd) filter(where accounting_status='MEASURED'),0) amount,
   coalesce(sum(exposure_usd) filter(where accounting_status<>'MEASURED'),0) unknown
  from ledger where started_at>=start_at and household_id is not null group by household_id
 ), household_spending as (
  select h.id,coalesce(s.amount,0) amount,coalesce(s.unknown,0) unknown,public.is_household_premium_at(h.id,now()) premium
   from public.households h left join spending s on s.household_id=h.id
 ), models as (
  select requested_model,requested_reasoning,route,count(*) attempts,count(*) filter(where final_outcome='SUCCEEDED') successful,
   count(*) filter(where accounting_status='MEASURED') measured_attempts,
   avg(cost_usd) filter(where accounting_status='MEASURED') mean_attempt_usd,
   sum(cost_usd) filter(where accounting_status='MEASURED') measured_usd,
   sum(cost_usd) filter(where accounting_status='MEASURED')/nullif(count(*) filter(where final_outcome='SUCCEEDED'),0) cost_per_successful_operation,
   sum(exposure_usd) filter(where accounting_status<>'MEASURED') unknown_exposure,
   sum(input_tokens) input_tokens,sum(cached_input_tokens) cached_input_tokens,sum(cache_write_tokens) cache_write_tokens,
   sum(output_tokens) output_tokens,sum(reasoning_tokens) reasoning_tokens,
   percentile_cont(.5) within group(order by latency_ms) latency_median_ms,
   percentile_cont(.95) within group(order by latency_ms) latency_p95_ms,
   count(*) filter(where model_campaign_id is not null) evaluation_attempts
  from ledger where started_at>=start_at group by requested_model,requested_reasoning,route
 ), trends as (
  select to_char(started_at at time zone 'UTC','YYYY-MM') as month_key,sum(cost_usd) filter(where accounting_status='MEASURED') measured_usd,
   sum(exposure_usd) filter(where accounting_status<>'MEASURED') unknown_exposure,count(*) attempts
  from ledger group by 1 order by 1
 ), events as (
  select payload,event_type,subscription_id from public.subscription_events where created_at>=start_at
 ), subscription_evidence as (
  select h.household_id,
   exists(select 1 from public.subscription_events e where e.subscription_id=h.source_subscription_id
    and upper(e.payload->>'environment')='PRODUCTION' and e.event_type in ('INITIAL_PURCHASE','RENEWAL','NON_RENEWING_PURCHASE')
    and (case when jsonb_typeof(e.payload->'price')='number' then (e.payload->>'price')::numeric end)>0) production_purchase,
   upper(coalesce(u.metadata->>'environment',''))='SANDBOX' or upper(coalesce(u.metadata->>'store',''))='TEST_STORE' sandbox,
   public.is_household_premium_at(h.household_id,now()) entitled
  from public.household_subscriptions h left join public.user_subscriptions u on u.id=h.source_subscription_id
 ), gross_events as (
  select payload->>'currency' currency,sum(case when jsonb_typeof(payload->'price')='number' then (payload->>'price')::numeric end) amount,count(*) event_count
  from events where upper(payload->>'environment')='PRODUCTION' and event_type in ('INITIAL_PURCHASE','RENEWAL','NON_RENEWING_PURCHASE')
   and (case when jsonb_typeof(payload->'price')='number' then (payload->>'price')::numeric end)>0 and payload->>'currency' ~ '^[A-Z]{3}$' group by 1
 )
 select jsonb_build_object('asOf',now(),'periodStart',start_at,'currency','USD',
  'spendingByModelAndRoute',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from models m),
  'monthlyTrends',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from trends t),
  'unknownExposureAllTime',(select coalesce(sum(exposure_usd),0) from ledger where accounting_status<>'MEASURED'),
  'reservations',(select coalesce(sum(reserved_usd),0) from ai_private.operations where state='RESERVED'),
  'household',(select jsonb_build_object('count',count(*),'meanUsd',avg(amount),'medianUsd',percentile_cont(.5) within group(order by amount),
   'p90Usd',percentile_cont(.9) within group(order by amount),'p95Usd',percentile_cont(.95) within group(order by amount),'highestUsd',max(amount),
   'highestHouseholdReference',(select left(encode(sha256(convert_to(id::text,'UTF8')),'hex'),16) from household_spending order by amount desc,id limit 1),
   'freeAllocationUsd',sum(amount) filter(where not premium),'premiumAllocationUsd',sum(amount) filter(where premium),
   'targetsCurrency','EUR','targetMeanEur',.2,'heavyTargetEur',.5,'warningEur',1,'elevatedEur',1.5,
   'alertFxAssumptionUsdPerEur',1.1,'warningOver1EurProjected',count(*) filter(where amount/1.1>1),
   'elevatedOver1_5EurProjected',count(*) filter(where amount/1.1>1.5),'targetsAreQuotas',false) from household_spending),
  'subscriptions',jsonb_build_object(
   'premiumEntitledHouseholds',(select count(*) from public.households h where public.is_household_premium_at(h.id,now())),
   'freeHouseholds',(select count(*) from public.households h where not public.is_household_premium_at(h.id,now())),
   'monthlySubscriptions',(select count(*) from public.household_subscriptions where billing_period::text='monthly'),
   'annualSubscriptions',(select count(*) from public.household_subscriptions where billing_period::text in ('yearly','annual')),
   'cancelledSubscriptions',(select count(*) from public.household_subscriptions where cancelled_at is not null or status::text='cancelled'),
   'refundedSubscriptions',(select count(*) from public.household_subscriptions where status::text='refunded'),
   'sandboxEvents',(select count(*) from events where upper(payload->>'environment')='SANDBOX' or upper(payload->>'store')='TEST_STORE'),
   'productionPurchaseEvents',(select count(*) from events where upper(payload->>'environment')='PRODUCTION' and event_type in ('INITIAL_PURCHASE','RENEWAL','NON_RENEWING_PURCHASE')),
   'unverifiedEnvironmentEvents',(select count(*) from events where payload->>'environment' is null and upper(coalesce(payload->>'store',''))<>'TEST_STORE'),
   'payingHouseholds',case when exists(select 1 from public.households h where public.is_household_premium_at(h.id,now())
    and not exists(select 1 from subscription_evidence s where s.household_id=h.id and (s.production_purchase or s.sandbox))) then null
    else (select count(*) from subscription_evidence where entitled and production_purchase and not sandbox) end,
   'knownProductionPayingHouseholds',(select count(*) from subscription_evidence where entitled and production_purchase and not sandbox),
   'sandboxHouseholds',(select count(*) from subscription_evidence where sandbox),
   'grossRevenueByCurrency',(select jsonb_agg(to_jsonb(g)) from gross_events g),
   'grossBasis','Recorded production purchase/renewal event amounts; not reconciled bank receipts or net collected revenue.',
   'netCollectedRevenue',null,'feesAndVat',null,'refundAmounts',null,'monthlyRecognizedRevenue',null),
  'contribution',jsonb_build_object('mean',null,'median',null,'breakEvenUsage',null,'successfulJourneyCost',null),
  'limitations',jsonb_build_array('Entitlements are access rights, not proof of collected revenue. Historical webhook metadata omitted environment; never infer production payments from it.',
   'Net receipts, tax, fees, refund amounts, paying-household reconciliation and actual journey correlation are unavailable. These metrics remain null.',
   'Spending includes evaluation attempts and failed calls; current Premium status allocation is not historical collected-payment attribution.',
   'Household mean and percentiles include zero-spend existing households. Unknown exposure is additional to measured spending. Reasoning tokens are included in output cost once.')) into result;
 return result;
end $$;

revoke all on function public.ai_owner_state(uuid),public.ai_owner_finops(uuid) from public,anon,authenticated,service_role;
grant execute on function public.ai_owner_state(uuid),public.ai_owner_finops(uuid) to service_role;
notify pgrst,'reload schema';
commit;
