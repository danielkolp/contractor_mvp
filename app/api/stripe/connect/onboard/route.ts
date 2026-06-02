import { type NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { stripe } from "@/lib/stripe/server"

export async function POST(_req: NextRequest) {
  // ── 1. Auth: contractor only ─────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const service = createServiceClient()

  // ── 2. Load contractor profile ────────────────────────────────────────────────
  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("role, stripe_account_id, owner_name, company_name")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  }

  if (profile.role !== "contractor") {
    return NextResponse.json({ error: "Only contractors can connect Stripe" }, { status: 403 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

  // ── 3. Create Stripe account if not yet connected ────────────────────────────
  let stripeAccountId = profile.stripe_account_id

  try {
    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: process.env.STRIPE_CONNECT_COUNTRY ?? "CA",
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
        individual: {
          email: user.email,
        },
      })

      stripeAccountId = account.id

      const { error: updateError } = await service
        .from("profiles")
        .update({ stripe_account_id: stripeAccountId })
        .eq("user_id", user.id)

      if (updateError) {
        console.error("[stripe/onboard] Failed to save stripe_account_id:", updateError)
        return NextResponse.json(
          { error: "Failed to save Stripe account. Please try again." },
          { status: 500 }
        )
      }
    }

    // ── 4. Create Account Link for onboarding ──────────────────────────────────
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${appUrl}/dashboard/settings?stripe=refresh`,
      return_url: `${appUrl}/dashboard/settings?stripe=return`,
      type: "account_onboarding",
    })

    return NextResponse.json({ url: accountLink.url })
  } catch (err) {
    const stripeErr = err as { message?: string; type?: string; code?: string }
    console.error("[stripe/onboard] Stripe error:", stripeErr.type ?? stripeErr.code, stripeErr.message)
    return NextResponse.json(
      { error: stripeErr.message ?? "Stripe error. Please try again." },
      { status: 502 }
    )
  }
}
