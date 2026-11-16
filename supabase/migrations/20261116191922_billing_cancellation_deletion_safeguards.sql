begin;

-- Extend the existing manual queue; no deletion worker or new subscription state.
alter table public.account_deletion_requests add column billing_review jsonb;

create function public.account_deletion_billing_context(target_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with subscriptions as (
    select 'legacy'::text as scope, us.id::text as source_id, null::uuid as household_id,
      us.platform::text as provider, us.status::text as status,
      coalesce(us.expires_at, us.current_period_end) as paid_until
    from public.user_subscriptions us
    where us.user_id = target_user_id and us.platform <> 'manual'
      and us.status not in ('expired', 'refunded')
      and not coalesce(us.status = 'cancelled' and us.cancelled_at is not null
        and coalesce(us.expires_at, us.current_period_end) <= now(), false)
    union all
    select 'household', hs.household_id::text, hs.household_id,
      hs.provider::text, hs.status::text, hs.current_period_end
    from public.household_subscriptions hs
    join public.household_members hm on hm.household_id = hs.household_id
    where hm.user_id = target_user_id and hm.role = 'owner' and hm.status = 'active'
      and hs.provider <> 'manual' and hs.status not in ('expired', 'refunded')
      and not coalesce(hs.status = 'cancelled' and hs.cancelled_at is not null and hs.current_period_end <= now(), false)
      and not exists (select 1 from public.household_members other
        where other.household_id = hm.household_id and other.user_id <> target_user_id
          and other.role = 'owner' and other.status = 'active')
  )
  select jsonb_build_object('blocking_subscriptions', coalesce(jsonb_agg(to_jsonb(subscriptions)), '[]'::jsonb),
    'provider_inventory_verification_required', true)
  from subscriptions;
$$;
revoke all on function public.account_deletion_billing_context(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_billing_context(uuid) to service_role;

create function public.refresh_account_deletion_billing_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.billing_review := public.account_deletion_billing_context(new.user_id)
    || jsonb_build_object('checked_at', clock_timestamp());
  if new.status = 'completed' and jsonb_array_length(new.billing_review->'blocking_subscriptions') > 0 then
    raise exception 'ACCOUNT_DELETION_BILLING_REVIEW_REQUIRED' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.refresh_account_deletion_billing_review() from public, anon, authenticated;
create trigger refresh_account_deletion_billing_review before insert or update
  on public.account_deletion_requests for each row execute function public.refresh_account_deletion_billing_review();

create function public.guard_account_deletion_billing()
returns trigger language plpgsql security definer set search_path = '' as $$
declare review jsonb;
begin
  -- Serialize against existing household purchase admission. No membership/role is changed.
  perform 1 from public.households h where h.id in (
    select hm.household_id from public.household_members hm where hm.user_id = old.id
  ) order by h.id for update;
  review := public.account_deletion_billing_context(old.id);
  if jsonb_array_length(review->'blocking_subscriptions') > 0
    or exists(select 1 from public.account_deletion_requests r where r.user_id = old.id and r.status = 'requested') then
    raise exception 'ACCOUNT_DELETION_BILLING_REVIEW_REQUIRED' using errcode = '42501';
  end if;
  -- The existing human reviewer must also verify provider-side inventory/pending checkouts.
  -- Local webhook state alone cannot prove that an unreported recurring purchase does not exist.
  return old;
end;
$$;
revoke all on function public.guard_account_deletion_billing() from public, anon, authenticated;
create trigger guard_account_deletion_billing before delete on auth.users
  for each row execute function public.guard_account_deletion_billing();

commit;
