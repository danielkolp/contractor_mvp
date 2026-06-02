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

  const { guestToken, response } = body as { guestToken?: string; response?: string }

  if (!guestToken || typeof guestToken !== "string") {
    return NextResponse.json({ error: "guestToken is required" }, { status: 400 })
  }
  if (!response || typeof response !== "string" || !response.trim()) {
    return NextResponse.json({ error: "response is required" }, { status: 400 })
  }

  const supabase = createServiceClient()

  const access = await validateGuestToken(supabase, guestToken)
  if (!access) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 })
  }

  const { data, error } = await supabase
    .from("job_requests")
    .update({ more_details_response: response.trim() } as never)
    .eq("id", access.jobRequestId)
    .select()
    .single()

  if (error || !data) {
    console.error("[guest/respond-details] update error:", error)
    return NextResponse.json({ error: "Could not save your response. Please try again." }, { status: 500 })
  }

  return NextResponse.json({ job: data })
}
