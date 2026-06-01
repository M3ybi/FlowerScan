create extension if not exists "pgcrypto";

create type public.plant_source as enum ('built_in', 'custom');
create type public.identification_status as enum ('confident', 'likely', 'needs_confirmation');
create type public.care_pill_tone as enum ('green', 'amber', 'blue', 'rose');
create type public.household_member_role as enum ('owner', 'editor', 'viewer');
create type public.diagnosis_confidence_label as enum ('nizka', 'stredna', 'vysoka');
create type public.diagnosis_risk_level as enum ('low', 'medium', 'high');
create type public.diagnosis_confirmation as enum ('confirmed', 'rejected');
create type public.request_status as enum ('pending', 'succeeded', 'failed');
create type public.delivery_type as enum ('email_report', 'push_watering');
create type public.delivery_status as enum ('pending', 'sent', 'skipped', 'failed');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legacy_public_token text unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.household_member_role not null default 'editor',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  token_hash text not null unique,
  role public.household_member_role not null default 'editor',
  expires_at timestamptz,
  used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plant_catalog (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  display_name text not null,
  likely_name text not null,
  identification public.identification_status not null,
  identification_note text not null,
  image_path text,
  short_care text not null,
  light text not null,
  watering text not null,
  watering_interval_days integer check (watering_interval_days is null or watering_interval_days between 1 and 90),
  soil text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plants (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  catalog_plant_id uuid references public.plant_catalog(id) on delete set null,
  legacy_id text,
  source public.plant_source not null,
  display_name text not null,
  likely_name text not null,
  identification public.identification_status not null,
  identification_note text not null,
  image_path text,
  short_care text not null,
  light text not null,
  watering text not null,
  watering_interval_days integer check (watering_interval_days is null or watering_interval_days between 1 and 90),
  notifications_enabled boolean not null default true,
  soil text not null,
  is_removed boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, legacy_id),
  unique (id, household_id)
);

create table public.plant_care_pills (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid references public.plants(id) on delete cascade,
  catalog_plant_id uuid references public.plant_catalog(id) on delete cascade,
  label text not null,
  value text not null,
  tone public.care_pill_tone not null,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((plant_id is not null) <> (catalog_plant_id is not null))
);

create table public.plant_care_tips (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid references public.plants(id) on delete cascade,
  catalog_plant_id uuid references public.plant_catalog(id) on delete cascade,
  tip text not null,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((plant_id is not null) <> (catalog_plant_id is not null))
);

create table public.plant_care_records (
  plant_id uuid primary key,
  household_id uuid not null,
  last_watered date,
  last_fertilized date,
  last_transplanted date,
  note text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (plant_id, household_id) references public.plants(id, household_id) on delete cascade
);

create table public.plant_diagnostics (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  plant_id uuid not null,
  legacy_id text,
  image_path text,
  diagnosis_title text not null,
  confidence integer not null check (confidence between 0 and 100),
  confidence_label public.diagnosis_confidence_label not null,
  reasoning_summary text not null,
  risk_level public.diagnosis_risk_level not null,
  disclaimer text not null,
  user_confirmation public.diagnosis_confirmation not null,
  user_note text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, legacy_id),
  foreign key (plant_id, household_id) references public.plants(id, household_id) on delete cascade
);

