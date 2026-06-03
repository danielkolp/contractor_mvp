/**
 * Centralised money calculations for Euroflo estimates.
 *
 * Money rules:
 *   contractor subtotal  = what the contractor wants to receive
 *   platform fee         = 15 % of contractor subtotal
 *   taxable subtotal     = contractor subtotal + platform fee
 *   GST                  = 5 % of taxable subtotal
 *   client total         = taxable subtotal + GST
 *   deposit              = initial Stripe charge (user-supplied or 30 % default)
 *   remaining balance    = client total − deposit
 *
 * All amounts are integers in cents.
 */

export const PLATFORM_FEE_PERCENT = Number(
  process.env.NEXT_PUBLIC_PLATFORM_FEE_PERCENT ?? 15
)
export const GST_PERCENT = 5

export interface PricingBreakdown {
  contractorSubtotalCents: number
  platformFeeCents: number
  taxableSubtotalCents: number
  gstCents: number
  clientTotalCents: number
  depositCents: number
  remainingBalanceCents: number
}

/**
 * Compute all pricing figures from the contractor's desired payout.
 *
 * @param contractorSubtotalCents  What the contractor wants (integer cents).
 * @param depositInput             Explicit deposit in cents; null/undefined → default 30 %.
 */
export function computePricing(
  contractorSubtotalCents: number,
  depositInput?: number | null
): PricingBreakdown {
  const platformFeeCents = Math.round(
    contractorSubtotalCents * (PLATFORM_FEE_PERCENT / 100)
  )
  const taxableSubtotalCents = contractorSubtotalCents + platformFeeCents
  const gstCents = Math.round(taxableSubtotalCents * (GST_PERCENT / 100))
  const clientTotalCents = taxableSubtotalCents + gstCents

  const rawDeposit =
    depositInput != null && depositInput > 0
      ? depositInput
      : Math.round(clientTotalCents * 0.3)

  const depositCents = Math.min(rawDeposit, clientTotalCents)

  return {
    contractorSubtotalCents,
    platformFeeCents,
    taxableSubtotalCents,
    gstCents,
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
