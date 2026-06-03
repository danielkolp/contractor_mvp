# Payment Cleanup, Deposit-Only Stripe, GST & Contractor Ratings

## Files Changed

| File | Change |
|------|--------|
| `lib/pricing.ts` | **NEW** – single source of truth for all money calculations |
| `supabase/migrations/20260602000005_deposit_and_ratings.sql` | **NEW** – deposit fields on estimates + contractor_reviews table |
| `lib/supabase/database.types.ts` | Added 5 deposit fields to estimates; added `contractor_reviews` table types |
| `app/dashboard/estimates/page.tsx` | Uses pricing helper; added deposit field & 6-cell fee breakdown (payout / fee / GST / total / deposit / balance) |
| `app/dashboard/job-requests/page.tsx` | Same pricing helper; added deposit field to create-estimate dialog |
| `app/api/payments/create-checkout-session/route.ts` | Charges `deposit_amount_cents` (not full total); proportional `application_fee_amount`; deposit/full metadata |
| `app/api/payments/create-guest-checkout-session/route.ts` | Same deposit-only logic for guest checkout |
| `app/api/stripe/webhook/route.ts` | `checkout.session.completed` → `deposit_paid` or `paid` based on `is_full_payment` metadata |
| `app/print/estimate/[id]/page.tsx` | Removed 30/40/30 midpoint schedule; new price-breakdown section (subtotal / fee / GST / total / deposit / balance); `deposit_paid` status badge |
| `components/client/portal-sections.tsx` | `PayButton` shows deposit due; estimate card shows total + deposit + remaining; `RatingCard` component; `FlowBar` counts `deposit_paid` as paid step |
| `app/api/reviews/route.ts` | **NEW** – POST submit rating (auth + eligibility check + dupe guard); GET average for contractor |
| `app/client/portal/[jobId]/portal-page.tsx` | Imports `RatingCard`; shows after `paid` or `deposit_paid` estimate |
| `app/guest/project/[token]/guest-portal-page.tsx` | Imports `RatingCard` (not rendered for guests — no auth) |
| `e2e/stripe-payment-flow.spec.ts` | Test 2: accepts `deposit_paid`; test 9: expects GST in total; all direct DB inserts now include `deposit_amount_cents` |

---

## Migration Summary

```sql
-- estimates table additions
ALTER TABLE estimates
  ADD COLUMN gst_cents              integer DEFAULT 0,
  ADD COLUMN deposit_amount_cents   integer,
  ADD COLUMN deposit_percentage     numeric(5,2),
  ADD COLUMN deposit_paid_at        timestamptz,
  ADD COLUMN deposit_payment_intent_id text;

-- new contractor_reviews table
CREATE TABLE contractor_reviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id    uuid NOT NULL REFERENCES profiles(user_id),
  client_id        uuid NOT NULL,
  job_request_id   uuid NOT NULL REFERENCES job_requests(id),
  estimate_id      uuid REFERENCES estimates(id),
  rating           integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment          text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, job_request_id)
);
-- RLS: anyone can read; clients can insert as themselves
```

---

## Money Math Summary

| | Calculation | Example ($1,000 payout) |
|---|---|---|
| Contractor subtotal | user input | $1,000.00 |
| Platform fee 15% | `round(subtotal × 0.15)` | $150.00 |
| Taxable subtotal | `subtotal + fee` | $1,150.00 |
| GST 5% | `round(taxable × 0.05)` | $57.50 |
| **Client total** | `taxable + gst` | **$1,207.50** |
| Deposit | user input or default 30% | $300.00 |
| Remaining balance | `total − deposit` | $907.50 |
| Stripe charge | deposit only | $300.00 |
| Stripe app fee | `round(deposit × fee / total)` | ~$37.22 |

All math lives in `lib/pricing.ts` → `computePricing()` and helpers. Every UI and API imports from there.

---

## Payment Status Flow

```
unpaid
  → checkout_created   (Stripe session opened)
    → deposit_paid     (deposit webhook received, is_full_payment=false)
    → paid             (full-payment webhook or deposit=total)
    → failed           (card declined)
  → refunded
```

The old `paid` status still works. `deposit_paid` is new and compatible with all existing paid-status checks (they were already using text comparisons).

---

## Test Results

- `npm run build` — **✓ clean** (0 errors)
- `npm run lint`  — **✓ clean** (2 pre-existing warnings, 0 errors)
- Playwright E2E — tests updated; direct-DB inserts now include `deposit_amount_cents: 57500` so the checkout charges the full amount (preserving existing test behavior); test 9 verifies GST-inclusive `client_total_cents`

---

## Rating System

**Submit:** `POST /api/reviews` with `{ estimateId, jobRequestId, contractorId, rating (1-5), comment? }`
- Requires auth (`auth.uid()`)
- Requires `payment_status IN ('paid', 'deposit_paid')` on an estimate linked to that `job_request_id`
- Unique on `(client_id, job_request_id)` — duplicate returns 409

**Read average:** `GET /api/reviews?contractorId=<id>` → `{ count, average }`

**Client portal:** `RatingCard` renders after `paid` or `deposit_paid` status. Guest portal does not render it (unauthenticated — no spam).

---

## Remaining Blockers

None for this implementation scope.

**Future work (not in scope):**
- "Pay remaining balance" second Stripe checkout for the balance after deposit
- Contractor dashboard average-rating summary widget (data is stored; endpoint exists)
- Invoice print page: update to show same fee breakdown as estimate PDF (invoices currently don't have `contractor_amount_cents` fields)
