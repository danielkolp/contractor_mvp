import { type NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { stripe } from "@/lib/stripe/server"

export async function POST(req: NextRequest) {
  // ── 1. Auth: authenticated user (client or contractor) ───────────────────────
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // ── 2. Parse body ─────────────────────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { estimateId } = body as { estimateId?: string }
  if (!estimateId || typeof estimateId !== "string") {
    return NextResponse.json({ error: "estimateId is required" }, { status: 400 })
  }

  // ── 3. Load estimate via the caller's RLS session ────────────────────────────
  // If the user is a client, RLS allows them to read estimates linked to their
  // job requests. If they are a contractor, they own the estimate directly.
  const { data: estimate, error: estError } = await supabase
    .from("estimates")
    .select("*")
    .eq("id", estimateId)
    .single()

  if (estError || !estimate) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 })
  }

  // ── 4. Validate estimate is payable ──────────────────────────────────────────
  if (estimate.payment_status === "paid") {
    return NextResponse.json({ error: "This estimate has already been paid" }, { status: 409 })
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

  const service = createServiceClient()

  // ── 5. Load contractor profile ────────────────────────────────────────────────
  const { data: contractorProfile, error: profileError } = await service
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

  if (!contractorProfile.stripe_charges_enabled || !contractorProfile.stripe_payouts_enabled) {
    return NextResponse.json(
      { error: "Contractor Stripe account is not fully active" },
      { status: 422 }
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

  // Determine a portal URL for success/cancel redirects.
  // Estimates are linked to job requests in the client portal.
  const jobRequestId = estimate.job_request_id
  const cancelUrl = jobRequestId
    ? `${appUrl}/client/portal/${jobRequestId}`
    : `${appUrl}/client/dashboard`
  const successUrl = jobRequestId
    ? `${appUrl}/client/portal/${jobRequestId}/success?session_id={CHECKOUT_SESSION_ID}`
    : `${appUrl}/client/dashboard`

  // ── 6. Create Stripe Checkout Session ────────────────────────────────────────
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
            name: `Estimate ${estimate.estimate_number}`,
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
        estimate_id:    estimate.id,
        contractor_id:  estimate.user_id,
        client_id:      user.id,
      },
    },
    metadata: {
      estimate_id:    estimate.id,
      contractor_id:  estimate.user_id,
      client_id:      user.id,
    },
      success_url: successUrl,
      cancel_url:  cancelUrl,
    })
  } catch (err) {
    const stripeErr = err as { message?: string; type?: string; code?: string }
    console.error("[checkout] Stripe session create error:", stripeErr.type ?? stripeErr.code, stripeErr.message)
    return NextResponse.json(
      { error: stripeErr.message ?? "Failed to create payment session. Please try again." },
      { status: 502 }
    )
  }

  // ── 7. Persist checkout session ID on estimate and create payment record ──────
  const { error: estUpdateErr } = await service
    .from("estimates")
    .update({
      stripe_checkout_session_id: session.id,
      payment_status: "checkout_created",
    })
    .eq("id", estimate.id)
  if (estUpdateErr) {
    console.error("[checkout] Failed to update estimate payment_status:", estUpdateErr.message)
  }

  await service.from("payments").upsert(
    {
      estimate_id:                estimate.id,
      contractor_id:              estimate.user_id,
      client_id:                  user.id,
      contractor_amount_cents:    estimate.contractor_amount_cents,
      platform_fee_cents:         estimate.platform_fee_cents,
      client_total_cents:         estimate.client_total_cents,
      currency:                   "cad",
      status:                     "pending",
      stripe_checkout_session_id: session.id,
      stripe_connected_account_id: contractorProfile.stripe_account_id,
    },
    { onConflict: "stripe_checkout_session_id" }
  )

  return NextResponse.json({ url: session.url })
}
