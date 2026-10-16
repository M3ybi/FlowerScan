-- Execute after the matching migration, in BEGIN/ROLLBACK.
do $$
begin
  if (select count(*) from storage.buckets where id in ('plant-images','diagnostic-images')
    and public=false and file_size_limit=2097152 and allowed_mime_types=array['image/jpeg']) <> 2 then
    raise exception 'Both private image buckets must enforce normalized JPEG <= 2 MiB.';
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname='plant_images_select_household_members') then
    raise exception 'Household image RLS was lost.';
  end if;
end;
$$;
