-- Run after the lifecycle migration inside a single BEGIN/ROLLBACK transaction.
-- All writes use randomly generated fixture users/households; no real tokens or
-- production membership rows are read into output, sent, deleted or changed.
do $test$
#variable_conflict use_variable
declare
  owner_id uuid := gen_random_uuid();
  existing_viewer_id uuid := gen_random_uuid();
  recipient_id uuid := gen_random_uuid();
  wrong_id uuid := gen_random_uuid();
  unverified_id uuid := gen_random_uuid();
  household_id uuid := gen_random_uuid();
  existing_household_id uuid := gen_random_uuid();
  other_household_id uuid := gen_random_uuid();
  standalone_household_id uuid;
  plant_id uuid := gen_random_uuid();
  other_plant_id uuid := gen_random_uuid();
  viewer_plant_id uuid := gen_random_uuid();
  future_email text := 'recipient-' || recipient_id::text || '@example.invalid';
  unverified_email text := 'unverified-' || unverified_id::text || '@example.invalid';
  invitation record;
  replacement record;
  entitlement record;
  joined public.households;
  error_caught boolean;
  affected integer;
  original_membership_count integer;
begin
  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values
    (owner_id, 'authenticated', 'authenticated', 'owner-' || owner_id::text || '@example.invalid', now(), now(), now()),
    (existing_viewer_id, 'authenticated', 'authenticated', 'viewer-' || existing_viewer_id::text || '@example.invalid', now(), now(), now()),
    (wrong_id, 'authenticated', 'authenticated', 'wrong-' || wrong_id::text || '@example.invalid', now(), now(), now()),
    (unverified_id, 'authenticated', 'authenticated', unverified_email, null, now(), now());
  insert into public.households (id, name, created_by, plan_key, premium_enabled, premium_expires_at)
  values (household_id, 'Invitation lifecycle fixture', owner_id, 'premium', true, now() + interval '1 year'),
    (other_household_id, 'Unrelated fixture', wrong_id, 'free', false, null);
  insert into public.household_members (household_id, user_id, role, status)
  values (household_id, owner_id, 'owner', 'active'),
    (household_id, existing_viewer_id, 'viewer', 'active'),
    (other_household_id, wrong_id, 'owner', 'active');
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  insert into public.plants (id, household_id, source, display_name, likely_name, identification,
    identification_note, short_care, light, watering, soil, created_by)
  values (plant_id, household_id, 'custom', 'Shared fixture plant', 'Fixture', 'confident', '', '', '', '', '', owner_id);
  perform set_config('request.jwt.claim.sub', wrong_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', wrong_id, 'role', 'authenticated')::text, true);
  insert into public.plants (id, household_id, source, display_name, likely_name, identification,
    identification_note, short_care, light, watering, soil, created_by)
  values (other_plant_id, other_household_id, 'custom', 'Other fixture plant', 'Fixture', 'confident', '', '', '', '', '', wrong_id);

  if exists (select 1 from auth.users where email = future_email) then
    raise exception 'Fixture recipient must initially be unregistered.';
  end if;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into invitation from public.create_household_invite(household_id, '  ' || upper(future_email) || '  ');
  if invitation.invitee_email <> future_email or invitation.role <> 'viewer'
    or invitation.expires_at <> invitation.created_at + interval '7 days' then
    raise exception 'Invitation must normalize email, assign Viewer and expire in seven days.';
  end if;
  if not exists (select 1 from public.get_household_invite_delivery(invitation.id) delivery
    where delivery.invitee_email = future_email and delivery.token = invitation.token
      and delivery.expires_at = invitation.expires_at) then
    raise exception 'Owner retry did not recover original token, recipient and expiry.';
  end if;
  select * into entitlement from public.get_household_entitlement(household_id);
  if entitlement.active_member_count <> 2 or entitlement.pending_invite_count <> 1 or entitlement.used_capacity <> 3 then
    raise exception 'Two active plus one pending must occupy exactly three slots.';
  end if;
  error_caught := false;
  begin perform public.create_household_invite(household_id, future_email);
    exception when unique_violation then error_caught := true; end;
  if not error_caught then raise exception 'Normalized duplicate invitation was allowed.'; end if;
  error_caught := false;
  begin perform public.create_household_invite(household_id, 'extra@example.invalid');
    exception when check_violation then error_caught := true; end;
  if not error_caught then raise exception 'Full occupied capacity did not reject a fourth slot.'; end if;
  error_caught := false;
  begin perform public.create_household_invite(household_id, 'owner-invite@example.invalid', 'owner');
    exception when invalid_parameter_value then error_caught := true; end;
  if not error_caught then raise exception 'Ordinary invitation allowed Owner role.'; end if;

  -- Anonymous token lookup previews only; an identifier is never authorization.
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}'::text, true);
  execute 'set local role anon';
  if (select status from public.get_household_invitation(invitation.token)) <> 'pending' then
    raise exception 'Anonymous secure token preview failed.';
  end if;
  error_caught := false;
  begin perform public.get_household_invitation(null, invitation.id);
    exception when insufficient_privilege then error_caught := true; end;
  if not error_caught then raise exception 'Anonymous identifier enumerated an invitation.'; end if;
  error_caught := false;
  begin perform public.accept_household_invitation(invitation.id);
    exception when insufficient_privilege then error_caught := true; end;
  if not error_caught then raise exception 'Anonymous recipient accepted invitation.'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', wrong_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', wrong_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if (select count(*) from public.list_my_household_invitations()) <> 0 then
    raise exception 'Unrelated verified email enumerated inbox.';
  end if;
  if (select count(*) from public.get_household_invitation(null, invitation.id)) <> 0 then
    raise exception 'Unrelated verified email enumerated identifier preview.';
  end if;
  error_caught := false;
  begin perform public.join_household_by_invite(invitation.token);
    exception when insufficient_privilege then error_caught := true; end;
  if not error_caught then raise exception 'Possession of token bypassed matching email.'; end if;
  error_caught := false;
  begin perform public.decline_household_invitation(invitation.id);
    exception when insufficient_privilege then error_caught := true; end;
  if not error_caught then raise exception 'Wrong account declined invitation.'; end if;
  execute 'reset role';

  -- Registration creates an independent default household. Accepting the invite
  -- adds membership without changing that household, its plants or care data.
  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (recipient_id, 'authenticated', 'authenticated', future_email, now(), now(), now());
  insert into public.households (id, name, created_by) values (existing_household_id, 'Existing recipient fixture', recipient_id);
  insert into public.household_members (household_id, user_id, role) values (existing_household_id, recipient_id, 'owner');
  select count(*)::integer into original_membership_count from public.household_members where user_id = recipient_id;
  perform set_config('request.jwt.claim.sub', recipient_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', recipient_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if (select count(*) from public.list_my_household_invitations()) <> 1 then
    raise exception 'New verified recipient did not discover email-first invitation.';
  end if;
  joined := public.accept_household_invitation(invitation.id);
  if joined.id <> household_id then raise exception 'Accepted membership returned incorrect household.'; end if;
  joined := public.join_household_by_invite(invitation.token);
  if joined.id <> household_id then raise exception 'Idempotent retry failed.'; end if;
  if (select count(*) from public.list_my_household_invitations()) <> 0 then
    raise exception 'Accepted invitation remained in inbox.';
  end if;
  if (select count(*) from public.list_my_households()) <> 2 then
    raise exception 'Acceptance lost an existing household or failed to add the new one.';
  end if;
  select * into entitlement from public.get_household_entitlement(household_id);
  if entitlement.active_member_count <> 3 or entitlement.pending_invite_count <> 0 or entitlement.used_capacity <> 3
    or entitlement.role <> 'viewer' then raise exception 'Acceptance must convert reserved to active Viewer slot.'; end if;
  if (select status from public.get_household_invitation(invitation.token)) <> 'accepted' then
    raise exception 'Accepted preview did not preserve terminal status.';
  end if;

  -- Real authenticated RLS permits Viewer content changes, including plants
  -- created by another member, while keeping other households inaccessible.
  update public.plants set display_name = 'Viewer edited shared plant' where id = plant_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Viewer could not edit another household member plant.'; end if;
  insert into public.plant_care_records (plant_id, household_id, last_watered, note, updated_by)
    values (plant_id, household_id, current_date, 'Viewer care note', recipient_id);
  insert into public.plant_care_pills (plant_id, label, value, tone, position)
    values (plant_id, 'Fixture pill', 'Fixture value', 'green', 0);
  insert into public.plant_care_tips (plant_id, tip, position) values (plant_id, 'Viewer tip', 0);
  update public.plants set watering_interval_days = 5 where id = plant_id;
  insert into public.plants (id, household_id, source, display_name, likely_name, identification,
    identification_note, short_care, light, watering, soil, created_by)
  values (viewer_plant_id, household_id, 'custom', 'Viewer created plant', 'Fixture', 'confident', '', '', '', '', '', recipient_id);
  insert into public.plant_diagnostics (household_id, plant_id, diagnosis_title, confidence, confidence_label,
    reasoning_summary, risk_level, disclaimer, user_confirmation)
  values (household_id, plant_id, 'Viewer diagnosis', 90, 'vysoka', 'Fixture', 'low', 'Fixture', 'confirmed');
  delete from public.plants where id = viewer_plant_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Viewer could not delete household plant.'; end if;
  update public.plants set display_name = 'Should not change' where id = other_plant_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Viewer mutated unrelated household plant.'; end if;
  error_caught := false;
  begin insert into public.plants (household_id, source, display_name, likely_name, identification,
    identification_note, short_care, light, watering, soil)
    values (other_household_id, 'custom', 'Forbidden', 'Fixture', 'confident', '', '', '', '', '');
    exception when insufficient_privilege then error_caught := true; end;
  if not error_caught then raise exception 'Viewer inserted plant in unrelated household.'; end if;
  error_caught := false;
  begin perform public.rename_household(household_id, 'Forbidden Viewer rename');
    exception when others then error_caught := true; end;
  if not error_caught then raise exception 'Viewer administered household.'; end if;
  error_caught := false;
  begin perform public.create_household_invite(household_id, 'viewer-forged@example.invalid');
    exception when insufficient_privilege then error_caught := true; end;
  if not error_caught then raise exception 'Viewer forged household invitation.'; end if;
  error_caught := false;
  begin perform public.remove_household_member(household_id, existing_viewer_id);
    exception when insufficient_privilege then error_caught := true; end;
  if not error_caught then raise exception 'Viewer removed another member.'; end if;
  error_caught := false;
  begin perform public.get_household_invite_delivery(invitation.id);
    exception when insufficient_privilege then error_caught := true; end;
  if not error_caught then raise exception 'Viewer recovered an Owner invite token.'; end if;
  execute 'reset role';
  if (select count(*) from public.household_members where user_id = recipient_id) <> original_membership_count + 1
    or not exists (select 1 from public.household_members hm where hm.household_id = existing_household_id and hm.user_id = recipient_id and hm.role = 'owner')
    or not exists (select 1 from public.households where id = existing_household_id and name = 'Existing recipient fixture' and plan_key = 'free') then
    raise exception 'Invitation changed existing membership or household plan.';
  end if;

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  error_caught := false;
  begin perform public.remove_household_member(household_id, owner_id);
    exception when invalid_parameter_value then error_caught := true; end;
  if not error_caught then raise exception 'Owner removed themselves through generic removal.'; end if;
  if public.remove_household_member(household_id, recipient_id) <> existing_household_id then
    raise exception 'Viewer removal failed to preserve usable existing household fallback.';
  end if;
  select * into replacement from public.create_household_invite(household_id, unverified_email);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', unverified_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', unverified_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  error_caught := false;
  begin perform public.list_my_household_invitations();
    exception when insufficient_privilege then error_caught := true; end;
  if not error_caught then raise exception 'Unverified email accessed invitation inbox.'; end if;
  error_caught := false;
  begin perform public.accept_household_invitation(replacement.id);
    exception when insufficient_privilege then error_caught := true; end;
  if not error_caught then raise exception 'Unverified email accepted invitation.'; end if;
  execute 'reset role';
  update auth.users set email_confirmed_at = now() where id = unverified_id;
  execute 'set local role authenticated';
  perform public.decline_household_invitation(replacement.id);
  perform public.decline_household_invitation(replacement.id);
  if (select count(*) from public.list_my_household_invitations()) <> 0 then
    raise exception 'Declined invitation remained in inbox.';
  end if;
  execute 'reset role';
  if exists (select 1 from public.household_members hm where hm.household_id = household_id and hm.user_id = unverified_id) then
    raise exception 'Decline created membership.';
  end if;

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into replacement from public.create_household_invite(household_id, unverified_email);
  perform public.revoke_household_invite(replacement.id);
  if (select count(*) from public.list_household_invites(household_id)) <> 0 then
    raise exception 'Revoked or declined invitation remained in current Owner list.';
  end if;
  select * into replacement from public.create_household_invite(household_id, unverified_email);
  execute 'reset role';
  update public.household_invites hi set expires_at = now() where hi.id = replacement.id;
  perform set_config('request.jwt.claim.sub', unverified_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', unverified_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if (select count(*) from public.list_my_household_invitations()) <> 0
    or (select status from public.get_household_invitation(replacement.token)) <> 'expired' then
    raise exception 'Expired invitation remained actionable before reconciliation.';
  end if;
  error_caught := false;
  begin perform public.accept_household_invitation(replacement.id);
    exception when invalid_parameter_value then error_caught := true; end;
  if not error_caught then raise exception 'Expired invitation accepted membership.'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into replacement from public.create_household_invite(household_id, unverified_email);
  select * into entitlement from public.get_household_entitlement(household_id);
  if entitlement.used_capacity <> 3 then raise exception 'Expired history blocked replacement or double-counted slots.'; end if;
  execute 'reset role';

  -- Time-based Premium expiry invalidates invites and suspends only Viewers.
  update public.households h set premium_expires_at = now() where h.id = household_id;
  perform public.reconcile_household_access(household_id);
  if not exists (select 1 from public.household_members hm where hm.household_id = household_id and hm.user_id = owner_id and hm.status = 'active')
    or exists (select 1 from public.household_members hm where hm.household_id = household_id and hm.role = 'viewer' and hm.status = 'active') then
    raise exception 'Expired plan did not retain Owners and suspend Viewers.';
  end if;
  perform set_config('request.jwt.claim.sub', existing_viewer_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', existing_viewer_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.plants set display_name = 'Suspended forbidden change' where id = plant_id;
  get diagnostics affected = row_count;
  if affected <> 0 or (select count(*) from public.list_my_households()) <> 0 then
    raise exception 'Suspended Viewer retained plant access or active household directory entry.';
  end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into entitlement from public.get_household_entitlement(household_id);
  if entitlement.is_premium or entitlement.max_members <> 1 or entitlement.pending_invite_count <> 0 then
    raise exception 'Free entitlement or pending expiry mismatch.';
  end if;
  error_caught := false;
  begin perform public.create_household_invite(household_id, 'free-forged@example.invalid');
    exception when insufficient_privilege then error_caught := true; end;
  if not error_caught then raise exception 'Free household accepted forged invitation.'; end if;
  execute 'reset role';
  update public.households h set premium_expires_at = now() + interval '1 year' where h.id = household_id;
  perform public.reconcile_household_access(household_id);
  if not exists (select 1 from public.household_members hm where hm.household_id = household_id and hm.user_id = existing_viewer_id and hm.status = 'active') then
    raise exception 'Premium restoration failed to reactivate suspended Viewer.';
  end if;

  -- A first-household recipient may have only Viewer memberships. Removing
  -- access from two households must eventually create one independent Free home.
  update public.households h set plan_key = 'premium', premium_enabled = true,
    premium_expires_at = now() + interval '1 year' where h.id = other_household_id;
  insert into public.household_members (household_id, user_id, role, status)
    values (other_household_id, existing_viewer_id, 'viewer', 'active');
  execute 'set local role authenticated';
  if public.remove_household_member(household_id, existing_viewer_id) <> other_household_id then
    raise exception 'Viewer-only recipient did not retain their other usable household.';
  end if;
  execute 'reset role';
  if not exists (select 1 from pg_locks locks where locks.locktype = 'advisory'
    and locks.pid = pg_backend_pid() and locks.granted and locks.classid = 76271::oid
    and locks.objid = (hashtext(existing_viewer_id::text)::bigint & 4294967295)::oid and locks.objsubid = 2) then
    raise exception 'Viewer removal did not retain the per-recipient transaction lock.';
  end if;
  perform set_config('request.jwt.claim.sub', wrong_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', wrong_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  standalone_household_id := public.remove_household_member(other_household_id, existing_viewer_id);
  if public.remove_household_member(other_household_id, existing_viewer_id) is not null then
    raise exception 'Repeated Viewer removal unexpectedly created another fallback.';
  end if;
  execute 'reset role';
  if standalone_household_id is null
    or (select count(*) from public.household_members hm where hm.user_id = existing_viewer_id) <> 1
    or not exists (select 1 from public.household_members hm where hm.household_id = standalone_household_id
      and hm.user_id = existing_viewer_id and hm.role = 'owner' and hm.status = 'active')
    or not exists (select 1 from public.households h where h.id = standalone_household_id
      and h.created_by = existing_viewer_id and h.plan_key = 'free' and not h.premium_enabled)
    or not exists (select 1 from public.household_report_settings settings where settings.household_id = standalone_household_id)
    or not exists (select 1 from public.plants p where p.id = plant_id and p.household_id = household_id)
    or not exists (select 1 from public.plants p where p.id = other_plant_id and p.household_id = other_household_id) then
    raise exception 'Last Viewer removal did not create one independent Free home while preserving shared plants.';
  end if;

  error_caught := false;
  begin insert into public.household_members (household_id, user_id, role) values (household_id, unverified_id, 'owner');
    exception when check_violation then error_caught := true; end;
  if not error_caught then raise exception 'Standard household allowed a second Owner.'; end if;
  error_caught := false;
  begin insert into public.household_members (household_id, user_id, role) values (household_id, unverified_id, 'editor');
    exception when check_violation then error_caught := true; end;
  if not error_caught then raise exception 'Historical Editor enum allowed an unsupported persisted role.'; end if;
  if exists (select 1 from public.household_members hm where hm.role not in ('owner','viewer')) then
    raise exception 'Unsupported role persisted after migration.';
  end if;
  if not exists (select 1 from public.households h where h.special_coowner_user_id is not null
    and h.household_type = 'admin_special' and h.max_owner_count = 2
    and (select count(*) from public.household_members hm where hm.household_id = h.id and hm.role = 'owner') = 2) then
    raise exception 'Configured administrative coownership was not preserved.';
  end if;
  raise notice 'Household lifecycle, verified recipient, capacity, idempotency, RLS and expiry assertions passed.';
end;
$test$;
