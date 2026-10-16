-- Preserve receipt binding, event idempotency and ordering while accepting effective revocations.
create or replace function public.apply_household_provider_event(
  customer_id text, provider_event_id text, provider_event_type text, event_plan_key text,
  event_status text, event_billing_period text, event_provider text, original_transaction_id text,
  period_start timestamptz, period_end timestamptz, event_occurred_at timestamptz, event_metadata jsonb,
  event_transaction_id text default null
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  target_household uuid;
  payer_user uuid;
  previous_row public.household_subscriptions;
  legacy_source public.user_subscriptions;
  source_id uuid;
  effective_plan text;
  legacy_customer boolean := false;
  event_name text;
  inserted_event uuid;
  previous_history_context text;
begin
  if nullif(provider_event_id, '') is null or nullif(provider_event_type, '') is null
    or nullif(original_transaction_id, '') is null
    or event_plan_key is null or event_plan_key not in ('premium_monthly', 'premium_yearly')
    or event_status is null or event_status not in ('active', 'trialing', 'cancelled', 'grace_period', 'expired', 'refunded')
    or event_billing_period is null or event_billing_period not in ('monthly', 'yearly')
    or event_provider is null or event_provider not in ('ios', 'android', 'web', 'manual')
    or event_occurred_at is null
    or (event_status not in ('expired', 'refunded') and period_end is null) then
    raise exception 'Invalid household subscription event.' using errcode = '22023';
  end if;
  select hbc.household_id, hbc.created_by into target_household, payer_user
    from public.household_billing_customers hbc where hbc.provider_customer_id = customer_id;
  if target_household is null and customer_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    legacy_customer := true;
    select au.id into payer_user from auth.users au where au.id = customer_id::uuid;
    if payer_user is not null then
      select * into legacy_source from public.user_subscriptions us
      where us.user_id = payer_user and us.platform = event_provider::public.subscription_platform
        and (us.platform_original_transaction_id = apply_household_provider_event.original_transaction_id
          or us.platform_customer_id = customer_id)
      order by (us.platform_original_transaction_id = apply_household_provider_event.original_transaction_id) desc nulls last,
        us.created_at desc, us.id limit 1 for update;
      select hss.household_id into target_household from public.household_subscription_sources hss
        where hss.source_subscription_id = legacy_source.id;
      if target_household is null then
        select binding.household_id into target_household from public.household_billing_bindings binding
        join public.household_members hm on hm.household_id = binding.household_id
          and hm.user_id = binding.user_id and hm.role = 'owner' and hm.status = 'active'
        where binding.user_id = payer_user;
      end if;
    end if;
  end if;
  if target_household is null then
    insert into public.subscription_events (event_id, event_type, platform, payload)
      values (provider_event_id, provider_event_type, event_provider::public.subscription_platform,
        coalesce(event_metadata, '{}'::jsonb)) on conflict (event_id) do nothing;
    return false;
  end if;
  perform 1 from public.households where id = target_household for update;
  insert into public.subscription_events (event_id, event_type, platform, payload, user_id)
    values (provider_event_id, provider_event_type, event_provider::public.subscription_platform,
      coalesce(event_metadata, '{}'::jsonb), payer_user)
    on conflict (event_id) do nothing returning id into inserted_event;
  if inserted_event is null then return false; end if;
  insert into public.household_provider_transactions (provider, original_transaction_id, household_id)
    values (event_provider::public.subscription_platform, original_transaction_id, target_household)
    on conflict do nothing;
  if exists (select 1 from public.household_provider_transactions hpt
    where hpt.provider = event_provider::public.subscription_platform
      and hpt.original_transaction_id = apply_household_provider_event.original_transaction_id
      and hpt.household_id <> target_household) then return false; end if;
  select * into previous_row from public.household_subscriptions where household_id = target_household;
  if previous_row.last_provider_event_at > event_occurred_at then return false; end if;
  if legacy_source.last_provider_event_at > event_occurred_at then return false; end if;
  if previous_row.last_provider_event_at = event_occurred_at
    and previous_row.status in ('expired', 'refunded')
    and event_status not in ('expired', 'refunded') then return false; end if;
  if previous_row.current_period_end > now() and previous_row.status in ('active', 'trialing', 'cancelled', 'grace_period') then
    if not legacy_customer and previous_row.source_subscription_id is not null then return false; end if;
    if legacy_customer and previous_row.provider_customer_id is distinct from customer_id then return false; end if;
    if legacy_customer and previous_row.source_subscription_id is distinct from legacy_source.id then return false; end if;
    if event_status in ('expired', 'refunded', 'cancelled', 'grace_period')
      and previous_row.provider_original_transaction_id is distinct from apply_household_provider_event.original_transaction_id then return false; end if;
  end if;
  -- An authoritative refund can shorten this same paid period. A refund
  -- for an older period must not revoke a later renewal.
  if period_end < previous_row.current_period_end
    and not coalesce((event_status = 'refunded' and period_start >= previous_row.current_period_start), false) and (
    event_status in ('expired', 'refunded') or period_start is null or previous_row.current_period_start is null
    or period_start <= previous_row.current_period_start) then return false; end if;
  event_name := case
    when provider_event_type = 'INITIAL_PURCHASE' then 'subscription_started'
    when event_status = 'expired' and previous_row.status is distinct from 'expired' then 'expired'
    when event_status = 'refunded' and previous_row.status is distinct from 'refunded' then 'refund'
    when event_status = 'cancelled' and previous_row.status is distinct from 'cancelled' then 'cancelled'
    when event_status = 'grace_period' and previous_row.status is distinct from 'grace_period' then 'payment_failed'
    when provider_event_type = 'UNCANCELLATION' and previous_row.status is distinct from 'active' then 'resumed'
    when previous_row.plan_key <> event_plan_key and event_plan_key = 'premium_yearly' then 'upgraded'
    when previous_row.plan_key <> event_plan_key then 'downgraded'
    when provider_event_type = 'RENEWAL' and
      (previous_row.household_id is null or previous_row.current_period_end is distinct from period_end) then 'renewed'
    when previous_row.status = 'cancelled' and event_status = 'active' then 'resumed'
    when previous_row.household_id is not null and previous_row.current_period_end is distinct from period_end then 'renewed'
    else null end;
  if legacy_customer then
    source_id := coalesce(legacy_source.id, gen_random_uuid());
    insert into public.user_subscriptions (
      id, user_id, plan_key, platform, status, billing_period, platform_customer_id,
      platform_original_transaction_id, platform_transaction_id, current_period_start,
      current_period_end, expires_at, cancelled_at, metadata, last_provider_event_at
    ) values (
      source_id, payer_user, event_plan_key, event_provider::public.subscription_platform,
      event_status::public.subscription_status, event_billing_period::public.billing_period, customer_id,
      original_transaction_id, event_transaction_id, period_start, period_end, period_end,
      case when event_status = 'cancelled' then event_occurred_at else null end,
      coalesce(event_metadata, '{}'::jsonb), event_occurred_at
    ) on conflict (id) do update set plan_key = excluded.plan_key, status = excluded.status,
      billing_period = excluded.billing_period, platform_original_transaction_id = excluded.platform_original_transaction_id,
      platform_transaction_id = excluded.platform_transaction_id, current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end, expires_at = excluded.expires_at,
      cancelled_at = excluded.cancelled_at, metadata = excluded.metadata, last_provider_event_at = excluded.last_provider_event_at;
    insert into public.household_subscription_sources (source_subscription_id, household_id)
      values (source_id, target_household) on conflict do nothing;
    effective_plan := case when event_status in ('expired', 'refunded') then 'free' else event_plan_key end;
    -- The legacy trigger keeps all state/access work. The atomic callback owns
    -- the one history row with its authoritative provider event identity/time.
    previous_history_context := current_setting('plantie.provider_history_in_progress', true);
    perform set_config('plantie.provider_history_in_progress', 'true', true);
    insert into public.user_entitlements (
      user_id, plan_key, is_premium, source_subscription_id, valid_until,
      ai_scans_monthly_limit, plants_limit, qr_labels_limit, ai_diagnosis_enabled,
      cloud_backup_enabled, household_sharing_enabled
    ) select payer_user, effective_plan, effective_plan <> 'free', source_id,
      case when effective_plan <> 'free' then period_end else null end,
      sp.ai_scans_monthly_limit, sp.plants_limit, sp.qr_labels_limit, sp.ai_diagnosis_enabled,
      sp.cloud_backup_enabled, sp.household_sharing_enabled from public.subscription_plans sp where sp.plan_key = effective_plan
    on conflict (user_id) do update set plan_key = excluded.plan_key, is_premium = excluded.is_premium,
      source_subscription_id = excluded.source_subscription_id, valid_until = excluded.valid_until,
      ai_scans_monthly_limit = excluded.ai_scans_monthly_limit, plants_limit = excluded.plants_limit,
      qr_labels_limit = excluded.qr_labels_limit, ai_diagnosis_enabled = excluded.ai_diagnosis_enabled,
      cloud_backup_enabled = excluded.cloud_backup_enabled, household_sharing_enabled = excluded.household_sharing_enabled;
    insert into public.usage_counters (user_id, counter_type, period_start, period_end, value)
    values (payer_user, 'ai_scan', date_trunc('month', now() at time zone 'UTC')::date,
      (date_trunc('month', now() at time zone 'UTC') + interval '1 month - 1 day')::date, 0)
    on conflict do nothing;
    perform set_config('plantie.provider_history_in_progress', coalesce(previous_history_context, ''), true);
    if event_name is not null then
      perform public.record_household_subscription_history(
        target_household, event_name, previous_row.plan_key, event_plan_key,
        event_provider::public.subscription_platform, provider_event_id, source_id, original_transaction_id,
        event_occurred_at, period_start, period_end
      );
    end if;
    update public.subscription_events set subscription_id = source_id where id = inserted_event;
    return true;
  end if;
  insert into public.household_subscriptions (
    household_id, plan_key, status, billing_period, provider, provider_user_id, provider_customer_id, provider_original_transaction_id,
    current_period_start, current_period_end, cancelled_at, last_provider_event_at
  ) values (
    target_household, event_plan_key, event_status::public.subscription_status,
    event_billing_period::public.billing_period, event_provider::public.subscription_platform,
    payer_user, customer_id, original_transaction_id, period_start, period_end,
    case when event_status = 'cancelled' then event_occurred_at else null end, event_occurred_at
  ) on conflict (household_id) do update set plan_key = excluded.plan_key, status = excluded.status,
    billing_period = excluded.billing_period, provider = excluded.provider, provider_user_id = excluded.provider_user_id,
    provider_customer_id = excluded.provider_customer_id, provider_original_transaction_id = excluded.provider_original_transaction_id,
    source_subscription_id = null,
    current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
    cancelled_at = excluded.cancelled_at, last_provider_event_at = excluded.last_provider_event_at;

  if event_name is not null then
    perform public.record_household_subscription_history(
      target_household, event_name, previous_row.plan_key, event_plan_key,
      event_provider::public.subscription_platform, provider_event_id, null, original_transaction_id,
      event_occurred_at, period_start, period_end
    );
  end if;
  perform public.reconcile_household_access(target_household);
  return true;
end;
$$;
