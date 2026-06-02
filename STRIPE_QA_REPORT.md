# Stripe Payment Flow QA Report

**Date:** 2026-06-01  
**App:** `revenue-recovery` (Next.js 15, Supabase, Stripe Connect)  
**Supabase project:** `lgjsatykcfkwatczyvla`  
**Dev server:** `http://localhost:3000`

---

## Verdict: FAIL

**Root cause: The Stripe Connect database migration was never applied.**

File `supabase/migrations/20260601000002_stripe_connect.sql` exists in the root `contractor_mvp/supabase/migrations/` folder but was never copied into `revenue-recovery/supabase/migrations/` and was never run against the live database.

---

## Missing Database Objects

The following are completely absent from the live database:

### Missing tables
| Table | Used by |
|-------|---------|
| `payments` | `POST /api/payments/create-checkout-session` (upsert on line 157) |
| `stripe_webhook_events` | `POST /api/stripe/webhook` (idempotency check on line 43) |

### Missing columns on `profiles`
| Column | Used by |
|--------|---------|
| `stripe_account_id` | `/api/stripe/connect/onboard`, `/api/stripe/connect/status`, `/api/payments/create-checkout-session` |
| `stripe_onboarding_complete` | `/api/payments/create-checkout-session` (line 86) |
| `stripe_charges_enabled` | `/api/payments/create-checkout-session` (line 92) |
| `stripe_payouts_enabled` | `/api/payments/create-checkout-session` (line 92) |
| `stripe_details_submitted` | `/api/stripe/connect/status` (line 48) |

### Missing columns on `estimates`
| Column | Used by |
|--------|---------|
| `contractor_amount_cents` | Checkout session creation, fee breakdown |
| `platform_fee_cents` | Checkout session creation |
| `client_total_cents` | `PayButton` render guard (`portal-page.tsx:495`) |
| `payment_status` | Webhook handler, double-pay guard |
| `paid_at` | Webhook handler |
| `stripe_checkout_session_id` | Checkout session creation, webhook handler |
| `stripe_payment_intent_id` | Webhook handler |

---

## Failure Chain (What Breaks and Why)

### 1. Contractor tries to connect Stripe
- Clicks "Connect Stripe" in Settings → `POST /api/stripe/connect/onboard`
- Route does `service.from("profiles").select("role, stripe_account_id")` → PostgREST 400 (`column profiles.stripe_account_id does not exist`)
- Supabase client sets `profileError` → route returns **404 "Profile not found"**
- User sees toast: **"Profile not found"**
- **Stripe onboarding is completely blocked**

### 2. Contractor tries to check Stripe status
- Settings page loads → `POST /api/stripe/connect/status`
- Same SELECT fails → **404 "Profile not found"**
- Status card stays on "Stripe not connected"

### 3. Contractor creates an estimate with payment amount
- Tries to INSERT into `estimates` with `contractor_amount_cents`, `platform_fee_cents`, `client_total_cents`
- PostgREST error: `Could not find the 'client_total_cents' column of 'estimates' in the schema cache`
- **Estimate INSERT fails — no payment amounts can ever be saved**

