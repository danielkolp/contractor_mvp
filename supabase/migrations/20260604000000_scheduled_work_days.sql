-- Multi-day work scheduling.
--
-- A job (estimate) can span any number of work days. Previously a single work
-- day was stored as scheduled_visit_* columns on the estimate row, so each new
-- schedule overwrote the last. This table holds one row per work day, plus a
-- job_completed_at flag on the estimate so the contractor can confirm when the
-- whole job is finished.

CREATE TABLE IF NOT EXISTS public.scheduled_work_days (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz,
  notes       text,
  status      text NOT NULL DEFAULT 'scheduled'
              CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduled_work_days_user_id_idx
  ON public.scheduled_work_days (user_id);

CREATE INDEX IF NOT EXISTS scheduled_work_days_estimate_id_idx
  ON public.scheduled_work_days (estimate_id);

CREATE INDEX IF NOT EXISTS scheduled_work_days_starts_at_idx
  ON public.scheduled_work_days (starts_at);

DROP TRIGGER IF EXISTS scheduled_work_days_updated_at ON public.scheduled_work_days;
CREATE TRIGGER scheduled_work_days_updated_at
  BEFORE UPDATE ON public.scheduled_work_days
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.scheduled_work_days ENABLE ROW LEVEL SECURITY;

-- Contractor owns their work days.
DROP POLICY IF EXISTS "work_days: owner all" ON public.scheduled_work_days;
CREATE POLICY "work_days: owner all" ON public.scheduled_work_days
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Client of the linked job request can read the schedule (mirrors the estimates
-- "requesting client can read" policy).
DROP POLICY IF EXISTS "work_days: requesting client can read" ON public.scheduled_work_days;
CREATE POLICY "work_days: requesting client can read" ON public.scheduled_work_days
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.estimates e
      JOIN public.job_requests jr ON jr.id = e.job_request_id
      WHERE e.id = scheduled_work_days.estimate_id
        AND jr.client_id = auth.uid()
    )
  );

GRANT ALL ON public.scheduled_work_days TO authenticated;
GRANT ALL ON public.scheduled_work_days TO service_role;
GRANT SELECT ON public.scheduled_work_days TO anon;

-- Job completion flag on the estimate (the "job").
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS job_completed_at timestamptz;

-- Backfill the existing single work day into the new table.
INSERT INTO public.scheduled_work_days (user_id, estimate_id, starts_at, ends_at, notes)
SELECT user_id, id, scheduled_visit_starts_at, scheduled_visit_ends_at, scheduled_visit_notes
FROM public.estimates
WHERE scheduled_visit_type = 'job_start'
  AND scheduled_visit_starts_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