create table public.diagnostic_observed_symptoms (
  id uuid primary key default gen_random_uuid(),
  diagnostic_id uuid not null references public.plant_diagnostics(id) on delete cascade,
  symptom text not null,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.diagnostic_recommended_steps (
  id uuid primary key default gen_random_uuid(),
  diagnostic_id uuid not null references public.plant_diagnostics(id) on delete cascade,
  step text not null,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_report_settings (
  household_id uuid primary key references public.households(id) on delete cascade,
  recipient_email text,
  last_sent_date date,
  last_push_notification_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text not null unique,
  expiration_time timestamptz,
  auth_key text not null,
  p256dh_key text not null,
  platform text,
  device_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  request_type text not null,
  model text,
  status public.request_status not null default 'pending',
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  delivery_type public.delivery_type not null,
  delivery_date date not null,
  status public.delivery_status not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, delivery_type, delivery_date)
);

create index profiles_updated_at_idx on public.profiles(updated_at);
create index households_created_by_idx on public.households(created_by);
create index households_legacy_public_token_idx on public.households(legacy_public_token);
create index household_members_household_id_idx on public.household_members(household_id);
create index household_members_user_id_idx on public.household_members(user_id);
create index household_invites_household_id_idx on public.household_invites(household_id);
create index plant_catalog_legacy_id_idx on public.plant_catalog(legacy_id);
create index plants_household_id_idx on public.plants(household_id);
create index plants_catalog_plant_id_idx on public.plants(catalog_plant_id);
create index plants_legacy_id_idx on public.plants(legacy_id);
create index plant_care_pills_plant_id_idx on public.plant_care_pills(plant_id);
create index plant_care_pills_catalog_plant_id_idx on public.plant_care_pills(catalog_plant_id);
create index plant_care_tips_plant_id_idx on public.plant_care_tips(plant_id);
create index plant_care_tips_catalog_plant_id_idx on public.plant_care_tips(catalog_plant_id);
create index plant_care_records_household_id_idx on public.plant_care_records(household_id);
create index plant_care_records_plant_id_idx on public.plant_care_records(plant_id);
create index plant_diagnostics_household_id_idx on public.plant_diagnostics(household_id);
create index plant_diagnostics_plant_id_idx on public.plant_diagnostics(plant_id);
create index plant_diagnostics_legacy_id_idx on public.plant_diagnostics(legacy_id);
create index diagnostic_observed_symptoms_diagnostic_id_idx on public.diagnostic_observed_symptoms(diagnostic_id);
create index diagnostic_recommended_steps_diagnostic_id_idx on public.diagnostic_recommended_steps(diagnostic_id);
create index push_subscriptions_household_id_idx on public.push_subscriptions(household_id);
create index push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
create index ai_requests_household_id_idx on public.ai_requests(household_id);
create index ai_requests_user_id_idx on public.ai_requests(user_id);
create index notification_deliveries_household_id_idx on public.notification_deliveries(household_id);

create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_households_updated_at before update on public.households for each row execute function public.set_updated_at();
create trigger set_household_members_updated_at before update on public.household_members for each row execute function public.set_updated_at();
create trigger set_household_invites_updated_at before update on public.household_invites for each row execute function public.set_updated_at();
create trigger set_plant_catalog_updated_at before update on public.plant_catalog for each row execute function public.set_updated_at();
create trigger set_plants_updated_at before update on public.plants for each row execute function public.set_updated_at();
create trigger set_plant_care_pills_updated_at before update on public.plant_care_pills for each row execute function public.set_updated_at();
create trigger set_plant_care_tips_updated_at before update on public.plant_care_tips for each row execute function public.set_updated_at();
create trigger set_plant_care_records_updated_at before update on public.plant_care_records for each row execute function public.set_updated_at();
create trigger set_plant_diagnostics_updated_at before update on public.plant_diagnostics for each row execute function public.set_updated_at();
create trigger set_diagnostic_observed_symptoms_updated_at before update on public.diagnostic_observed_symptoms for each row execute function public.set_updated_at();
create trigger set_diagnostic_recommended_steps_updated_at before update on public.diagnostic_recommended_steps for each row execute function public.set_updated_at();
create trigger set_household_report_settings_updated_at before update on public.household_report_settings for each row execute function public.set_updated_at();
create trigger set_push_subscriptions_updated_at before update on public.push_subscriptions for each row execute function public.set_updated_at();
create trigger set_ai_requests_updated_at before update on public.ai_requests for each row execute function public.set_updated_at();
create trigger set_notification_deliveries_updated_at before update on public.notification_deliveries for each row execute function public.set_updated_at();

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = auth.uid()
  );
