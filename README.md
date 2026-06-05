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

### Supabase (required)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon/public key |

Both variables must be prefixed with `NEXT_PUBLIC_` so they are available in the browser.

### Resend — transactional email (optional, enables direct sending)

Follow-up emails are sent via [Resend](https://resend.com). Sign up, verify a sending domain, and create an API key.

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | Resend API key (starts with `re_`) |
| `RESEND_FROM_EMAIL` | Verified sender, e.g. `Euroflo <followups@yourdomain.com>` |

**If these are missing:** the app does not crash. The "Send follow-up email" button shows a clear configuration error. Copy/manual fallback continues to work. Only recovery follow-up emails use Resend — invoice and estimate sending is not yet implemented.

### Email format

Follow-up emails are sent as **branded HTML** with a plain-text fallback. The HTML template (`lib/email/recovery-email-template.ts`) uses inline styles only — no external CSS or fonts — so it renders correctly in Gmail, Outlook, Apple Mail, and mobile clients.

Layout:
- Ocean header bar with "Follow-up from [Company Name]"
- Subject line as a heading
- Message body as paragraphs (line breaks preserved)
- Contractor signature (name, company, phone if set, website if set)
- Footer: "Sent via Euroflo on behalf of [Company Name]"

**Reply-To**: when `RESEND_INBOUND_DOMAIN` is configured, the `replyTo` address is set to a unique inbound address (`r_<event_id>@<domain>`) and client replies are routed back to the dashboard. Without inbound configured, the contractor's real email is used as `replyTo` — replies go to their inbox and are not tracked in-app. See **Inbound reply handling** below.

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
| `20240112000000_contractor_public_profile.sql` | RPC for safe contractor profile exposure to clients |
| `20240113000000_recovery_email_events.sql` | **Required for email:** audit log of all sent follow-ups |
| `20240114000000_grant_recovery_email_events.sql` | Explicit grants for recovery_email_events |
| `20240115000000_recovery_inbound_replies.sql` | **Required for inbound replies:** reply addressing columns + recovery_email_replies table |

Tables created:
- `profiles` — business profile per user, auto-created on signup
- `settings` — invoice defaults and follow-up preferences
- `clients` — contractor's client records
- `invoices` — invoice tracking with status and recovery stage
- `estimates` — estimate tracking linked to clients
- `recovery_items` — follow-up queue items (the core product)
- `recovery_email_events` — audit log of every recovery email send attempt
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
3. If a client email is on the item: click **Send follow-up email** — the app emails the client directly via Resend, logs the event, and schedules the check-back
4. If no email is available: **Copy** the message and send it manually, then click **Mark sent manually**
5. Come back on the check-back date to record the outcome
6. Mark won / lost / follow up again

Every email send is logged in `recovery_email_events`. The recovery item is only updated to "Waiting for reply" after the provider confirms delivery — a failed send never silently marks the item as sent.

> **Email requires Resend credentials** — see Environment variables above. Copy/manual mode works without them.

## Inbound reply handling

When a contractor sends a recovery follow-up email, the app can generate a unique **Reply-To** address that routes the client's reply back into the dashboard. This requires configuring Resend Receiving.

### Required environment variables

| Variable | Description |
|---|---|
| `RESEND_INBOUND_DOMAIN` | Domain you configured for Resend Receiving, e.g. `reply.yourdomain.com` |
| `RESEND_WEBHOOK_SECRET` | Shared secret to authenticate inbound webhook POSTs |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — webhook uses this to bypass RLS when saving replies |

### Resend Receiving setup

1. Go to **Resend dashboard → Receiving**.
2. Add a receiving domain (e.g. `reply.yourdomain.com`) and follow DNS setup instructions.
3. Add a webhook endpoint with event type **`email.received`**.
4. Set the webhook URL to: `https://your-app.com/api/webhooks/resend/inbound?secret=<RESEND_WEBHOOK_SECRET>`
   - Or pass the secret as `x-resend-webhook-secret` header if Resend supports custom headers.
5. Set `RESEND_INBOUND_DOMAIN=reply.yourdomain.com` in your environment.
6. Set `RESEND_WEBHOOK_SECRET` to any long random string.

### How reply addresses work

Each outbound follow-up email generates a unique reply address:

```
r_<email_event_uuid>@<RESEND_INBOUND_DOMAIN>
```

This address is stored in `recovery_email_events.reply_to_email` and embedded as the `Reply-To` header. When the client replies, Resend routes the email to the webhook which looks up the matching event and saves the reply to `recovery_email_replies`.

### Local testing with ngrok

Resend needs a publicly reachable URL to deliver inbound webhooks.

```bash
# Start the dev server
npm run dev

# In another terminal, expose port 3000
ngrok http 3000
```

Use the ngrok URL (`https://xxxx.ngrok.io/api/webhooks/resend/inbound?secret=...`) as the webhook URL in Resend.

### Database migrations

Two new tables / columns are added by `20240115000000_recovery_inbound_replies.sql`:

- `recovery_email_events.reply_to_email` — the inbound address used for a specific send
- `recovery_email_events.inbound_thread_key` — UUID used to match inbound replies
- `recovery_email_replies` — stores each inbound reply from a client

### Limitations

- Replies are only visible in the app for emails **sent after inbound setup** — historical emails have no `reply_to_email` set.
- No in-app reply composer yet — the contractor must reply via their own email client.
- Email attachments in client replies are not stored (only text/HTML body).
- If `RESEND_INBOUND_DOMAIN` is missing, the `Reply-To` header falls back to the contractor's real email — replies go to their inbox and are **not tracked** in the app.
- Requires Resend's Receiving feature, which may require a custom domain and DNS setup.

---

## Known limitations / future work

- Invoice and estimate email sending not yet implemented (only recovery follow-ups use Resend)
- No SMS sending (Twilio integration is future work)
- Recovery follow-up emails support a "Pay now" button, but recovery items are not yet
  linked to a payable estimate, so the deep link isn't wired in the send route yet
- Real Stripe subscription and payout charges need an environment where Stripe's hosts
  are reachable (blocked in the sandbox)

Implemented: client job-request photo uploads, Stripe Connect payments (deposits +
balances), and Stripe Billing subscriptions (Free / Pro / Team) with per-plan card fees.

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

## Planned features

### Public no-account request form

**Status: not yet built — do not partially implement.**

The current client request link (`/client/jobs/new?contractor=<uuid>`) requires the client to be signed in. This is acceptable for the authenticated portal flow but not suitable for posting on a contractor's website or social profile.

Future route: `/request/[contractorId]`

Requirements before building:
- New public route outside `/client` — no login required
- Anonymous submit must use a `SECURITY DEFINER` RPC (never a direct anonymous insert on `job_requests`)
- Collect `requester_name`, `requester_email`, `requester_phone` on the form
- Insert `job_request` with `client_id = null` and `contractor_id` set
- Contractor sees it in Job Requests as a lead with requester contact fields
- Existing authenticated client portal remains unchanged
- Client account only needed later for estimate acceptance / portal access
