-- Estimates / quote follow-up workflow.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'estimate_status'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.estimate_status AS ENUM (
      'Draft',
      'Sent',
      'Follow-up Needed',
      'Follow-up Sent',
      'Interested',
      'Won',
      'Lost',
      'Archived'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.estimates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id        uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name      text,
  estimate_number  text NOT NULL,
  amount           numeric(12,2) NOT NULL DEFAULT 0,
  status           public.estimate_status NOT NULL DEFAULT 'Sent',
  sent_date        date NOT NULL DEFAULT CURRENT_DATE,
  follow_up_date   date,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimates_user_id_idx
  ON public.estimates (user_id);

CREATE INDEX IF NOT EXISTS estimates_client_id_idx
  ON public.estimates (client_id);

CREATE INDEX IF NOT EXISTS estimates_status_idx
  ON public.estimates (status);

CREATE INDEX IF NOT EXISTS estimates_follow_up_date_idx
  ON public.estimates (follow_up_date);

CREATE UNIQUE INDEX IF NOT EXISTS estimates_user_number_idx
  ON public.estimates (user_id, estimate_number);

DROP TRIGGER IF EXISTS estimates_updated_at ON public.estimates;
CREATE TRIGGER estimates_updated_at
  BEFORE UPDATE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estimates: own rows" ON public.estimates;
CREATE POLICY "estimates: own rows" ON public.estimates
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.estimates TO authenticated;
GRANT SELECT ON public.estimates TO anon;

NOTIFY pgrst, 'reload schema';
