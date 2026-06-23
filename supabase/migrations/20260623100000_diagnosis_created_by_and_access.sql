alter table public.plant_diagnostics
  alter column created_by set default auth.uid();

create or replace function public.set_plant_diagnostic_created_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;

    if auth.uid() is not null and new.created_by is distinct from auth.uid() then
      raise exception 'Cannot save diagnosis for another user.';
    end if;

    return new;
  end if;

  new.created_by := old.created_by;
  return new;
end;
$$;

drop trigger if exists set_plant_diagnostic_created_by on public.plant_diagnostics;
create trigger set_plant_diagnostic_created_by
  before insert or update on public.plant_diagnostics
  for each row
  execute function public.set_plant_diagnostic_created_by();

drop policy if exists "plant_diagnostics_insert_editors" on public.plant_diagnostics;
create policy "plant_diagnostics_insert_editors" on public.plant_diagnostics
  for insert to authenticated
  with check (
    public.can_edit_household(household_id)
    and created_by = auth.uid()
  );

revoke all on function public.set_plant_diagnostic_created_by() from public;
