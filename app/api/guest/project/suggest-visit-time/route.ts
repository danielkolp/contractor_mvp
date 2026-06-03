import { type NextRequest, NextResponse } from "next/server"

import { validateGuestToken } from "@/lib/guest-access"
import {
  INPUT_LIMITS,
  guestTokenField,
  inputErrorMessage,
  isoDateTimeField,
  optionalTextField,
} from "@/lib/security/input"
import { createServiceClient } from "@/lib/supabase/service"

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  let guestToken: string
  let proposedAt: string
  let notes: string | null

  try {
    const raw = body as { guestToken?: unknown; proposedAt?: unknown; notes?: unknown }
    guestToken = guestTokenField(raw.guestToken)
    proposedAt = isoDateTimeField(raw.proposedAt, "proposedAt")
    notes = optionalTextField(raw.notes, "Notes", {
      maxLength: INPUT_LIMITS.notes,
      multiline: true,
    })
  } catch (error) {
    return NextResponse.json({ error: inputErrorMessage(error) }, { status: 400 })
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
      visit_client_notes:       notes,
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
