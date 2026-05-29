-- Client portal foundation: roles, job requests, and linked estimates/invoices.
-- This intentionally supports incoming requests only, not a marketplace.

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'user_role' and n.nspname = 'public'
  ) then
    create type public.user_role as enum ('contractor', 'client');
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'job_request_urgency' and n.nspname = 'public'
  ) then
    create type public.job_request_urgency as enum ('flexible', 'soon', 'urgent');
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'job_request_status' and n.nspname = 'public'
  ) then
    create type public.job_request_status as enum (
      'new',
      'reviewed',
      'estimate_created',
      'accepted',
      'declined',
      'closed'
    );
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'estimate_status' and n.nspname = 'public'
  ) then
    alter type public.estimate_status add value if not exists 'Accepted';
    alter type public.estimate_status add value if not exists 'Declined';
  end if;
end $$;

alter table public.profiles
  add column if not exists role public.user_role not null default 'contractor';

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested_role text;
begin
  requested_role := coalesce(new.raw_user_meta_data ->> 'role', 'contractor');

  insert into public.profiles (user_id, role)
  values (
    new.id,
    case when requested_role = 'client' then 'client'::public.user_role else 'contractor'::public.user_role end
  )
  on conflict (user_id) do nothing;

  update public.profiles
  set
    owner_name = coalesce(nullif(new.raw_user_meta_data ->> 'owner_name', ''), owner_name),
    company_name = coalesce(nullif(new.raw_user_meta_data ->> 'company_name', ''), company_name),
    trade = coalesce(nullif(new.raw_user_meta_data ->> 'trade', ''), trade),
    service_area = coalesce(nullif(new.raw_user_meta_data ->> 'service_area', ''), service_area),
    phone = coalesce(nullif(new.raw_user_meta_data ->> 'phone', ''), phone)
  where user_id = new.id;

  return new;
end;
$$;

create table if not exists public.job_requests (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references auth.users(id) on delete cascade,
  client_name        text,
  client_email       text,
  title              text not null,
  description        text not null,
  service_area       text not null,
  urgency            public.job_request_urgency not null default 'flexible',
  budget_min         numeric(12,2),
  budget_max         numeric(12,2),
  contact_preference text not null default 'Email',
  photo_notes        text,
  status             public.job_request_status not null default 'new',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists job_requests_client_id_idx
  on public.job_requests (client_id);

create index if not exists job_requests_status_idx
  on public.job_requests (status);

drop trigger if exists job_requests_updated_at on public.job_requests;
create trigger job_requests_updated_at
  before update on public.job_requests
  for each row execute function public.set_updated_at();

alter table public.estimates
  add column if not exists job_request_id uuid references public.job_requests(id) on delete set null;

alter table public.invoices
  add column if not exists job_request_id uuid references public.job_requests(id) on delete set null;

create index if not exists estimates_job_request_id_idx
  on public.estimates (job_request_id);

create index if not exists invoices_job_request_id_idx
  on public.invoices (job_request_id);

alter table public.job_requests enable row level security;

drop policy if exists "job_requests: clients own rows" on public.job_requests;
create policy "job_requests: clients own rows" on public.job_requests
  for all
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);

drop policy if exists "job_requests: contractors can read incoming" on public.job_requests;
create policy "job_requests: contractors can read incoming" on public.job_requests
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'contractor'
    )
  );

drop policy if exists "job_requests: contractors can update incoming" on public.job_requests;
create policy "job_requests: contractors can update incoming" on public.job_requests
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'contractor'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'contractor'
    )
  );

drop policy if exists "estimates: requesting client can read" on public.estimates;
create policy "estimates: requesting client can read" on public.estimates
  for select
  using (
    exists (
      select 1 from public.job_requests jr
      where jr.id = estimates.job_request_id
        and jr.client_id = auth.uid()
    )
  );

drop policy if exists "estimates: requesting client can respond" on public.estimates;
create policy "estimates: requesting client can respond" on public.estimates
  for update
  using (
    exists (
      select 1 from public.job_requests jr
      where jr.id = estimates.job_request_id
        and jr.client_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.job_requests jr
      where jr.id = estimates.job_request_id
        and jr.client_id = auth.uid()
    )
  );

drop policy if exists "invoices: requesting client can read" on public.invoices;
create policy "invoices: requesting client can read" on public.invoices
  for select
  using (
    exists (
      select 1 from public.job_requests jr
      where jr.id = invoices.job_request_id
        and jr.client_id = auth.uid()
    )
  );

drop policy if exists "profiles: clients can read linked contractors" on public.profiles;
create policy "profiles: clients can read linked contractors" on public.profiles
  for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.estimates e
      join public.job_requests jr on jr.id = e.job_request_id
      where e.user_id = profiles.user_id
        and jr.client_id = auth.uid()
    )
    or exists (
      select 1 from public.invoices i
      join public.job_requests jr on jr.id = i.job_request_id
      where i.user_id = profiles.user_id
        and jr.client_id = auth.uid()
    )
  );

grant all on public.job_requests to authenticated;
grant select on public.job_requests to anon;

notify pgrst, 'reload schema';
