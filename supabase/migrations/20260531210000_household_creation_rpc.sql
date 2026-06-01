create or replace function public.create_household_for_current_user(household_name text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household public.households;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  insert into public.households (name, created_by)
  values (coalesce(nullif(trim(household_name), ''), 'Moja domacnost'), auth.uid())
  returning * into new_household;

  insert into public.household_members (household_id, user_id, role)
  values (new_household.id, auth.uid(), 'owner');

  insert into public.household_report_settings (household_id)
  values (new_household.id);

  return new_household;
end;
$$;

grant execute on function public.create_household_for_current_user(text) to authenticated;

