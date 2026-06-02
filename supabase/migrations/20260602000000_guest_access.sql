-- Guest access tokens for one-job portal access without account
-- Issued after job request submission so clients can track their job without logging in.

create table if not exists public.job_request_guest_access (
  id             uuid        primary key default gen_random_uuid(),
  job_request_id uuid        not null references public.job_requests(id) on delete cascade,
  client_email   text        not null,
  token          text        not null unique,
  expires_at     timestamptz,
  claimed_by     uuid        references auth.users(id),
  claimed_at     timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists idx_guest_access_token
  on public.job_request_guest_access (token);

create index if not exists idx_guest_access_job_request_id
  on public.job_request_guest_access (job_request_id);

alter table public.job_request_guest_access enable row level security;

-- All access goes through server-side API routes using the service role.
-- No direct client access is allowed.

grant select, insert, update
  on public.job_request_guest_access
  to service_role;

notify pgrst, 'reload schema';
