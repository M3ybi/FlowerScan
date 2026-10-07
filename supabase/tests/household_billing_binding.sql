-- Execute migrations and this fixture in one BEGIN/ROLLBACK transaction.
-- Synthetic data only; no real checkout, provider request or email is sent.
do $test$
declare
  owner_id uuid := gen_random_uuid();
  viewer_id uuid := gen_random_uuid();
  other_owner_id uuid := gen_random_uuid();
  first_home uuid := gen_random_uuid();
  second_home uuid := gen_random_uuid();
  legacy_home uuid := gen_random_uuid();
  legacy_subscription uuid := gen_random_uuid();
  first_customer text;
  second_customer text;
  entitlement record;
  denied boolean;
  event_prefix text := gen_random_uuid()::text;
begin
  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (owner_id, 'authenticated', 'authenticated', 'billing-' || owner_id || '@example.invalid', now(), now(), now()),
    (viewer_id, 'authenticated', 'authenticated', 'billing-viewer-' || viewer_id || '@example.invalid', now(), now(), now()),
    (other_owner_id, 'authenticated', 'authenticated', 'billing-other-' || other_owner_id || '@example.invalid', now(), now(), now());
  insert into public.households (id, name, created_by)
  values (first_home, 'Billing first fixture', owner_id), (second_home, 'Billing second fixture', owner_id),
    (legacy_home, 'Billing legacy fixture', other_owner_id);
  insert into public.household_members (household_id, user_id, role, status)
  values (first_home, owner_id, 'owner', 'active'), (second_home, owner_id, 'owner', 'active'),
    (first_home, viewer_id, 'viewer', 'suspended_plan_limit'), (legacy_home, other_owner_id, 'owner', 'active');
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  first_customer := public.begin_household_purchase(first_home);
  if first_customer not like 'hh_%' or first_customer <> public.begin_household_purchase(first_home) then
    raise exception 'Household provider identity must be opaque and stable across retries/cancelled checkouts.';
  end if;
  second_customer := public.begin_household_purchase(second_home);
  if second_customer = first_customer then raise exception 'Two owned households shared a billing identity.'; end if;
  perform set_config('request.jwt.claim.sub', viewer_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', viewer_id, 'role', 'authenticated')::text, true);
  denied := false;
  begin perform public.get_household_billing_customer(first_home);
    exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Viewer obtained owner billing identity.'; end if;
  denied := false;
  begin perform public.apply_household_provider_event(first_customer, event_prefix || '-forged', 'INITIAL_PURCHASE',
    'premium_monthly', 'active', 'monthly', 'web', event_prefix || '-receipt', now(), now() + interval '1 month', now(), '{}'::jsonb);
    exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Authenticated client forged a paid subscription.'; end if;
  execute 'reset role';
  execute 'set local role service_role';
  if not public.apply_household_provider_event(first_customer, event_prefix || '-first', 'INITIAL_PURCHASE',
    'premium_monthly', 'active', 'monthly', 'web', event_prefix || '-receipt', now(), now() + interval '1 month', now(), '{}'::jsonb) then
    raise exception 'Trusted household purchase was not applied.';
  end if;
  execute 'reset role';
  if public.apply_household_provider_event(owner_id::text, event_prefix || '-unrelated-legacy', 'INITIAL_PURCHASE',
    'premium_yearly', 'active', 'yearly', 'web', event_prefix || '-unrelated-receipt', now(), now() + interval '1 year',
    now() + interval '1 second', '{}'::jsonb) then
    raise exception 'An unrelated personal customer overwrote the selected household provider source.';
  end if;
  if exists (select 1 from public.user_subscriptions us where us.user_id = owner_id) then
    raise exception 'Rejected unrelated personal subscription partially committed.';
  end if;
  if public.is_household_premium_at(second_home, now()) then raise exception 'Purchase fanned out to another owned household.'; end if;
  if not exists (select 1 from public.household_members hm where hm.household_id = first_home
    and hm.user_id = viewer_id and hm.status = 'active') then raise exception 'Premium did not restore suspended Viewer.'; end if;
  if public.apply_household_provider_event(first_customer, event_prefix || '-first', 'INITIAL_PURCHASE',
    'premium_monthly', 'active', 'monthly', 'web', event_prefix || '-receipt', now(), now() + interval '1 month', now(), '{}'::jsonb) then
    raise exception 'Duplicate provider callback applied twice.';
  end if;
  if not public.apply_household_provider_event(first_customer, event_prefix || '-cancelled', 'CANCELLATION',
    'premium_monthly', 'cancelled', 'monthly', 'web', event_prefix || '-receipt', now(), now() + interval '1 month', now() + interval '1 second', '{}'::jsonb) then
    raise exception 'Cancellation was not applied.';
  end if;
  if not public.is_household_premium_at(first_home, now()) then raise exception 'Cancellation removed already-paid access.'; end if;
  perform set_config('request.jwt.claim.sub', viewer_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', viewer_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into entitlement from public.get_household_entitlement(first_home);
  if not entitlement.is_premium or not entitlement.cancel_at_period_end or entitlement.billing_interval <> 'monthly'
    or entitlement.valid_until <= now() or entitlement.role <> 'viewer' then
    raise exception 'Viewer did not receive the selected household paid lifecycle details.';
  end if;
  execute 'reset role';
  if public.apply_household_provider_event(second_customer, event_prefix || '-transfer', 'INITIAL_PURCHASE',
    'premium_monthly', 'active', 'monthly', 'web', event_prefix || '-receipt', now(), now() + interval '1 month', now() + interval '2 seconds', '{}'::jsonb) then
    raise exception 'A provider receipt transferred into another household.';
  end if;
  if public.is_household_premium_at(second_home, now()) then raise exception 'Receipt transfer incorrectly granted Premium.'; end if;
  if not public.apply_household_provider_event(second_customer, event_prefix || '-second', 'INITIAL_PURCHASE',
    'premium_yearly', 'active', 'yearly', 'web', event_prefix || '-second-receipt', now(), now() + interval '1 year', now() + interval '3 seconds', '{}'::jsonb) then
    raise exception 'Independent household purchase was not applied.';
  end if;
  if not public.apply_household_provider_event(first_customer, event_prefix || '-renewed', 'RENEWAL',
    'premium_monthly', 'active', 'monthly', 'web', event_prefix || '-receipt', now(), now() + interval '2 months', now() + interval '4 seconds', '{}'::jsonb) then
    raise exception 'Renewal was not applied.';
  end if;
  if public.apply_household_provider_event(first_customer, event_prefix || '-old-cancel', 'CANCELLATION',
    'premium_monthly', 'cancelled', 'monthly', 'web', event_prefix || '-receipt', now(), now() + interval '1 month', now() + interval '2 seconds', '{}'::jsonb) then
    raise exception 'Stale callback overwrote the renewed subscription.';
  end if;
  -- Move only this synthetic paid period into the past to simulate actual expiry.
  update public.household_subscriptions set current_period_end = now() - interval '1 day',
    current_period_start = now() - interval '1 month' where household_id = first_home;
  if not public.apply_household_provider_event(first_customer, event_prefix || '-expired', 'EXPIRATION',
    'premium_monthly', 'expired', 'monthly', 'web', event_prefix || '-receipt', now() - interval '1 month', now() - interval '1 day', now() + interval '5 seconds', '{}'::jsonb) then
    raise exception 'Expiry was not applied.';
  end if;
  if public.is_household_premium_at(first_home, now()) or not public.is_household_premium_at(second_home, now()) then
    raise exception 'Expiry crossed household subscription boundaries.';
  end if;
  if not exists (select 1 from public.household_members hm where hm.household_id = first_home
    and hm.user_id = viewer_id and hm.status = 'suspended_plan_limit') then
    raise exception 'Expiry deleted or failed to suspend Viewer membership.';
  end if;
  denied := false;
  begin perform public.apply_household_provider_event(first_customer, event_prefix || '-null-plan', 'RENEWAL',
    null, 'active', 'monthly', 'web', event_prefix || '-receipt', now(), now() + interval '1 month', now(), '{}'::jsonb);
    exception when invalid_parameter_value then denied := true; end;
  if not denied then raise exception 'Malformed provider input was accepted.'; end if;
  execute 'reset role';
  insert into public.household_billing_bindings (user_id, household_id) values (other_owner_id, legacy_home);
  insert into public.user_subscriptions (id, user_id, plan_key, status, billing_period, platform,
    platform_customer_id, platform_original_transaction_id, current_period_end, expires_at)
  values (legacy_subscription, other_owner_id, 'premium_yearly', 'active', 'yearly', 'web',
    other_owner_id::text, event_prefix || '-legacy-receipt', now() + interval '1 year', now() + interval '1 year');
  insert into public.user_entitlements (user_id, plan_key, is_premium, source_subscription_id, valid_until)
  values (other_owner_id, 'premium_yearly', true, legacy_subscription, now() + interval '1 year');
  if not exists (select 1 from public.household_subscription_sources hss
    where hss.source_subscription_id = legacy_subscription and hss.household_id = legacy_home) then
    raise exception 'Legacy source was not permanently mapped to its household.';
  end if;
  update public.household_billing_bindings set household_id = second_home where user_id = other_owner_id;
  update public.user_subscriptions set status = 'cancelled', cancelled_at = now() where id = legacy_subscription;
  update public.user_entitlements set updated_at = now() where user_id = other_owner_id;
  if not exists (select 1 from public.household_subscriptions hs where hs.household_id = legacy_home
    and hs.source_subscription_id = legacy_subscription and hs.status = 'cancelled') then
    raise exception 'Legacy callback followed a changed purchase hint instead of original source mapping.';
  end if;
  perform set_config('request.jwt.claim.sub', other_owner_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', other_owner_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.get_household_billing_customer(legacy_home) <> other_owner_id::text then
    raise exception 'Existing provider customer was replaced instead of preserved.';
  end if;
  select * into entitlement from public.get_household_entitlement(legacy_home);
  if not entitlement.is_premium or not entitlement.cancel_at_period_end then
    raise exception 'Legacy cancellation lost paid household entitlement.';
  end if;
  execute 'reset role';
  if not public.apply_household_provider_event(other_owner_id::text, event_prefix || '-legacy-renew', 'RENEWAL',
    'premium_yearly', 'active', 'yearly', 'web', event_prefix || '-legacy-receipt', now(),
    now() + interval '2 years', now() + interval '10 seconds', '{}'::jsonb, event_prefix || '-legacy-new-tx') then
    raise exception 'Legacy renewal was not applied atomically.';
  end if;
  if not exists (select 1 from public.user_subscriptions us where us.id = legacy_subscription
    and us.platform_customer_id = other_owner_id::text and us.platform_transaction_id = event_prefix || '-legacy-new-tx') then
    raise exception 'Legacy provider source/customer identity changed during renewal.';
  end if;
  if public.apply_household_provider_event(other_owner_id::text, event_prefix || '-legacy-old-expiry', 'EXPIRATION',
    'premium_yearly', 'expired', 'yearly', 'web', event_prefix || '-legacy-receipt', now() - interval '1 year',
    now() - interval '1 second', now() + interval '11 seconds', '{}'::jsonb) then
    raise exception 'Legacy previous-period expiry revoked an extended paid period.';
  end if;
  if not public.apply_household_provider_event(other_owner_id::text, event_prefix || '-legacy-cancel', 'CANCELLATION',
    'premium_yearly', 'cancelled', 'yearly', 'web', event_prefix || '-legacy-receipt', now(),
    now() + interval '2 years', now() + interval '12 seconds', '{}'::jsonb) then
    raise exception 'Legacy cancellation was not applied atomically.';
  end if;
  if public.apply_household_provider_event(other_owner_id::text, event_prefix || '-legacy-stale-renew', 'RENEWAL',
    'premium_yearly', 'active', 'yearly', 'web', event_prefix || '-legacy-receipt', now(),
    now() + interval '2 years', now() + interval '10 seconds', '{}'::jsonb) then
    raise exception 'Equal-expiry stale legacy event overwrote cancellation.';
  end if;
  if not public.is_household_premium_at(legacy_home, now()) then
    raise exception 'Atomic legacy cancellation removed paid access.';
  end if;
  if not public.apply_household_provider_event(other_owner_id::text, event_prefix || '-legacy-refund', 'REFUND',
    'premium_yearly', 'refunded', 'yearly', 'web', event_prefix || '-legacy-receipt', now(),
    now() + interval '2 years', now() + interval '13 seconds', '{}'::jsonb) then
    raise exception 'Legacy refund was not applied atomically.';
  end if;
  if public.is_household_premium_at(legacy_home, now()) or not exists (
    select 1 from public.user_entitlements ue where ue.user_id = other_owner_id
      and not ue.is_premium and ue.source_subscription_id = legacy_subscription) then
    raise exception 'Legacy refund lost source mapping or retained refunded access.';
  end if;
end;
$test$;
