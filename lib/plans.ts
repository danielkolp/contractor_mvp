/**
 * Plans, gating, and per-plan transaction fees — the business model in one file.
 *
 * Two tiers are sold (MVP):
 *   free — $0/mo, fee-only. Requests, clients, basic estimates, client portal +
 *          online payment (so Free still earns Euroflo a fee), manual recovery
 *          follow-ups, offline payment recording (e-transfer/cash/cheque, no fee).
 *   pro  — $49/mo. Everything in Free, plus a lower card fee (2% capped at $25),
 *          branded estimates, custom deposit control, and follow-up tone presets.
 *
 * The "team" tier still exists in the DB enum and in PlanTier for forward
 * compatibility, but it is NOT sold: it is excluded from PAID_PLANS, has no
 * Stripe price wiring, and must never appear in user-facing UI.
 *
 * Transaction fee (application fee Euroflo takes on each card charge):
 *   free 5% capped at $50/transaction · pro 2% capped at $25/transaction
 *   Offline payments (e-transfer / cash / cheque) never carry a Euroflo fee.
 *
 * This file is the single source of truth. Server routes call requireFeature();
 * UI calls hasPlanFeature(); charge creation calls transactionFeeCents() or
 * planFeeOptions() (for lib/pricing's computePricing).
 */

export const PLAN_TIERS = ["free", "pro", "team"] as const
export type PlanTier = (typeof PLAN_TIERS)[number]

export type BillingInterval = "month" | "year"

/** Higher rank = more capable. Used to decide upgrade vs. downgrade. */
const PLAN_RANK: Record<PlanTier, number> = { free: 0, pro: 1, team: 2 }

export function isPlanTier(value: unknown): value is PlanTier {
  return typeof value === "string" && (PLAN_TIERS as readonly string[]).includes(value)
}

export function normalizePlan(value: unknown): PlanTier {
  return isPlanTier(value) ? value : "free"
}

export function comparePlans(a: PlanTier, b: PlanTier): number {
  return PLAN_RANK[a] - PLAN_RANK[b]
}

// ── Feature matrix ────────────────────────────────────────────────────────────

export type PlanFeature =
  | "requests"
  | "clients"
  | "basicEstimates"
  | "clientPortalPayment"
  | "basicRecovery"
  | "offlinePayments"
  | "brandedEstimates"
  | "customDeposits"
  | "followUpPresets"

const FREE_FEATURES: PlanFeature[] = [
  "requests",
  "clients",
  "basicEstimates",
  "clientPortalPayment",
  "basicRecovery",
  "offlinePayments",
]

const PRO_FEATURES: PlanFeature[] = [
  ...FREE_FEATURES,
  "brandedEstimates",
  "customDeposits",
  "followUpPresets",
]

const PLAN_FEATURE_MAP: Record<PlanTier, ReadonlySet<PlanFeature>> = {
  free: new Set(FREE_FEATURES),
  pro: new Set(PRO_FEATURES),
  // Team is not sold yet — internally it unlocks the same features as Pro so a
  // legacy/manually-set team plan never behaves worse than Pro.
  team: new Set(PRO_FEATURES),
}

/** The full feature set a plan unlocks. */
export function planFeatures(plan: PlanTier): ReadonlySet<PlanFeature> {
  return PLAN_FEATURE_MAP[normalizePlan(plan)]
}

/** UI-safe check: does this plan include the feature? */
export function hasPlanFeature(plan: PlanTier, feature: PlanFeature): boolean {
  return planFeatures(plan).has(feature)
}

/** The lowest plan that unlocks a feature — used for "Upgrade to Pro" copy. */
export function minimumPlanFor(feature: PlanFeature): PlanTier {
  if (PLAN_FEATURE_MAP.free.has(feature)) return "free"
  return "pro"
}

export class PlanGateError extends Error {
  readonly requiredPlan: PlanTier
  readonly feature: PlanFeature
  constructor(feature: PlanFeature, requiredPlan: PlanTier) {
    super(`This feature requires the ${PLAN_META[requiredPlan].name} plan.`)
    this.name = "PlanGateError"
    this.feature = feature
    this.requiredPlan = requiredPlan
  }
}

/**
 * Server-side guard. Throws PlanGateError when the plan lacks the feature.
 * Routes catch it and return 402 (Payment Required).
 */
export function requireFeature(plan: PlanTier, feature: PlanFeature): void {
  if (!hasPlanFeature(plan, feature)) {
    throw new PlanGateError(feature, minimumPlanFor(feature))
  }
}

// ── Transaction fees (Stripe Connect application fee) ─────────────────────────

const PLAN_FEE_BPS: Record<PlanTier, number> = {
  free: 500, // 5%
  pro: 200, // 2%
  team: 200, // not sold; mirrors Pro so a legacy team plan never pays more
}

/**
 * Per-transaction cap on the Free tier's 5% so big jobs don't flee off-platform.
 * Locked at $50/transaction; overridable via EUROFLO_FREE_FEE_CAP_CENTS.
 */
export const FREE_FEE_CAP_CENTS: number | null = process.env.EUROFLO_FREE_FEE_CAP_CENTS
  ? Number(process.env.EUROFLO_FREE_FEE_CAP_CENTS)
  : 5000

/** Per-transaction cap on the Pro tier's 2%. Locked at $25/transaction. */
export const PRO_FEE_CAP_CENTS = 2500

const PLAN_FEE_CAP_CENTS: Record<PlanTier, number | null> = {
  free: FREE_FEE_CAP_CENTS,
  pro: PRO_FEE_CAP_CENTS,
  team: PRO_FEE_CAP_CENTS, // not sold; mirrors Pro
}

