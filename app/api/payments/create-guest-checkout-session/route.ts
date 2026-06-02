import { type NextRequest, NextResponse } from "next/server"

import { validateGuestToken } from "@/lib/guest-access"
import { stripe } from "@/lib/stripe/server"
import {
  getAccountsV2ConnectedStatus,
  retrieveAccountsV2ConnectedAccount,
} from "@/lib/stripe/accounts-v2"
import { createServiceClient } from "@/lib/supabase/service"

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { estimateId, guestToken } = body as { estimateId?: string; guestToken?: string }

  if (!estimateId || typeof estimateId !== "string") {
    return NextResponse.json({ error: "estimateId is required" }, { status: 400 })
  }
  if (!guestToken || typeof guestToken !== "string") {
    return NextResponse.json({ error: "guestToken is required" }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Validate guest token
  const access = await validateGuestToken(supabase, guestToken)
  if (!access) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 })
  }

  const { jobRequestId } = access

  // Load estimate and verify it belongs to this guest's job request
  const { data: estimate, error: estError } = await supabase
    .from("estimates")
    .select("*")
    .eq("id", estimateId)
    .eq("job_request_id", jobRequestId)
    .single()

  if (estError || !estimate) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 })
  }

  // Same payment guards as the authenticated checkout route
  if (estimate.payment_status === "paid") {
    return NextResponse.json({ error: "This estimate has already been paid" }, { status: 409 })
  }

  if (estimate.payment_status === "checkout_created" && estimate.stripe_checkout_session_id) {
    try {
      const existingSession = await stripe.checkout.sessions.retrieve(
        estimate.stripe_checkout_session_id
      )
      if (existingSession.status === "open" && existingSession.url) {
        return NextResponse.json({ url: existingSession.url })
      }
      if (existingSession.payment_status === "paid" || existingSession.status === "complete") {
        return NextResponse.json({ error: "This estimate has already been paid" }, { status: 409 })
      }
    } catch (err) {
      console.warn("[guest-checkout] Failed to retrieve existing session:", err)
    }
  }

  if (estimate.status !== "Accepted" && estimate.status !== "Won") {
    return NextResponse.json(
      { error: "Estimate must be accepted before payment" },
      { status: 422 }
    )
  }

  if (
    !estimate.contractor_amount_cents ||
    !estimate.platform_fee_cents ||
    !estimate.client_total_cents
  ) {
    return NextResponse.json(
      { error: "This estimate is not configured for online payment" },
      { status: 422 }
    )
  }

  if (estimate.client_total_cents < 50) {
    return NextResponse.json(
      { error: "Payment amount is below the minimum ($0.50 CAD)" },
      { status: 422 }
    )
  }

  // Load contractor Stripe account
  const { data: contractorProfile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, stripe_account_id, stripe_onboarding_complete, stripe_charges_enabled, stripe_payouts_enabled")
    .eq("user_id", estimate.user_id)
    .single()

  if (profileError || !contractorProfile) {
    return NextResponse.json({ error: "Contractor not found" }, { status: 404 })
  }

  if (!contractorProfile.stripe_account_id) {
    return NextResponse.json(
      { error: "Contractor has not connected Stripe" },
      { status: 422 }
    )
  }

  const connectedAccount = await retrieveAccountsV2ConnectedAccount(
    contractorProfile.stripe_account_id
  )
  const connectedStatus = getAccountsV2ConnectedStatus(connectedAccount)

  await supabase
    .from("profiles")
    .update({
      stripe_charges_enabled:     connectedStatus.chargesEnabled,
      stripe_payouts_enabled:     connectedStatus.payoutsEnabled,
      stripe_details_submitted:   connectedStatus.detailsSubmitted,
      stripe_onboarding_complete: connectedStatus.onboardingComplete,
    })
    .eq("user_id", estimate.user_id)

  if (connectedStatus.stripeTransfersStatus !== "active") {
    return NextResponse.json(
      { error: "Contractor Stripe account is not fully active" },
      { status: 422 }
    )
  }

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const cancelUrl = `${appUrl}/guest/project/${guestToken}`
  const successUrl = `${appUrl}/guest/project/${guestToken}/success?session_id={CHECKOUT_SESSION_ID}`

  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>
  try {
    session = await stripe.checkout.sessions.create({
      mode:                 "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency:     "cad",
            product_data: {
              name:        `Estimate ${estimate.estimate_number}`,
              description: estimate.notes ?? "Contractor project payment",
            },
            unit_amount: estimate.client_total_cents,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: estimate.platform_fee_cents,
        transfer_data: {
          destination: contractorProfile.stripe_account_id,
        },
        metadata: {
          estimate_id:   estimate.id,
          contractor_id: estimate.user_id,
          guest_token:   guestToken,
        },
      },
      metadata: {
        estimate_id:   estimate.id,
        contractor_id: estimate.user_id,
        guest_token:   guestToken,
      },
      success_url: successUrl,
      cancel_url:  cancelUrl,
    })
  } catch (err) {
    const stripeErr = err as { message?: string; type?: string; code?: string }
    console.error("[guest-checkout] Stripe session create error:", stripeErr.type ?? stripeErr.code, stripeErr.message)
    return NextResponse.json(
      { error: stripeErr.message ?? "Failed to create payment session. Please try again." },
      { status: 502 }
    )
  }

  // Persist checkout session ID
  await supabase
    .from("estimates")
    .update({
      stripe_checkout_session_id: session.id,
      payment_status:             "checkout_created",
    })
    .eq("id", estimate.id)

  await supabase.from("payments").upsert(
    {
      estimate_id:                  estimate.id,
      contractor_id:                estimate.user_id,
      client_id:                    null,
      contractor_amount_cents:      estimate.contractor_amount_cents,
      platform_fee_cents:           estimate.platform_fee_cents,
      client_total_cents:           estimate.client_total_cents,
      currency:                     "cad",
      status:                       "pending",
      stripe_checkout_session_id:   session.id,
      stripe_connected_account_id:  contractorProfile.stripe_account_id,
    },
    { onConflict: "stripe_checkout_session_id" }
  )

  return NextResponse.json({ url: session.url })
}
