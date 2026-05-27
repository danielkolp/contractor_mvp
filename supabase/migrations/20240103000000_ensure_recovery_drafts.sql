-- ============================================================
-- Ensure Recovery Drafts exists in hosted Supabase
-- Safe to run if the table is missing or partially created.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.recovery_drafts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id           uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  invoice_id          uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  channel             text NOT NULL DEFAULT 'sms',
  message_body        text NOT NULL,
  status              text NOT NULL DEFAULT 'needs_approval',
  recommended_action  text,
  days_overdue        integer NOT NULL DEFAULT 0,
  provider_message_id text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  approved_at         timestamptz,
  sent_at             timestamptz,
  resolved_at         timestamptz
);

ALTER TABLE public.recovery_drafts
  ADD COLUMN IF NOT EXISTS provider_message_id text;

ALTER TABLE public.recovery_drafts
  DROP CONSTRAINT IF EXISTS recovery_drafts_user_id_fkey,
  ADD CONSTRAINT recovery_drafts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.recovery_drafts
  DROP CONSTRAINT IF EXISTS recovery_drafts_client_id_fkey,
  ADD CONSTRAINT recovery_drafts_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.recovery_drafts
  DROP CONSTRAINT IF EXISTS recovery_drafts_invoice_id_fkey,
  ADD CONSTRAINT recovery_drafts_invoice_id_fkey
    FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;

ALTER TABLE public.recovery_drafts
  ALTER COLUMN channel SET DEFAULT 'sms',
  ALTER COLUMN status SET DEFAULT 'needs_approval',
  ALTER COLUMN days_overdue SET DEFAULT 0,
  ALTER COLUMN days_overdue SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.recovery_drafts
  DROP CONSTRAINT IF EXISTS recovery_drafts_status_check,
  ADD CONSTRAINT recovery_drafts_status_check CHECK (
    status IN (
      'draft',
      'needs_approval',
      'approved',
      'sent',
      'waiting_on_customer',
      'resolved',
      'cancelled'
    )
  );

ALTER TABLE public.recovery_drafts
  DROP CONSTRAINT IF EXISTS recovery_drafts_channel_check,
  ADD CONSTRAINT recovery_drafts_channel_check CHECK (
    channel IN ('sms', 'email', 'manual')
  );

CREATE INDEX IF NOT EXISTS recovery_drafts_user_id_idx
  ON public.recovery_drafts (user_id);

CREATE INDEX IF NOT EXISTS recovery_drafts_invoice_id_idx
  ON public.recovery_drafts (invoice_id);

CREATE INDEX IF NOT EXISTS recovery_drafts_status_idx
  ON public.recovery_drafts (status);

DROP TRIGGER IF EXISTS recovery_drafts_updated_at ON public.recovery_drafts;
CREATE TRIGGER recovery_drafts_updated_at
  BEFORE UPDATE ON public.recovery_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.recovery_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recovery_drafts: own rows" ON public.recovery_drafts;
CREATE POLICY "recovery_drafts: own rows" ON public.recovery_drafts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.recovery_drafts TO authenticated;
GRANT SELECT ON public.recovery_drafts TO anon;

NOTIFY pgrst, 'reload schema';
