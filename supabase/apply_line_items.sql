-- Run this in your Supabase SQL editor to add line_items and tax_rate
-- to the estimates and invoices tables.

alter table estimates
  add column if not exists line_items jsonb    not null default '[]'::jsonb,
  add column if not exists tax_rate   numeric(5, 2) not null default 0;

alter table invoices
  add column if not exists line_items jsonb    not null default '[]'::jsonb,
  add column if not exists tax_rate   numeric(5, 2) not null default 0;
