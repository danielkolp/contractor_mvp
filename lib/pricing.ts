/**
 * Centralised money calculations for Euroflo estimates.
 *
 * Money rules (per the locked fee model):
 *   contractor subtotal  = what the contractor wants to receive (they always get this)
 *   platform fee         = plan fee % of contractor subtotal, capped per transaction
 *                          (Free 5% capped $50 / Pro 2% capped $25 — see lib/plans.ts;
 *                          pass planFeeOptions(plan) as the fee options)
 *   taxable subtotal     = contractor subtotal + platform fee
 *   GST                  = 5 % of taxable subtotal
 *   pre-Stripe total     = taxable subtotal + GST
 *   Stripe fee           = grossed up so Stripe's 2.9% + 30¢ is covered by the client
 *   client total         = pre-Stripe total + Stripe fee  (what the client pays)
 *   deposit              = initial Stripe charge (user-supplied or 30 % default)
 *   remaining balance    = client total − deposit
 *
 * Both the platform fee and Stripe's processing fee are charged to the client on
 * top, so the contractor receives their quoted amount in full.
 *
 * All amounts are integers in cents.
 */

import { FREE_FEE_CAP_CENTS, transactionFeePercent } from "./plans"

/**
 * Default platform fee % when no explicit plan fee is supplied. Falls back to
 * the contractor's baseline plan fee (the Free tier, 5%) rather than a flat 15%,
 * so estimates always reflect the real per-plan card fee from `lib/plans.ts`.
 * An env override (`NEXT_PUBLIC_PLATFORM_FEE_PERCENT`) still wins when set.
 */
export const PLATFORM_FEE_PERCENT = process.env.NEXT_PUBLIC_PLATFORM_FEE_PERCENT
  ? Number(process.env.NEXT_PUBLIC_PLATFORM_FEE_PERCENT)
  : transactionFeePercent("free")
export const GST_PERCENT = 5

/** Stripe standard card processing fee (CAD): 2.9% + 30¢. */
export const STRIPE_PERCENT = 2.9
export const STRIPE_FIXED_CENTS = 30

export interface PricingBreakdown {
  contractorSubtotalCents: number
  platformFeeCents: number
  taxableSubtotalCents: number
  gstCents: number
  stripeFeeCents: number
  clientTotalCents: number
  depositCents: number
  remainingBalanceCents: number
}

export interface ComputePricingOptions {
  /** Explicit deposit in cents; null/undefined → default 30 % of client total. */
  depositInputCents?: number | null
  /** Platform fee percentage (e.g. 5, 2). Defaults to PLATFORM_FEE_PERCENT. */
  feePercent?: number
  /**
   * Per-transaction cap on the platform fee in cents. null = uncapped.
   * Defaults to the Free-tier cap so it pairs with the default Free fee —
   * callers should pass planFeeOptions(plan) from lib/plans.ts instead of
   * assembling these two options by hand.
   */
  feeCapCents?: number | null
  /** Gross up the client total to cover Stripe's processing fee. Default true. */
  includeStripeFee?: boolean
}

/**
 * Gross up a net amount so that after Stripe deducts 2.9% + 30¢ the net remains.
 * Returns the Stripe fee in cents (clientTotal − net).
 */
export function stripeProcessingFeeCents(netCents: number): number {
  if (netCents <= 0) return 0
  const gross = (netCents + STRIPE_FIXED_CENTS) / (1 - STRIPE_PERCENT / 100)
  return Math.ceil(gross) - netCents
}

/**
 * Compute all pricing figures from the contractor's desired payout.
 *
 * @param contractorSubtotalCents  What the contractor wants (integer cents).
 * @param options                  Deposit, plan fee %, cap, and Stripe gross-up.
 */
export function computePricing(
  contractorSubtotalCents: number,
  options: ComputePricingOptions = {}
): PricingBreakdown {
  const {
    depositInputCents,
    feePercent = PLATFORM_FEE_PERCENT,
    feeCapCents = FREE_FEE_CAP_CENTS,
    includeStripeFee = true,
  } = options

  const rawPlatformFee = Math.round(contractorSubtotalCents * (feePercent / 100))
  const platformFeeCents =
    feeCapCents != null ? Math.min(rawPlatformFee, feeCapCents) : rawPlatformFee

  const taxableSubtotalCents = contractorSubtotalCents + platformFeeCents
  const gstCents = Math.round(taxableSubtotalCents * (GST_PERCENT / 100))
  const preStripeTotalCents = taxableSubtotalCents + gstCents

  const stripeFeeCents = includeStripeFee
    ? stripeProcessingFeeCents(preStripeTotalCents)
    : 0
  const clientTotalCents = preStripeTotalCents + stripeFeeCents

  const rawDeposit =
    depositInputCents != null && depositInputCents > 0
      ? depositInputCents
      : Math.round(clientTotalCents * 0.3)

  const depositCents = Math.min(rawDeposit, clientTotalCents)

  return {
    contractorSubtotalCents,
    platformFeeCents,
    taxableSubtotalCents,
    gstCents,
    stripeFeeCents,
    clientTotalCents,
    depositCents,
    remainingBalanceCents: clientTotalCents - depositCents,
  }
}

/**
 * Proportional application fee Euroflo collects on a partial deposit charge.
 * Maintains the same fee ratio as the full payment.
 */
export function depositApplicationFee(
  depositCents: number,
  platformFeeCents: number,
  clientTotalCents: number
): number {
  if (clientTotalCents <= 0) return 0
  return Math.round((depositCents * platformFeeCents) / clientTotalCents)
}

/**
 * The Stripe Connect application fee for a charge of `chargeCents`: the
 * proportional platform fee plus the actual Stripe processing fee on that charge,
 * so the contractor receives their proportional quoted amount in full.
 */
export function chargeApplicationFee(
  chargeCents: number,
  platformFeeCents: number,
  clientTotalCents: number
): number {
  const platformPortion = depositApplicationFee(chargeCents, platformFeeCents, clientTotalCents)
  return platformPortion + stripeProcessingFeeCents(chargeCents - platformPortion)
}

/**
 * Resolve the deposit amount for an estimate that may or may not have an
 * explicit deposit_amount_cents.  Falls back to 30 % of clientTotal.
 */
export function resolveDepositCents(
  depositAmountCents: number | null | undefined,
  depositPercentage: number | null | undefined,
  clientTotalCents: number
): number {
  if (depositAmountCents != null && depositAmountCents > 0) {
    return Math.min(depositAmountCents, clientTotalCents)
  }
  if (depositPercentage != null && depositPercentage > 0) {
    return Math.min(
      Math.round(clientTotalCents * (depositPercentage / 100)),
      clientTotalCents
    )
  }
  return Math.round(clientTotalCents * 0.3)
}

/**
 * Remaining balance after deposit.  Always non-negative.
 */
export function resolveBalanceCents(
  clientTotalCents: number,
  depositAmountCents: number | null | undefined,
  depositPercentage: number | null | undefined
): number {
  const paid = resolveDepositCents(depositAmountCents, depositPercentage, clientTotalCents)
  return Math.max(0, clientTotalCents - paid)
}
