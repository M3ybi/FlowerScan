drop policy if exists "plant_images_insert_household_editors" on storage.objects;
drop policy if exists "plant_images_update_household_editors" on storage.objects;
drop policy if exists "diagnostic_images_insert_household_editors" on storage.objects;
drop policy if exists "diagnostic_images_update_household_editors" on storage.objects;

create policy "plant_images_insert_via_validated_service_only" on storage.objects
  for insert
  to authenticated
  with check (false);

create policy "plant_images_update_via_validated_service_only" on storage.objects
  for update
  to authenticated
  using (false)
  with check (false);

create policy "diagnostic_images_insert_via_validated_service_only" on storage.objects
  for insert
  to authenticated
  with check (false);

create policy "diagnostic_images_update_via_validated_service_only" on storage.objects
  for update
  to authenticated
  using (false)
  with check (false);