### 4. Client views estimate in portal
- `portal-page.tsx` line 495: `if (!clientTotalCents || clientTotalCents <= 0) return null`
- `client_total_cents` is always `null` (column doesn't exist)
- **Pay button never renders**

### 5. Even if checkout session were created
- Route tries to `upsert` into `payments` table → table doesn't exist → **500 error**
- Route tries to `UPDATE estimates SET payment_status='checkout_created'` → column doesn't exist → **error**

### 6. Webhook receives payment confirmation
- Handler tries `INSERT INTO stripe_webhook_events` → table doesn't exist → throws
- Returns `{"received":true,"error":"Handler failed"}` (200 status, so Stripe stops retrying)
- `payment_status` on estimate is **never updated to "paid"**

---

## What Does Work

| Area | Status | Notes |
|------|--------|-------|
| Auth guards on all 5 Stripe routes | ✅ | All return 401 for unauthenticated requests |
| Webhook signature validation | ✅ | Missing header → 400; invalid signature → 400 |
| Job request submission | ✅ | `POST /api/client-request` works end-to-end |
| Contractor login and profile | ✅ | Auth, role check, request_slug all correct |
| Fee calculation logic (in code) | ✅ | 15% platform fee math is correct |
| Stripe test keys configured | ✅ | `sk_test_…`, `pk_test_…`, `whsec_…` all set |
| Fee env var consistency | ✅ | `PLATFORM_FEE_PERCENT` = `NEXT_PUBLIC_PLATFORM_FEE_PERCENT` = 15 |

---

## Fix Instructions

### Step 1 — Copy migration into revenue-recovery (Critical)

```bash
cp supabase/migrations/20260601000002_stripe_connect.sql \
   revenue-recovery/supabase/migrations/20260601000002_stripe_connect.sql
```

Then apply it:
- **Option A:** `supabase db push` from `revenue-recovery/`
- **Option B:** Paste the SQL into the Supabase dashboard → SQL Editor → Run

The migration uses `ADD COLUMN IF NOT EXISTS` and `CREATE TABLE IF NOT EXISTS` so it is safe to run against an existing database.

### Step 2 — Fix FlowBar "Paid" detection (Medium)

**File:** `app/client/portal/[jobId]/portal-page.tsx` line 207

```tsx
// Current (broken — only checks invoices)
const isPaid = invoices.some((invoice) => invoice.status === "Paid")

// Fix — also check Stripe payment status on estimates
const isPaid = invoices.some((invoice) => invoice.status === "Paid")
  || estimates.some((e) => (e as { payment_status?: string }).payment_status === "paid")
```

Without this fix, the "Paid" step in the project FlowBar never activates after a Stripe payment, because Stripe payments don't create invoices.

### Step 3 — Set `NEXT_PUBLIC_APP_URL` for production (High)

Both `onboard/route.ts` and `create-checkout-session/route.ts` fall back to `http://localhost:3000` for Stripe redirect URLs. Set the env var before any production deployment:

```
NEXT_PUBLIC_APP_URL=https://your-production-domain.com
```

---

## Key File Locations

| File | Role |
|------|------|
| `revenue-recovery/app/api/stripe/connect/onboard/route.ts` | Creates Stripe Express account, generates onboarding link |
| `revenue-recovery/app/api/stripe/connect/status/route.ts` | Retrieves live Stripe account status, persists to DB |
| `revenue-recovery/app/api/payments/create-checkout-session/route.ts` | Creates Stripe Checkout Session, records in payments table |
| `revenue-recovery/app/api/stripe/webhook/route.ts` | Handles Stripe events, marks estimates/payments as paid |
| `revenue-recovery/app/client/portal/[jobId]/portal-page.tsx` | Client portal UI: estimate accept, Pay button, FlowBar |
| `revenue-recovery/app/client/portal/[jobId]/success/page.tsx` | Post-payment success page |
| `revenue-recovery/app/dashboard/settings/page.tsx` | `StripeConnectCard` component — contractor connect flow |
| `supabase/migrations/20260601000002_stripe_connect.sql` | **The migration that needs to be applied** |

---

## Test Suite

A comprehensive Playwright test suite was written at:
`revenue-recovery/e2e/stripe-payment-flow.spec.ts`

Run after applying the migration:
```bash
cd revenue-recovery
E2E_CONTRACTOR_EMAIL="danielkolpakov00@gmail.com" \
E2E_CONTRACTOR_PASSWORD="REMOVED_E2E_CONTRACTOR_PASSWORD" \
PLAYWRIGHT_BASE_URL="http://localhost:3000" \
npx playwright test e2e/stripe-payment-flow.spec.ts
```

Tests cover: contractor Stripe status, full payment flow, double-pay (409), cancel checkout, declined card, unconnected contractor (422), cross-contractor access (404), webhook idempotency, fee calculation.
