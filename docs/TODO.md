# Euroflo — Build To-Do

Compiled from the business plan, the caveman doc, and the run-through. Ordered by
priority. **Governance rule for everything below: "Does this help the contractor
get paid? If no, throw rock at it."**

Companion docs: `BUSINESS_PLAN.md` (detail), `EUROFLO_CAVEMAN.md` (north star).

---

## ✅ Already shipped (for context)
- [x] Fix signup password copy (enforce 8 chars) — `components/auth/signup-form.tsx`
- [x] Remove orphaned duplicate **Customers** page
- [x] Remove dead **Templates** "coming soon" page
- [x] Retire the orphaned **Reminders** route
- [x] Add the missing **Stripe estimate columns migration** (was breaking fresh setups) — `supabase/migrations/20260602000006_*`
- [x] Add a real **Job title** field to the public request form (was titling every job "Plumbing")

---

## 🥇 P1 — "What are you owed?" cold-start  *(the conversion engine — build first)*

Replace the empty-account experience with the app bonking the contractor on the
head with their own stuck money in the first five minutes. **No new tables, no
new API routes, no migration.**

**Files**
- [ ] NEW `components/dashboard/cold-start.tsx`
- [ ] EDIT `components/dashboard/today-page.tsx` — in the `!hasAnyItems` branch,
      render `<ColdStart userId onSeeded={load} onDemo={handleUseDemoData} onSkip>`
      instead of `<OnboardingState>`

**The screen — copy**
- [ ] Title: **"What are you owed right now?"**
- [ ] Sub: "Add the quotes that went quiet and the invoices nobody paid. We'll
      total it up and start chasing — you approve every message."
- [ ] Live **"$X at risk"** total chip = `money(sum(row.amount))`, updates as they type
- [ ] Rows (start with 3, "+ Add another", max ~8), each with 3 inputs + remove (✕)
- [ ] Primary button **"Start chasing →"** (disabled until ≥1 valid row)
- [ ] Secondary: **"Skip for now"** and **"Use demo data instead"** (wire to existing `handleUseDemoData`)

**The 3 inputs per row → real `recovery_items` columns**
- [ ] *Who owes you?* → text → `client_name`
- [ ] *What happened?* → `<select>` (values are the real `reason` enum):
  - `invoice_overdue` → label **"Invoice unpaid"** (default)
  - `estimate_no_reply` → label **"Quote went quiet"**
  - `work_not_paid` → label **"Work done, not paid"**
  - `maybe_later` → label **"Said 'maybe later'"**
- [ ] *How much?* → number, `$` prefix → `amount`

**On "Start chasing" — the only write.** For each row with non-empty
`client_name` AND `amount > 0`, one `supabase.from("recovery_items").insert([...])`:
```ts
{
  user_id,
  client_name,
  reason,
  amount,
  contacted_date: todayIso(),
  status: "needs_follow_up",
  follow_up_count: 0,
  message_body: generateRecoveryItemMessage({ clientName: client_name, reason, amount, followUpCount: 0 }),
}
```
- [ ] Then call `load()` → `hasAnyItems` flips → dashboard shows the at-risk number
      + these rows in "Needs your attention," each with a drafted message ready to Send/Copy

**Reuse (don't rewrite)**
- [ ] `generateRecoveryItemMessage` — `@/lib/recovery-engine`
- [ ] `money` — `@/lib/format-money`
- [ ] `textField` / `numberField` / `optionalTextField` — `@/lib/security/input`
- [ ] `createClient` — `@/lib/supabase/client`

**Done when**
- [ ] Zero-data contractor sees the cold-start, not the 9-step wizard
- [ ] Typing amounts updates the "$X at risk" total live
- [ ] "Start chasing" creates N recovery items (status `needs_follow_up`,
      `message_body` populated) that land in Today's "Needs your attention"
- [ ] "Skip for now" and "Use demo data instead" still work
- [ ] All inserts validated; RLS `user_id = auth.uid()`

---

## 🥈 P2 — Free "Mark paid → e-transfer / cash"  *(payment-strategy foundation)*

Let them record any payment for free, so the **workflow** is the lock-in, not the
payment rail. Caveman: *"Use e-transfer, cash, cheque, card. Me no care. Just mark
job paid."*

- [ ] Add a **"Mark paid"** action on invoices/estimates with a method picker:
      `e-transfer · cash · cheque · card`
- [ ] e-transfer / cash / cheque → set status **Paid** + `paid_at`, **no fee**,
      record the method; stops the chase
- [ ] card → routes to existing Stripe flow (fee applies)
- [ ] Recording a payment removes the job from the recovery/follow-up queue
- [ ] Done when: a contractor can close out a job paid by e-transfer in ≤2 clicks,
      free, and it disappears from "Needs your attention"

---

## 🥉 P3 — Make in-app card the *obvious* choice at the 2 winning moments  *(not forced)*

- [ ] **Accept & pay deposit:** at estimate acceptance, primary CTA =
      "Accept estimate → pay 30% deposit" (card), e-transfer as the secondary path
- [ ] **Pay now in the follow-up:** put a prominent **Pay now** button inside the
      recovery follow-up the app already sends (contractor is passive)
- [ ] Reframe fee copy: "the job closes itself" / "get paid upfront," not a tax
- [ ] Consider a per-transaction **cap on the Free 5%** so big jobs don't flee off-platform

---

## 🛠️ P4 — Close the trust gaps  *(so a real contractor fully adopts)*

- [ ] **Follow-up email works out-of-box** — it currently falls back to copy/manual
      if Resend isn't set up; the headline feature must actually send
- [ ] **Self-serve change of email/password** in-app (currently "contact support")
- [ ] **"Are you sure?" confirmation** before the customer is sent to the card screen
- [ ] **Rating fires after the work is done**, not after a deposit
- [ ] Surface the customer's **contact preference** (Call/Text/Email) on the
      compact job card, not just the detail view

---

## 🪨 Governance — throw the rock (decide, don't drift)
- [ ] **Audit the new multi-day scheduling feature** against "does it help get paid?"
      Keep only the parts that are a *stall stage* (e.g. "work booked, no deposit →
      bonk"). If it's becoming a calendar app, **park it.**
- [ ] Keep **parked / do not build:** reviews, ratings, marketplace, bidding, full
      scheduling empire, giant CRM
- [ ] Trim the **9-step onboarding wizard** — the cold-start (P1) replaces it
- [ ] Kill the dead **"tone" setting** until it does something

---

## 🔭 Unproven — verify
- [ ] **Run one real Stripe payout end-to-end** (deposit → contractor's account).
      The only part of the journey not yet proven. Needs an environment where
      Stripe's hosts are reachable.

---

## North-star metric to wire in eventually
- [ ] Make **"dollars recovered for you"** visible in-app (e.g. "Euroflo has
      recovered $14,200 for you this year") — the number that justifies the price.
