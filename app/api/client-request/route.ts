import { type NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"

import {
  renderClientIntakeEmailHtml,
  renderClientIntakeEmailText,
} from "@/lib/email/client-intake-template"
import { createServiceClient } from "@/lib/supabase/service"

// Reuse across requests when env is present.
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

function getAppUrl(req: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  const url = new URL(req.url)
  return `${url.protocol}//${url.host}`
}

export async function POST(req: NextRequest) {
  // ── Parse body ──────────────────────────────────────────────────────────────
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const body         = raw as Record<string, unknown>
  const name         = typeof body.name         === "string" ? body.name.trim()         : ""
  const email        = typeof body.email        === "string" ? body.email.trim().toLowerCase() : ""
  const phone        = typeof body.phone        === "string" && body.phone.trim() ? body.phone.trim() : null
  const title        = typeof body.title        === "string" ? body.title.trim()        : ""
  const description  = typeof body.description  === "string" ? body.description.trim()  : ""
  const location     = typeof body.location     === "string" ? body.location.trim()     : ""
  const contractorId = typeof body.contractor_id === "string" ? body.contractor_id.trim() : ""
  const photoNotes   = typeof body.photo_notes  === "string" && body.photo_notes.trim()
    ? body.photo_notes.trim()
    : null

  if (!name)         return NextResponse.json({ error: "Full name is required" },       { status: 400 })
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
                     return NextResponse.json({ error: "Valid email is required" },      { status: 400 })
  if (!title)        return NextResponse.json({ error: "Project type is required" },     { status: 400 })
  if (!description)  return NextResponse.json({ error: "Description is required" },     { status: 400 })
  if (!contractorId) return NextResponse.json({ error: "Contractor link is invalid" },  { status: 400 })

  const supabase = createServiceClient()
  const appUrl   = getAppUrl(req)

  // ── 1. Verify contractor exists ─────────────────────────────────────────────
  const { data: contractorProfile } = await supabase
    .from("profiles")
    .select("user_id, owner_name, company_name")
    .eq("user_id", contractorId)
    .eq("role", "contractor")
    .maybeSingle()

  if (!contractorProfile) {
    return NextResponse.json({ error: "Contractor not found" }, { status: 404 })
  }

  const contractorName =
    contractorProfile.company_name ||
    contractorProfile.owner_name ||
    "Your contractor"

  // ── 2. Find or create client auth account ───────────────────────────────────
  let clientUserId: string

  const { data: existingId } = await supabase.rpc("get_auth_user_id_by_email", {
    lookup_email: email,
  }) as { data: string | null }

  if (existingId) {
    clientUserId = existingId

    // Refresh profile name and phone so the portal shows the right name.
    await supabase
      .from("profiles")
      .update({ owner_name: name, ...(phone ? { phone } : {}), role: "client" })
      .eq("user_id", clientUserId)
  } else {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        role: "client",
        owner_name: name,
        ...(phone ? { phone } : {}),
      },
    })

    if (createError || !created.user) {
      console.error("[client-request] createUser error:", createError)
      return NextResponse.json(
        { error: "Could not create your account. Please try again." },
        { status: 500 }
      )
    }

    clientUserId = created.user.id

    // The DB trigger creates the profile row; update it with supplied details.
    await supabase
      .from("profiles")
      .update({ owner_name: name, ...(phone ? { phone } : {}), role: "client" })
      .eq("user_id", clientUserId)
  }

  // ── 3. Create job request ───────────────────────────────────────────────────
  // client_phone is a new column added in the v2 migration; cast to bypass stale types.
  const jobPayload = {
    client_id:          clientUserId,
    contractor_id:      contractorId,
    client_name:        name,
    client_email:       email,
    client_phone:       phone,
    title,
    description,
    photo_notes:        photoNotes,
    service_area:       location || "Not specified",
    urgency:            "flexible" as const,
    contact_preference: "Email",
    status:             "new" as const,
  } as Parameters<ReturnType<typeof supabase.from<"job_requests">>["insert"]>[0]

  const { data: jobRequest, error: jobError } = await supabase
    .from("job_requests")
    .insert(jobPayload)
    .select()
    .single()

  if (jobError || !jobRequest) {
    console.error("[client-request] job insert error:", jobError)
    return NextResponse.json(
      { error: "Could not submit your request. Please try again." },
      { status: 500 }
    )
  }

  // ── 4. Generate magic login link ────────────────────────────────────────────
  const redirectTo = `${appUrl}/auth/callback?next=/client/portal/${jobRequest.id}`

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  })

  if (linkError) {
    console.warn("[client-request] generateLink error:", linkError)
  }

  // Fallback to login page if magic link generation failed.
  const magicLink = linkData?.properties?.action_link ?? `${appUrl}/login`

  // ── 5. Send confirmation email ──────────────────────────────────────────────
  let emailSent = false

  if (resend && process.env.RESEND_FROM_EMAIL) {
    const emailArgs = {
      clientName: name,
      contractorName,
      projectTitle: title,
      magicLink,
    }

    const { error: sendError } = await resend.emails.send({
      from:    process.env.RESEND_FROM_EMAIL,
      to:      email,
      subject: `Your request has been submitted to ${contractorName}`,
      html:    renderClientIntakeEmailHtml(emailArgs),
      text:    renderClientIntakeEmailText(emailArgs),
    })

    if (sendError) {
      console.warn("[client-request] email send error:", sendError)
    } else {
      emailSent = true
    }
  }

  return NextResponse.json({
    success:        true,
    jobRequestId:   jobRequest.id,
    contractorName,
    emailSent,
  })
}
