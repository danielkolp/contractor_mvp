import { type NextRequest, NextResponse } from "next/server"

import {
  INPUT_LIMITS,
  emailField,
  inputErrorMessage,
  optionalTextField,
  textField,
  uuidField,
} from "@/lib/security/input"
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

const MAX_INBOUND_WEBHOOK_BYTES = 1_000_000

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

  const contentLength = Number(req.headers.get("content-length") ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_INBOUND_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 })
  }

  // ── 2. Parse the JSON body ───────────────────────────────────────────────────
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const rawPayloadSize = JSON.stringify(raw).length
  if (rawPayloadSize > MAX_INBOUND_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 })
  }

  // ── 3. Normalise the Resend inbound payload ──────────────────────────────────
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
  let eventType: string | undefined
  let data: Record<string, unknown>
  let fromRaw: string
  let toRaw: unknown
  let subjectRaw: string | null
  let textBodyRaw: string | null
  let htmlBodyRaw: string | null
  let providerEmailId: string | null

  try {
    eventType = typeof payload.type === "string"
      ? textField(payload.type, "event type", { maxLength: 64 })
      : undefined
    data = (payload.data ?? payload) as Record<string, unknown>
    fromRaw = textField(data.from ?? data.sender ?? "", "from", {
      required: true,
      maxLength: INPUT_LIMITS.mediumText,
    })
    toRaw = data.to ?? data.recipient
    subjectRaw = optionalTextField(data.subject ?? "", "Subject", {
      maxLength: INPUT_LIMITS.shortText,
    })
    textBodyRaw = optionalTextField(data.text ?? data.plain ?? "", "Text body", {
      maxLength: INPUT_LIMITS.message,
      multiline: true,
    })
    htmlBodyRaw = optionalTextField(data.html ?? "", "HTML body", {
      maxLength: 10_000,
      multiline: true,
    })
    providerEmailId = optionalTextField(
      data.email_id ?? data.messageId ?? data.message_id ?? null,
      "provider email id",
      { maxLength: INPUT_LIMITS.mediumText }
    )
  } catch (error) {
    return NextResponse.json({ error: inputErrorMessage(error) }, { status: 400 })
  }

  if (eventType && eventType !== "email.received" && eventType !== "inbound.email") {
    // Not an inbound email event — acknowledge and ignore.
    return NextResponse.json({ received: true })
  }

  let fromName: string | null
  let fromEmail: string
  let toAddresses: string[]
  try {
    // Normalise "from" — could be "Name <addr>" or just "addr"
    const parsedFrom = parseEmailAddress(fromRaw)
    fromName = parsedFrom.name
    fromEmail = parsedFrom.email

    // Normalise "to" — could be a string or an array
    toAddresses = Array.isArray(toRaw)
      ? (toRaw as unknown[])
          .slice(0, 20)
          .map((a) => parseEmailAddress(String(a)).email)
      : typeof toRaw === "string"
      ? [parseEmailAddress(toRaw).email]
      : []
  } catch (error) {
    return NextResponse.json({ error: inputErrorMessage(error) }, { status: 400 })
  }

  if (toAddresses.length === 0 || !fromEmail) {
    return NextResponse.json({ error: "Malformed payload: missing to/from" }, { status: 400 })
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
      name: optionalTextField(match[1], "sender name", {
        maxLength: INPUT_LIMITS.name,
      }),
      email: emailField(match[2]),
    }
  }
  return { name: null, email: emailField(raw) }
}

function parseThreadKey(toAddress: string): string | null {
  // Extracts the UUID from r_<uuid>@domain
  const match = toAddress.match(/^r_([0-9a-f-]{36})@/)
  if (!match) return null
  try {
    return uuidField(match[1], "thread key")
  } catch (error) {
    console.warn("[inbound] invalid thread key:", inputErrorMessage(error))
    return null
  }
}
