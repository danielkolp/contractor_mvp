# Euroflo — Build To-Do (master)

The single source of truth for what to build. Compiled from the business plan,
the caveman doc, and the full product run-through. Ordered by priority.

**Governance rule for everything below:** *"Does this help the contractor get
paid? If no, throw rock at it."*

Companion docs: `BUSINESS_PLAN.md` (detail) · `EUROFLO_CAVEMAN.md` (north star).

---

## ✅ Already shipped
- [x] Fix signup password copy (enforce 8 chars) — `components/auth/signup-form.tsx`
- [x] Remove orphaned duplicate **Customers** page
- [x] Remove dead **Templates** "coming soon" page
- [x] Retire the orphaned **Reminders** route
- [x] Add the missing **Stripe estimate columns migration** (was breaking fresh setups) — `supabase/migrations/20260602000006_*`
- [x] Add a real **Job title** field to the public request form (was titling every job "Plumbing")

---

## 🔒 Decisions — LOCKED (2026-06-11)
- [x] **Two tiers only for the MVP: Free and Pro.** Team is parked — the `team`
      enum stays in the DB for forward compatibility but is not sold, not shown,
      and has no Stripe price wiring.
- [x] **Fee mechanics:** platform % is an application fee charged to the client
      on top (plus grossed-up Stripe processing), so the contractor always
      receives their quoted amount (`lib/pricing.ts`).
- [x] **Per-transaction caps:** Free 5% capped at **$50** · Pro 2% capped at
      **$25** (`lib/plans.ts` is the single source of truth).
- [x] **Pro pitch:** "Lower fees, better follow-ups, branded estimates, and
      deposit control."

---

## 🥇 P0 — Subscriptions & tier gating  *(SHIPPED 2026-06-11, except live Stripe verification)*

**Billing — built**
- [x] **Stripe Billing** (subscription Checkout + customer portal) for the
      contractor's own plan — `app/api/billing/checkout` + `app/api/billing/portal`
- [x] `profiles.plan` + `stripe_subscription_id`, `plan_status`,
      `current_period_end` (`20260604100000_subscription_billing.sql`)
- [x] Webhook for subscription created/updated/canceled → updates `profiles.plan`,
      `plan_status`, `stripe_subscription_id`, `stripe_customer_id`,
      `current_period_end`; canceled/unpaid downgrades to Free; `past_due`
      keeps Pro during Stripe dunning (explicit in `isPlanActive`)
- [x] Billing card in Settings: current plan, Free vs Pro comparison with fee
      caps, Upgrade to Pro, Manage billing (Stripe portal)
- [x] Single required env var: `STRIPE_PRICE_PRO_MONTH`. Missing → clear error
      (dev names the var; prod says "Pro checkout is temporarily unavailable")
- [~] **Annual billing** — parked. `STRIPE_PRICE_PRO_YEAR` is read if set (so an
      existing annual sub maps back to Pro) but nothing depends on it.

**Plans & gating — built**
- [x] Central `planFeatures(plan)` / `hasPlanFeature` / `requireFeature` in `lib/plans.ts`
- [x] Per-plan fee with caps applied everywhere estimates are priced
      (`planFeeOptions(plan)` → `computePricing`)

| Capability | Free | Pro ($49/mo) |
|---|---|---|
| Public request link, job requests, clients | ✅ | ✅ |
| Estimates, invoices, client portal + online card payment | ✅ | ✅ |
| Manual recovery follow-ups (the hook) | ✅ | ✅ |
| Record offline payments (e-transfer/cash/cheque) — no fee | ✅ | ✅ |
| Branded footer on estimates & invoices | — | ✅ |
| Custom deposit amount (Free uses the 30% default) | — | ✅ |
| Follow-up tone presets (friendly/professional/firm) | — | ✅ |
| Card transaction fee | 5%, capped $50 | 2%, capped $25 |

**Still open for Pro**
- [ ] Branding logo upload (column/migration pattern is in place; needs storage upload UI)
- [ ] Branded footer on the client portal pages (currently on printable estimates + invoices)
- [ ] Tone presets on estimate follow-ups & Today-page recovery items
      (currently applied to invoice follow-up drafts)
- [ ] Saved custom follow-up templates (beyond tone presets) — only if contractors ask

> Note: **testing real subscription charges needs an environment where Stripe's
> hosts are reachable** (blocked in the sandbox). The flow is built; run one
> live Free → Pro → cancel → Free pass before launch.

---

## 🥈 P1 — "What are you owed?" cold-start  *(the conversion engine)*

Replace the empty-account experience with the app bonking the contractor on the
head with their own stuck money in the first five minutes. **No new tables, no new
API routes, no migration.**

**Files**
- [ ] NEW `components/dashboard/cold-start.tsx`
- [ ] EDIT `components/dashboard/today-page.tsx` — in the `!hasAnyItems` branch,
      render `<ColdStart userId onSeeded={load} onDemo={handleUseDemoData} onSkip>`
      instead of `<OnboardingState>`

**Screen — copy**
- [ ] Title: **"What are you owed right now?"**
- [ ] Sub: "Add the quotes that went quiet and the invoices nobody paid. We'll
      total it up and start chasing — you approve every message."
- [ ] Live **"$X at risk"** chip = `money(sum(row.amount))`, updates as they type
- [ ] Rows (start with 3, "+ Add another", max ~8), each 3 inputs + remove (✕)
- [ ] Primary **"Start chasing →"** (disabled until ≥1 valid row)
- [ ] Secondary: **"Skip for now"** · **"Use demo data instead"** (existing `handleUseDemoData`)

