begin;

-- Request admission is separate from subscription usage. Rejections and provider
-- failures consume anti-abuse capacity, never the customer's monthly allowance.
create table public.image_operation_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (operation in ('validation', 'upload', 'care', 'test_email')),
  window_started timestamptz not null default now(),
  requests integer not null check (requests > 0),
  primary key (user_id, operation)
);
alter table public.image_operation_limits enable row level security;
revoke all on public.image_operation_limits from public, anon, authenticated;

create function public.admit_image_operation(requested_operation text)
returns void language plpgsql security definer set search_path = public as $$
declare
  requester uuid := auth.uid();
  request_limit integer;
  admitted integer;
begin
  if requester is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  request_limit := case requested_operation when 'validation' then 60 when 'upload' then 40 when 'care' then 30 when 'test_email' then 3 else null end;
  if request_limit is null then raise exception 'INVALID_OPERATION'; end if;
  insert into public.image_operation_limits as limits(user_id, operation, requests)
  values (requester, requested_operation, 1)
  on conflict (user_id, operation) do update set
    requests = case when limits.window_started <= now() - interval '1 hour' then 1 else limits.requests + 1 end,
    window_started = case when limits.window_started <= now() - interval '1 hour' then now() else limits.window_started end
  where limits.window_started <= now() - interval '1 hour' or limits.requests < request_limit
  returning requests into admitted;
  if admitted is null then raise exception 'IMAGE_RATE_LIMITED'; end if;
end;
$$;
revoke all on function public.admit_image_operation(text) from public, anon;
grant execute on function public.admit_image_operation(text) to authenticated;

create table public.image_upload_intents (
  bucket_id text not null check (bucket_id in ('plant-images', 'diagnostic-images')),
  path text not null,
  household_id uuid not null references public.households(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (bucket_id, path)
);
create index image_upload_intents_household_idx on public.image_upload_intents(household_id);
alter table public.image_upload_intents enable row level security;
revoke all on public.image_upload_intents from public, anon, authenticated;

create function public.reserve_image_upload(target_household_id uuid, image_kind text, image_id uuid)
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
revoke all on function public.reserve_image_upload(uuid, text, uuid) from public, anon;
grant execute on function public.reserve_image_upload(uuid, text, uuid) to authenticated;

commit;
