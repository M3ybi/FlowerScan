insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('plant-images', 'plant-images', false, 8388608, array['image/jpeg']),
  ('diagnostic-images', 'diagnostic-images', false, 8388608, array['image/jpeg'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.storage_household_id(object_name text)
returns uuid
language plpgsql
stable
as $$
declare
  first_segment text := (storage.foldername(object_name))[1];
begin
  if first_segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return first_segment::uuid;
  end if;

  return null;
end;
$$;

grant execute on function public.storage_household_id(text) to authenticated;

drop policy if exists "plant_images_select_household_members" on storage.objects;
drop policy if exists "plant_images_insert_household_editors" on storage.objects;
drop policy if exists "plant_images_update_household_editors" on storage.objects;
drop policy if exists "plant_images_delete_household_editors" on storage.objects;
drop policy if exists "diagnostic_images_select_household_members" on storage.objects;
drop policy if exists "diagnostic_images_insert_household_editors" on storage.objects;
drop policy if exists "diagnostic_images_update_household_editors" on storage.objects;
drop policy if exists "diagnostic_images_delete_household_editors" on storage.objects;

create policy "plant_images_select_household_members" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'plant-images'
    and name like '%/plants/%/original.jpg'
    and public.storage_household_id(name) is not null
    and public.is_household_member(public.storage_household_id(name))
  );

create policy "plant_images_insert_household_editors" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'plant-images'
    and name like '%/plants/%/original.jpg'
    and public.storage_household_id(name) is not null
    and public.can_edit_household(public.storage_household_id(name))
  );

create policy "plant_images_update_household_editors" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'plant-images'
    and name like '%/plants/%/original.jpg'
    and public.storage_household_id(name) is not null
    and public.can_edit_household(public.storage_household_id(name))
  )
  with check (
    bucket_id = 'plant-images'
    and name like '%/plants/%/original.jpg'
    and public.storage_household_id(name) is not null
    and public.can_edit_household(public.storage_household_id(name))
  );

create policy "plant_images_delete_household_editors" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'plant-images'
    and name like '%/plants/%/original.jpg'
    and public.storage_household_id(name) is not null
    and public.can_edit_household(public.storage_household_id(name))
  );

create policy "diagnostic_images_select_household_members" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'diagnostic-images'
    and name like '%/diagnostics/%/image.jpg'
    and public.storage_household_id(name) is not null
    and public.is_household_member(public.storage_household_id(name))
  );

create policy "diagnostic_images_insert_household_editors" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'diagnostic-images'
    and name like '%/diagnostics/%/image.jpg'
    and public.storage_household_id(name) is not null
    and public.can_edit_household(public.storage_household_id(name))
  );

create policy "diagnostic_images_update_household_editors" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'diagnostic-images'
    and name like '%/diagnostics/%/image.jpg'
    and public.storage_household_id(name) is not null
    and public.can_edit_household(public.storage_household_id(name))
  )
  with check (
    bucket_id = 'diagnostic-images'
    and name like '%/diagnostics/%/image.jpg'
    and public.storage_household_id(name) is not null
    and public.can_edit_household(public.storage_household_id(name))
  );

create policy "diagnostic_images_delete_household_editors" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'diagnostic-images'
    and name like '%/diagnostics/%/image.jpg'
    and public.storage_household_id(name) is not null
    and public.can_edit_household(public.storage_household_id(name))
  );
