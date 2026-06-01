# Euroflo — Claude Code Handoff

## What This App Is

**Euroflo** is a job management tool for independent contractors (plumbers, electricians, general contractors). It manages the full lifecycle of a job — from the first client request through to final payment — without the contractor ever leaving the app.

The core insight: contractors waste time chasing clients for basic info, chasing payments, and juggling texts/emails/notes. Euroflo structures the job from the start so none of that is necessary.

---

## The Two Users

**Contractor (Mike):** Logs in. Uses the dashboard daily. Non-techy tradesperson on a phone.

**Client (Sarah):** Never logs in. Never creates an account. Only ever sees tokenized public pages delivered via email link.

Supabase is invisible to both — it is developer infrastructure only.

---

## The Exact Flow

```
[1] Client submits request
        ↓
[2] Contractor reviews request in dashboard
        ↓
[3] Contractor creates + sends estimate → client gets email with tokenized link
        ↓
[4] Client opens link, accepts estimate → contractor gets notified
        ↓
[5] Contractor does the job
        ↓
[6] Contractor creates + sends invoice → client gets email with tokenized link
        ↓
[7] Client opens link, pays invoice → contractor gets notified, job marked paid
```

Each step is a `job_status`. The Today page shows every active job and its current status with one clear next action.

---

## Contractor Flow (Simple)

1. Sends his unique link to a lead
2. Gets notified — new request with all details and photos
3. Reviews job, creates and sends estimate in the app
4. Gets notified — client accepted
5. Does the job
6. Creates and sends invoice in the app
7. Gets paid, job auto-marks complete

---

## Client Flow (Simple)

1. Gets a link from the contractor
2. Fills out one form — job details, address, photos, budget, contact preference
3. Receives estimate link by email, opens it, accepts
4. Job gets done
5. Receives invoice link by email, opens it, pays

---

## Tech Stack

- **Next.js 15** (App Router, server components) — the entire app
- **Supabase** — database + contractor auth (developer-facing only)
- **Resend** — sends tokenized links to clients via email
- **Stripe** — client pays invoice (Stripe Checkout, no auth required)
- **Vercel** — hosting

---

## Design System

### Name
**Euroflo** — named after the way work should flow. "Euro" signals the precision and quality contractors already associate with European tool brands (Festool, Hilti, Bosch). "Flo" is the process from first contact to final payment.

### Colors (warm stone + construction orange — NOT generic SaaS blue)
```
Background:     #FAFAF9   (stone-50)
Surface/cards:  #F5F5F4   (stone-100)
Border:         #E7E5E4   (stone-200)
Muted text:     #78716C   (stone-500)
Body text:      #292524   (stone-800)
Headings:       #1C1917   (stone-950)

Primary CTA:    #EA580C   (orange-600)   ← construction orange, distinctive
CTA hover:      #C2410C   (orange-700)
Success/paid:   #15803D   (green-700)
Danger/overdue: #DC2626   (red-600)
Warning/follow: #F59E0B   (amber-500)
```

### Typography
```
Heading:  Barlow Condensed 700  — industrial, condensed, impact
Body:     Barlow 400/500/600    — same family, clean and readable

@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500;600&display=swap');
```

### Component Rules
```
Border radius:    6px           (not 12px — less startup-bubbly)
Border width:     1.5px         (feels physical, not hairline)
Shadows:          none          (flat and direct)
Button height:    48px min      (large hands, phone use)
Primary buttons:  Barlow 600, uppercase, orange-600 fill, no gradient
Cards:            bg-stone-100, border border-stone-200, no shadow
```

### Status Border System (left border on job cards)
```
Needs action now:   border-l-4 border-red-600
Waiting on client:  border-l-4 border-amber-500
Complete/paid:      border-l-4 border-green-700
```

### Anti-patterns to avoid
- No `rounded-xl` or `rounded-full` buttons
- No blue as primary color
- No thin font weights
- No glassmorphism or shadows
- No small touch targets
- No gray text lighter than stone-500

---

## Current Codebase State

