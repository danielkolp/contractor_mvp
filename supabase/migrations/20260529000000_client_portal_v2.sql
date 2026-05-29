-- Client Portal v2
-- Adds: client_phone to job_requests, project_timeline_events table,
--        client_messages table, helper RPC for email lookup.

-- ── 1. Phone number on job_requests ──────────────────────────────────────────

alter table public.job_requests
  add column if not exists client_phone text;

-- ── 2. Project timeline events ────────────────────────────────────────────────

create table if not exists public.project_timeline_events (
  id              uuid        primary key default gen_random_uuid(),
  job_request_id  uuid        not null references public.job_requests(id) on delete cascade,
  contractor_id   uuid        not null references auth.users(id) on delete cascade,
  event_type      text        not null default 'update',
  title           text        not null,
  notes           text,
  event_date      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index if not exists idx_project_timeline_events_job_request_id
  on public.project_timeline_events (job_request_id, event_date);

create index if not exists idx_project_timeline_events_contractor_id
  on public.project_timeline_events (contractor_id);

alter table public.project_timeline_events enable row level security;

-- Contractors manage their own timeline events.
create policy "timeline_events_contractor_all"
  on public.project_timeline_events
  for all
  using (contractor_id = auth.uid())
  with check (contractor_id = auth.uid());

-- Clients read timeline events for their own job requests.
create policy "timeline_events_client_read"
  on public.project_timeline_events
  for select
  using (
    job_request_id in (
      select id from public.job_requests where client_id = auth.uid()
    )
  );

-- ── 3. Client ↔ contractor messages ─────────────────────────────────────────

create table if not exists public.client_messages (
  id              uuid        primary key default gen_random_uuid(),
  job_request_id  uuid        not null references public.job_requests(id) on delete cascade,
  sender_id       uuid        not null references auth.users(id) on delete cascade,
  sender_role     text        not null check (sender_role in ('contractor', 'client')),
  body            text        not null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_client_messages_job_request_id
  on public.client_messages (job_request_id, created_at);

alter table public.client_messages enable row level security;

-- Both parties on a job request can read all messages for that request.
create policy "messages_participants_select"
  on public.client_messages
  for select
  using (
    job_request_id in (
      select id from public.job_requests
      where client_id = auth.uid() or contractor_id = auth.uid()
    )
  );

-- Participants may insert their own messages.
create policy "messages_participants_insert"
  on public.client_messages
  for insert
  with check (
    sender_id = auth.uid()
    and job_request_id in (
      select id from public.job_requests
      where client_id = auth.uid() or contractor_id = auth.uid()
    )
  );

-- ── 4. Helper: find auth user id by email ─────────────────────────────────────
-- Used exclusively by the client intake API route (service_role).
-- SECURITY DEFINER keeps auth.users invisible to regular roles.

create or replace function public.get_auth_user_id_by_email(lookup_email text)
returns uuid
language sql
security definer
set search_path = auth, public
as $$
  select id from auth.users where lower(email) = lower(lookup_email) limit 1;
$$;

revoke all on function public.get_auth_user_id_by_email from public, anon, authenticated;
grant execute on function public.get_auth_user_id_by_email to service_role;

-- ── 5. Grants ─────────────────────────────────────────────────────────────────

grant select, insert, update, delete on public.project_timeline_events to authenticated;
grant select, insert                  on public.client_messages          to authenticated;

-- Service role bypasses RLS but still needs table-level grants.
grant select, insert, update, delete  on public.project_timeline_events to service_role;
grant select, insert                  on public.client_messages          to service_role;

notify pgrst, 'reload schema';
