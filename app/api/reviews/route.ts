import { type NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

export async function POST(req: NextRequest) {
  // ── 1. Auth ──────────────────────────────────────────────────────────────────
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

  const { estimateId, jobRequestId, contractorId, rating, comment } =
    body as {
      estimateId?:   string
      jobRequestId?: string
      contractorId?: string
      rating?:       number
      comment?:      string | null
    }

  if (!jobRequestId || typeof jobRequestId !== "string") {
    return NextResponse.json({ error: "jobRequestId is required" }, { status: 400 })
  }
  if (!contractorId || typeof contractorId !== "string") {
    return NextResponse.json({ error: "contractorId is required" }, { status: 400 })
  }
  if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "rating must be an integer 1–5" }, { status: 400 })
  }

  const service = createServiceClient()

  // ── 3. Verify eligibility ─────────────────────────────────────────────────────
  // The client must have a payment on an estimate linked to this job request.
  const { data: estimate } = await service
    .from("estimates")
    .select("id, payment_status, user_id")
    .eq("job_request_id", jobRequestId)
    .in("payment_status", ["paid", "deposit_paid"])
    .maybeSingle()

  if (!estimate) {
    return NextResponse.json(
      { error: "No eligible payment found for this job. Complete the deposit payment first." },
      { status: 403 }
    )
  }

  // Verify the estimate's contractor matches what was passed
  if (estimate.user_id !== contractorId) {
    return NextResponse.json({ error: "Contractor mismatch" }, { status: 403 })
  }

  // ── 4. Check for duplicate ────────────────────────────────────────────────────
  const { data: existing } = await service
    .from("contractor_reviews")
    .select("id")
    .eq("client_id", user.id)
    .eq("job_request_id", jobRequestId)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: "You have already submitted a rating for this job." },
      { status: 409 }
    )
  }

  // ── 5. Insert review ──────────────────────────────────────────────────────────
  const { error: insertError } = await service
    .from("contractor_reviews")
    .insert({
      contractor_id:  contractorId,
      client_id:      user.id,
      job_request_id: jobRequestId,
      estimate_id:    estimateId ?? estimate.id,
      rating:         Math.round(rating),
      comment:        comment ?? null,
    })

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "You have already submitted a rating for this job." },
        { status: 409 }
      )
    }
    console.error("[reviews] Insert error:", insertError.message)
    return NextResponse.json({ error: "Could not save your rating." }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// ── GET: fetch average rating for a contractor ────────────────────────────────

export async function GET(req: NextRequest) {
  const contractorId = req.nextUrl.searchParams.get("contractorId")
  if (!contractorId) {
    return NextResponse.json({ error: "contractorId query param required" }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from("contractor_reviews")
    .select("rating")
    .eq("contractor_id", contractorId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const count   = data?.length ?? 0
  const average = count > 0
    ? Math.round((data.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10
    : null

  return NextResponse.json({ count, average })
}
