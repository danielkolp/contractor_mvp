-- ============================================================
-- Revenue Recovery — Initial Schema
-- Paste this into the Supabase SQL editor and run it.
-- ============================================================

-- ───────────────────────────── ENUMS ──────────────────────────────

CREATE TYPE public.invoice_status AS ENUM (
  'Draft',
  'Sent',
  'Overdue',
  'Follow-up Sent',
  'Payment Plan',
  'Paid',
  'Escalated'
);

CREATE TYPE public.payment_reliability AS ENUM (
  'Reliable',
  'Slow payer',
  'High risk',
  'New client'
);

CREATE TYPE public.recovery_stage AS ENUM (
  'newly_overdue',
  'first_follow_up',
  'second_follow_up',
  'final_notice',
  'escalated',
  'resolved'
);

CREATE TYPE public.recovery_action_status AS ENUM (
  'Pending',
  'Completed',
  'Skipped',
  'Cancelled'
);

CREATE TYPE public.contact_method AS ENUM (
  'Email',
  'Phone',
  'Text'
);

-- ──────────────────────── UPDATED_AT TRIGGER ──────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─────────────────────────── PROFILES ─────────────────────────────

CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text,
  owner_name  text,
  trade       text,
  phone       text,
  website     text,
  service_area text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on new auth user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────── SETTINGS ─────────────────────────────

CREATE TABLE public.settings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  default_payment_terms integer NOT NULL DEFAULT 30,
  late_fee_percentage  numeric(5,2) NOT NULL DEFAULT 0,
  currency             text NOT NULL DEFAULT 'CAD',
  first_reminder_days  integer NOT NULL DEFAULT 3,
  second_reminder_days integer NOT NULL DEFAULT 7,
  final_notice_days    integer NOT NULL DEFAULT 14,
  default_tone         text NOT NULL DEFAULT 'friendly',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create settings row on new auth user
CREATE OR REPLACE FUNCTION public.handle_new_user_settings()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_settings
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_settings();

-- ─────────────────────────── CLIENTS ──────────────────────────────

CREATE TABLE public.clients (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  company               text NOT NULL DEFAULT '',
  trade                 text,
  email                 text,
  phone                 text,
  notes                 text,
  total_billed          numeric(12,2),
  unpaid_balance        numeric(12,2),
  overdue_invoice_count integer,
  last_contacted_date   date,
  payment_reliability   public.payment_reliability NOT NULL DEFAULT 'New client',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX clients_user_id_idx ON public.clients (user_id);

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────── INVOICES ─────────────────────────────

CREATE TABLE public.invoices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id      uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name    text,
  invoice_number text NOT NULL,
  project_name   text,
  amount         numeric(12,2) NOT NULL,
  issue_date     date,
  due_date       date,
  paid_at        timestamptz,
  status         public.invoice_status NOT NULL DEFAULT 'Draft',
  trade          text,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX invoices_user_id_idx   ON public.invoices (user_id);
CREATE INDEX invoices_client_id_idx ON public.invoices (client_id);
CREATE INDEX invoices_due_date_idx  ON public.invoices (due_date);
CREATE INDEX invoices_status_idx    ON public.invoices (status);

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────── RECOVERY ACTIONS ──────────────────────

CREATE TABLE public.recovery_actions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id               uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  stage                    public.recovery_stage NOT NULL,
  action_type              text NOT NULL,
  status                   public.recovery_action_status NOT NULL DEFAULT 'Pending',
  contact_method           public.contact_method NOT NULL DEFAULT 'Email',
  recommended_next_action  text,
  notes                    text,
  scheduled_for            timestamptz,
  completed_at             timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX recovery_actions_user_id_idx    ON public.recovery_actions (user_id);
CREATE INDEX recovery_actions_invoice_id_idx ON public.recovery_actions (invoice_id);

CREATE TRIGGER recovery_actions_updated_at
  BEFORE UPDATE ON public.recovery_actions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────── REMINDERS ────────────────────────────

CREATE TABLE public.reminders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id     uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  reminder_date  date NOT NULL,
  scheduled_for  timestamptz NOT NULL,
  reminder_type  text NOT NULL DEFAULT 'Payment follow-up',
  contact_method text NOT NULL DEFAULT 'Email',
  status         text NOT NULL DEFAULT 'Scheduled',
  sent_at        timestamptz,
  completed      boolean NOT NULL DEFAULT false,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reminders_user_id_idx    ON public.reminders (user_id);
CREATE INDEX reminders_invoice_id_idx ON public.reminders (invoice_id);
CREATE INDEX reminders_reminder_date  ON public.reminders (reminder_date);

CREATE TRIGGER reminders_updated_at
  BEFORE UPDATE ON public.reminders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ══════════════════════════ ROW LEVEL SECURITY ════════════════════

ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders        ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles: own rows" ON public.profiles
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- settings
CREATE POLICY "settings: own rows" ON public.settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- clients
CREATE POLICY "clients: own rows" ON public.clients
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- invoices
CREATE POLICY "invoices: own rows" ON public.invoices
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- recovery_actions
CREATE POLICY "recovery_actions: own rows" ON public.recovery_actions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- reminders
CREATE POLICY "reminders: own rows" ON public.reminders
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ══════════════════════════ ROLE GRANTS ══════════════════════════
-- RLS filters rows but the role still needs table-level access.

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
