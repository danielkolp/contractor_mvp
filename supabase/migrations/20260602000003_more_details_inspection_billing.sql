-- Contractor can request more info from the client and schedule an inspection
-- before creating an estimate. Also adds billing_type to estimates.

-- New job_request_status values
alter type public.job_request_status add value if not exists 'needs_info';
alter type public.job_request_status add value if not exists 'inspection_scheduled';
alter type public.job_request_status add value if not exists 'inspection_confirmed';

-- More details request/response columns on job_requests
alter table public.job_requests
  add column if not exists more_details_message text,
  add column if not exists more_details_response text;

-- Billing type on estimates (flat_rate or hourly)
alter table public.estimates
  add column if not exists billing_type text default 'flat_rate'
    check (billing_type in ('flat_rate', 'hourly'));

notify pgrst, 'reload schema';
