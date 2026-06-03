import { type NextRequest, NextResponse } from "next/server"

import { validateGuestToken } from "@/lib/guest-access"
import { guestTokenField, inputErrorMessage } from "@/lib/security/input"
import { createServiceClient } from "@/lib/supabase/service"

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  let guestToken: string
  try {
    guestToken = guestTokenField((body as { guestToken?: unknown }).guestToken)
  } catch (error) {
    return NextResponse.json({ error: inputErrorMessage(error) }, { status: 400 })
  }

  const supabase = createServiceClient()

  const access = await validateGuestToken(supabase, guestToken)
  if (!access) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 })
  }

  const { data: current } = await supabase
    .from("job_requests")
    .select("status")
    .eq("id", access.jobRequestId)
    .single()

  if (current?.status !== "inspection_scheduled") {
    return NextResponse.json({ error: "No inspection is pending confirmation" }, { status: 409 })
  }

  const { data, error } = await supabase
    .from("job_requests")
    .update({ status: "inspection_confirmed" })
    .eq("id", access.jobRequestId)
    .select()
    .single()

  if (error || !data) {
    console.error("[guest/confirm-inspection] update error:", error)
    return NextResponse.json({ error: "Could not confirm inspection. Please try again." }, { status: 500 })
  }

  return NextResponse.json({ job: data })
}
