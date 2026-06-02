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

  // ── 2. Load profile ───────────────────────────────────────────────────────────
  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("role, stripe_account_id")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  }

  if (profile.role !== "contractor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (!profile.stripe_account_id) {
    return NextResponse.json({
      connected: false,
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
      onboarding_complete: false,
    })
  }

  // ── 3. Retrieve Stripe account ────────────────────────────────────────────────
  const account = await stripe.accounts.retrieve(profile.stripe_account_id)

  const chargesEnabled   = account.charges_enabled   ?? false
  const payoutsEnabled   = account.payouts_enabled   ?? false
  const detailsSubmitted = account.details_submitted ?? false
  const onboardingComplete = chargesEnabled && payoutsEnabled

  // ── 4. Persist updated status ─────────────────────────────────────────────────
  await service
    .from("profiles")
    .update({
      stripe_charges_enabled:     chargesEnabled,
      stripe_payouts_enabled:     payoutsEnabled,
      stripe_details_submitted:   detailsSubmitted,
      stripe_onboarding_complete: onboardingComplete,
    })
    .eq("user_id", user.id)

  return NextResponse.json({
    connected:           true,
    charges_enabled:     chargesEnabled,
    payouts_enabled:     payoutsEnabled,
    details_submitted:   detailsSubmitted,
    onboarding_complete: onboardingComplete,
  })
}

// Also allow GET so the settings page can poll on load.
export { POST as GET }
