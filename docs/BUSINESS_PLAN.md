# Euroflo — Business Plan

> **One sentence:** Euroflo gets trades paid — it chases every quote and invoice
> that stalls, so you don't have to.

---

## 1. Executive summary

Euroflo is a SaaS app that **gets trades contractors paid** by chasing every
quote and invoice that stalls, automatically. It began as a narrow "revenue
recovery" tool and grew a full quote-to-cash loop (intake → estimate → accept →
pay → follow-up).

The strategy is to **re-focus that breadth behind one promise** — *you get paid,
we chase the stalls* — using **recovery as the hook** and the
**stall-detection / follow-up engine as the moat**. The business is a
**subscription** ($49 Pro / $199 Team), with a small card-transaction fee as
upside, not the foundation.

---

## 2. The problem

Tradespeople are excellent at the trade and allergic to the office work that gets
them paid. Money leaks invisibly at **every handoff**:

- Quote sent → customer goes quiet → the one follow-up that would've won it never
  gets sent.
- Job accepted → **no deposit collected** → contractor floats the materials cost.
- Work done → invoice sent → nobody chases → 60 days late, or never.

The contractor never sees the aggregate. They just feel "busy but broke." It's a
**painkiller** problem, denominated in dollars — the only unit a contractor
respects.

---

## 3. The solution & value proposition

A single place where every job lives, that **watches each stage and nudges when
it stalls** — and makes the money easy to collect at the moments that matter.

The core deliverable isn't "job management"; it's **recovered revenue that would
otherwise have slipped through the cracks.**

---

## 4. Target customer

Solo and small (1–3 person) trades businesses — plumbers, electricians, HVAC,
handymen (the "Michael" persona). Today they run on a notebook, texts, and
QuickBooks. They lose real money to not following up, and find existing software
(Jobber / ServiceTitan) bloated and overkill.

---

## 5. Positioning & differentiation — what it is NOT

To be *great at one thing*, publicly refuse to be everything:

- ❌ Not scheduling / dispatch (Jobber, ServiceTitan)
- ❌ Not accounting (they keep QuickBooks — confirmed)
- ❌ Not a CRM, marketing suite, or review platform

> **Homepage line:** "Euroflo doesn't run your whole business. It just makes sure
> you get paid." Constraints sell.

Competitive wedge vs. the incumbents (big, broad, $200+/mo): **a get-paid focus,
a free/cheap entry point, and a no-account client experience** (homeowners accept
and pay without signing up).

---

## 6. The strategy: Hook vs Moat

| | Role | What it is |
|---|---|---|
| **Hook** | Get them in | **Recovery.** "What are you owed *right now?*" → onboarding surfaces a **"$ at risk"** number and drafts the follow-ups. Quantifiable, urgent, demo-able in 60 seconds. |
| **Moat** | Why it works & why they stay | **The stall engine.** Every job is a pipeline (lead → quote → accepted → deposit → done → paid); the app watches each stage and auto-nudges when it stalls. Owning the whole path is what makes recovery *automatic* instead of manual. |

**The test for every feature:** does it create a pipeline stage the engine can
watch and chase? If yes, core. If it's just "a thing contractors do," park it.

---

## 7. Product / feature architecture

Verdict key: 🟢 Core (reason to pay) · 🔵 Pipeline (creates a chaseable stage) ·
🟡 Supporting · 🔴 Cut / Park

| Feature | Verdict | Why it earns its place |
|---|---|---|
| Recovery queue + drafted follow-ups + check-backs | 🟢 | The product. Recovers money on autopilot. |
| "$ at risk" total | 🟢 | The hook, made visible every login. |
| Auto follow-up email + reply tracking | 🟢 | Must work out-of-box, or it's a vitamin not a painkiller. |
| Online payment / deposits (Stripe Connect) | 🟢 | Closes the loop; the seasoning revenue. |
| Public intake form + shareable link | 🔵 | "Leads that don't die" — starts the pipeline. |
| Estimates (line items, tax, PDF) | 🔵 | The "quote sent" stage. Keep lean; don't out-feature Jobber. |
| Client / guest portal + accept/decline | 🔵 | The "accepted?" signal; no-account flow is a real edge. |
| Invoices + overdue tracking | 🔵 | Classic recovery surface. |
| Today action queue | 🟢 | The daily money-first habit loop. |
| Inspections / scheduling | 🟡→🔴 | Justify only as a stall stage; else it's Jobber drift — park. |
| Ratings / reviews | 🔴 | Doesn't recover money. Park. |
| Clients + reliability badges | 🟡 | Keep the badges (recovery intel); drop CRM ambitions. |
| 9-step onboarding, tone setting, templates | 🔴 | Friction / dead weight. Trim to the aha moment. |

---

## 8. Business model — subscriptions are the meat, fees are the seasoning

**Subscriptions are the business; the card fee is upside on the subset that pays
by card.**

