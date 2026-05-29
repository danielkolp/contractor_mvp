-- Inbound email reply tracking for recovery follow-ups.
-- Phase 1: Extend recovery_email_events with reply addressing columns.
-- Phase 2: Create recovery_email_replies table for inbound messages from clients.

-- ── Phase 1: extend recovery_email_events ─────────────────────────────────────

alter table public.recovery_email_events
  add column if not exists reply_to_email    text null,
  add column if not exists inbound_thread_key text null;

comment on column public.recovery_email_events.reply_to_email is
  'The inbound reply-to address used for this send, e.g. r_<event_id>@reply.domain.com. Null when RESEND_INBOUND_DOMAIN is not configured.';

comment on column public.recovery_email_events.inbound_thread_key is
  'The event UUID embedded in the reply address, used to match inbound replies back to this event.';

create index if not exists idx_recovery_email_events_reply_to_email
  on public.recovery_email_events (reply_to_email)
  where reply_to_email is not null;

create index if not exists idx_recovery_email_events_inbound_thread_key
  on public.recovery_email_events (inbound_thread_key)
  where inbound_thread_key is not null;

-- ── Phase 2: recovery_email_replies ───────────────────────────────────────────

create table if not exists public.recovery_email_replies (
  id                      uuid        primary key default gen_random_uuid(),
  user_id                 uuid        not null references auth.users(id) on delete cascade,
  recovery_item_id        uuid        not null references public.recovery_items(id) on delete cascade,
  recovery_email_event_id uuid        null references public.recovery_email_events(id) on delete set null,
  from_email              text        not null,
  from_name               text        null,
  to_email                text        not null,
  subject                 text        null,
  text_body               text        null,
  html_body               text        null,
  provider                text        not null default 'resend',
  provider_email_id       text        null,
  raw_payload             jsonb       null,
  received_at             timestamptz not null default now(),
  created_at              timestamptz not null default now()
);

comment on table public.recovery_email_replies is
  'Inbound email replies from clients, received via Resend inbound webhook and matched to recovery items.';

-- Idempotency: prevent duplicate rows for the same provider message.
create unique index if not exists idx_recovery_email_replies_provider_email_id
  on public.recovery_email_replies (provider, provider_email_id)
  where provider_email_id is not null;

create index if not exists idx_recovery_email_replies_user_id
  on public.recovery_email_replies (user_id);

create index if not exists idx_recovery_email_replies_recovery_item_id
  on public.recovery_email_replies (recovery_item_id);

create index if not exists idx_recovery_email_replies_recovery_email_event_id
  on public.recovery_email_replies (recovery_email_event_id)
  where recovery_email_event_id is not null;

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.recovery_email_replies enable row level security;

-- Contractors can only read their own replies.
create policy "Users select own email replies"
  on public.recovery_email_replies for select
  using (auth.uid() = user_id);

-- Inserts come exclusively from the inbound webhook using the service role,
-- which bypasses RLS. No client-facing INSERT policy is needed.

-- ── Grants ────────────────────────────────────────────────────────────────────

grant select on public.recovery_email_replies to authenticated;
grant select on public.recovery_email_replies to anon;

-- service_role needs explicit grants because the inbound webhook uses it
-- to look up events and insert replies without a user session.
grant select on public.recovery_email_events to service_role;
grant select, insert on public.recovery_email_replies to service_role;
