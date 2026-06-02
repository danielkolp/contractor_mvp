import type Stripe from "stripe"

import { stripe } from "./server"

export const STRIPE_CONNECT_CONFIGURATIONS = ["merchant", "recipient"] as const

type V2Account = Stripe.V2.Core.Account
type V2CapabilityStatus = "active" | "pending" | "restricted" | "unsupported"

type CreateConnectedAccountInput = {
  email?: string | null
  userId: string
  displayName?: string | null
  country?: string | null
}

type ConnectedAccountStatus = {
  connected: boolean
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  onboardingComplete: boolean
  cardPaymentsStatus: V2CapabilityStatus | null
  stripeTransfersStatus: V2CapabilityStatus | null
  payoutsStatus: V2CapabilityStatus | null
  requirementsDue: number
  futureRequirementsDue: number
}

function normaliseCountry(country?: string | null) {
  return (country ?? process.env.STRIPE_CONNECT_COUNTRY ?? "CA").trim().toUpperCase()
}

function displayNameFallback(input: CreateConnectedAccountInput) {
  return input.displayName?.trim() || input.email || "Euroflo contractor"
}

export async function createAccountsV2ConnectedAccount(input: CreateConnectedAccountInput) {
  const country = normaliseCountry(input.country)

  const account = await stripe.v2.core.accounts.create(
    {
      contact_email: input.email ?? undefined,
      dashboard: "express",
      defaults: {
        currency: "cad",
        locales: ["en-CA"],
        responsibilities: {
          fees_collector: "application",
          losses_collector: "application",
        },
      },
      display_name: displayNameFallback(input),
      identity: {
        country,
        entity_type: "individual",
        individual: {
          email: input.email ?? undefined,
        },
      },
      configuration: {
        merchant: {
          capabilities: {
            card_payments: { requested: true },
          },
        },
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: { requested: true },
            },
          },
        },
      },
      include: ["configuration.merchant", "configuration.recipient", "requirements"],
      metadata: {
        app: "euroflo",
        profile_user_id: input.userId,
      },
    },
    {
      idempotencyKey: `accounts-v2-connect:${input.userId}`,
    }
  )

  return account.id
}

export async function createAccountsV2OnboardingLink(accountId: string, appUrl: string) {
  return stripe.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: [...STRIPE_CONNECT_CONFIGURATIONS],
        collection_options: {
          fields: "eventually_due",
          future_requirements: "include",
        },
        refresh_url: `${appUrl}/dashboard/settings?stripe=refresh`,
        return_url: `${appUrl}/dashboard/settings?stripe=return`,
      },
    },
  })
}

export async function createAccountsV2UpdateLink(accountId: string, appUrl: string) {
  return stripe.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_update",
      account_update: {
        configurations: [...STRIPE_CONNECT_CONFIGURATIONS],
        collection_options: {
          fields: "eventually_due",
          future_requirements: "include",
        },
        refresh_url: `${appUrl}/dashboard/settings?stripe=refresh`,
        return_url: `${appUrl}/dashboard/settings?stripe=return`,
      },
    },
  })
}

export async function retrieveAccountsV2ConnectedAccount(accountId: string) {
  return stripe.v2.core.accounts.retrieve(accountId, {
    include: [
      "configuration.merchant",
      "configuration.recipient",
      "future_requirements",
      "requirements",
    ],
  })
}

function countDueRequirements(account: V2Account, key: "requirements" | "future_requirements") {
  return account[key]?.entries?.filter((entry) => entry.awaiting_action_from === "user").length ?? 0
}

export function getAccountsV2ConnectedStatus(account: V2Account): ConnectedAccountStatus {
  const cardPaymentsStatus =
    account.configuration?.merchant?.capabilities?.card_payments?.status ?? null
  const payoutsStatus =
    account.configuration?.merchant?.capabilities?.stripe_balance?.payouts?.status ?? null
  const stripeTransfersStatus =
    account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ?? null
  const requirementsDue = countDueRequirements(account, "requirements")
  const futureRequirementsDue = countDueRequirements(account, "future_requirements")
  const chargesEnabled = cardPaymentsStatus === "active" || stripeTransfersStatus === "active"
  const payoutsEnabled = payoutsStatus === "active" || stripeTransfersStatus === "active"
  const onboardingComplete =
    cardPaymentsStatus === "active" && stripeTransfersStatus === "active" && requirementsDue === 0

  return {
    connected: true,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted: requirementsDue === 0 && futureRequirementsDue === 0,
    onboardingComplete,
    cardPaymentsStatus,
    stripeTransfersStatus,
    payoutsStatus,
    requirementsDue,
    futureRequirementsDue,
  }
}
