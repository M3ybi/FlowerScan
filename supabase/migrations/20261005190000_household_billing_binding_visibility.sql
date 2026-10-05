-- The client may display the purchaser's provider state only for the household
-- selected for that purchase. Do not expose bindings for other households.
create or replace function public.is_household_billing_bound(target_household_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_household_owner(target_household_id)
    and exists (
      select 1 from public.household_billing_bindings binding
      where binding.user_id = auth.uid() and binding.household_id = target_household_id
    );
$$;
revoke all on function public.is_household_billing_bound(uuid) from public, anon, authenticated;
grant execute on function public.is_household_billing_bound(uuid) to authenticated;
