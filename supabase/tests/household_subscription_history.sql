-- Run this fixture after 20261007150000 in one BEGIN/ROLLBACK transaction.
-- All users, customers, receipts and events below are synthetic.
do $test$
#variable_conflict use_variable
declare
  owner_id uuid := gen_random_uuid();
  viewer_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  legacy_owner_id uuid := gen_random_uuid();
  main_home uuid := gen_random_uuid();
  legacy_home uuid := gen_random_uuid();
  fallback_home uuid := gen_random_uuid();
  observed_home uuid;
  customer text;
  observed_customer text;
  event_prefix text := gen_random_uuid()::text;
  observed_at timestamptz := now() - interval '2 days';
  initial_end timestamptz := observed_at + interval '1 month';
  yearly_start timestamptz := observed_at + interval '1 month';
  yearly_end timestamptz := observed_at + interval '13 months';
  legacy_source uuid;
  history_count integer;
  denied boolean;
  observed_type text;
  observed_status text;
  expected_type text;
  observed_end timestamptz;
  position integer;
  types text[] := array['RENEWAL', 'EXPIRATION', 'BILLING_ISSUE', 'REFUND', 'CANCELLATION', 'UNCANCELLATION'];
  statuses text[] := array['active', 'expired', 'grace_period', 'refunded', 'cancelled', 'active'];
  expected text[] := array['renewed', 'expired', 'payment_failed', 'refund', 'cancelled', 'resumed'];
