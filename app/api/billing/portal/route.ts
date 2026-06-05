import { type NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { stripe } from "@/lib/stripe/server"

// Stripe Billing customer portal — contractor manages/cancels their own plan.
export async function POST(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const service = createServiceClient()
  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  }
  if (!profile.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account yet. Choose a plan first." }, { status: 422 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${appUrl}/dashboard/settings`,
    })
    return NextResponse.json({ url: session.url })
  } catch (err) {
    const e = err as { message?: string; type?: string; code?: string }
    console.error("[billing/portal] error:", e.type ?? e.code, e.message)
    return NextResponse.json({ error: "Could not open billing portal. Please try again." }, { status: 502 })
  }
}
