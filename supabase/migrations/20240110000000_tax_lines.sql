-- Replace the single tax_rate field with named tax lines for estimates and
-- invoices, enabling GST, PST, HST, QST, etc. to appear as separate lines.
-- The old tax_rate column is kept for backwards compatibility and defaults
-- to 0; new records use tax_lines exclusively.

alter table public.estimates
  add column if not exists tax_lines jsonb not null default '[]';

alter table public.invoices
  add column if not exists tax_lines jsonb not null default '[]';

notify pgrst, 'reload schema';
