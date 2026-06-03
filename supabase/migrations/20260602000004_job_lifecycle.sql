-- Full job lifecycle: contractor decline, visit negotiation, visit completed,
-- and structured estimate decline reason from the client.

-- ── New job_request_status values ─────────────────────────────────────────────
alter type public.job_request_status add value if not exists 'declined_by_contractor';
alter type public.job_request_status add value if not exists 'visit_completed';

-- ── Visit negotiation columns on job_requests ──────────────────────────────────
-- Client can counter-propose a visit time; contractor accepts or re-proposes.
alter table public.job_requests
  add column if not exists visit_client_proposed_at timestamptz,
  add column if not exists visit_client_notes        text,
  add column if not exists contractor_decline_reason text;

-- ── Structured decline reason on estimates (client declining an estimate) ─────
alter table public.estimates
  add column if not exists decline_reason  text
    check (
      decline_reason is null or
      decline_reason in (
        'price_too_high', 'scope_changed', 'hired_another',
        'no_longer_needed', 'timeline', 'other'
      )
    ),
  add column if not exists decline_comment text;

-- Ensure service_role can update all relevant tables from API routes
grant all on public.job_requests to service_role;
grant all on public.estimates    to service_role;

notify pgrst, 'reload schema';
