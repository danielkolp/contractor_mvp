import { type NextRequest, NextResponse } from "next/server"

import { validateGuestToken } from "@/lib/guest-access"
import {
  INPUT_LIMITS,
  guestTokenField,
  inputErrorMessage,
  textField,
} from "@/lib/security/input"
import { createServiceClient } from "@/lib/supabase/service"

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  let guestToken: string
  let response: string
  try {
    const raw = body as { guestToken?: unknown; response?: unknown }
    guestToken = guestTokenField(raw.guestToken)
    response = textField(raw.response, "Response", {
      required: true,
      maxLength: INPUT_LIMITS.description,
      multiline: true,
    })
  } catch (error) {
    return NextResponse.json({ error: inputErrorMessage(error) }, { status: 400 })
  }

  const supabase = createServiceClient()

  const access = await validateGuestToken(supabase, guestToken)
  if (!access) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 })
  }

  const { data, error } = await supabase
    .from("job_requests")
    .update({ more_details_response: response })
    .eq("id", access.jobRequestId)
    .select()
    .single()

  if (error || !data) {
    console.error("[guest/respond-details] update error:", error)
    return NextResponse.json({ error: "Could not save your response. Please try again." }, { status: 500 })
  }

  return NextResponse.json({ job: data })
}
