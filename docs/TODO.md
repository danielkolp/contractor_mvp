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

## 🔒 Decisions to lock (do these on paper before/while building P0)
- [ ] **Fee mechanics:** make the platform % an **application fee on top of
      contractor-paid Stripe (~2.9% + 30¢)** — otherwise the 1–2% tiers run
      negative and lose money on every transaction.
- [ ] **Who bears the fee:** contractor-paid (recommended — honest pricing, no
      "total higher than I quoted" friction), optionally passable to the customer on Pro.
- [ ] **Per-transaction cap on the Free 5%** so big jobs don't flee off-platform.
- [ ] **Lock the final tier feature matrix** (the table in P0) before gating code.

---

## 🥇 P0 — Subscriptions & tier gating  *(the business itself — nothing earns without it)*

The app today only has Stripe Connect for contractors getting **paid by
customers**. There is **no subscription billing** for the contractor to pay
$49/$199. This is the revenue model — build it.

**Billing**
- [ ] Add **Stripe Billing** (subscription Checkout + customer portal) for the
      contractor's own plan — separate from the Connect/payments flow
- [ ] `profiles.plan` (`free` | `pro` | `team`) + `stripe_subscription_id`,
      `plan_status`, `current_period_end` (new migration)
- [ ] Webhook handling for subscription created/updated/canceled → update `profiles.plan`
- [ ] **Annual billing** option with 10–20% discount (separate Stripe prices)
- [ ] Billing section in Settings: current plan, upgrade/downgrade, manage via Stripe portal

**Plans & gating**
- [ ] Central `planFeatures(plan)` helper + a `requirePlan()` guard (server + UI)
- [ ] Set transaction fee % by plan when creating Connect charges: Free 5% · Pro 2% · Team 1%

| Capability | Free | Pro ($49) | Team ($199) |
|---|---|---|---|
| Requests / clients / basic estimates | ✅ | ✅ | ✅ |
| Client portal + online payment (so Free can earn a fee) | ✅ | ✅ | ✅ |
| Basic recovery follow-ups (the hook) | ✅ | ✅ | ✅ |
| Automated follow-up cadences + reply tracking | — | ✅ | ✅ |
| CRM / reliability badges, branded estimates, deposits | — | ✅ | ✅ |
| Multi-user, advanced reporting, team mgmt | — | — | ✅ |
| Card transaction fee | 5% (capped) | 2% | 1% |

- [ ] **Multi-user / team accounts** (Team tier) — invite teammates to one workspace
- [ ] **Advanced reporting** (Team) — at minimum the "dollars recovered" report (see north-star)
- [ ] Done when: a contractor can subscribe to Pro, get Pro features unlocked, see
      the 2% fee applied, and manage/cancel billing themselves.

> Note: building can proceed locally, but **testing real subscription charges
> needs an environment where Stripe's hosts are reachable** (blocked in the sandbox).

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
      and powers Team-tier reporting.
