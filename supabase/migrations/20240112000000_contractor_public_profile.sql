-- SECURITY DEFINER RPC that exposes minimal contractor profile data to clients
-- before a job_request row exists (at that point the client has no RLS
-- permission to read the profiles table directly).  Only returns rows where
-- role = 'contractor', so it cannot be used to leak client profiles.

create or replace function public.contractor_public_profile(contractor_user_id uuid)
returns table (
  company_name text,
  owner_name   text,
  trade        text,
  service_area text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.company_name,
    p.owner_name,
    p.trade,
    p.service_area
  from public.profiles p
  where p.user_id = contractor_user_id
    and p.role = 'contractor'
  limit 1;
$$;

grant execute on function public.contractor_public_profile(uuid) to authenticated;

notify pgrst, 'reload schema';
