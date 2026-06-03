import { type NextRequest, NextResponse } from "next/server"

import { claimGuestAccess } from "@/lib/guest-access"
import { guestTokenField, inputErrorMessage } from "@/lib/security/input"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

export async function POST(req: NextRequest) {
  // Must be authenticated to claim
  const supabaseUser = await createClient()
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  let claimToken: string
  try {
    claimToken = guestTokenField((body as { claimToken?: unknown }).claimToken, "claimToken")
  } catch (error) {
    return NextResponse.json({ error: inputErrorMessage(error) }, { status: 400 })
  }

  const supabase = createServiceClient()
  const result   = await claimGuestAccess(supabase, claimToken, user.id)

  if (!result) {
    return NextResponse.json({ error: "Token not found or already claimed" }, { status: 404 })
  }

  return NextResponse.json({ jobRequestId: result.jobRequestId })
}
