-- Subscription billing (the contractor's own plan — separate from Connect/payments).
-- Adds plan + Stripe Billing fields to profiles. This is the revenue model: the
-- contractor pays Euroflo $49 (Pro) / $199 (Team); Free is the fee-only tier.

-- ── 1. Plan + billing fields on profiles ─────────────────────────────────────

alter table public.profiles
  add column if not exists plan                  text        not null default 'free',
  add column if not exists plan_status           text        not null default 'active',
  add column if not exists plan_interval         text,
  add column if not exists stripe_customer_id    text,
  add column if not exists stripe_subscription_id text,
  add column if not exists current_period_end    timestamptz;

-- Plan must be one of the known tiers.
alter table public.profiles
  drop constraint if exists profiles_plan_check;
alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('free', 'pro', 'team'));

-- plan_status mirrors the Stripe subscription status we care about.
alter table public.profiles
  drop constraint if exists profiles_plan_status_check;
alter table public.profiles
  add constraint profiles_plan_status_check
  check (plan_status in (
    'active', 'trialing', 'past_due', 'canceled', 'incomplete', 'unpaid', 'paused'
  ));

-- plan_interval is 'month' | 'year' (null on Free).
alter table public.profiles
  drop constraint if exists profiles_plan_interval_check;
alter table public.profiles
  add constraint profiles_plan_interval_check
  check (plan_interval is null or plan_interval in ('month', 'year'));

-- Look up a profile fast from a Stripe webhook (customer or subscription id).
create index if not exists idx_profiles_stripe_customer_id
  on public.profiles (stripe_customer_id);
create index if not exists idx_profiles_stripe_subscription_id
  on public.profiles (stripe_subscription_id);

-- ── 2. Grants ────────────────────────────────────────────────────────────────
-- The webhook writes plan changes via the service role.
grant select, update on public.profiles to service_role;

notify pgrst, 'reload schema';
