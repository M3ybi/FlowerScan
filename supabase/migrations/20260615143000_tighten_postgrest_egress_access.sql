revoke all on table public.profiles from anon;
revoke all on table public.households from anon;
revoke all on table public.household_members from anon;
revoke all on table public.household_invites from anon;
revoke all on table public.plants from anon;
revoke all on table public.plant_care_records from anon;
revoke all on table public.plant_diagnostics from anon;
revoke all on table public.diagnostic_observed_symptoms from anon;
revoke all on table public.diagnostic_recommended_steps from anon;
revoke all on table public.household_report_settings from anon;
revoke all on table public.push_subscriptions from anon;
revoke all on table public.ai_requests from anon;
revoke all on table public.notification_deliveries from anon;
revoke all on table public.user_subscriptions from anon;
revoke all on table public.subscription_events from anon;
revoke all on table public.user_entitlements from anon;
revoke all on table public.usage_counters from anon;
revoke all on table public.household_usage_counters from anon;
revoke all on table public.household_usage_reservations from anon;
revoke all on table public.plant_care_tip_generations from anon;

grant select on table public.plant_catalog to anon;
grant select on table public.plant_care_pills to anon;
grant select on table public.plant_care_tips to anon;
grant select on table public.subscription_plans to anon;

drop policy if exists "plant_catalog_select_all" on public.plant_catalog;
create policy "plant_catalog_select_active_public" on public.plant_catalog
  for select to anon, authenticated using (is_active = true);

create index if not exists plants_household_legacy_id_idx on public.plants(household_id, legacy_id);
create index if not exists plants_household_created_at_idx on public.plants(household_id, created_at);
create index if not exists plant_diagnostics_household_created_at_idx on public.plant_diagnostics(household_id, created_at desc);
create index if not exists plant_diagnostics_plant_created_at_idx on public.plant_diagnostics(plant_id, created_at desc);
create index if not exists plant_care_records_household_plant_idx on public.plant_care_records(household_id, plant_id);
create index if not exists household_usage_counters_household_type_period_idx
  on public.household_usage_counters(household_id, usage_type, period_start);
