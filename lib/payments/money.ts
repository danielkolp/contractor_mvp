const FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT ?? 15)

export function dollarsToCents(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`dollarsToCents: invalid amount ${amount}`)
  }
  return Math.round(amount * 100)
}

export function centsToDollars(cents: number): number {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(`centsToDollars: invalid cents value ${cents}`)
  }
  return cents / 100
}

export function calculatePlatformFee(contractorAmountCents: number): {
  contractorAmountCents: number
  platformFeeCents: number
  clientTotalCents: number
} {
  if (!Number.isInteger(contractorAmountCents) || contractorAmountCents <= 0) {
    throw new Error(
      `calculatePlatformFee: contractor amount must be a positive integer, got ${contractorAmountCents}`
    )
  }
  // Stripe minimum charge is 50 cents CAD
  if (contractorAmountCents < 50) {
    throw new Error("calculatePlatformFee: amount must be at least $0.50 CAD")
  }

  const platformFeeCents = Math.round(contractorAmountCents * (FEE_PERCENT / 100))
  const clientTotalCents = contractorAmountCents + platformFeeCents

  return { contractorAmountCents, platformFeeCents, clientTotalCents }
}

export function feePercent(): number {
  return FEE_PERCENT
}

export function formatCad(cents: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(centsToDollars(cents))
}
