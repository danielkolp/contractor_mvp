-- Public request photos are uploaded by the API with the service role.
-- Anonymous visitors should not need direct storage insert permissions.

drop policy if exists "job_request_photos_upload" on storage.objects;

notify pgrst, 'reload schema';
