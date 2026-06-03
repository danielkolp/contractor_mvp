import { type NextRequest, NextResponse } from "next/server"

import { validateGuestToken } from "@/lib/guest-access"
import { createServiceClient } from "@/lib/supabase/service"

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { guestToken, proposedAt, notes } = body as {
    guestToken?: string
    proposedAt?: string
    notes?:      string
  }

  if (!guestToken || typeof guestToken !== "string") {
    return NextResponse.json({ error: "guestToken is required" }, { status: 400 })
  }
  if (!proposedAt || typeof proposedAt !== "string") {
    return NextResponse.json({ error: "proposedAt is required" }, { status: 400 })
  }

  const supabase = createServiceClient()
  const access   = await validateGuestToken(supabase, guestToken)
  if (!access) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 })
  }

  const { data: current } = await supabase
    .from("job_requests")
    .select("status")
    .eq("id", access.jobRequestId)
    .single()

  if (current?.status !== "inspection_scheduled") {
    return NextResponse.json({ error: "No site visit is currently pending" }, { status: 409 })
  }

  const { data, error } = await supabase
    .from("job_requests")
    .update({
      visit_client_proposed_at: proposedAt,
      visit_client_notes:       notes?.trim() || null,
    })
    .eq("id", access.jobRequestId)
    .select()
    .single()

  if (error || !data) {
    console.error("[guest/suggest-visit-time] update error:", error)
    return NextResponse.json({ error: "Could not send your suggestion. Please try again." }, { status: 500 })
  }

  return NextResponse.json({ job: data })
}