/** Fee in basis points (1% = 100 bps) for a plan. */
export function transactionFeeBps(plan: PlanTier): number {
  return PLAN_FEE_BPS[normalizePlan(plan)]
}

/** Fee as a percentage number (e.g. 5, 2) for display / pricing math. */
export function transactionFeePercent(plan: PlanTier): number {
  return transactionFeeBps(plan) / 100
}

/** Per-transaction cap on the plan's fee in cents (null = uncapped). */
export function transactionFeeCapCents(plan: PlanTier): number | null {
  return PLAN_FEE_CAP_CENTS[normalizePlan(plan)]
}

/**
 * Per-plan options for lib/pricing's computePricing — the one place callers
 * should get { feePercent, feeCapCents } from, so every estimate/payment
 * breakdown uses the contractor's actual current plan fee.
 */
export function planFeeOptions(plan: PlanTier): { feePercent: number; feeCapCents: number | null } {
  return {
    feePercent: transactionFeePercent(plan),
    feeCapCents: transactionFeeCapCents(plan),
  }
}

/**
 * The application fee in cents for a charge of `amountCents` under `plan`,
 * applying the plan's per-transaction cap.
 */
export function transactionFeeCents(plan: PlanTier, amountCents: number): number {
  const raw = Math.round((amountCents * transactionFeeBps(plan)) / 10_000)
  const cap = transactionFeeCapCents(plan)
  return cap != null ? Math.min(raw, cap) : raw
}

// ── Plan display metadata + Stripe price wiring ───────────────────────────────

export type PlanMeta = {
  tier: PlanTier
  name: string
  /** Monthly price in dollars (display only; Stripe holds the real amount). */
  monthlyPrice: number
  tagline: string
  feeLabel: string
  highlights: string[]
}

export const PLAN_META: Record<PlanTier, PlanMeta> = {
  free: {
    tier: "free",
    name: "Free",
    monthlyPrice: 0,
    tagline: "Get paid online. Pay only when you get paid.",
    feeLabel: "5% card fee · capped at $50/transaction",
    highlights: [
      "Public request link, job requests & clients",
      "Estimates, invoices & client portal",
      "Online card payments + manual follow-ups",
      "Record e-transfer / cash / cheque — no fee",
    ],
  },
  pro: {
    tier: "pro",
    name: "Pro",
    monthlyPrice: 49,
    tagline: "Lower fees, better follow-ups, branded estimates, and deposit control.",
    feeLabel: "2% card fee · capped at $25/transaction",
    highlights: [
      "Everything in Free",
      "2% card fee capped at $25 (vs 5% capped at $50)",
      "Your branding on estimates & invoices",
      "Custom deposit amounts on estimates",
      "Follow-up tone presets (friendly / professional / firm)",
    ],
  },
  // Not sold — kept only so internal code indexing PLAN_META by PlanTier
  // stays total. Never render this entry in user-facing UI.
  team: {
    tier: "team",
    name: "Team",
    monthlyPrice: 0,
    tagline: "",
    feeLabel: "",
    highlights: [],
  },
}

/** Plans that can be purchased, in display order. Team is intentionally absent. */
export const PAID_PLANS: PlanTier[] = ["pro"]

/**
 * Resolve the Stripe price id for a purchasable plan + interval from env.
 * MVP only requires STRIPE_PRICE_PRO_MONTH. STRIPE_PRICE_PRO_YEAR is read if
 * present (so an existing annual subscription still maps back to Pro in the
 * webhook) but nothing depends on it. Team has no price wiring on purpose.
 */
export function stripePriceId(plan: PlanTier, interval: BillingInterval): string | null {
  if (plan !== "pro") return null
  const key = interval === "year" ? "STRIPE_PRICE_PRO_YEAR" : "STRIPE_PRICE_PRO_MONTH"
  return process.env[key] ?? null
}

/** Reverse lookup: which plan + interval does a Stripe price id correspond to? */
export function planFromPriceId(priceId: string): { plan: PlanTier; interval: BillingInterval } | null {
  for (const plan of PAID_PLANS) {
    for (const interval of ["month", "year"] as const) {
      if (stripePriceId(plan, interval) === priceId) return { plan, interval }
    }
  }
  return null
}

/** Map a Stripe subscription status to our stored plan_status. */
export function normalizePlanStatus(status: string): string {
  const known = [
    "active",
    "trialing",
    "past_due",
    "canceled",
    "incomplete",
    "unpaid",
    "paused",
  ]
  if (status === "incomplete_expired") return "canceled"
  return known.includes(status) ? status : "incomplete"
}

/**
 * Whether a plan_status counts as actively entitling paid features.
 *
 * Deliberate choice: `past_due` still counts as active — the contractor keeps
 * Pro during Stripe's dunning/grace window instead of being yanked to Free the
 * moment a card fails. Stripe moves the subscription to `canceled`/`unpaid`
 * when dunning is exhausted, and the webhook then downgrades the profile.
 */
export function isPlanActive(status: string): boolean {
  return status === "active" || status === "trialing" || status === "past_due"
}

/**
 * The plan that should actually be enforced. A paid plan whose subscription has
 * lapsed (canceled/unpaid/incomplete) falls back to free. past_due keeps access
 * during Stripe's dunning grace period (see isPlanActive).
 */
export function effectivePlan(plan: PlanTier, status: string): PlanTier {
  const tier = normalizePlan(plan)
  if (tier === "free") return "free"
  return isPlanActive(status) ? tier : "free"
}
