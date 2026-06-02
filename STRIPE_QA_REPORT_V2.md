# Stripe Payment Flow QA Report — v2 (Post-Migration)

**Date:** 2026-06-01  
**App:** `revenue-recovery` (Next.js 15, Supabase, Stripe Connect)  
**Migration applied:** `20260601000002_stripe_connect.sql` ✅  
**Test environment:** `http://localhost:3000` + `https://lgjsatykcfkwatczyvla.supabase.co`

---

## Verdict: FAIL

**5 bugs found. 2 are production blockers. 1 requires a Stripe dashboard action.**

---

## PASS / FAIL Summary Table

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | profiles: 5 Stripe columns present | ✅ PASS | Migration applied |
| 2 | estimates: 7 Stripe columns present | ✅ PASS | Readable via user session |
| 3 | payments table: all 16 columns | ✅ PASS | New table exists |
| 4 | stripe_webhook_events table | ✅ PASS | New table exists |
| 5 | service_role → SELECT estimates | ❌ FAIL | **BUG-01** — GRANT missing |
| 6 | service_role → UPDATE estimates | ❌ FAIL | **BUG-01** — GRANT missing |
| 7 | Contractor sign-in | ✅ PASS | |
| 8 | POST /api/stripe/connect/onboard — unauth → 401 | ✅ PASS | |
| 9 | POST /api/stripe/connect/onboard — authenticated | ❌ FAIL | **BUG-02 + BUG-03** — 500 empty body |
| 10 | POST /api/stripe/connect/status — unauth → 401 | ✅ PASS | |
| 11 | POST /api/stripe/connect/status — authenticated → 200 | ✅ PASS | Returns all 5 fields |
| 12 | POST /api/payments/create-checkout-session — unauth → 401 | ✅ PASS | |
| 13 | POST /api/payments/create-checkout-session — missing estimateId → 400 | ✅ PASS | |
| 14 | POST /api/payments/create-checkout-session — non-existent estimate → 404 | ✅ PASS | |
| 15 | POST /api/payments/create-checkout-session — amount < $0.50 → 422 | ✅ PASS | |
| 16 | POST /api/payments/create-checkout-session — unconnected contractor → 422 | ✅ PASS | Clear error message |
| 17 | Double-pay: payment_status='paid' → 409 | ✅ PASS | Guard works when status is set correctly |
| 18 | POST /api/stripe/webhook — missing stripe-signature → 400 | ✅ PASS | |
| 19 | POST /api/stripe/webhook — invalid stripe-signature → 400 | ✅ PASS | |
| 20 | Webhook idempotency: duplicate event_id rejected at DB | ✅ PASS | UNIQUE primary key on stripe_webhook_events |
| 21 | Fee calculation: 15% math correct | ✅ PASS | contractor=$1000, fee=$150, total=$1150 |
| 22 | Success page: shows correct state | ❌ FAIL | **BUG-01 downstream** — shows "No payment found" after Stripe payment |
| 23 | FlowBar "Paid" step activates after payment | ❌ FAIL | **BUG-04** — only checks invoices, not payment_status |

**Score: 18 PASS / 5 FAIL**

---

## Bug Details

---

### BUG-01 — CRITICAL (P0) — Production Blocker
**`service_role` missing GRANT on `estimates` table — webhook handler silently fails to mark estimates as paid**

**What happens:**  
The migration that created the new `payments` and `stripe_webhook_events` tables added `GRANT ... TO service_role` for those new tables, but did NOT add a GRANT for service_role on the existing `estimates` table. The original `20240104000000_estimates.sql` migration only granted `GRANT ALL TO authenticated` and `GRANT SELECT TO anon`.

All four Stripe server-side operations on `estimates` use the service role client:
- `create-checkout-session/route.ts` line 149: `service.from("estimates").update({ stripe_checkout_session_id, payment_status: "checkout_created" })` → **silently fails**
- `webhook/route.ts` line 127: `service.from("estimates").update({ payment_status: "paid", paid_at, stripe_payment_intent_id })` → **silently fails**
- `webhook/route.ts` line 252: `service.from("estimates").select("*")` for email sending → **throws** → webhook returns `{ received: true, error: "Handler failed" }` → no payment emails sent

**Confirmed via:**  
```
curl -X GET https://lgjsatykcfkwatczyvla.supabase.co/rest/v1/estimates?select=id&limit=1 \
  -H "Authorization: Bearer {service_role_key}"
# → 403 {"code":"42501","message":"permission denied for table estimates","hint":"Grant the required privileges..."}
```

**Downstream effects:**
1. After creating a checkout session: `estimates.payment_status` stays `'unpaid'` (not `'checkout_created'`)
2. After a successful Stripe payment: `estimates.payment_status` stays `'unpaid'` (not `'paid'`)
3. **Double-pay protection broken in production**: checkout route checks `if (estimate.payment_status === "paid")` — it's never `'paid'`, so the 409 guard is bypassed. A client can create unlimited checkout sessions for the same estimate after paying.
4. Success page: reads `payment_status === 'paid'` → false → shows "No payment found for this project yet." to a client who just paid money
5. Payment receipt emails: `sendPaymentEmails` crashes trying to SELECT estimates → no emails sent
6. Stripe retries: webhook returns 200 with `{ received: true, error: "Handler failed" }` → Stripe stops retrying — the failure is swallowed permanently

