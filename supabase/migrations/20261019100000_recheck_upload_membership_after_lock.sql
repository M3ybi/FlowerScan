-- Preserve upload admission limits while authorizing at the serialized reservation.
-- No signatures, grants, records or Storage policies change.
begin;

create or replace function public.reserve_image_upload(target_household_id uuid, image_kind text, image_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  target_bucket text;
  target_path text;
  pending integer;
begin
  if not public.can_manage_household_content(target_household_id) then raise exception 'HOUSEHOLD_ACCESS_DENIED'; end if;
  if image_kind not in ('plant', 'diagnostic') or image_kind is null or image_id is null then raise exception 'INVALID_IMAGE'; end if;
  target_bucket := case image_kind when 'plant' then 'plant-images' else 'diagnostic-images' end;
  target_path := target_household_id::text || case image_kind when 'plant' then '/plants/' else '/diagnostics/' end || image_id::text || case image_kind when 'plant' then '/original.jpg' else '/image.jpg' end;
  -- Serialize reservations, not external Storage requests. Outstanding intents
  -- count immediately, so simultaneous uploads cannot all pass an empty count.
  perform 1 from public.households where id = target_household_id for update;
  -- Membership may have been revoked while this reservation waited for the lock.
  if not public.can_manage_household_content(target_household_id) then raise exception 'HOUSEHOLD_ACCESS_DENIED'; end if;
  delete from public.image_upload_intents i where i.household_id = target_household_id and (
    (i.bucket_id = 'plant-images' and exists (select 1 from public.plants p where p.household_id = target_household_id and p.image_path = i.path))
    or (i.bucket_id = 'diagnostic-images' and exists (select 1 from public.plant_diagnostics d where d.household_id = target_household_id and d.image_path = i.path))
    or (i.created_at < now() - interval '1 hour' and not exists (select 1 from storage.objects o where o.bucket_id = i.bucket_id and o.name = i.path))
  );
  if exists (select 1 from public.image_upload_intents where bucket_id = target_bucket and path = target_path)
    or (image_kind = 'plant' and exists (select 1 from public.plants where household_id = target_household_id and image_path = target_path))
    or (image_kind = 'diagnostic' and exists (select 1 from public.plant_diagnostics where household_id = target_household_id and image_path = target_path)) then return; end if;
  select count(*) into pending from (
    select i.bucket_id, i.path from public.image_upload_intents i where i.household_id = target_household_id
    union
    select o.bucket_id, o.name from storage.objects o where o.bucket_id in ('plant-images', 'diagnostic-images') and o.name like target_household_id::text || '/%'
      and not exists (select 1 from public.plants p where p.household_id = target_household_id and p.image_path = o.name and o.bucket_id = 'plant-images')
      and not exists (select 1 from public.plant_diagnostics d where d.household_id = target_household_id and d.image_path = o.name and o.bucket_id = 'diagnostic-images')
  ) outstanding;
  if pending >= 20 then raise exception 'IMAGE_UPLOAD_CAPACITY'; end if;
  insert into public.image_upload_intents(bucket_id, path, household_id) values (target_bucket, target_path, target_household_id);
end;
$$;

commit;
