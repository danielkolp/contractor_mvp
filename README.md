# Revenue Recovery

A **contractor-first SaaS** for tracking unpaid invoices, ignored estimates, and unpaid work — generating polite follow-up messages, scheduling check-backs, and recovering money from dead jobs.

> **Not a marketplace.** Contractors manage their own clients. Clients submit job requests to a specific contractor via a shareable link.

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
5. Run **all migration files** in order (see Database migrations section below)

### 4. Enable email verification

Supabase controls whether confirmation emails are sent, so this must be enabled in the Supabase dashboard:

1. Go to **Authentication → Providers → Email**
2. Turn on **Confirm email**
3. Go to **Authentication → URL Configuration**
4. Set the site URL to your app URL
5. Add redirect URLs for each environment:
   - `http://localhost:3000/auth/callback`
   - `https://your-production-domain.com/auth/callback`
6. Go to **Authentication → Email Templates → Confirm signup**
7. Use `supabase/email-templates/confirm-signup-subject.txt` as the subject
8. Use `supabase/email-templates/confirm-signup.html` as the message body

For reliable production delivery, configure a custom SMTP provider in Supabase Auth.

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

## Database migrations

Run all migration files in order by pasting them into the Supabase SQL Editor. Each file is idempotent-safe.

| File | Description |
|---|---|
| `20240101000000_initial_schema.sql` | Core tables: profiles, settings, clients, invoices, recovery |
| `20240102000000_recovery_drafts.sql` | Recovery draft persistence |
| `20240103000000_ensure_recovery_drafts.sql` | Recovery drafts safety patch |
| `20240104000000_estimates.sql` | Estimates table with status tracking |
| `20240105000000_recovery_items.sql` | Recovery items (follow-up queue) |
| `20240106000000_line_items.sql` | Line items on estimates/invoices |
| `20240107000000_client_portal_job_requests.sql` | Client portal, job requests, roles |
| `20240108000000_fix_rls_recursion.sql` | RLS recursion fix |
| `20240109000000_job_requests_trade.sql` | Trade field on job requests |
| `20240110000000_tax_lines.sql` | Multi-line tax support |
| `20240111000000_job_requests_contractor_id.sql` | **Required:** scopes job requests to contractor |

Tables created:
- `profiles` — business profile per user, auto-created on signup
- `settings` — invoice defaults and follow-up preferences
- `clients` — contractor's client records
- `invoices` — invoice tracking with status and recovery stage
- `estimates` — estimate tracking linked to clients
- `recovery_items` — follow-up queue items (the core product)
- `job_requests` — client-submitted job requests scoped to a contractor
- `recovery_drafts`, `reminders`, `recovery_actions` — supporting tables

All tables have Row Level Security enabled. Users can only read and write their own records.

## Routes

### Contractor dashboard

| Route | Description |
|---|---|
| `/dashboard` | Today — action queue, overdue invoices, follow-ups due |
| `/dashboard/recoveries` | Recovery history — all follow-up items with filters |
| `/dashboard/estimates` | Estimate CRUD and status tracking |
| `/dashboard/invoices` | Invoice CRUD and follow-up generator |
| `/dashboard/clients` | Client CRUD with reliability badges |
| `/dashboard/job-requests` | Incoming client job requests (contractor-scoped) |
| `/dashboard/settings` | Business profile, invoice defaults, client request link |
| `/print/estimate/[id]` | Printable estimate PDF |
| `/print/invoice/[id]` | Printable invoice PDF |

### Client portal

| Route | Description |
|---|---|
| `/client/dashboard` | Client view: estimates and invoices |
| `/client/jobs/new?contractor=<id>` | Submit a job request to a specific contractor |

## Currency

The default currency is **CAD**. All dashboard displays and PDFs use `en-CA` formatting. The currency can be changed per-user in **Settings → Invoice defaults**.

## Follow-up workflow

1. Add a recovery item (ignored estimate, overdue invoice, unpaid work, etc.)
2. The app generates a polite follow-up message
3. **Copy** the message and send it manually (email, SMS, phone — your choice)
4. Mark as sent and schedule a check-back date
5. Come back on the check-back date to record the outcome
6. Mark won / lost / follow up again

> Messages are **copied to clipboard only** — no automatic email or SMS is sent.

## Known limitations / future work

- Photo uploads in client job requests are not yet implemented
- Templates feature is not yet implemented
- No automatic email/SMS sending — all messages are copy/paste
- No Stripe or payment processing

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