**Reproduction:**
1. Have a Won/Accepted estimate with payment amounts set
2. Call `POST /api/payments/create-checkout-session` — returns a Stripe URL ✅
3. Check `estimates.payment_status` — still `'unpaid'` ❌ (should be `'checkout_created'`)
4. Complete payment on Stripe test card
5. Check `estimates.payment_status` — still `'unpaid'` ❌ (should be `'paid'`)
6. Open `/client/portal/{jobId}/success` — shows "No payment found for this project yet." ❌

**Fix — run in Supabase SQL Editor immediately:**
```sql
GRANT SELECT, UPDATE ON public.estimates TO service_role;
NOTIFY pgrst, 'reload schema';
```

**Migration file already updated:** `revenue-recovery/supabase/migrations/20260601000004_stripe_estimates_service_role_grant.sql`  
**Root migration also patched:** `supabase/migrations/20260601000002_stripe_connect.sql` (for future environments)

---

### BUG-02 — CRITICAL (P0) — Environment/Config
**Stripe Connect not activated on the test Stripe account**

**What happens:**  
`POST /api/stripe/connect/onboard` returns HTTP 500 with empty body.

**Root cause:**  
`stripe.accounts.create()` throws `StripeInvalidRequestError: You can only create new accounts if you've signed up for Connect, which you can do at https://dashboard.stripe.com/connect.`

**Confirmed via:**
```js
const stripe = new Stripe('sk_test_51QInIg...')
await stripe.accounts.create({ type: "express", country: "CA", ... })
// StripeInvalidRequestError: You can only create new accounts if you've signed up for Connect
```

