-- BUG-01 fix: service_role was missing SELECT + UPDATE on estimates.
-- The original estimates migration (20240104000000) only granted to authenticated/anon.
-- The stripe_connect migration (applied via dashboard) added columns to estimates but
-- did not add the service_role grant.
--
-- Without this grant the webhook handler and create-checkout-session route
-- silently fail to update estimates.payment_status, so payments are never
-- reflected in the DB and double-pay protection is bypassed.

grant select, update on public.estimates to service_role;

notify pgrst, 'reload schema';
