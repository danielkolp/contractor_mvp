/**
 * Plans, gating, and per-plan transaction fees — the business model in one file.
 *
 * Three tiers (see TODO P0 feature matrix):
 *   free  — fee-only. Requests, clients, basic estimates, client portal + online
 *           payment (so Free can still earn Euroflo a fee), basic recovery follow-ups.
 *   pro   ($49/mo) — adds automated follow-up cadences, reply tracking, CRM /
 *           reliability badges, branded estimates, deposits.
 *   team  ($199/mo) — adds multi-user workspaces, advanced reporting, team mgmt.
 *
 * Transaction fee (application fee Euroflo takes on each card charge):
 *   free 5%  ·  pro 2%  ·  team 1%
 *
 * This file is the single source of truth. Server routes call requireFeature();
 * UI calls hasPlanFeature(); charge creation calls transactionFeeBps().
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
  | "automatedCadences"
  | "replyTracking"
  | "crmReliabilityBadges"
  | "brandedEstimates"
  | "deposits"
  | "multiUser"
  | "advancedReporting"
  | "teamManagement"

const FREE_FEATURES: PlanFeature[] = [
  "requests",
  "clients",
  "basicEstimates",
  "clientPortalPayment",
  "basicRecovery",
]

const PRO_FEATURES: PlanFeature[] = [
  ...FREE_FEATURES,
  "automatedCadences",
  "replyTracking",
  "crmReliabilityBadges",
  "brandedEstimates",
  "deposits",
]

const TEAM_FEATURES: PlanFeature[] = [
  ...PRO_FEATURES,
  "multiUser",
  "advancedReporting",
  "teamManagement",
]

const PLAN_FEATURE_MAP: Record<PlanTier, ReadonlySet<PlanFeature>> = {
  free: new Set(FREE_FEATURES),
  pro: new Set(PRO_FEATURES),
  team: new Set(TEAM_FEATURES),
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
  if (PLAN_FEATURE_MAP.pro.has(feature)) return "pro"
  return "team"
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
  team: 100, // 1%
}

/**
 * Per-transaction cap on the Free tier's 5% so big jobs don't flee off-platform.
 * Locked at $50/transaction; overridable via EUROFLO_FREE_FEE_CAP_CENTS.
 */
export const FREE_FEE_CAP_CENTS: number | null = process.env.EUROFLO_FREE_FEE_CAP_CENTS
  ? Number(process.env.EUROFLO_FREE_FEE_CAP_CENTS)
  : 5000

/** Fee in basis points (1% = 100 bps) for a plan. */
export function transactionFeeBps(plan: PlanTier): number {
  return PLAN_FEE_BPS[normalizePlan(plan)]
}

/** Fee as a percentage number (e.g. 5, 2, 1) for display / pricing math. */
export function transactionFeePercent(plan: PlanTier): number {
  return transactionFeeBps(plan) / 100
}

/**
 * The application fee in cents for a charge of `amountCents` under `plan`,
 * applying the Free-tier cap when configured.
 */
export function transactionFeeCents(plan: PlanTier, amountCents: number): number {
  const raw = Math.round((amountCents * transactionFeeBps(plan)) / 10_000)
  if (normalizePlan(plan) === "free" && FREE_FEE_CAP_CENTS != null) {
    return Math.min(raw, FREE_FEE_CAP_CENTS)
  }
  return raw
}

// ── Plan display metadata + Stripe price wiring ───────────────────────────────

export type PlanMeta = {
  tier: PlanTier
  name: string
  /** Monthly price in dollars (display only; Stripe holds the real amount). */
  monthlyPrice: number
  /** Annual price in dollars for the year (≈10–20% discount baked into Stripe price). */
  annualPrice: number
  tagline: string
  feeLabel: string
  highlights: string[]
}

export const PLAN_META: Record<PlanTier, PlanMeta> = {
  free: {
    tier: "free",
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    tagline: "Get paid online. Pay only when you get paid.",
    feeLabel: "5% card fee",
    highlights: [
      "Requests, clients & estimates",
      "Client portal + online payment",
      "Basic recovery follow-ups",
    ],
  },
  pro: {
    tier: "pro",
    name: "Pro",
    monthlyPrice: 49,
    annualPrice: 490, // ~17% off (2 months free)
    tagline: "Chase on autopilot and close more jobs.",
    feeLabel: "2% card fee",
    highlights: [
      "Everything in Free",
      "Automated follow-up cadences + reply tracking",
      "Reliability badges, branded estimates, deposits",
    ],
  },
  team: {
    tier: "team",
    name: "Team",
    monthlyPrice: 199,
    annualPrice: 1990, // ~17% off (2 months free)
    tagline: "Run a crew with shared visibility and reporting.",
    feeLabel: "1% card fee",
    highlights: [
      "Everything in Pro",
      "Multi-user workspaces & team management",
      "Advanced reporting (dollars recovered)",
    ],
  },
}

/** Paid plans only, in display order. */
export const PAID_PLANS: PlanTier[] = ["pro", "team"]

/**
 * Resolve the Stripe price id for a paid plan + interval from env.
 * Env vars: STRIPE_PRICE_PRO_MONTH, STRIPE_PRICE_PRO_YEAR,
 *           STRIPE_PRICE_TEAM_MONTH, STRIPE_PRICE_TEAM_YEAR.
 */
export function stripePriceId(plan: PlanTier, interval: BillingInterval): string | null {
  if (plan === "free") return null
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${interval === "year" ? "YEAR" : "MONTH"}`
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

/** Whether a plan_status counts as actively entitling paid features. */
export function isPlanActive(status: string): boolean {
  return status === "active" || status === "trialing" || status === "past_due"
}

/**
 * The plan that should actually be enforced. A paid plan whose subscription has
 * lapsed (canceled/unpaid/incomplete) falls back to free. past_due keeps access
 * during Stripe's dunning grace period.
 */
export function effectivePlan(plan: PlanTier, status: string): PlanTier {
  const tier = normalizePlan(plan)
  if (tier === "free") return "free"
  return isPlanActive(status) ? tier : "free"
}
