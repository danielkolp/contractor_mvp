-- Logs every email send attempt for recovery follow-ups.
-- A row is inserted whether the send succeeded or failed so contractors
-- have a full audit trail and we never mark items "sent" unless the
-- email provider confirmed delivery.

create table public.recovery_email_events (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users(id) on delete cascade,
  recovery_item_id    uuid        not null references public.recovery_items(id) on delete cascade,
  to_email            text        not null,
  subject             text        not null,
  body                text        not null,
  provider            text        not null default 'resend',
  provider_message_id text        null,
  status              text        not null default 'sent',   -- 'sent' | 'failed'
  error_message       text        null,
  sent_at             timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

alter table public.recovery_email_events enable row level security;

create policy "Users select own email events"
  on public.recovery_email_events for select
  using (auth.uid() = user_id);

create policy "Users insert own email events"
  on public.recovery_email_events for insert
  with check (auth.uid() = user_id);

create policy "Users update own email events"
  on public.recovery_email_events for update
  using (auth.uid() = user_id);

comment on table public.recovery_email_events is
  'Audit log of all recovery follow-up emails sent via the app.';
