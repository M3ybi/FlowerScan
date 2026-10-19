begin;

-- Customer entitlements are unchanged. These are hourly per-user request limits
-- shared across households, including Premium diagnosis and invitation retries.
alter table public.image_operation_limits drop constraint image_operation_limits_operation_check;
alter table public.image_operation_limits add constraint image_operation_limits_operation_check
  check (operation in ('validation', 'upload', 'care', 'test_email', 'diagnosis', 'invite_email'));

create or replace function public.admit_image_operation(requested_operation text)
returns void language plpgsql security definer set search_path = public as $$
declare
  requester uuid := auth.uid();
  request_limit integer;
  admitted integer;
begin
  if requester is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  request_limit := case requested_operation when 'validation' then 60 when 'upload' then 40 when 'care' then 30 when 'test_email' then 3 when 'diagnosis' then 30 when 'invite_email' then 6 else null end;
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

commit;
