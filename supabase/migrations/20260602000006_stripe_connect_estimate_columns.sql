-- Stripe Connect payment columns on estimates.
--
-- These columns were originally added to production out-of-band (via the
-- Supabase dashboard) when Stripe Connect was wired up, so no migration file
-- ever created them. Fresh setups that "run all migrations in order" were left
-- without them, and estimate creation died with:
--   Could not find the 'client_total_cents' column of 'estimates'
-- (likewise contractor_amount_cents / platform_fee_cents and the payment fields).
--
-- This migration backfills the column definitions so a clean database matches
-- production. It is timestamped to run BEFORE the input-validation constraints
-- migration (20260603000000) so its guarded CHECK constraints actually attach
-- to these columns instead of being skipped because the columns don't exist yet.
--
-- All adds are IF NOT EXISTS, so re-running against a database that already has
-- the columns (e.g. production) is a no-op.

alter table public.estimates
  add column if not exists contractor_amount_cents    integer,
  add column if not exists platform_fee_cents         integer,
  add column if not exists client_total_cents         integer,
  add column if not exists payment_status             text not null default 'unpaid',
  add column if not exists paid_at                    timestamptz,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id   text;

create index if not exists estimates_payment_status_idx
  on public.estimates (payment_status);

create index if not exists estimates_stripe_checkout_session_id_idx
  on public.estimates (stripe_checkout_session_id);

create index if not exists estimates_stripe_payment_intent_id_idx
  on public.estimates (stripe_payment_intent_id);

notify pgrst, 'reload schema';
