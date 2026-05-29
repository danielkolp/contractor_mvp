-- Add line_items (JSONB array) and tax_rate to estimates and invoices.
-- Each element in line_items: { description, quantity, unit_price }
-- The stored `amount` is always the authoritative grand total.

alter table estimates
  add column if not exists line_items jsonb    not null default '[]'::jsonb,
  add column if not exists tax_rate   numeric(5, 2) not null default 0;

alter table invoices
  add column if not exists line_items jsonb    not null default '[]'::jsonb,
  add column if not exists tax_rate   numeric(5, 2) not null default 0;
