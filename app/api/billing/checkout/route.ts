import { type NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { stripe } from "@/lib/stripe/server"
import { enumField, inputErrorMessage } from "@/lib/security/input"
import { PAID_PLANS, stripePriceId, type PlanTier } from "@/lib/plans"

// Subscription Checkout for the contractor's OWN plan ($49/mo Pro — the only
// purchasable plan in the MVP). Separate from the Connect/payments flow
// (clients paying contractors).
export async function POST(req: NextRequest) {
  // ── 1. Auth: contractor only ─────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // ── 2. Parse body ─────────────────────────────────────────────────────────────
  let body: unknown
  try { body = await req.json() }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) }

  let plan: PlanTier
  try {
    const raw = body as { plan?: unknown }
    plan = enumField(raw.plan, "plan", PAID_PLANS as readonly PlanTier[])
  } catch (error) {
    return NextResponse.json({ error: inputErrorMessage(error) }, { status: 400 })
  }

  // Monthly only for the MVP — annual billing is intentionally not wired up.
  const priceId = stripePriceId(plan, "month")
  if (!priceId) {
    // Explicit env handling: never show a vague "not available" message.
    const message =
      process.env.NODE_ENV === "production"
        ? "Pro checkout is temporarily unavailable."
        : "Pro checkout is not configured. Missing STRIPE_PRICE_PRO_MONTH."
    console.error("[billing/checkout] STRIPE_PRICE_PRO_MONTH is not set")
    return NextResponse.json({ error: message }, { status: 503 })
  }

  const service = createServiceClient()

  // ── 3. Load profile, ensure contractor + Stripe customer ─────────────────────
  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("role, company_name, owner_name, stripe_customer_id")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  }
  if (profile.role !== "contractor") {
    return NextResponse.json({ error: "Only contractors can subscribe" }, { status: 403 })
  }

  let customerId = profile.stripe_customer_id
  try {
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: user.email ?? undefined,
          name: profile.company_name ?? profile.owner_name ?? undefined,
          metadata: { app: "euroflo", profile_user_id: user.id },
        },
        { idempotencyKey: `billing-customer:${user.id}` }
      )
      customerId = customer.id
      const { error: saveError } = await service
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("user_id", user.id)
      if (saveError) {
        console.error("[billing/checkout] Failed to save stripe_customer_id:", saveError)
        return NextResponse.json({ error: "Failed to start checkout. Please try again." }, { status: 500 })
      }
    }
  } catch (err) {
    const e = err as { message?: string; type?: string; code?: string }
    console.error("[billing/checkout] customer error:", e.type ?? e.code, e.message)
    return NextResponse.json({ error: "Stripe error. Please try again." }, { status: 502 })
  }

  // ── 4. Create subscription Checkout session ──────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: user.id,
      subscription_data: {
        metadata: { app: "euroflo", profile_user_id: user.id, plan },
      },
      metadata: { app: "euroflo", profile_user_id: user.id, plan },
      success_url: `${appUrl}/dashboard/settings?billing=success`,
      cancel_url: `${appUrl}/dashboard/settings?billing=cancelled`,
    })
    return NextResponse.json({ url: session.url })
  } catch (err) {
    const e = err as { message?: string; type?: string; code?: string }
    console.error("[billing/checkout] session error:", e.type ?? e.code, e.message)
    return NextResponse.json(
      { error: e.message ?? "Failed to start checkout. Please try again." },
      { status: 502 }
    )
  }
}