$$;

create or replace function public.has_household_role(target_household_id uuid, allowed_roles public.household_member_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = auth.uid()
      and hm.role = any(allowed_roles)
  );
$$;

create or replace function public.can_edit_household(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_household_role(target_household_id, array['owner', 'editor']::public.household_member_role[]);
$$;

create or replace function public.is_household_owner(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_household_role(target_household_id, array['owner']::public.household_member_role[]);
$$;

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.has_household_role(uuid, public.household_member_role[]) to authenticated;
grant execute on function public.can_edit_household(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.plant_catalog enable row level security;
alter table public.plants enable row level security;
alter table public.plant_care_pills enable row level security;
alter table public.plant_care_tips enable row level security;
alter table public.plant_care_records enable row level security;
alter table public.plant_diagnostics enable row level security;
alter table public.diagnostic_observed_symptoms enable row level security;
alter table public.diagnostic_recommended_steps enable row level security;
alter table public.household_report_settings enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.ai_requests enable row level security;
alter table public.notification_deliveries enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "households_select_members" on public.households for select to authenticated using (public.is_household_member(id));
create policy "households_insert_authenticated" on public.households for insert to authenticated with check (created_by = auth.uid());
create policy "households_update_editors" on public.households for update to authenticated using (public.can_edit_household(id)) with check (public.can_edit_household(id));
create policy "households_delete_owners" on public.households for delete to authenticated using (public.is_household_owner(id));

create policy "household_members_select_members" on public.household_members for select to authenticated using (public.is_household_member(household_id) or user_id = auth.uid());
create policy "household_members_insert_owners" on public.household_members for insert to authenticated with check (public.is_household_owner(household_id));
create policy "household_members_update_owners" on public.household_members for update to authenticated using (public.is_household_owner(household_id)) with check (public.is_household_owner(household_id));
create policy "household_members_delete_owners" on public.household_members for delete to authenticated using (public.is_household_owner(household_id));

create policy "household_invites_select_owners" on public.household_invites for select to authenticated using (public.is_household_owner(household_id));
create policy "household_invites_insert_owners" on public.household_invites for insert to authenticated with check (public.is_household_owner(household_id));
create policy "household_invites_update_owners" on public.household_invites for update to authenticated using (public.is_household_owner(household_id)) with check (public.is_household_owner(household_id));
create policy "household_invites_delete_owners" on public.household_invites for delete to authenticated using (public.is_household_owner(household_id));

create policy "plant_catalog_select_all" on public.plant_catalog for select to anon, authenticated using (true);

create policy "plants_select_members" on public.plants for select to authenticated using (public.is_household_member(household_id));
create policy "plants_insert_editors" on public.plants for insert to authenticated with check (public.can_edit_household(household_id));
create policy "plants_update_editors" on public.plants for update to authenticated using (public.can_edit_household(household_id)) with check (public.can_edit_household(household_id));
create policy "plants_delete_editors" on public.plants for delete to authenticated using (public.can_edit_household(household_id));

create policy "plant_care_pills_select_catalog_or_member_plants" on public.plant_care_pills
  for select to anon, authenticated
  using (
    catalog_plant_id is not null
    or exists (
      select 1 from public.plants p
      where p.id = plant_care_pills.plant_id
        and public.is_household_member(p.household_id)
    )
  );
create policy "plant_care_pills_insert_editor_plants" on public.plant_care_pills
  for insert to authenticated
  with check (
    catalog_plant_id is null
    and exists (
      select 1 from public.plants p
      where p.id = plant_care_pills.plant_id
        and public.can_edit_household(p.household_id)
    )
  );
create policy "plant_care_pills_update_editor_plants" on public.plant_care_pills
  for update to authenticated
  using (
    exists (
      select 1 from public.plants p
      where p.id = plant_care_pills.plant_id
        and public.can_edit_household(p.household_id)
    )
  )
  with check (
    catalog_plant_id is null
    and exists (
      select 1 from public.plants p
      where p.id = plant_care_pills.plant_id
        and public.can_edit_household(p.household_id)
    )
  );
create policy "plant_care_pills_delete_editor_plants" on public.plant_care_pills
  for delete to authenticated
  using (
    exists (
      select 1 from public.plants p
      where p.id = plant_care_pills.plant_id
        and public.can_edit_household(p.household_id)
    )
  );

create policy "plant_care_tips_select_catalog_or_member_plants" on public.plant_care_tips
  for select to anon, authenticated
  using (
    catalog_plant_id is not null
    or exists (
      select 1 from public.plants p
      where p.id = plant_care_tips.plant_id
        and public.is_household_member(p.household_id)
    )
  );
create policy "plant_care_tips_insert_editor_plants" on public.plant_care_tips
  for insert to authenticated
  with check (
    catalog_plant_id is null
    and exists (
      select 1 from public.plants p
      where p.id = plant_care_tips.plant_id
        and public.can_edit_household(p.household_id)
    )
  );
create policy "plant_care_tips_update_editor_plants" on public.plant_care_tips
  for update to authenticated
  using (
    exists (
      select 1 from public.plants p
      where p.id = plant_care_tips.plant_id
        and public.can_edit_household(p.household_id)
    )
  )
  with check (
    catalog_plant_id is null
    and exists (
      select 1 from public.plants p
      where p.id = plant_care_tips.plant_id
        and public.can_edit_household(p.household_id)
    )
  );
create policy "plant_care_tips_delete_editor_plants" on public.plant_care_tips
  for delete to authenticated
  using (
    exists (
      select 1 from public.plants p
      where p.id = plant_care_tips.plant_id
        and public.can_edit_household(p.household_id)
    )
  );

create policy "plant_care_records_select_members" on public.plant_care_records for select to authenticated using (public.is_household_member(household_id));
create policy "plant_care_records_insert_editors" on public.plant_care_records for insert to authenticated with check (public.can_edit_household(household_id));
create policy "plant_care_records_update_editors" on public.plant_care_records for update to authenticated using (public.can_edit_household(household_id)) with check (public.can_edit_household(household_id));
create policy "plant_care_records_delete_editors" on public.plant_care_records for delete to authenticated using (public.can_edit_household(household_id));

create policy "plant_diagnostics_select_members" on public.plant_diagnostics for select to authenticated using (public.is_household_member(household_id));
create policy "plant_diagnostics_insert_editors" on public.plant_diagnostics for insert to authenticated with check (public.can_edit_household(household_id));
create policy "plant_diagnostics_update_editors" on public.plant_diagnostics for update to authenticated using (public.can_edit_household(household_id)) with check (public.can_edit_household(household_id));
create policy "plant_diagnostics_delete_editors" on public.plant_diagnostics for delete to authenticated using (public.can_edit_household(household_id));

create policy "diagnostic_observed_symptoms_select_members" on public.diagnostic_observed_symptoms
  for select to authenticated
  using (
    exists (
      select 1 from public.plant_diagnostics d
      where d.id = diagnostic_observed_symptoms.diagnostic_id
        and public.is_household_member(d.household_id)
    )
  );
create policy "diagnostic_observed_symptoms_insert_editors" on public.diagnostic_observed_symptoms
  for insert to authenticated
  with check (
    exists (
      select 1 from public.plant_diagnostics d
      where d.id = diagnostic_observed_symptoms.diagnostic_id
        and public.can_edit_household(d.household_id)
    )
  );
create policy "diagnostic_observed_symptoms_update_editors" on public.diagnostic_observed_symptoms
  for update to authenticated
  using (
    exists (
      select 1 from public.plant_diagnostics d
      where d.id = diagnostic_observed_symptoms.diagnostic_id
        and public.can_edit_household(d.household_id)
    )
  )
  with check (
    exists (
      select 1 from public.plant_diagnostics d
      where d.id = diagnostic_observed_symptoms.diagnostic_id
        and public.can_edit_household(d.household_id)
    )
  );
create policy "diagnostic_observed_symptoms_delete_editors" on public.diagnostic_observed_symptoms
  for delete to authenticated
  using (
    exists (
      select 1 from public.plant_diagnostics d
      where d.id = diagnostic_observed_symptoms.diagnostic_id
        and public.can_edit_household(d.household_id)
    )
  );

create policy "diagnostic_recommended_steps_select_members" on public.diagnostic_recommended_steps
  for select to authenticated
  using (
    exists (
      select 1 from public.plant_diagnostics d
      where d.id = diagnostic_recommended_steps.diagnostic_id
        and public.is_household_member(d.household_id)
    )
  );
create policy "diagnostic_recommended_steps_insert_editors" on public.diagnostic_recommended_steps
  for insert to authenticated
  with check (
    exists (
      select 1 from public.plant_diagnostics d
      where d.id = diagnostic_recommended_steps.diagnostic_id
        and public.can_edit_household(d.household_id)
    )
  );
create policy "diagnostic_recommended_steps_update_editors" on public.diagnostic_recommended_steps
  for update to authenticated
  using (
    exists (
      select 1 from public.plant_diagnostics d
      where d.id = diagnostic_recommended_steps.diagnostic_id
        and public.can_edit_household(d.household_id)
    )
  )
  with check (
    exists (
      select 1 from public.plant_diagnostics d
      where d.id = diagnostic_recommended_steps.diagnostic_id
        and public.can_edit_household(d.household_id)
    )
  );
create policy "diagnostic_recommended_steps_delete_editors" on public.diagnostic_recommended_steps
  for delete to authenticated
  using (
    exists (
      select 1 from public.plant_diagnostics d
      where d.id = diagnostic_recommended_steps.diagnostic_id
        and public.can_edit_household(d.household_id)
    )
  );

create policy "household_report_settings_select_members" on public.household_report_settings for select to authenticated using (public.is_household_member(household_id));
create policy "household_report_settings_insert_editors" on public.household_report_settings for insert to authenticated with check (public.can_edit_household(household_id));
create policy "household_report_settings_update_editors" on public.household_report_settings for update to authenticated using (public.can_edit_household(household_id)) with check (public.can_edit_household(household_id));
create policy "household_report_settings_delete_owners" on public.household_report_settings for delete to authenticated using (public.is_household_owner(household_id));

create policy "push_subscriptions_select_members" on public.push_subscriptions for select to authenticated using (public.is_household_member(household_id));
create policy "push_subscriptions_insert_members" on public.push_subscriptions for insert to authenticated with check (public.is_household_member(household_id) and (user_id is null or user_id = auth.uid()));
create policy "push_subscriptions_update_members" on public.push_subscriptions for update to authenticated using (public.is_household_member(household_id) and (user_id is null or user_id = auth.uid())) with check (public.is_household_member(household_id) and (user_id is null or user_id = auth.uid()));
create policy "push_subscriptions_delete_members" on public.push_subscriptions for delete to authenticated using (public.is_household_member(household_id) and (user_id is null or user_id = auth.uid()));

create policy "ai_requests_select_related" on public.ai_requests
  for select to authenticated
  using ((user_id = auth.uid()) or (household_id is not null and public.is_household_member(household_id)));
create policy "ai_requests_insert_related" on public.ai_requests
  for insert to authenticated
  with check ((user_id = auth.uid()) and (household_id is null or public.is_household_member(household_id)));

create policy "notification_deliveries_select_members" on public.notification_deliveries for select to authenticated using (public.is_household_member(household_id));

