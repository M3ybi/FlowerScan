create or replace function public.is_household_name_allowed(household_name text)
returns boolean
language plpgsql
immutable
set search_path = public
as $function$
declare
  normalized_name text;
  compact_name text;
  unsafe_terms text[] := array[
    'cabron',
    'connard',
    'cono',
    'cunt',
    'fuck',
    'fick',
    'fotze',
    'hovno',
    'jeb',
    'joder',
    'kokot',
    'kurva',
    'merde',
    'mierda',
    'pendejo',
    'pica',
    'putain',
    'puta',
    'salope',
    'scheisse',
    'shit'
  ];
  unsafe_term text;
begin
  normalized_name := lower(trim(coalesce(household_name, '')));
  normalized_name := replace(normalized_name, 'ß', 'ss');
  normalized_name := translate(
    normalized_name,
    'áäčďéěíĺľňóôöŕšťúüýžàâçèêëîïñòûùÿÁÄČĎÉĚÍĹĽŇÓÔÖŔŠŤÚÜÝŽÀÂÇÈÊËÎÏÑÒÛÙŸ',
    'aacdeeillnooorstuuyzaaceeeiinoouuyAACDEEILLNOOORSTUUYZAACEEEIINOOUUY'
  );
  normalized_name := regexp_replace(normalized_name, '[^a-z0-9]+', ' ', 'g');
  normalized_name := trim(normalized_name);

  if normalized_name = '' then
    return true;
  end if;

  compact_name := regexp_replace(normalized_name, '\s+', '', 'g');

  foreach unsafe_term in array unsafe_terms loop
    if position(' ' || unsafe_term || ' ' in ' ' || normalized_name || ' ') > 0
      or position(unsafe_term in compact_name) > 0 then
      return false;
    end if;
  end loop;

  return true;
end;
$function$;

create or replace function public.create_household_for_current_user(household_name text)
returns public.households
language plpgsql
security definer
set search_path = public
as $function$
declare
  normalized_name text;
  new_household public.households;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  normalized_name := coalesce(nullif(trim(household_name), ''), 'Moja domacnost');

  if length(normalized_name) > 80 then
    raise exception 'Household name must be 80 characters or fewer.';
  end if;

  if not public.is_household_name_allowed(normalized_name) then
    raise exception 'Household name contains explicit or vulgar language.';
  end if;

  insert into public.households (name, created_by)
  values (normalized_name, auth.uid())
  returning * into new_household;

  insert into public.household_members (household_id, user_id, role)
  values (new_household.id, auth.uid(), 'owner');

  insert into public.household_report_settings (household_id)
  values (new_household.id);

  return new_household;
end;
$function$;

create or replace function public.rename_household(target_household_id uuid, household_name text)
returns public.households
language plpgsql
security definer
set search_path = public
as $function$
declare
  normalized_name text;
  updated_household public.households;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if target_household_id is null then
    raise exception 'Household is required.';
  end if;

  if not public.is_household_owner(target_household_id) then
    raise exception 'Only household owners can rename this household.';
  end if;

  normalized_name := trim(coalesce(household_name, ''));

  if normalized_name = '' then
    raise exception 'Household name is required.';
  end if;

  if length(normalized_name) > 80 then
    raise exception 'Household name must be 80 characters or fewer.';
  end if;

  if not public.is_household_name_allowed(normalized_name) then
    raise exception 'Household name contains explicit or vulgar language.';
  end if;

  update public.households
  set name = normalized_name
  where id = target_household_id
  returning * into updated_household;

  if updated_household.id is null then
    raise exception 'Household not found.';
  end if;

  return updated_household;
end;
$function$;

revoke all on function public.is_household_name_allowed(text) from public;
revoke all on function public.create_household_for_current_user(text) from public;
revoke all on function public.rename_household(uuid, text) from public;

grant execute on function public.create_household_for_current_user(text) to authenticated;
grant execute on function public.rename_household(uuid, text) to authenticated;