**Fix:** Go to [https://dashboard.stripe.com/connect](https://dashboard.stripe.com/connect) and activate Stripe Connect on the test account. No code changes required.

---

### BUG-03 — HIGH (P1)
**No error handling around Stripe API calls in `/api/stripe/connect/onboard`**

**File:** `app/api/stripe/connect/onboard/route.ts` lines 39 and 70

**What happens:**  
`stripe.accounts.create()` (line 39) and `stripe.accountLinks.create()` (line 70) have no try-catch. Any Stripe error propagates as an unhandled exception, causing Next.js to return HTTP 500 with an empty body — impossible to diagnose without server logs.

The Stripe error IS informative: `"You can only create new accounts if you've signed up for Connect"` — but the client never sees it.

**Fix:**
```ts
// line 38 — wrap the entire Stripe section
try {
  if (!stripeAccountId) {
    const account = await stripe.accounts.create({ ... })
    // ... save to DB
    stripeAccountId = account.id
  }
  const accountLink = await stripe.accountLinks.create({ ... })
  return NextResponse.json({ url: accountLink.url })
} catch (err) {
  const stripeErr = err as { message?: string; type?: string }
  console.error("[stripe/onboard] Stripe error:", stripeErr)
  return NextResponse.json(
    { error: stripeErr.message ?? "Stripe error. Please try again." },
    { status: 502 }
  )
}
```

---

### BUG-04 — MEDIUM (P2)
**FlowBar "Paid" step never activates after Stripe payment**

**File:** `app/client/portal/[jobId]/portal-page.tsx` line 206

**What happens:**
```ts
const isPaid = invoices.some((invoice) => invoice.status === "Paid")
```
The FlowBar checks invoices for the "Paid" step. Stripe payments don't create invoices, so this condition is never true after a Stripe payment.

Note: the per-estimate PayButton rendering at line 577 **correctly** uses `payment_status === "paid"` — only the FlowBar progress bar is wrong.

**Fix:**
```tsx
// line 206
const isPaid = invoices.some((invoice) => invoice.status === "Paid")
  || estimates.some((e) => (e as { payment_status?: string | null }).payment_status === "paid")
```

---

### BUG-05 — MEDIUM (P2, Production only)
**`NEXT_PUBLIC_APP_URL` not set → Stripe redirects to localhost**

**File:** `.env.local` (missing env var)

**What happens:**  
Both `onboard/route.ts` line 33 and `create-checkout-session/route.ts` line 99 use:
```ts
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
```
Without the env var in production, Stripe will redirect clients to `http://localhost:3000/client/portal/{jobId}/success` after payment — which works in dev but is broken in production.

**Fix:** Add to production environment:
```
NEXT_PUBLIC_APP_URL=https://your-production-domain.com
```

---

## What Passes

| Area | Status |
|------|--------|
| All 5 endpoint auth guards (401 for unauthenticated) | ✅ |
| Webhook signature validation | ✅ |
| Checkout: missing estimateId → 400 | ✅ |
| Checkout: non-existent estimate → 404 | ✅ |
| Checkout: amount below $0.50 → 422 | ✅ |
| Checkout: unconnected contractor → 422 with clear error | ✅ |
| Double-pay guard: `payment_status='paid'` → 409 | ✅ |
| Webhook idempotency: duplicate event rejected at DB level | ✅ |
| Fee calculation: 15% math correct | ✅ |
| DB schema: all new columns and tables present | ✅ |
| Status endpoint: all 5 fields in response | ✅ |
| payments table: all 16 columns accessible | ✅ |
| stripe_webhook_events: accessible, 0 rows | ✅ |

---

## Failure Chain (Post-Migration)

```
1. Contractor clicks "Connect Stripe"
   → POST /api/stripe/connect/onboard
   → stripe.accounts.create() throws StripeInvalidRequestError  [BUG-02]
   → No try-catch → unhandled exception → 500 empty body         [BUG-03]
   → Contractor sees a spinning spinner then nothing
   → Stripe onboarding BLOCKED

2. (After Stripe Connect is activated — BUG-02 fixed)
   Contractor successfully onboards
   → stripe_account_id saved, charges_enabled = true

3. Estimate set to Accepted with payment amounts
   Client clicks Pay
   → POST /api/payments/create-checkout-session
   → Estimate read via user session ✅
   → Contractor profile read via service_role ✅
   → Stripe Checkout Session created ✅
   → service_role UPDATE estimates SET payment_status='checkout_created' → 403 SILENTLY SWALLOWED [BUG-01]
   → service_role UPSERT payments → OK ✅
   → Returns Stripe URL ✅

4. Client pays on Stripe
   → Stripe fires checkout.session.completed webhook
   → Webhook validates signature ✅
   → Idempotency INSERT to stripe_webhook_events ✅
   → handleCheckoutSuccess:
     → service_role UPDATE estimates SET payment_status='paid' → 403 SILENTLY SWALLOWED [BUG-01]
     → service_role UPDATE payments SET status='paid' → OK ✅
     → sendPaymentEmails:
       → service_role SELECT estimates → 403 THROWS
       → webhook catch block → returns { received: true, error: "Handler failed" }
       → Stripe sees 200, stops retrying
       → No payment emails sent

5. Client redirected to /client/portal/{jobId}/success
   → Reads estimates.payment_status → still 'unpaid' [BUG-01 downstream]
   → Shows "No payment found for this project yet." ❌

6. FlowBar on portal page
   → isPaid checks invoices only → no invoices for Stripe → FlowBar "Paid" never lights up [BUG-04]

7. Double-pay protection
   → estimates.payment_status is still 'unpaid' [BUG-01 downstream]
   → Client can create a second checkout session for the same estimate ❌
   → Contractor charged twice
```

---

## Fix Priority

| Priority | Bug | Action | Effort |
|----------|-----|--------|--------|
| **P0 — Do now** | BUG-01: GRANT on estimates | Run 2-line SQL in Supabase dashboard | 2 min |
| **P0 — Do now** | BUG-02: Stripe Connect not enabled | Click "Activate" in Stripe dashboard | 5 min |
| **P1 — Today** | BUG-03: No error handling in onboard | Add try-catch around Stripe calls | 15 min |
| **P2 — Before launch** | BUG-04: FlowBar isPaid | One-line fix in portal-page.tsx | 5 min |
| **P2 — Before deploy** | BUG-05: NEXT_PUBLIC_APP_URL | Set env var in hosting dashboard | 2 min |

---

## Immediate Actions Required

**1. Run this SQL in the Supabase dashboard → SQL Editor:**
```sql
GRANT SELECT, UPDATE ON public.estimates TO service_role;
NOTIFY pgrst, 'reload schema';
```

**2. Activate Stripe Connect:**  
https://dashboard.stripe.com/connect → Activate

---

## Key File Locations

| File | Bug |
|------|-----|
| `supabase/migrations/20260601000002_stripe_connect.sql` | BUG-01 root (missing GRANT — now patched in file) |
| `revenue-recovery/supabase/migrations/20260601000004_stripe_estimates_service_role_grant.sql` | BUG-01 fix migration |
| `revenue-recovery/app/api/stripe/connect/onboard/route.ts` lines 39, 70 | BUG-03 — no try-catch |
| `revenue-recovery/app/client/portal/[jobId]/portal-page.tsx` line 206 | BUG-04 — FlowBar isPaid |
| `revenue-recovery/.env.local` | BUG-05 — NEXT_PUBLIC_APP_URL missing |

---

## Test Suite

Run after applying BUG-01 and BUG-02 fixes:
```bash
cd revenue-recovery
E2E_CONTRACTOR_EMAIL="danielkolpakov00@gmail.com" \
E2E_CONTRACTOR_PASSWORD="REMOVED_E2E_CONTRACTOR_PASSWORD" \
PLAYWRIGHT_BASE_URL="http://localhost:3000" \
npx playwright test e2e/stripe-payment-flow.spec.ts
```
