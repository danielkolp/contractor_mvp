import { type NextRequest, NextResponse } from "next/server"

import { validateGuestToken } from "@/lib/guest-access"
import {
  INPUT_LIMITS,
  enumField,
  guestTokenField,
  inputErrorMessage,
  optionalTextField,
  uuidField,
} from "@/lib/security/input"
import { createServiceClient } from "@/lib/supabase/service"

const ESTIMATE_RESPONSES = ["Accepted", "Declined"] as const
const DECLINE_REASONS = [
  "price_too_high",
  "scope_changed",
  "hired_another",
  "no_longer_needed",
  "timeline",
  "other",
] as const

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  let guestToken: string
  let estimateId: string
  let response: (typeof ESTIMATE_RESPONSES)[number]
  let declineReason: (typeof DECLINE_REASONS)[number] | null = null
  let declineComment: string | null = null

  try {
    const raw = body as {
      guestToken?: unknown
      estimateId?: unknown
      response?: unknown
      declineReason?: unknown
      declineComment?: unknown
    }
    guestToken = guestTokenField(raw.guestToken)
    estimateId = uuidField(raw.estimateId, "estimateId")
    response = enumField(raw.response, "response", ESTIMATE_RESPONSES)
    declineReason = raw.declineReason
      ? enumField(raw.declineReason, "declineReason", DECLINE_REASONS)
      : null
    declineComment = optionalTextField(raw.declineComment, "Decline comment", {
      maxLength: INPUT_LIMITS.notes,
      multiline: true,
    })
  } catch (error) {
    return NextResponse.json({ error: inputErrorMessage(error) }, { status: 400 })
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
  const [estResult, jobResult] = await Promise.all([
    supabase
      .from("estimates")
      .update(
        response === "Declined"
          ? { status: response, decline_reason: declineReason, decline_comment: declineComment }
          : { status: response }
      )
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
