begin;

-- An authenticated review queue, never an account-deletion command.
create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  status text not null default 'requested' check (status in ('requested', 'processing', 'completed')),
  requested_at timestamptz not null default now(),
  identity_verified_at timestamptz not null default now()
);
create index account_deletion_review_status_idx on public.account_deletion_requests(status, requested_at);
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public, anon, authenticated;
grant select on public.account_deletion_requests to authenticated;
grant all on public.account_deletion_requests to service_role;
create policy account_deletion_request_self_read on public.account_deletion_requests
  for select to authenticated using (user_id = auth.uid());

create table public.account_deletion_request_audit (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.account_deletion_requests(id) on delete cascade,
  previous_status text,
  status text not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
alter table public.account_deletion_request_audit enable row level security;
revoke all on public.account_deletion_request_audit from public, anon, authenticated;
grant select on public.account_deletion_request_audit to service_role;

create function public.audit_account_deletion_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.account_deletion_request_audit(request_id, status, changed_by)
      values (new.id, new.status, auth.uid());
  elsif old.status is distinct from new.status then
    insert into public.account_deletion_request_audit(request_id, previous_status, status, changed_by)
      values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function public.audit_account_deletion_request() from public, anon, authenticated;
create trigger audit_account_deletion_request after insert or update on public.account_deletion_requests
  for each row execute function public.audit_account_deletion_request();

create function public.request_account_deletion()
returns table (request_id uuid, request_status text, requested_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare requester uuid := auth.uid();
begin
  if requester is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501'; end if;
  -- One row per verified identity makes retries and lost responses safe.
  return query insert into public.account_deletion_requests as requests(user_id)
    values (requester) on conflict (user_id) do update set user_id = excluded.user_id
    returning requests.id, requests.status, requests.requested_at;
end;
$$;
revoke all on function public.request_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;

commit;
