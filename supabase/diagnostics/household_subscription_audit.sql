-- Read-only production diagnostics. No tokens, passwords or provider secrets.
select u.email, u.email_confirmed_at is not null as email_confirmed,
  p.id is not null as has_profile, h.id as household_id, h.name,
  hm.role, hm.status as membership_status,
  public.is_household_premium_at(h.id,now()) as effective_premium,
  h.premium_source, hs.plan_key, hs.status as provider_status, hs.current_period_end
from auth.users u
left join public.profiles p on p.id=u.id
left join public.household_members hm on hm.user_id=u.id
left join public.households h on h.id=hm.household_id
left join public.household_subscriptions hs on hs.household_id=h.id
where lower(u.email) in ('fedorcor28@gmail.com','majercakovalenka01@gmail.com');

select n.nspname as schema, c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','storage') and c.relkind='r' order by 1,2;
select schemaname,tablename,policyname,cmd,roles,qual,with_check
from pg_policies where schemaname in ('public','storage') order by 1,2,3;
select n.nspname,c.relname,con.conname,pg_get_constraintdef(con.oid) as definition
from pg_constraint con join pg_class c on c.oid=con.conrelid
join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by 2,3;
select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname='public' order by 2,3;
select n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal order by 2,3;
select p.proname,p.prosecdef as security_definer,p.proacl,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' order by 1;
select id,public,file_size_limit,allowed_mime_types from storage.buckets;
select plan_key,ai_scans_monthly_limit,plants_limit,qr_labels_limit from public.subscription_plans;
select current_setting('TimeZone') as database_timezone,
  public.household_usage_period_start() as quota_period_start,
  public.household_usage_period_end() as quota_period_end;
