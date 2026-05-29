import { type NextRequest, NextResponse } from "next/server"

import { createServiceClient } from "@/lib/supabase/service"

// ── Resend inbound email webhook ───────────────────────────────────────────────
//
// Resend POSTs this endpoint whenever a client replies to a recovery follow-up
// email sent with an inbound Reply-To address (r_<event_id>@<RESEND_INBOUND_DOMAIN>).
//
// Setup:
//   1. Configure a Receiving domain in Resend dashboard → Receiving.
//   2. Add a webhook with event type "email.received" pointing to this route.
//   3. Set RESEND_INBOUND_DOMAIN and RESEND_WEBHOOK_SECRET in your environment.
//
// Security: this endpoint requires the shared secret from RESEND_WEBHOOK_SECRET
// either as a `secret` query param or the `x-resend-webhook-secret` header.
// Without the secret the request is rejected with 401.
//
// Idempotency: duplicate deliveries for the same provider_email_id are silently
// ignored (unique index on recovery_email_replies.provider_email_id).

export async function POST(req: NextRequest) {
  // ── 1. Authenticate the webhook ─────────────────────────────────────────────
  const expectedSecret = process.env.RESEND_WEBHOOK_SECRET?.trim()

  if (expectedSecret) {
    const headerSecret = req.headers.get("x-resend-webhook-secret")
    const querySecret  = req.nextUrl.searchParams.get("secret")
    const provided     = headerSecret ?? querySecret

    if (provided !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }
  // If RESEND_WEBHOOK_SECRET is not set we still process the request so the
  // webhook works during initial setup, but operators should always set the secret.

  // ── 2. Parse the JSON body ───────────────────────────────────────────────────
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // ── 3. Normalise the Resend inbound payload ──────────────────────────────────
  console.log("[inbound] raw payload:", JSON.stringify(raw, null, 2))
  // Resend inbound webhook payload:
  // {
  //   "type": "email.received",
  //   "data": {
  //     "email_id": "...",          // or "messageId" depending on version
  //     "from": "Name <addr@x.com>",
  //     "to": ["r_<uuid>@domain"],
  //     "subject": "Re: ...",
  //     "text": "...",
  //     "html": "...",
  //     "headers": { ... },
  //     "attachments": []
  //   }
  // }
  const payload = raw as Record<string, unknown>

  // Accept both wrapped {"type":"email.received","data":{...}} and flat form.
  const eventType = payload.type as string | undefined
  const data      = (payload.data ?? payload) as Record<string, unknown>

  if (eventType && eventType !== "email.received" && eventType !== "inbound.email") {
    // Not an inbound email event — acknowledge and ignore.
    return NextResponse.json({ received: true })
  }

  // Extract fields from the Resend inbound payload.
  const fromRaw       = (data.from  ?? data.sender ?? "") as string
  const toRaw         = data.to ?? data.recipient
  const subjectRaw    = (data.subject ?? "") as string
  const textBodyRaw   = (data.text ?? data.plain ?? "") as string
  const htmlBodyRaw   = (data.html ?? "") as string
  // Resend uses email_id or messageId depending on the SDK version.
  const providerEmailId = (data.email_id ?? data.messageId ?? data.message_id ?? null) as string | null

  // Normalise "from" — could be "Name <addr>" or just "addr"
  const { name: fromName, email: fromEmail } = parseEmailAddress(fromRaw)

  // Normalise "to" — could be a string or an array
  const toAddresses: string[] = Array.isArray(toRaw)
    ? (toRaw as unknown[]).map((a) => String(a))
    : typeof toRaw === "string"
    ? [toRaw]
    : []

  if (toAddresses.length === 0 || !fromEmail) {
    // Malformed payload — acknowledge without error to prevent retries.
    console.warn("[inbound] malformed payload: missing to/from", { fromRaw, toRaw })
    return NextResponse.json({ received: true })
  }

  // ── 4. Match to a recovery email event ──────────────────────────────────────
  // Try each to-address in case of CC/BCC routing.
  const supabase = createServiceClient()

  let matchedEvent: {
    id: string
    user_id: string
    recovery_item_id: string
  } | null = null

  for (const toAddr of toAddresses) {
    const normalised = toAddr.toLowerCase().trim()

    const { data: event, error } = await supabase
      .from("recovery_email_events")
      .select("id, user_id, recovery_item_id")
      .eq("reply_to_email", normalised)
      .eq("status", "sent")
      .maybeSingle()

    if (error) {
      console.error("[inbound] event lookup error:", error)
      continue
    }

    if (event) {
      matchedEvent = event
      break
    }

    // Fallback: parse the event UUID from r_<uuid>@domain format.
    const threadKey = parseThreadKey(normalised)
    if (threadKey) {
      const { data: eventByKey, error: keyError } = await supabase
        .from("recovery_email_events")
        .select("id, user_id, recovery_item_id")
        .eq("inbound_thread_key", threadKey)
        .eq("status", "sent")
        .maybeSingle()

      if (keyError) {
        console.error("[inbound] thread key lookup error:", keyError)
        continue
      }

      if (eventByKey) {
        matchedEvent = eventByKey
        break
      }
    }
  }

  if (!matchedEvent) {
    // No matching recovery event — could be an unrelated email to the domain.
    // Return 200 to prevent Resend from retrying.
    return NextResponse.json({ received: true, matched: false })
  }

  // ── 5. Idempotency check ─────────────────────────────────────────────────────
  // The unique index on (provider, provider_email_id) handles true duplicates,
  // but we check first to avoid a DB error on repeated delivery.
  if (providerEmailId) {
    const { data: existing } = await supabase
      .from("recovery_email_replies")
      .select("id")
      .eq("provider", "resend")
      .eq("provider_email_id", providerEmailId)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ received: true, duplicate: true })
    }
  }

  // ── 6. Insert the reply ──────────────────────────────────────────────────────
  const { error: insertError } = await supabase
    .from("recovery_email_replies")
    .insert({
      user_id:                 matchedEvent.user_id,
      recovery_item_id:        matchedEvent.recovery_item_id,
      recovery_email_event_id: matchedEvent.id,
      from_email:              fromEmail,
      from_name:               fromName ?? null,
      to_email:                toAddresses[0] ?? "",
      subject:                 subjectRaw || null,
      text_body:               textBodyRaw || null,
      html_body:               htmlBodyRaw || null,
      provider:                "resend",
      provider_email_id:       providerEmailId,
      raw_payload:             payload as unknown as import("@/lib/supabase/database.types").Json,
    })

  if (insertError) {
    // Unique violation (duplicate) is not a hard error.
    if (insertError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true })
    }
    console.error("[inbound] insert reply failed:", insertError)
    return NextResponse.json({ error: "Failed to save reply" }, { status: 500 })
  }

  return NextResponse.json({ received: true, matched: true })
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseEmailAddress(raw: string): { name: string | null; email: string } {
  // Handles "Name <addr@example.com>" and plain "addr@example.com"
  const match = raw.match(/^(.*?)\s*<([^>]+)>\s*$/)
  if (match) {
    return {
      name:  match[1].trim() || null,
      email: match[2].trim().toLowerCase(),
    }
  }
  return { name: null, email: raw.trim().toLowerCase() }
}

function parseThreadKey(toAddress: string): string | null {
  // Extracts the UUID from r_<uuid>@domain
  const match = toAddress.match(/^r_([0-9a-f-]{36})@/)
  return match ? match[1] : null
}
