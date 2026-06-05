-- "Mark paid" with a method picker (e-transfer / cash / cheque / card).
-- Workflow is the lock-in: let a contractor close out a job paid off-platform
-- (no fee) and record HOW it was paid, so it leaves the chase queue.

-- ── 1. payment_method on the things you get paid for ─────────────────────────

alter table public.invoices
  add column if not exists payment_method text;

alter table public.estimates
  add column if not exists payment_method text;

alter table public.recovery_items
  add column if not exists payment_method text,
  add column if not exists paid_at        timestamptz;

-- Constrain to the known methods (null = unknown / not yet paid).
do $$
begin
  alter table public.invoices
    drop constraint if exists invoices_payment_method_check;
  alter table public.invoices
    add constraint invoices_payment_method_check
    check (payment_method is null or payment_method in ('e_transfer', 'cash', 'cheque', 'card'));

  alter table public.estimates
    drop constraint if exists estimates_payment_method_check;
  alter table public.estimates
    add constraint estimates_payment_method_check
    check (payment_method is null or payment_method in ('e_transfer', 'cash', 'cheque', 'card'));

  alter table public.recovery_items
    drop constraint if exists recovery_items_payment_method_check;
  alter table public.recovery_items
    add constraint recovery_items_payment_method_check
    check (payment_method is null or payment_method in ('e_transfer', 'cash', 'cheque', 'card'));
end $$;

notify pgrst, 'reload schema';
