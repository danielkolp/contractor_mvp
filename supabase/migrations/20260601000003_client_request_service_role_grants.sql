-- The public client-request API uses the Supabase service role server-side.
-- Grant the exact public objects it needs so the route can resolve contractors,
-- refresh client profiles, and insert job requests while RLS stays in place for
-- browser clients.

grant usage on schema public to service_role;

grant select, update
  on public.profiles
  to service_role;

grant select, insert
  on public.job_requests
  to service_role;

grant execute on function public.get_auth_user_id_by_email(text) to service_role;

notify pgrst, 'reload schema';
