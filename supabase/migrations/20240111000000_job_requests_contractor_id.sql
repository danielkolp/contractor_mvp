-- Add contractor_id to job_requests so every request is owned by a specific
-- contractor.  Replaces the "all contractors see all requests" pattern with
-- proper row-level security scoped to the owning contractor.
--
-- Safe migration strategy:
--   1. Add contractor_id column (nullable first).
--   2. Create a SECURITY DEFINER helper so RLS policies can check contractor
--      status without querying profiles directly (avoids RLS recursion and
--      prevents clients from needing read access to profiles before a row exists).
--   3. Drop the old "all contractors read/update all requests" policies.
--   4. Create new narrower policies that use the helper function.
--   5. Existing rows keep contractor_id = NULL and are hidden from all
--      contractor dashboards until re-assigned (preserving data integrity).

alter table public.job_requests
  add column if not exists contractor_id uuid references auth.users(id) on delete set null;

create index if not exists job_requests_contractor_id_idx
  on public.job_requests (contractor_id);

-- ── SECURITY DEFINER helper ──────────────────────────────────────────────────
-- Called from both RLS policies and client-side RPC.  Runs as the function
-- owner (not the calling role), so it bypasses the caller's RLS context and
-- avoids any risk of recursion between job_requests and profiles policies.

create or replace function public.contractor_exists(contractor_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = contractor_user_id
      and role = 'contractor'
  );
$$;

-- Client job-request form requires login before calling this RPC, so grant
-- only to authenticated.  Anonymous access is not needed.
grant execute on function public.contractor_exists(uuid) to authenticated;

-- ── Drop old broad contractor policies ───────────────────────────────────────
drop policy if exists "job_requests: contractors can read incoming" on public.job_requests;
drop policy if exists "job_requests: contractors can update incoming" on public.job_requests;

-- Drop new-style policies idempotently so a re-run after a partial apply
-- never fails with "policy already exists".
drop policy if exists "job_requests: contractor reads own" on public.job_requests;
drop policy if exists "job_requests: contractor updates own" on public.job_requests;

-- Contractors can only read requests assigned to them.
create policy "job_requests: contractor reads own" on public.job_requests
  for select
  using (
    contractor_id = auth.uid()
    and public.contractor_exists(auth.uid())
  );

-- Contractors can only update requests assigned to them.
create policy "job_requests: contractor updates own" on public.job_requests
  for update
  using (
    contractor_id = auth.uid()
    and public.contractor_exists(auth.uid())
  )
  with check (
    contractor_id = auth.uid()
    and public.contractor_exists(auth.uid())
  );

-- Clients can insert a request only when the contractor_id resolves to a real
-- contractor.  Using the SECURITY DEFINER helper avoids direct subqueries on
-- profiles from within job_requests RLS (no recursion risk).
drop policy if exists "job_requests: clients own rows" on public.job_requests;

create policy "job_requests: clients own rows" on public.job_requests
  for all
  using (auth.uid() = client_id)
  with check (
    auth.uid() = client_id
    and contractor_id is not null
    and public.contractor_exists(contractor_id)
  );

notify pgrst, 'reload schema';
