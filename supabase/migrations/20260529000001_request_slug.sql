-- Client Portal v2 — part 2
-- Adds request_slug to profiles so contractor request URLs don't expose raw UUIDs.
-- Also adds the contractor_profile_by_slug() RPC used by the public request form.

-- ── 1. Add request_slug column ────────────────────────────────────────────────

alter table public.profiles
  add column if not exists request_slug text;

-- Backfill all existing rows with a unique 12-char hex slug derived from a fresh UUID.
update public.profiles
set request_slug = lower(substring(replace(gen_random_uuid()::text, '-', ''), 1, 12))
where request_slug is null;

-- Enforce not-null and uniqueness now that all rows have a value.
alter table public.profiles
  alter column request_slug set not null,
  alter column request_slug set default lower(substring(replace(gen_random_uuid()::text, '-', ''), 1, 12));

create unique index if not exists idx_profiles_request_slug
  on public.profiles (request_slug);

-- ── 2. RPC: contractor_profile_by_slug ───────────────────────────────────────
-- Called by the public /request/[slug] page (anon) to load the contractor's name
-- and trades. Security definer so the profiles table stays behind RLS.

create or replace function public.contractor_profile_by_slug(slug text)
returns table (
  company_name  text,
  owner_name    text,
  trade         text,
  service_area  text
)
language sql
security definer
set search_path = public
as $$
  select company_name, owner_name, trade, service_area
  from public.profiles
  where request_slug = slug
    and role = 'contractor'
  limit 1;
$$;

grant execute on function public.contractor_profile_by_slug to anon, authenticated;

notify pgrst, 'reload schema';
