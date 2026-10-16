-- Existing larger files remain readable. New writes use normalized JPEG <= 2 MiB.
-- RLS and object path conventions are unchanged.
update storage.buckets
set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg']
where id in ('plant-images', 'diagnostic-images');