### App Router structure
```
app/
├── dashboard/          ← contractor dashboard
│   ├── page.tsx        ← Today page (needs redesign)
│   ├── clients/        ← CRUD (keep)
│   ├── estimates/      ← CRUD (keep, needs Send button)
│   ├── invoices/       ← CRUD (keep, needs Send button)
│   ├── job-requests/   ← incoming requests (keep, needs photo display + CTA)
│   ├── settings/       ← profile (keep)
│   ├── recoveries/     ← DEPRIORITIZE, do not build further
│   ├── reminders/      ← DEPRIORITIZE, do not build further
│   ├── templates/      ← DELETE (coming soon stub, 31 lines)
│   ├── customers/      ← DELETE (duplicate of clients/)
│   └── setup/          ← keep (onboarding wizard)
├── request/[contractorId]/  ← public client form (needs address + photos + contact pref)
├── print/              ← keep as-is
├── client/             ← DELETE ENTIRE FOLDER (authenticated client portal, not needed)
├── api/
│   ├── recovery/       ← deprioritize
│   ├── webhooks/resend/← keep for inbound
│   └── client-request/ ← keep
└── login/ signup/      ← keep
```

### Database tables (Supabase)
```
profiles          — contractor business info
settings          — invoice defaults, follow-up prefs
clients           — contractor's client records
estimates         — estimate CRUD (status enum includes "Accepted")
invoices          — invoice CRUD (status enum includes "Paid")
job_requests      — client submissions (has contractor_id, client_name, client_email)
recovery_items    — DEPRIORITIZE
recovery_email_events — DEPRIORITIZE
recovery_email_replies — DEPRIORITIZE
```

### Key enums already in DB
```
job_request_status: "new" | "reviewed" | "estimate_created" | "accepted" | "declined" | "closed"
estimate_status:    "Draft" | "Sent" | "Accepted" | "Won" | "Declined" | ...
invoice_status:     "Draft" | "Sent" | "Paid" | "Overdue" | ...
```

### What's already working
- Contractor auth (Supabase)
- Estimate CRUD with line items and tax
- Invoice CRUD with line items and tax
- Client CRUD
- Public request form at `/request/[contractorId]` (needs additions)
- Resend email infrastructure (`/api/recovery/send-email`, lib/email/)
- Print views for estimates and invoices
- Settings/profile page

### What's missing (build in this order)
See BUILD PLAN below.

---

## Build Plan (Priority Order)

### 1. Clean up dead weight first
- Delete `/app/dashboard/templates/`
- Delete `/app/dashboard/customers/`
- Delete `/app/client/` (entire folder)
- Remove nav links to recoveries, reminders, templates from sidebar

### 2. Client request form additions (`/app/request/[contractorId]/page.tsx`)
- Add **address** field (street, city — two inputs or one combined)
- Add **preferred contact method** field (Text / Call / Email — radio or segmented control)
- Wire up **photo upload** to Supabase Storage (bucket: `job-request-photos`)
  - Store photo URLs as array in `job_requests` table (add `photo_urls text[]` column via migration)
- `service_area` field currently stores a string — replace with proper address fields

### 3. Job requests dashboard improvements (`/app/dashboard/job-requests/`)
- Display uploaded photos in request detail view
- Add **"Create Estimate"** button that navigates to `/dashboard/estimates/new?from_request=[id]` pre-filling client name, email, description
- Show contact preference clearly

### 4. Tokenized estimate link system
**New migration:** Add `share_token uuid DEFAULT gen_random_uuid()` to `estimates` table

**New API route:** `POST /api/estimates/[id]/send`
- Sets `status = 'Sent'`, `sent_date = now()`
- Sends email via Resend to client with link: `https://euroflo.app/e/[share_token]`

**New public page:** `/app/e/[token]/page.tsx`
- No auth required
- Fetches estimate by `share_token`
- Displays: contractor name/company, line items, total, notes, expiry
- Two buttons: **Accept** / **Decline**
- On Accept: updates `estimate.status = 'Accepted'`, triggers Resend email to contractor

