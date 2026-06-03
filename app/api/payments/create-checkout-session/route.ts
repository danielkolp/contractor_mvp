import { type NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { stripe } from "@/lib/stripe/server"
import {
  getAccountsV2ConnectedStatus,
  retrieveAccountsV2ConnectedAccount,
} from "@/lib/stripe/accounts-v2"
import {
  depositApplicationFee,
  resolveBalanceCents,
  resolveDepositCents,
} from "@/lib/pricing"

type PaymentType = "deposit" | "balance" | "full"

export async function POST(req: NextRequest) {
  // ── 1. Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // ── 2. Parse body ─────────────────────────────────────────────────────────────
  let body: unknown
  try { body = await req.json() }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) }

  const { estimateId, paymentType = "deposit" } =
    body as { estimateId?: string; paymentType?: PaymentType }

  if (!estimateId || typeof estimateId !== "string") {
    return NextResponse.json({ error: "estimateId is required" }, { status: 400 })
  }
  if (!["deposit", "balance", "full"].includes(paymentType)) {
    return NextResponse.json({ error: "Invalid paymentType" }, { status: 400 })
  }

  // ── 3. Load estimate (RLS-gated) ──────────────────────────────────────────────
  const { data: estimate, error: estError } = await supabase
    .from("estimates")
    .select("*")
    .eq("id", estimateId)
    .single()

  if (estError || !estimate) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 })
  }

  const extEst = estimate as typeof estimate & {
    deposit_amount_cents?: number | null
    deposit_percentage?: number | null
  }

  const clientTotal    = estimate.client_total_cents ?? 0
  const platformFee    = estimate.platform_fee_cents ?? 0
  const depositCents   = resolveDepositCents(extEst.deposit_amount_cents, extEst.deposit_percentage, clientTotal)
  const balanceCents   = resolveBalanceCents(clientTotal, extEst.deposit_amount_cents, extEst.deposit_percentage)

  // ── 4. State-machine validation per paymentType ───────────────────────────────
  const status = estimate.payment_status ?? "unpaid"

  if (paymentType === "balance") {
    // Balance only allowed after deposit is paid
    if (status === "paid") {
      return NextResponse.json({ error: "This estimate has already been paid in full" }, { status: 409 })
    }
    if (status !== "deposit_paid" && status !== "balance_checkout_created") {
      return NextResponse.json(
        { error: "Deposit must be paid before paying the remaining balance" },
        { status: 422 }
      )
    }
    if (balanceCents < 50) {
      return NextResponse.json(
        { error: "Remaining balance is below the minimum ($0.50 CAD)" },
        { status: 422 }
      )
    }
    // Resume existing open balance session
    if (status === "balance_checkout_created" && estimate.stripe_checkout_session_id) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(estimate.stripe_checkout_session_id)
        if (existing.status === "open" && existing.url) {
          return NextResponse.json({ url: existing.url })
        }
        if (existing.payment_status === "paid" || existing.status === "complete") {
          return NextResponse.json({ error: "This estimate has already been paid in full" }, { status: 409 })
        }
      } catch (err) {
        console.warn("[checkout] Failed to retrieve balance session:", err)
      }
    }
  } else {
    // deposit or full
    if (status === "paid" || status === "deposit_paid") {
      return NextResponse.json({ error: "This estimate has already been paid" }, { status: 409 })
    }
    // Resume existing deposit/full session
    if (status === "checkout_created" && estimate.stripe_checkout_session_id) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(estimate.stripe_checkout_session_id)
        if (existing.status === "open" && existing.url) {
          return NextResponse.json({ url: existing.url })
        }
        if (existing.payment_status === "paid" || existing.status === "complete") {
          return NextResponse.json({ error: "This estimate has already been paid" }, { status: 409 })
        }
      } catch (err) {
        console.warn("[checkout] Failed to retrieve existing checkout session:", err)
      }
    }
  }

  // ── 5. Common validation ──────────────────────────────────────────────────────
  if (estimate.status !== "Accepted" && estimate.status !== "Won") {
    return NextResponse.json(
      { error: "Estimate must be accepted before payment" },
      { status: 422 }
    )
  }
  if (!estimate.contractor_amount_cents || !platformFee || !clientTotal) {
    return NextResponse.json(
      { error: "This estimate is not configured for online payment" },
      { status: 422 }
    )
  }
  if (clientTotal < 50) {
    return NextResponse.json(
      { error: "Payment amount is below the minimum ($0.50 CAD)" },
      { status: 422 }
    )
  }

  const service = createServiceClient()

  // ── 6. Load and verify contractor Stripe account ──────────────────────────────
  const { data: contractorProfile, error: profileError } = await service
    .from("profiles")
    .select("user_id, stripe_account_id, stripe_onboarding_complete, stripe_charges_enabled, stripe_payouts_enabled")
    .eq("user_id", estimate.user_id)
    .single()

  if (profileError || !contractorProfile) {
    return NextResponse.json({ error: "Contractor not found" }, { status: 404 })
  }
  if (!contractorProfile.stripe_account_id) {
    return NextResponse.json({ error: "Contractor has not connected Stripe" }, { status: 422 })
  }

  const connectedAccount = await retrieveAccountsV2ConnectedAccount(contractorProfile.stripe_account_id)
  const connectedStatus  = getAccountsV2ConnectedStatus(connectedAccount)

  await service
    .from("profiles")
    .update({
      stripe_charges_enabled:     connectedStatus.chargesEnabled,
      stripe_payouts_enabled:     connectedStatus.payoutsEnabled,
      stripe_details_submitted:   connectedStatus.detailsSubmitted,
      stripe_onboarding_complete: connectedStatus.onboardingComplete,
    })
    .eq("user_id", estimate.user_id)

  if (connectedStatus.stripeTransfersStatus !== "active") {
    return NextResponse.json({ error: "Contractor Stripe account is not fully active" }, { status: 422 })
  }

  // ── 7. Resolve charge amount based on paymentType ─────────────────────────────
  let chargeAmountCents: number
  let isFullPayment: boolean
  let productName: string

  if (paymentType === "balance") {
    chargeAmountCents = balanceCents
    isFullPayment     = true   // balance payment completes the job
    productName       = `Balance — Estimate ${estimate.estimate_number}`
  } else if (paymentType === "full") {
    chargeAmountCents = clientTotal
    isFullPayment     = true
    productName       = `Estimate ${estimate.estimate_number}`
  } else {
    // deposit
    chargeAmountCents = depositCents
    isFullPayment     = depositCents >= clientTotal
    productName       = isFullPayment
      ? `Estimate ${estimate.estimate_number}`
      : `Deposit — Estimate ${estimate.estimate_number}`
  }

  const appFee = depositApplicationFee(chargeAmountCents, platformFee, clientTotal)

  if (chargeAmountCents < 50) {
    return NextResponse.json(
      { error: "Charge amount is below the minimum ($0.50 CAD)" },
      { status: 422 }
    )
  }

  // ── 8. Redirect URLs ──────────────────────────────────────────────────────────
  const appUrl       = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const jobRequestId = estimate.job_request_id
  const cancelUrl    = jobRequestId
    ? `${appUrl}/client/portal/${jobRequestId}`
    : `${appUrl}/client/dashboard`
  const successUrl   = jobRequestId
    ? `${appUrl}/client/portal/${jobRequestId}/success?session_id={CHECKOUT_SESSION_ID}`
    : `${appUrl}/client/dashboard`

  // ── 9. Create Stripe Checkout Session ─────────────────────────────────────────
  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "cad",
            product_data: {
              name: productName,
              description: estimate.notes ?? "Contractor project payment",
            },
            unit_amount: chargeAmountCents,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: appFee,
        transfer_data: { destination: contractorProfile.stripe_account_id },
        metadata: {
          estimate_id:     estimate.id,
          contractor_id:   estimate.user_id,
          client_id:       user.id,
          payment_type:    paymentType,
          charge_cents:    String(chargeAmountCents),
          is_full_payment: isFullPayment ? "true" : "false",
        },
      },
      metadata: {
        estimate_id:     estimate.id,
        contractor_id:   estimate.user_id,
        client_id:       user.id,
        payment_type:    paymentType,
        charge_cents:    String(chargeAmountCents),
        is_full_payment: isFullPayment ? "true" : "false",
      },
      success_url: successUrl,
      cancel_url:  cancelUrl,
    })
  } catch (err) {
    const e = err as { message?: string; type?: string; code?: string }
    console.error("[checkout] Stripe session create error:", e.type ?? e.code, e.message)
    return NextResponse.json(
      { error: e.message ?? "Failed to create payment session. Please try again." },
      { status: 502 }
    )
  }

  // ── 10. Persist session on estimate and in payments table ─────────────────────
  const newEstimateStatus = paymentType === "balance"
    ? "balance_checkout_created"
    : "checkout_created"

  await service
    .from("estimates")
    .update({
      stripe_checkout_session_id: session.id,
      payment_status: newEstimateStatus,
    })
    .eq("id", estimate.id)

  await service.from("payments").upsert(
    {
      estimate_id:                 estimate.id,
      contractor_id:               estimate.user_id,
      client_id:                   user.id,
      contractor_amount_cents:     estimate.contractor_amount_cents ?? chargeAmountCents,
      platform_fee_cents:          appFee,
      client_total_cents:          chargeAmountCents,
      currency:                    "cad",
      status:                      "pending",
      stripe_checkout_session_id:  session.id,
      stripe_connected_account_id: contractorProfile.stripe_account_id,
    },
    { onConflict: "stripe_checkout_session_id" }
  )

  return NextResponse.json({ url: session.url })
}
