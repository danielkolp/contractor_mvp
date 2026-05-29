# Revenue Recovery

A contractor-friendly SaaS dashboard for tracking unpaid invoices, following up on overdue balances, and managing the recovery workflow from first reminder to resolution.

## Tech stack

- **Next.js 15** — App Router, server components, middleware
- **TypeScript** — strict mode
- **Tailwind CSS v4** — PostCSS plugin, no config file needed
- **shadcn/ui + Radix UI** — accessible component primitives
- **Supabase** — auth (email/password) + Postgres database with RLS
- **Sonner** — toast notifications

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create environment file

```bash
cp .env.example .env.local
```

Fill in your Supabase project URL and anon key (see below).

### 3. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **Project Settings → API** and copy your **Project URL** and **anon public** key
3. Paste them into `.env.local`
4. Go to the **SQL Editor** in your Supabase dashboard
5. Paste and run the migration file: `supabase/migrations/20240101000000_initial_schema.sql`

The migration creates all tables, enums, RLS policies, and triggers (including auto-profile creation on signup).

### 4. Enable email verification

Supabase controls whether confirmation emails are sent, so this must be enabled in the Supabase dashboard:

1. Go to **Authentication -> Providers -> Email**
2. Turn on **Confirm email**
3. Go to **Authentication -> URL Configuration**
4. Set the site URL to your app URL
5. Add redirect URLs for each environment:
   - `http://localhost:3000/auth/callback`
   - `https://your-production-domain.com/auth/callback`
6. Go to **Authentication -> Email Templates -> Confirm signup**
7. Use `supabase/email-templates/confirm-signup-subject.txt` as the subject
8. Use `supabase/email-templates/confirm-signup.html` as the message body

For reliable production delivery, configure a custom SMTP provider in Supabase Auth. The app includes resend-verification actions on both `/login` and `/signup`.

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon/public key |

Both variables must be prefixed with `NEXT_PUBLIC_` so they are available in the browser.

## Database migration

The full schema lives in one file:

```
supabase/migrations/20240101000000_initial_schema.sql
```

Run it once by pasting it into the Supabase SQL Editor. It is idempotent-safe (uses `CREATE TYPE IF NOT EXISTS` equivalents where possible).

Tables created:
- `profiles` — business profile per user, auto-created on signup
- `settings` — invoice defaults and follow-up preferences, auto-created on signup
- `clients` — contractor's client records
- `invoices` — invoice tracking with status and recovery stage
- `recovery_actions` — log of follow-up actions per invoice
- `reminders` — scheduled follow-up reminders linked to invoices

All tables have Row Level Security enabled. Users can only read and write their own records.

## Routes

| Route | Description |
|---|---|
| `/` | Landing page |
| `/login` | Email/password login |
| `/signup` | Email/password signup |
| `/dashboard` | Overview — stats, overdue invoices, reminders |
| `/dashboard/invoices` | Invoice CRUD, detail drawer, follow-up generator |
| `/dashboard/clients` | Client CRUD, reliability badges |
| `/dashboard/recovery` | Recovery pipeline by stage |
| `/dashboard/reminders` | Reminder list with filters |
| `/dashboard/settings` | Business profile and invoice defaults |

## Run commands

```bash
npm run dev      # start dev server (Turbopack)
npm run build    # production build
npm run start    # serve production build
npm run lint     # ESLint
```

## Deployment

Deploy to [Vercel](https://vercel.com) by connecting the GitHub repo. Add the two environment variables in the Vercel project settings under **Environment Variables**.

The app has no build-time Supabase dependency — pages that require auth gracefully degrade when env vars are missing.
