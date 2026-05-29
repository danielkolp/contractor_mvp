-- Add contractor_id to job_requests so every request is owned by a specific
-- contractor.  Replaces the "all contractors see all requests" pattern with
-- proper row-level security scoped to the owning contractor.
--
-- Safe migration strategy:
--   1. Add contractor_id column (nullable first).
--   2. Drop the old "all contractors read/update all requests" policies.
--   3. Create new narrower policies scoped to contractor_id.
--   4. Existing rows keep contractor_id = NULL and are hidden from all
--      contractor dashboards until re-assigned (preserving data integrity).

alter table public.job_requests
  add column if not exists contractor_id uuid references auth.users(id) on delete set null;

create index if not exists job_requests_contractor_id_idx
  on public.job_requests (contractor_id);

-- Drop the old broad contractor policies that exposed all requests.
drop policy if exists "job_requests: contractors can read incoming" on public.job_requests;
drop policy if exists "job_requests: contractors can update incoming" on public.job_requests;

-- Contractors can only read requests assigned to them.
create policy "job_requests: contractor reads own" on public.job_requests
  for select
  using (
    contractor_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'contractor'
    )
  );

-- Contractors can only update requests assigned to them.
create policy "job_requests: contractor updates own" on public.job_requests
  for update
  using (
    contractor_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'contractor'
    )
  )
  with check (
    contractor_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'contractor'
    )
  );

-- Clients can insert a request only when the contractor_id matches a real
-- contractor profile.  This prevents unassigned/global requests.
drop policy if exists "job_requests: clients own rows" on public.job_requests;

create policy "job_requests: clients own rows" on public.job_requests
  for all
  using (auth.uid() = client_id)
  with check (
    auth.uid() = client_id
    and contractor_id is not null
    and exists (
      select 1 from public.profiles p
      where p.user_id = contractor_id
        and p.role = 'contractor'
    )
  );

notify pgrst, 'reload schema';
