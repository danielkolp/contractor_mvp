-- Allow legacy /request/[contractor_uuid] links to keep working while the
-- canonical public request URL remains /request/[request_slug].

create or replace function public.contractor_profile_by_slug(slug text)
returns table (
  company_name  text,
  owner_name    text,
  trade         text,
  service_area  text
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
  where p.role = 'contractor'
    and (
      p.request_slug = slug
      or p.user_id = case
        when slug ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then slug::uuid
        else null
      end
    )
  limit 1;
$$;

grant execute on function public.contractor_profile_by_slug(text) to anon, authenticated;

notify pgrst, 'reload schema';
