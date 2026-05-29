-- Fix infinite RLS recursion introduced in migration 20240107.
--
-- The cycle was:
--   estimates  →  job_requests (via "requesting client can read" policy)
--   job_requests → profiles    (via "contractors can read incoming" policy)
--   profiles   →  estimates    (via "clients can read linked contractors" policy)
--
-- Solution: wrap the profiles lookup inside a SECURITY DEFINER function so
-- it runs without triggering profiles RLS, breaking the loop.

create or replace function public.current_user_is_contractor()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'contractor'
  );
$$;

-- Re-create contractor job_request policies using the helper function.

drop policy if exists "job_requests: contractors can read incoming" on public.job_requests;
create policy "job_requests: contractors can read incoming" on public.job_requests
  for select
  using (public.current_user_is_contractor());

drop policy if exists "job_requests: contractors can update incoming" on public.job_requests;
create policy "job_requests: contractors can update incoming" on public.job_requests
  for update
  using (public.current_user_is_contractor())
  with check (public.current_user_is_contractor());

notify pgrst, 'reload schema';
