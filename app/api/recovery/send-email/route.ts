import { type NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"

import { createClient } from "@/lib/supabase/server"
import {
  renderRecoveryEmailHtml,
  renderRecoveryEmailText,
} from "@/lib/email/recovery-email-template"

// Instantiated once at module scope so the SDK is reused across requests.
// Will be null when RESEND_API_KEY is absent — callers receive a 503.
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

export async function POST(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // ── 2. Parse + validate body ───────────────────────────────────────────────
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const body = raw as Record<string, unknown>

  const recovery_item_id = body.recovery_item_id
  const subject         = body.subject
  const messageBody     = body.body
  const check_back_date = body.check_back_date

  if (!recovery_item_id || typeof recovery_item_id !== "string") {
    return NextResponse.json({ error: "recovery_item_id is required" }, { status: 400 })
  }
  if (!subject || typeof subject !== "string" || subject.trim().length === 0) {
    return NextResponse.json({ error: "subject is required" }, { status: 400 })
  }
  if (!messageBody || typeof messageBody !== "string" || messageBody.trim().length === 0) {
    return NextResponse.json({ error: "message body is required" }, { status: 400 })
  }
  if (
    !check_back_date ||
    typeof check_back_date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(check_back_date)
  ) {
    return NextResponse.json(
      { error: "check_back_date must be a date string (YYYY-MM-DD)" },
      { status: 400 }
    )
  }

  // ── 3. Fetch recovery item + contractor profile in parallel ────────────────
  // Never trust client-supplied user_id — all lookups are scoped to auth user.
  const [itemResult, profileResult] = await Promise.all([
    supabase
      .from("recovery_items")
      .select("*")
      .eq("id", recovery_item_id)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("profiles")
      .select("company_name, owner_name, phone, website")
      .eq("user_id", user.id)
      .maybeSingle(),
  ])

  if (itemResult.error || !itemResult.data) {
    return NextResponse.json({ error: "Recovery item not found" }, { status: 404 })
  }

  const item    = itemResult.data
  const profile = profileResult.data // may be null if profile not yet saved

  if (!item.client_email) {
    return NextResponse.json(
      { error: "This recovery item has no client email address" },
      { status: 400 }
    )
  }

  // ── 4. Email provider check ────────────────────────────────────────────────
  if (!resend || !process.env.RESEND_FROM_EMAIL) {
    return NextResponse.json(
      {
        error:
          "Email sending is not configured. Add RESEND_API_KEY and RESEND_FROM_EMAIL to your environment.",
      },
      { status: 503 }
    )
  }

  const trimmedSubject = subject.trim()
  const trimmedBody    = messageBody.trim()
  const today          = new Date().toISOString().slice(0, 10)

  // Contractor identity — fall back gracefully when profile is incomplete
  const contractorName  = profile?.owner_name   ?? user.email ?? "Your contractor"
  const companyName     = profile?.company_name  ?? contractorName
  const contractorEmail = user.email ?? null

  // ── 5. Inbound reply address ───────────────────────────────────────────────
  // Pre-generate the event UUID so we can embed it in the reply-to address and
  // insert everything in a single DB round-trip.
  const eventId      = crypto.randomUUID()
  const inboundDomain = process.env.RESEND_INBOUND_DOMAIN?.trim() || null

  // Format: r_<event_uuid>@<inbound_domain>
  // Simple to parse, contains only a UUID (no sensitive data).
  const inboundReplyToEmail = inboundDomain
    ? `r_${eventId}@${inboundDomain}`
    : null

  // The Reply-To header: prefer inbound address if configured, else contractor email.
  const replyToAddress = inboundReplyToEmail ?? contractorEmail ?? null

  // ── 6. Render email content ────────────────────────────────────────────────
  const templateArgs = {
    messageBody:         trimmedBody,
    subject:             trimmedSubject,
    contractorName,
    companyName,
    contractorEmail,
    contractorPhone:      profile?.phone    ?? null,
    contractorWebsite:    profile?.website  ?? null,
    inboundReplyToEmail,
  }

  const htmlContent = renderRecoveryEmailHtml(templateArgs)
  const textContent = renderRecoveryEmailText(templateArgs)

  // ── 7. Send via Resend ─────────────────────────────────────────────────────
  let providerMessageId: string | null = null
  let sendErrorMessage:  string | null = null

  try {
    const sendPayload: Parameters<typeof resend.emails.send>[0] = {
      from:    process.env.RESEND_FROM_EMAIL,
      to:      item.client_email,
      subject: trimmedSubject,
      html:    htmlContent,
      text:    textContent,
    }

    if (replyToAddress) {
      sendPayload.replyTo = replyToAddress
    }

    const { data: sendData, error: resendError } = await resend.emails.send(sendPayload)

    if (resendError) {
      sendErrorMessage = resendError.message
    } else {
      providerMessageId = sendData?.id ?? null
    }
  } catch (err) {
    sendErrorMessage = err instanceof Error ? err.message : "Unknown send error"
  }

  // ── 8. Log the event — always, even on failure ─────────────────────────────
  // Use the pre-generated eventId so reply_to_email is stored in one insert.
  const { error: insertError } = await supabase
    .from("recovery_email_events")
    .insert({
      id:                  eventId,
      user_id:             user.id,
      recovery_item_id,
      to_email:            item.client_email,
      subject:             trimmedSubject,
      body:                trimmedBody,
      provider:            "resend",
      provider_message_id: sendErrorMessage ? null : providerMessageId,
      status:              sendErrorMessage ? "failed" : "sent",
      error_message:       sendErrorMessage,
      reply_to_email:      sendErrorMessage ? null : inboundReplyToEmail,
      inbound_thread_key:  (sendErrorMessage || !inboundReplyToEmail) ? null : eventId,
    })

  if (insertError) {
    console.error("[send-email] recovery_email_events insert failed:", insertError)
  }

  // ── 9. Return error without updating item if send failed ───────────────────
  if (sendErrorMessage) {
    return NextResponse.json({ error: sendErrorMessage }, { status: 502 })
  }

  // ── 10. Update recovery item only after confirmed send ─────────────────────
  const { data: updatedItem, error: updateError } = await supabase
    .from("recovery_items")
    .update({
      status:         "sent",
      contacted_date: today,
      check_back_date,
      message_body:   trimmedBody,
    })
    .eq("id", recovery_item_id)
    .eq("user_id", user.id)
    .select()
    .single()

  if (updateError || !updatedItem) {
    return NextResponse.json({
      success:             true,
      provider_message_id: providerMessageId,
      warning:
        "Email sent, but failed to update item status: " +
        (updateError?.message ?? "unknown error"),
    })
  }

  return NextResponse.json({
    success:             true,
    provider_message_id: providerMessageId,
    item:                updatedItem,
  })
}
