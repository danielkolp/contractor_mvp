-- ── Deposit / GST fields on estimates ────────────────────────────────────────
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS gst_cents              integer       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_amount_cents   integer,
  ADD COLUMN IF NOT EXISTS deposit_percentage     numeric(5,2),
  ADD COLUMN IF NOT EXISTS deposit_paid_at        timestamptz,
  ADD COLUMN IF NOT EXISTS deposit_payment_intent_id text;

-- ── Contractor reviews ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contractor_reviews (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id    uuid        NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  client_id        uuid        NOT NULL,
  job_request_id   uuid        NOT NULL REFERENCES job_requests(id) ON DELETE CASCADE,
  estimate_id      uuid        REFERENCES estimates(id) ON DELETE SET NULL,
  rating           integer     NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment          text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, job_request_id)
);

ALTER TABLE contractor_reviews ENABLE ROW LEVEL SECURITY;

-- Clients can read all reviews (used for contractor profile display)
CREATE POLICY "Anyone can read contractor reviews"
  ON contractor_reviews FOR SELECT USING (true);

-- Clients can only submit a review as themselves
CREATE POLICY "Clients submit their own review"
  ON contractor_reviews FOR INSERT
  WITH CHECK (auth.uid() = client_id);
