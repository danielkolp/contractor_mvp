-- Pro branding: a short branded footer/message the contractor can show on
-- estimates, invoices, and the client portal. Editing/display is gated to the
-- Pro plan in app code (free profiles may keep an old value but it is not shown).
-- Logo upload is deferred — when it lands it will be another column here.

alter table public.profiles
  add column if not exists branding_footer text;

-- Keep it a short footer line, not an essay.
alter table public.profiles
  drop constraint if exists profiles_branding_footer_length;
alter table public.profiles
  add constraint profiles_branding_footer_length
  check (branding_footer is null or char_length(branding_footer) <= 300);

notify pgrst, 'reload schema';
