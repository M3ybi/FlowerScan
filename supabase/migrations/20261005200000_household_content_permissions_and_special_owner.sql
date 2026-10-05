-- Content access follows active membership. Household administration uses
-- is_household_owner; the older can_edit_household helper is retained solely
-- for Storage policies owned by Supabase's storage service.
create or replace function public.can_manage_household_content(target_household_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_household_member(target_household_id);
$$;
revoke all on function public.can_manage_household_content(uuid) from public, anon, authenticated;
grant execute on function public.can_manage_household_content(uuid) to authenticated;

-- Existing content policies all use the old owner-only helper. Preserve their
-- other checks (including diagnosis audit and catalog row protection) while
-- changing only the membership decision, then remove role names from policy IDs.
do $$
declare
  item record;
  alteration text;
  changed_count integer := 0;
begin
  for item in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public' and tablename = any(array[
      'plants', 'plant_care_pills', 'plant_care_tips', 'plant_care_records',
      'plant_diagnostics', 'diagnostic_observed_symptoms', 'diagnostic_recommended_steps'
    ])
    order by schemaname, tablename, policyname
  loop
    if coalesce(item.qual, '') not like '%can_edit_household(%'
       and coalesce(item.with_check, '') not like '%can_edit_household(%' then
      continue;
    end if;
    alteration := format('alter policy %I on %I.%I', item.policyname, item.schemaname, item.tablename);
    if item.qual is not null then
      alteration := alteration || format(' using (%s)',
        replace(item.qual, 'can_edit_household(', 'can_manage_household_content('));
    end if;
    if item.with_check is not null then
      alteration := alteration || format(' with check (%s)',
        replace(item.with_check, 'can_edit_household(', 'can_manage_household_content('));
    end if;
    execute alteration;
    execute format('alter policy %I on %I.%I rename to %I',
      item.policyname, item.schemaname, item.tablename,
      replace(item.policyname, 'editor', 'member'));
    changed_count := changed_count + 1;
  end loop;
  if changed_count <> 21 then
    raise exception 'Expected 21 content policies, found %', changed_count;
  end if;
end;
$$;

alter policy "households_update_editors" on public.households
  using (public.is_household_owner(id)) with check (public.is_household_owner(id));
alter policy "households_update_editors" on public.households rename to households_update_owners;
alter policy "household_report_settings_insert_editors" on public.household_report_settings
  with check (public.is_household_owner(household_id));
alter policy "household_report_settings_insert_editors" on public.household_report_settings rename to household_report_settings_insert_owners;
alter policy "household_report_settings_update_editors" on public.household_report_settings
  using (public.is_household_owner(household_id)) with check (public.is_household_owner(household_id));
alter policy "household_report_settings_update_editors" on public.household_report_settings rename to household_report_settings_update_owners;