**New API route:** `POST /api/estimates/accept`
- Body: `{ token, action: 'accept' | 'decline' }`
- Updates estimate status
- Sends notification email to contractor via Resend

### 5. Tokenized invoice link system (same pattern as estimate)
**New migration:** Add `share_token uuid DEFAULT gen_random_uuid()` to `invoices` table

**New API route:** `POST /api/invoices/[id]/send`
- Sets `status = 'Sent'`
- Sends email via Resend to client with link: `https://euroflo.app/i/[share_token]`

**New public page:** `/app/i/[token]/page.tsx`
- No auth required
- Fetches invoice by `share_token`
- Displays invoice details
- **Pay Now** button → Stripe Checkout

### 6. Stripe payment integration
**New API route:** `POST /api/invoices/[id]/checkout`
- Creates Stripe Checkout Session
- `success_url` redirects to `/i/[token]?paid=true`
- `cancel_url` returns to `/i/[token]`

**New API route:** `POST /api/webhooks/stripe`
- Listens for `checkout.session.completed`
- Updates `invoice.status = 'Paid'`, sets `paid_at`
- Sends Resend email to contractor: "Sarah paid your invoice — $1,250"

### 7. Today page redesign (`/app/dashboard/page.tsx`)
Redesign around job status, not recovery workflow.

**Layout:**
```
─────────────────────────────────
  Total outstanding: $4,200
─────────────────────────────────
  ACTION NEEDED (2)
  ┌─────────────────────────────┐
  │ ▌ Mike Chen                 │  ← border-l-4 border-red-600
  │   Bathroom retile           │
  │   Estimate accepted 2d ago  │
  │   [Send Invoice]            │
  └─────────────────────────────┘

  WAITING ON CLIENT (1)
  ┌─────────────────────────────┐
  │ ▌ Dave Kowalski             │  ← border-l-4 border-amber-500
  │   Deck repair               │
  │   Estimate sent 5d ago      │
  │   [Send Reminder]           │
  └─────────────────────────────┘

  RECENTLY PAID (1)
  ┌─────────────────────────────┐
  │ ▌ Sarah Johnson             │  ← border-l-4 border-green-700
  │   Kitchen plumbing          │
  │   Paid yesterday — $850     │
  └─────────────────────────────┘
─────────────────────────────────
  NEW REQUESTS (1)
  [View Requests]
─────────────────────────────────
```

No charts. No metrics. Just jobs and one action per job.

---

## Notification Emails (via Resend)

| Trigger | Recipient | Subject |
|---------|-----------|---------|
| New client request submitted | Contractor | "New job request from Sarah Johnson" |
| Client accepts estimate | Contractor | "Sarah accepted your estimate — $2,400" |
| Client declines estimate | Contractor | "Sarah declined your estimate" |
| Client pays invoice | Contractor | "Sarah paid — $2,400 received" |
| Estimate sent | Client | "Your estimate from [Contractor] is ready" |
| Invoice sent | Client | "Invoice from [Contractor] — $2,400 due" |

All emails sent via Resend. Contractor emails use contractor's email from `profiles`. Client emails use email from `job_requests.client_email`.

---

## Environment Variables (already configured)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
RESEND_FROM_EMAIL
```

**Need to add:**
```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL=https://euroflo.app  (or localhost:3000 for dev)
```

---

## Key Design Decisions to Preserve

1. **No client accounts.** Ever. All client-facing pages are tokenized public routes.
2. **One primary action per screen.** Never two equally prominent buttons.
3. **Supabase is developer-only infrastructure.** Neither contractor nor client is aware of it.
4. **The Today page is the whole app** for daily use. Everything else is detail.
5. **The recovery workflow is deprioritized** — the structured flow prevents needing it. Do not build on it.
6. **Mobile first.** 48px min touch targets. Primary actions at bottom of screen.
7. **Warm stone palette + orange CTA.** Never default shadcn blue-white.

---

## Branch
`claude/contractor-experience-next-steps-EAz9r`
