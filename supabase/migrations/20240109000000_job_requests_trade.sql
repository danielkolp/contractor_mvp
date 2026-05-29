-- Add trade field to job_requests so clients can specify the type of work,
-- enabling contractors to filter requests that match their trade profile.

alter table public.job_requests
  add column if not exists trade text;

create index if not exists job_requests_trade_idx
  on public.job_requests (trade);

notify pgrst, 'reload schema';