-- Storage's existing delete policies still call this compatibility helper.
-- Both the helper and the new name now have the same active-member decision.
create or replace function public.can_edit_household(target_household_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_household_content(target_household_id);
$$;

-- The second administrative owner is configured once against verified existing
-- accounts. The unique partial index makes this the only such household.
alter table public.households
  add column special_coowner_user_id uuid references auth.users(id) on delete set null;
create unique index households_single_special_coowner_idx on public.households ((true))
  where special_coowner_user_id is not null;

create or replace function public.enforce_household_owner_capacity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_household public.households;
  owner_count integer;
  owner_limit integer;
begin
  if new.role <> 'owner' then return new; end if;
  if tg_op = 'UPDATE' and old.role = 'owner' and old.household_id = new.household_id
    and old.user_id = new.user_id then return new; end if;

  select * into target_household from public.households where id = new.household_id for update;
  if target_household.id is null then raise exception 'Household not found.'; end if;
  owner_limit := case when target_household.special_coowner_user_id is null then 1 else 2 end;
  if target_household.special_coowner_user_id is not null
    and new.user_id not in (target_household.created_by, target_household.special_coowner_user_id) then
    raise exception 'This household has two designated owners.' using errcode = '42501';
  end if;
  select count(*)::integer into owner_count from public.household_members hm
    where hm.household_id = new.household_id and hm.role = 'owner' and hm.user_id <> new.user_id;
  if owner_count >= owner_limit then
    raise exception 'Household owner limit reached.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_household_owner_capacity() from public, anon, authenticated;
drop index public.household_members_one_owner_idx;
create trigger enforce_household_owner_capacity before insert or update of household_id, user_id, role
  on public.household_members for each row execute function public.enforce_household_owner_capacity();

do $$
declare
  special_household_id uuid;
  second_owner_id uuid;
begin
  select h.id, second_user.id into strict special_household_id, second_owner_id
  from public.households h
  join auth.users first_user on first_user.id = h.created_by
  join public.household_members first_member on first_member.household_id = h.id
    and first_member.user_id = first_user.id and first_member.role = 'owner'
  join auth.users second_user on lower(second_user.email) = 'majercakovalenka01@gmail.com'
  join public.household_members second_member on second_member.household_id = h.id
    and second_member.user_id = second_user.id
  where lower(btrim(h.name)) = 'petzvalova'
    and lower(first_user.email) = 'fedorcor28@gmail.com';

  update public.households set special_coowner_user_id = second_owner_id where id = special_household_id;
  update public.household_members set role = 'owner', status = 'active'
    where household_id = special_household_id and user_id = second_owner_id;
  perform public.reconcile_household_access(special_household_id);
exception
  when no_data_found then raise exception 'Designated Petzvalova household or owners were not found.';
  when too_many_rows then raise exception 'More than one designated Petzvalova household was found.';
end;
$$;

-- Two Owners still count toward Premium's three occupied member slots.
create or replace function public.reconcile_household_access(target_household_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  premium boolean;
  active_count integer;
  available_slots integer;
  viewer_slots integer;
begin
  perform 1 from public.households where id = target_household_id for update;
  if not found then raise exception 'Household not found.'; end if;
  premium := public.is_household_premium_at(target_household_id, now());
  if not premium then
    insert into public.household_subscription_history (household_id, event_type, plan_key, source_subscription_id)
    select hs.household_id, 'switched_to_free', 'free', hs.source_subscription_id
    from public.household_subscriptions hs
    where hs.household_id = target_household_id and hs.source_subscription_id is not null
      and hs.current_period_end <= now()
    on conflict do nothing;
    update public.household_invites set revoked_at = now()
      where household_id = target_household_id and used_at is null and revoked_at is null;
    update public.household_members set status = 'suspended_plan_limit'
      where household_id = target_household_id and role = 'viewer' and status = 'active';
    return;
  end if;

  select greatest(3 - count(*)::integer, 0) into viewer_slots
  from public.household_members where household_id = target_household_id and role = 'owner';
  update public.household_members hm set status = 'suspended_plan_limit'
    where (hm.household_id, hm.user_id) in (
      select household_id, user_id from public.household_members
      where household_id = target_household_id and role = 'viewer' and status = 'active'
      order by created_at, user_id offset viewer_slots
    );

  select count(*)::integer into active_count from public.household_members
    where household_id = target_household_id and status = 'active';
  available_slots := greatest(3 - active_count, 0);
  update public.household_members hm set status = 'active'
    where (hm.household_id, hm.user_id) in (
      select household_id, user_id from public.household_members
      where household_id = target_household_id and role = 'viewer' and status = 'suspended_plan_limit'
      order by created_at, user_id limit available_slots
    );

  select count(*)::integer into active_count from public.household_members
    where household_id = target_household_id and status = 'active';
  available_slots := greatest(3 - active_count, 0);
  update public.household_invites hi set revoked_at = now()
    where hi.household_id = target_household_id and hi.used_at is null and hi.revoked_at is null
      and hi.id not in (
        select id from public.household_invites
        where household_id = target_household_id and used_at is null and revoked_at is null
        order by created_at, id limit available_slots
      );
end;
$$;

create or replace function public.get_household_entitlement(target_household_id uuid)
returns table (
  plan_key text, is_premium boolean, status text, valid_until timestamptz,
  max_members integer, invitations_enabled boolean, active_member_count integer,
  pending_invite_count integer, suspended_member_count integer, role public.household_member_role
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_household_member(target_household_id) then
    raise exception 'Household membership is required.' using errcode = '42501';
  end if;
  perform public.reconcile_household_access(target_household_id);
  return query
  select
    case when public.is_household_premium_at(target_household_id, now())
      then coalesce(hs.plan_key, 'premium') else 'free' end,
    public.is_household_premium_at(target_household_id, now()),
    case when public.is_household_premium_at(target_household_id, now())
      then coalesce(hs.status::text, 'active') else 'free' end,
    case when public.is_household_premium_at(target_household_id, now())
      then coalesce(hs.current_period_end, h.premium_expires_at) else null end,
    case when public.is_household_premium_at(target_household_id, now()) then 3
      when h.special_coowner_user_id is not null then 2 else 1 end,
    public.is_household_premium_at(target_household_id, now()),
    (select count(*)::integer from public.household_members hm
      where hm.household_id = target_household_id and hm.status = 'active'),
    (select count(*)::integer from public.household_invites hi
      where hi.household_id = target_household_id and hi.used_at is null and hi.revoked_at is null),
    (select count(*)::integer from public.household_members hm
      where hm.household_id = target_household_id and hm.status = 'suspended_plan_limit'),
    (select hm.role from public.household_members hm
      where hm.household_id = target_household_id and hm.user_id = auth.uid())
  from public.households h left join public.household_subscriptions hs on hs.household_id = h.id
  where h.id = target_household_id;
end;
$$;

do $$ declare household_id_to_reconcile uuid; begin
  for household_id_to_reconcile in select id from public.households order by id loop
    perform public.reconcile_household_access(household_id_to_reconcile);
  end loop;
end $$;
