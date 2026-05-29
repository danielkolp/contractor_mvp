-- Recovery items: the central entity for the simplified follow-up flow.
-- Each record tracks one job/payment situation from creation through resolution.

CREATE TABLE IF NOT EXISTS recovery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Client info (denormalized for simplicity; no FK required)
  client_name text NOT NULL DEFAULT '',
  client_email text,
  client_phone text,

  -- What happened
  -- 'estimate_no_reply' | 'invoice_overdue' | 'maybe_later' | 'work_not_paid' | 'other'
  reason text NOT NULL DEFAULT 'other',

  -- Job value and when it was last touched
  amount numeric NOT NULL DEFAULT 0,
  contacted_date date,

  -- Lifecycle state
  -- 'needs_follow_up' | 'message_ready' | 'sent' | 'waiting' | 'resolved' | 'lost' | 'archived'
  status text NOT NULL DEFAULT 'needs_follow_up',

  -- The follow-up message (generated or manually written)
  message_body text,

  -- When to resurface this item after a follow-up is sent
  check_back_date date,

  -- How many follow-up attempts have been made (used to adjust message tone)
  follow_up_count integer NOT NULL DEFAULT 0,

  notes text,
  is_demo boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recovery_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own recovery items"
  ON recovery_items
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION set_recovery_items_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recovery_items_updated_at ON recovery_items;
CREATE TRIGGER recovery_items_updated_at
  BEFORE UPDATE ON recovery_items
  FOR EACH ROW EXECUTE FUNCTION set_recovery_items_updated_at();