**3 inputs per row → real `recovery_items` columns**
- [ ] *Who owes you?* → text → `client_name`
- [ ] *What happened?* → `<select>` (real `reason` enum values):
  - `invoice_overdue` → **"Invoice unpaid"** (default)
  - `estimate_no_reply` → **"Quote went quiet"**
  - `work_not_paid` → **"Work done, not paid"**
  - `maybe_later` → **"Said 'maybe later'"**
- [ ] *How much?* → number, `$` prefix → `amount`

**On "Start chasing" — the only write** (`recovery_items.insert([...])`):
```ts
{
  user_id, client_name, reason, amount,
  contacted_date: todayIso(),
  status: "needs_follow_up",
  follow_up_count: 0,
  message_body: generateRecoveryItemMessage({ clientName: client_name, reason, amount, followUpCount: 0 }),
}
```
- [ ] Then `load()` → dashboard shows the at-risk total + rows in "Needs your
      attention," each with a drafted message ready to Send/Copy

**Reuse:** `generateRecoveryItemMessage` (`@/lib/recovery-engine`), `money`
(`@/lib/format-money`), `textField`/`numberField` (`@/lib/security/input`),
`createClient` (`@/lib/supabase/client`).

**Done when**
- [ ] Zero-data contractor sees the cold-start, not the 9-step wizard
- [ ] Typing amounts updates the live "$X at risk" total
- [ ] "Start chasing" creates N recovery items (status `needs_follow_up`,
      `message_body` populated) in Today's "Needs your attention"
- [ ] "Skip" and "Use demo data" still work; inserts validated; RLS `user_id = auth.uid()`

---

## 🥉 P2 — Free "Mark paid → e-transfer / cash"  *(payment-strategy foundation)*

Workflow is the lock-in, not the payment rail. *"Use e-transfer, cash, cheque,
card. Me no care. Just mark job paid."*
- [ ] "Mark paid" action on invoices/estimates with method picker: `e-transfer · cash · cheque · card`
- [ ] e-transfer/cash/cheque → status **Paid** + `paid_at`, **no fee**, record method, stop the chase
- [ ] card → existing Stripe flow (fee applies)
- [ ] Paid job leaves the recovery/follow-up queue
- [ ] Done when: close out an e-transfer-paid job in ≤2 clicks, free, gone from "Needs your attention"

---

## 4️⃣ P3 — Make in-app card the *obvious* choice at the 2 winning moments  *(not forced)*
- [ ] **Accept & pay deposit:** at acceptance, primary CTA = "Accept estimate → pay 30% deposit" (card); e-transfer secondary
- [ ] **Pay now in the follow-up:** prominent **Pay now** button inside the recovery follow-up the app already sends
- [ ] Reframe fee copy: "the job closes itself" / "get paid upfront," not a tax

---

## 5️⃣ P4 — Close the trust gaps  *(so a real contractor fully adopts)*
- [ ] **Follow-up email works out-of-box** — currently silently falls back to copy/manual without Resend
- [ ] **Customer can't lose the thread** — success screen leans on an emailed link;
      if email fails, the customer has only one browser tab. Add a durable fallback
      (always show the portal link / let them re-request the link).
- [ ] **Self-serve change of email/password** in-app (currently "contact support")
- [ ] **"Are you sure?"** confirmation before the customer hits the card screen
- [ ] **Rating fires after the work is done**, not after a deposit
- [ ] Surface the customer's **contact preference** (Call/Text/Email) on the compact job card, not just the detail view
- [ ] **Invoices "Follow up" button** — make it one always-visible button instead of greying out / hiding it in the "…" menu

---

## 📣 Marketing / copy
- [ ] **Homepage rewrite** around the recovery hook + *"Money hides in messy cave.
      Euroflo makes clean cave."* and the "$ at risk" number
- [ ] Selling line: *"Send quotes. Collect deposits. Chase unpaid jobs. Stop forgetting money."*
- [ ] Add the "what it is NOT" line: *"Euroflo doesn't run your whole business. It just makes sure you get paid."*
- [ ] **"Drafts the message" honesty** — it's a template, not AI; keep the claim accurate

---

## 🪨 Governance — throw the rock (decide, don't drift)
- [ ] **Audit the new multi-day scheduling feature** against "does it help get paid?"
      Keep only stall-stage parts (e.g. "work booked, no deposit → bonk"); if it's
      becoming a calendar app, **park it.**
- [ ] **Trim the 9-step onboarding wizard** — the cold-start (P1) replaces it
- [ ] **Kill the dead "tone" setting** until it does something
- [ ] Keep **parked / do not build:** reviews, ratings, marketplace, bidding, full
      scheduling empire, giant CRM

---

## 🧹 Polish / docs
- [ ] **Align the Follow-ups page with Today** — `/dashboard/recoveries` shows only
      recovery items; Today shows recovery + estimates + invoices. Make them one
      consistent "everything to chase" list.
- [ ] **Fix the stale README** — it says photo uploads aren't implemented, but they are.

---

## 🔭 Unproven — verify
- [ ] **Run one real Stripe payout end-to-end** (deposit → contractor's account) —
      the only part of the journey not yet proven. Needs Stripe hosts reachable.
- [ ] **Test a real subscription charge** (P0) — same environment requirement.

---

## ⭐ North-star metric
- [ ] Make **"dollars recovered for you"** visible in-app (e.g. "Euroflo has
      recovered $14,200 for you this year") — the number that justifies the price
      and will power reporting on a future Team tier (parked).
