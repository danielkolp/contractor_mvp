-- Add street address and photo URL array to job requests.
-- Create storage bucket for intake photos with public read + anon upload.

alter table public.job_requests
  add column if not exists address_street text;

alter table public.job_requests
  add column if not exists photo_urls text[] not null default '{}';

-- Storage bucket for job request photos
insert into storage.buckets (id, name, public)
values ('job-request-photos', 'job-request-photos', true)
on conflict (id) do nothing;

-- Allow anyone (including unauthenticated visitors on the intake form) to upload
drop policy if exists "job_request_photos_upload" on storage.objects;
create policy "job_request_photos_upload"
  on storage.objects for insert
  with check (bucket_id = 'job-request-photos');

-- Public read so photo URLs are accessible without auth
drop policy if exists "job_request_photos_read" on storage.objects;
create policy "job_request_photos_read"
  on storage.objects for select
  using (bucket_id = 'job-request-photos');

notify pgrst, 'reload schema';
