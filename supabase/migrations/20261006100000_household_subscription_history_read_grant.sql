-- These tables were created after the general authenticated-table grants.
-- RLS still limits rows to the active household member/owner, respectively.
grant select on table public.household_subscriptions to authenticated;
grant select on table public.household_subscription_history to authenticated;
