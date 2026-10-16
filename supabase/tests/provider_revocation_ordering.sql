-- Execute in BEGIN/ROLLBACK. Uses only synthetic subscription records.
do $test$
declare
  owner_id uuid := gen_random_uuid();
  home_id uuid := gen_random_uuid();
  customer text;
  prefix text := gen_random_uuid()::text;
begin
  insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at)
  values(owner_id,'authenticated','authenticated','revocation-' || owner_id || '@example.invalid',now(),now(),now());
  insert into public.households(id,name,created_by) values(home_id,'Revocation fixture',owner_id);
  insert into public.household_members(household_id,user_id,role,status) values(home_id,owner_id,'owner','active');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  customer := public.begin_household_purchase(home_id);
  execute 'reset role';
  execute 'set local role service_role';
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform public.apply_household_provider_event(customer,prefix || '-purchase','INITIAL_PURCHASE',
    'premium_monthly','active','monthly','web',prefix,now(),now()+interval '1 month',now(),'{}');
  if not public.apply_household_provider_event(customer,prefix || '-refund','CANCELLATION',
    'premium_monthly','refunded','monthly','web',prefix,now(),now(),now()+interval '1 second','{}') then
    raise exception 'Provider revocation shortening a paid period was ignored.';
  end if;
  execute 'reset role';
  if public.is_household_premium_at(home_id,now()) then raise exception 'Refunded household retained Premium.'; end if;
  execute 'set local role service_role';
  if public.apply_household_provider_event(customer,prefix || '-stale','RENEWAL',
    'premium_monthly','active','monthly','web',prefix,now(),now()+interval '1 month',now(),'{}') then
    raise exception 'Older renewal resurrected revoked Premium.';
  end if;
  execute 'reset role';
end;
$test$;
