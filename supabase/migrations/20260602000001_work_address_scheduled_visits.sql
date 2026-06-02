-- Add work-site address and scheduled visit metadata to requests, estimates,
-- and invoices. All fields are nullable so this can be applied safely to
-- existing production data.

alter table public.job_requests
  add column if not exists work_address text,
  add column if not exists scheduled_visit_type text,
  add column if not exists scheduled_visit_starts_at timestamptz,
  add column if not exists scheduled_visit_ends_at timestamptz,
  add column if not exists scheduled_visit_notes text;

update public.job_requests
set work_address = address_street
where work_address is null
  and address_street is not null;

alter table public.estimates
  add column if not exists work_address text,
  add column if not exists scheduled_visit_type text,
  add column if not exists scheduled_visit_starts_at timestamptz,
  add column if not exists scheduled_visit_ends_at timestamptz,
  add column if not exists scheduled_visit_notes text;

alter table public.invoices
  add column if not exists work_address text,
  add column if not exists scheduled_visit_type text,
  add column if not exists scheduled_visit_starts_at timestamptz,
  add column if not exists scheduled_visit_ends_at timestamptz,
  add column if not exists scheduled_visit_notes text;

do $$
begin
  alter table public.job_requests
    add constraint job_requests_scheduled_visit_type_check
    check (
      scheduled_visit_type is null
      or scheduled_visit_type in ('inspection', 'job_start', 'job_completion', 'site_visit')
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.estimates
    add constraint estimates_scheduled_visit_type_check
    check (
      scheduled_visit_type is null
      or scheduled_visit_type in ('inspection', 'job_start', 'job_completion', 'site_visit')
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.invoices
    add constraint invoices_scheduled_visit_type_check
    check (
      scheduled_visit_type is null
      or scheduled_visit_type in ('inspection', 'job_start', 'job_completion', 'site_visit')
    );
exception when duplicate_object then null;
end $$;
