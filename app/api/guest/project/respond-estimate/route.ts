import { type NextRequest, NextResponse } from "next/server"

import { validateGuestToken } from "@/lib/guest-access"
import { createServiceClient } from "@/lib/supabase/service"

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { guestToken, estimateId, response, declineReason, declineComment } = body as {
    guestToken?:     string
    estimateId?:     string
    response?:       string
    declineReason?:  string
    declineComment?: string
  }

  if (!guestToken || typeof guestToken !== "string") {
    return NextResponse.json({ error: "guestToken is required" }, { status: 400 })
  }
  if (!estimateId || typeof estimateId !== "string") {
    return NextResponse.json({ error: "estimateId is required" }, { status: 400 })
  }
  if (response !== "Accepted" && response !== "Declined") {
    return NextResponse.json({ error: "response must be Accepted or Declined" }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Validate token and get linked job request
  const access = await validateGuestToken(supabase, guestToken)
  if (!access) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 })
  }

  const { jobRequestId } = access

  // Verify estimate belongs to this job request
  const { data: estimate, error: estErr } = await supabase
    .from("estimates")
    .select("id, status, job_request_id")
    .eq("id", estimateId)
    .eq("job_request_id", jobRequestId)
    .maybeSingle()

  if (estErr || !estimate) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 })
  }

  if (
    estimate.status === "Accepted" ||
    estimate.status === "Declined" ||
    estimate.status === "Won" ||
    estimate.status === "Lost"
  ) {
    return NextResponse.json({ error: "Estimate has already been responded to" }, { status: 409 })
  }

  // Update estimate and job request atomically
  const estUpdate: Record<string, unknown> = { status: response }
  if (response === "Declined") {
    estUpdate.decline_reason  = declineReason  ?? null
    estUpdate.decline_comment = declineComment ?? null
  }

  const [estResult, jobResult] = await Promise.all([
    supabase
      .from("estimates")
      .update(estUpdate)
      .eq("id", estimateId)
      .select()
      .single(),
    supabase
      .from("job_requests")
      .update({ status: response === "Accepted" ? "accepted" : "declined" })
      .eq("id", jobRequestId)
      .select()
      .single(),
  ])

  if (estResult.error || jobResult.error) {
    console.error("[guest/respond-estimate] update error:", estResult.error ?? jobResult.error)
    return NextResponse.json(
      { error: "Could not save your response. Please try again." },
      { status: 500 }
    )
  }

  return NextResponse.json({ estimate: estResult.data, job: jobResult.data })
}