| | **Free** | **Pro — $49/mo** | **Team — $199/mo** |
|---|---|---|---|
| Requests / clients / basic estimates | ✅ | ✅ | ✅ |
| **Client portal + online payment** | ✅ *(so Free can earn a fee)* | ✅ | ✅ |
| **Basic recovery follow-ups (the hook)** | ✅ | ✅ | ✅ |
| Automated follow-up cadences + reply tracking | — | ✅ | ✅ |
| CRM / reliability badges, branded estimates, deposits | — | ✅ | ✅ |
| Multi-user, advanced reporting, team mgmt | — | — | ✅ |
| **Card transaction fee** | 5% *(consider per-txn cap)* | 2% | 1% |

- **Annual billing: 10–20% discount.**
- **Recording e-transfer / cash is always free** (retention move — see §9).
- Gating rule: **Free gives the whole loop once** (feel the magic *and* let it
  earn a fee); **Pro sells the automation that removes the work.**

Two decisions baked in:

1. **The % is an application fee *on top of contractor-paid Stripe* (~2.9% + 30¢)**
   — otherwise the 1–2% tiers run negative after Stripe and bankrupt you.
2. **Contractor-paid** (honest pricing, no "total higher than I quoted"
   friction), optionally passable to the customer on Pro.

---

## 9. Payment strategy — the e-transfer problem (the crux)

**You cannot beat e-transfer** (free, instant, universal in Canada). Don't try.
Separate the two goals:

- **Retention (keep them in the workflow):** be generous — **let them record
  e-transfer / cash for free.** Lock-in comes from "every job lives here," not
  from the payment rail. Forcing card use drives them off the workflow entirely.
- **Fee revenue (route money by card):** win only the two moments card genuinely
  beats e-transfer:
  1. **The deposit at acceptance** — "Accept estimate → pay 30% deposit" in one
     tap. Asking for a deposit by e-transfer is awkward and manual; this is your
     stickiest payment.
  2. **Customer-initiated "Pay now"** inside the follow-up the app already sends —
     the contractor is passive (can't slip in "just e-transfer me"), and the card
     link is the lower-friction option in the moment.

**Reframe the fee:** not a tax on getting paid, but the price of *the job closing
itself* (auto-marked paid, chase ends, deposit upfront, receipt + records). Charge
it **only on card**. Keep it **low and quiet** (watch the 5% on Free — cap it).
Never hold features hostage to force card use — in trades, a "nickel-and-diming"
reputation kills word-of-mouth.

---

## 10. Unit economics & pricing logic

- **Fee-as-upgrade-lever:** Pro's $49 is covered once a contractor processes
  **~$1,633/mo** by card (`$49 ÷ (5% − 2%)`) — often a single job. Anyone actually
  transacting upgrades out of self-interest.
- **Don't model on full GMV capture.** Assume you capture **deposits + a fraction
  of balances**, because e-transfer guarantees leakage. If the model only works at
  100% capture, it's too fragile.
- **The profit engine is MRR**, not basis points.

---

## 11. Go-to-market & growth loop

1. **Free signup → "what are you owed?" cold start** (replaces the 9-step wizard)
   → instant **"$X at risk"** number = the aha in 5 minutes.
2. One click sends a follow-up → a week later a customer pays → **the moment they
   tell another contractor.**
3. Word-of-mouth in a tight, referral-driven trade community.
4. **Upgrade to Pro** driven by (a) the fee differential and (b) automation
   gating.

---

## 12. Metrics / north star

- **North star:** *dollars recovered per contractor per month* — make it visible
  ("Euroflo has recovered $14,200 for you this year").
- **Business metrics:** MRR, free → Pro conversion, net revenue retention.
  **Not** GMV, not MAU.

---

## 13. Validation so far

- The core loop **works end-to-end** — verified by running a real client through
  request → estimate → accept on the live app.
- The persona test ("Michael," a plumber): **would adopt the front half
  immediately and pay $49**, running it in parallel first, going all-in once he's
  (a) watched one real Stripe payout land and (b) can change his own login. The
  painful part of his week is exactly what the app does well.

---

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Payment leaks to e-transfer** → fee revenue evaporates | Subscriptions are the business; fee is upside. Win deposits + customer pay-now; record e-transfer free. |
| **Trades resist software / adoption** | Sub-5-minute aha (money number), no-account client flow, free entry. |
| **Scope creep → "okay at everything"** | Park non-core (scheduling, reviews); enforce the "what it is NOT" discipline. |
| **Product maturity** (e.g., the missing-migration bug found in testing) | Real end-to-end testing as standard; fix the open trust-killers (email out-of-box, change own password, "are you sure" before pay, rating timing). |
| **Free-tier cannibalization** | Free = acquisition funnel, not profit; automation + lower fee pull active users to Pro. |

---

## 15. Roadmap / immediate next steps

1. **Make the subscription undeniable:** the *"what are you owed?"* cold-start +
   recovery loop that makes $49 obvious in the first five minutes. *(The thing
   that converts free → paid — now the whole game.)*
2. **Make in-app pay the obvious choice** at the deposit (Accept & pay deposit)
   and customer "Pay now" moments.
3. **Make e-transfer recording free** ("Mark paid → e-transfer / cash").
4. **Close the trust gaps:** email follow-ups working out-of-box, self-serve
   email/password change, pay confirmation, rating after work (not deposit).
5. **Verify a real Stripe payout** (the one part not yet proven).