begin
  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (owner_id, 'authenticated', 'authenticated', 'history-owner-' || owner_id || '@example.invalid', now(), now(), now()),
    (viewer_id, 'authenticated', 'authenticated', 'history-viewer-' || viewer_id || '@example.invalid', now(), now(), now()),
    (outsider_id, 'authenticated', 'authenticated', 'history-outsider-' || outsider_id || '@example.invalid', now(), now(), now()),
    (legacy_owner_id, 'authenticated', 'authenticated', 'history-legacy-' || legacy_owner_id || '@example.invalid', now(), now(), now());
  insert into public.households (id, name, created_by)
  values (main_home, 'History main fixture', owner_id), (legacy_home, 'History legacy fixture', legacy_owner_id),
    (fallback_home, 'History identity fixture', owner_id);
  insert into public.household_members (household_id, user_id, role, status)
  values (main_home, owner_id, 'owner', 'active'), (main_home, viewer_id, 'viewer', 'suspended_plan_limit'),
    (legacy_home, legacy_owner_id, 'owner', 'active'), (fallback_home, owner_id, 'owner', 'active');
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  customer := public.begin_household_purchase(main_home);
  execute 'reset role';
  if not public.apply_household_provider_event(customer, event_prefix || '-start', 'INITIAL_PURCHASE',
    'premium_monthly', 'active', 'monthly', 'web', event_prefix || '-main-receipt',
    observed_at, initial_end, observed_at, '{}'::jsonb) then raise exception 'Initial history event not applied.'; end if;
  if not exists (
    select 1 from public.household_subscription_history h
    where h.household_id = main_home and h.provider_event_id = event_prefix || '-start'
      and h.provider = 'web' and h.event_type = 'subscription_started'
      and h.previous_plan_key is null and h.new_plan_key = 'premium_monthly'
      and h.occurred_at = observed_at and h.period_start = observed_at and h.period_end = initial_end
  ) then raise exception 'History did not store immutable initial event facts/provider time.'; end if;

  if not public.apply_household_provider_event(customer, event_prefix || '-yearly', 'RENEWAL',
    'premium_yearly', 'active', 'yearly', 'web', event_prefix || '-main-receipt',
    yearly_start, yearly_end, observed_at + interval '1 second', '{}'::jsonb) then
    raise exception 'Effective plan change not applied.'; end if;
  if not exists (
    select 1 from public.household_subscription_history h
    where h.household_id = main_home and h.provider_event_id = event_prefix || '-yearly'
      and h.event_type = 'upgraded' and h.previous_plan_key = 'premium_monthly'
      and h.new_plan_key = 'premium_yearly' and h.period_start = yearly_start and h.period_end = yearly_end
  ) then raise exception 'Historical Monthly to Yearly facts were lost.'; end if;
  perform public.apply_household_provider_event(customer, event_prefix || '-issue', 'BILLING_ISSUE',
    'premium_yearly', 'grace_period', 'yearly', 'web', event_prefix || '-main-receipt',
    yearly_start, yearly_end, observed_at + interval '2 seconds', '{}'::jsonb);
  perform public.apply_household_provider_event(customer, event_prefix || '-cancel', 'CANCELLATION',
    'premium_yearly', 'cancelled', 'yearly', 'web', event_prefix || '-main-receipt',
    yearly_start, yearly_end, observed_at + interval '3 seconds', '{}'::jsonb);
  if not public.is_household_premium_at(main_home, now()) then
    raise exception 'History-only migration changed cancelled paid access.'; end if;
  perform public.apply_household_provider_event(customer, event_prefix || '-resume', 'UNCANCELLATION',
    'premium_yearly', 'active', 'yearly', 'web', event_prefix || '-main-receipt',
    yearly_start, yearly_end, observed_at + interval '4 seconds', '{}'::jsonb);
  perform public.apply_household_provider_event(customer, event_prefix || '-renew-one', 'RENEWAL',
    'premium_yearly', 'active', 'yearly', 'web', event_prefix || '-main-receipt',
    yearly_end, observed_at + interval '25 months', observed_at + interval '5 seconds', '{}'::jsonb);
  select count(*) into history_count from public.household_subscription_history h where h.household_id = main_home;
  if public.apply_household_provider_event(customer, event_prefix || '-renew-one', 'RENEWAL',
    'premium_yearly', 'active', 'yearly', 'web', event_prefix || '-main-receipt',
    yearly_end, observed_at + interval '25 months', observed_at + interval '5 seconds', '{}'::jsonb) then
    raise exception 'Duplicate provider delivery applied.'; end if;
  perform public.apply_household_provider_event(customer, event_prefix || '-same-period', 'RENEWAL',
    'premium_yearly', 'active', 'yearly', 'web', event_prefix || '-main-receipt',
    yearly_end, observed_at + interval '25 months', observed_at + interval '6 seconds', '{}'::jsonb);
  if (select count(*) from public.household_subscription_history h where h.household_id = main_home) <> history_count then
    raise exception 'Duplicate delivery or unchanged-period reconciliation created history noise.'; end if;
  perform public.apply_household_provider_event(customer, event_prefix || '-renew-two', 'RENEWAL',
    'premium_yearly', 'active', 'yearly', 'web', event_prefix || '-main-receipt',
    observed_at + interval '25 months', observed_at + interval '37 months', observed_at + interval '7 seconds', '{}'::jsonb);
  if (select count(*) from public.household_subscription_history h
      where h.household_id = main_home and h.event_type = 'renewed') <> 2 then
    raise exception 'Different legitimate billing periods were collapsed.'; end if;

  -- Exact period fallback requires the immutable receipt, not household/plan alone.
  perform public.record_household_subscription_history(fallback_home, 'renewed', 'premium_monthly', 'premium_monthly',
    'web', event_prefix || '-fallback-a', null, event_prefix || '-receipt-a', observed_at, observed_at, initial_end);
  perform public.record_household_subscription_history(fallback_home, 'renewed', 'premium_monthly', 'premium_monthly',
    'web', event_prefix || '-fallback-repeat', null, event_prefix || '-receipt-a', observed_at, observed_at, initial_end);
  perform public.record_household_subscription_history(fallback_home, 'renewed', 'premium_monthly', 'premium_monthly',
    'web', event_prefix || '-fallback-b', null, event_prefix || '-receipt-b', observed_at, observed_at, initial_end);
  if (select count(*) from public.household_subscription_history h where h.household_id = fallback_home) <> 2 then
    raise exception 'Period fallback collapsed distinct receipts or kept an exact receipt-period duplicate.'; end if;
  perform public.record_household_subscription_history(fallback_home, 'renewed', 'premium_monthly', 'premium_monthly',
    'web', event_prefix || '-fallback-a', null, event_prefix || '-receipt-c', observed_at, initial_end, initial_end + interval '1 month');
  if (select count(*) from public.household_subscription_history h where h.household_id = fallback_home) <> 2 then
    raise exception 'Provider event ID uniqueness was bypassed by another receipt/period.'; end if;

  -- All first-observed lifecycle types retain the provider meaning, not a fabricated purchase.
  for position in 1..array_length(types, 1) loop
    observed_home := gen_random_uuid();
    observed_type := types[position];
    observed_status := statuses[position];
    expected_type := expected[position];
    observed_end := case when observed_status = 'expired' then observed_at - interval '1 second' else initial_end end;
    insert into public.households (id, name, created_by) values (observed_home, 'History first observation fixture', owner_id);
    insert into public.household_members (household_id, user_id, role, status) values (observed_home, owner_id, 'owner', 'active');
    perform set_config('request.jwt.claim.sub', owner_id::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    observed_customer := public.begin_household_purchase(observed_home);
    execute 'reset role';
    perform public.apply_household_provider_event(observed_customer, event_prefix || '-observed-' || position, observed_type,
      'premium_monthly', observed_status, 'monthly', 'web', event_prefix || '-observed-receipt-' || position,
      observed_at - interval '1 month', observed_end, observed_at, '{}'::jsonb);
    if not exists (select 1 from public.household_subscription_history h
      where h.household_id = observed_home and h.provider_event_id = event_prefix || '-observed-' || position
        and h.event_type = expected_type and h.previous_plan_key is null) then
      raise exception 'First observed % was falsely classified as a purchase.', observed_type;
    end if;
  end loop;

  -- Legacy UUID callbacks still emit one authoritative event, not trigger+Free noise.
  insert into public.household_billing_bindings (user_id, household_id) values (legacy_owner_id, legacy_home);
  perform public.apply_household_provider_event(legacy_owner_id::text, event_prefix || '-legacy-start', 'INITIAL_PURCHASE',
    'premium_monthly', 'active', 'monthly', 'web', event_prefix || '-legacy-receipt',
    observed_at - interval '1 month', initial_end, observed_at, '{}'::jsonb);
  select hs.source_subscription_id into legacy_source from public.household_subscriptions hs where hs.household_id = legacy_home;
  if legacy_source is null then raise exception 'Legacy billing source changed.'; end if;
  if (select count(*) from public.household_subscription_history h where h.household_id = legacy_home) <> 1 then
    raise exception 'Legacy callback emitted duplicate trigger history.'; end if;
  update public.household_subscriptions set current_period_end = observed_at - interval '1 second'
    where household_id = legacy_home;
  update public.user_subscriptions set current_period_end = observed_at - interval '1 second',
    expires_at = observed_at - interval '1 second' where id = legacy_source;
  perform public.apply_household_provider_event(legacy_owner_id::text, event_prefix || '-legacy-expired', 'EXPIRATION',
    'premium_monthly', 'expired', 'monthly', 'web', event_prefix || '-legacy-receipt',
    observed_at - interval '1 month', observed_at - interval '1 second', observed_at + interval '1 second', '{}'::jsonb);
  perform public.reconcile_household_access(legacy_home);
  perform public.reconcile_household_access(legacy_home);
  if (select count(*) from public.household_subscription_history h where h.household_id = legacy_home) <> 2
    or not exists (select 1 from public.household_subscription_history h where h.household_id = legacy_home
      and h.event_type = 'expired' and h.provider_event_id = event_prefix || '-legacy-expired'
      and h.occurred_at = observed_at + interval '1 second' and h.source_subscription_id = legacy_source)
    or exists (select 1 from public.household_subscription_history h where h.household_id = legacy_home
      and h.event_type = 'switched_to_free') then
    raise exception 'Legacy expiry duplicated Free history or lost its provider facts.'; end if;
  if coalesce(current_setting('plantie.provider_history_in_progress', true), '') = 'true' then
    raise exception 'Legacy history context leaked after callback.'; end if;
  perform public.apply_household_provider_event(legacy_owner_id::text, event_prefix || '-legacy-restart', 'INITIAL_PURCHASE',
    'premium_monthly', 'active', 'monthly', 'web', event_prefix || '-legacy-receipt',
    observed_at, initial_end, observed_at + interval '2 seconds', '{}'::jsonb);
  perform public.apply_household_provider_event(legacy_owner_id::text, event_prefix || '-legacy-refund', 'REFUND',
    'premium_monthly', 'refunded', 'monthly', 'web', event_prefix || '-legacy-receipt',
    observed_at, initial_end, observed_at + interval '3 seconds', '{}'::jsonb);
  perform public.reconcile_household_access(legacy_home);
  if (select count(*) from public.household_subscription_history h where h.household_id = legacy_home) <> 4
    or not exists (select 1 from public.household_subscription_history h where h.household_id = legacy_home
      and h.event_type = 'refund' and h.provider_event_id = event_prefix || '-legacy-refund')
    or exists (select 1 from public.household_subscription_history h where h.household_id = legacy_home
      and h.event_type = 'switched_to_free') or public.is_household_premium_at(legacy_home, now()) then
    raise exception 'Legacy refund duplicated Free history, lost provider identity or changed refunded access.';
  end if;

  perform set_config('request.jwt.claim.sub', viewer_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', viewer_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if not exists (select 1 from public.household_subscription_history h where h.household_id = main_home)
    or exists (select 1 from public.household_subscription_history h where h.household_id = legacy_home) then
    raise exception 'Viewer history read was denied or leaked another household.'; end if;
  denied := false;
  begin
    insert into public.household_subscription_history (household_id, event_type, plan_key)
      values (main_home, 'renewed', 'premium_monthly');
    exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Viewer gained a history mutation.'; end if;
  denied := false;
  begin
    perform public.record_household_subscription_history(main_home, 'renewed', null, 'premium_monthly',
      'web', null, null, null, now(), null, null);
    exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Viewer gained the trusted history writer.'; end if;
  perform set_config('request.jwt.claim.sub', outsider_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', outsider_id, 'role', 'authenticated')::text, true);
  if exists (select 1 from public.household_subscription_history h where h.household_id = main_home) then
    raise exception 'Unrelated account read household billing history.'; end if;
  execute 'reset role';
end;
$test$;
