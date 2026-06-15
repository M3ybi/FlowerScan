do $$
declare
  matched_count integer;
  updated_id uuid;
begin
  select count(*)::integer into matched_count
  from public.households
  where lower(trim(name)) in ('petzvalova', 'petzvalova household')
     or lower(trim(coalesce(legacy_public_token, ''))) = 'petzvalova';

  if matched_count = 0 then
    raise warning 'Petzvalova household was not found; no premium grant was applied.';
  elsif matched_count > 1 then
    raise exception 'Petzvalova premium grant is ambiguous; % households matched.', matched_count;
  else
    update public.households
    set plan_key = 'premium',
        premium_enabled = true,
        premium_source = 'manual_admin_grant',
        premium_started_at = coalesce(premium_started_at, now()),
        premium_expires_at = null,
        updated_at = now()
    where lower(trim(name)) in ('petzvalova', 'petzvalova household')
       or lower(trim(coalesce(legacy_public_token, ''))) = 'petzvalova'
    returning id into updated_id;

    raise notice 'Enabled unlimited premium for Petzvalova household %.', updated_id;
  end if;
end $$;
