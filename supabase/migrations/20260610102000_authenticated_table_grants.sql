grant usage on schema public to authenticated;

do $grant_authenticated_tables$
declare
  table_name text;
  writable_tables text[] := array[
    'profiles',
    'households',
    'household_members',
    'household_invites',
    'plants',
    'plant_care_pills',
    'plant_care_tips',
    'plant_care_records',
    'plant_diagnostics',
    'diagnostic_observed_symptoms',
    'diagnostic_recommended_steps',
    'household_report_settings',
    'push_subscriptions',
    'ai_requests',
    'notification_deliveries'
  ];
  readable_tables text[] := array[
    'plant_catalog',
    'subscription_plans',
    'user_subscriptions',
    'subscription_events',
    'user_entitlements',
    'usage_counters'
  ];
begin
  foreach table_name in array writable_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    end if;
  end loop;

  foreach table_name in array readable_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('grant select on table public.%I to authenticated', table_name);
    end if;
  end loop;
end
$grant_authenticated_tables$;

grant usage, select on all sequences in schema public to authenticated;
