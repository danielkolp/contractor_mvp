-- Explicit grants for recovery_email_events.
-- When migrations are applied via the Supabase SQL editor (rather than
-- supabase db push), ALTER DEFAULT PRIVILEGES does not automatically apply
-- to new tables. These grants ensure the authenticated role can insert and
-- read from the event log.

grant select, insert, update on public.recovery_email_events to authenticated;
grant select, insert, update on public.recovery_email_events to anon;
