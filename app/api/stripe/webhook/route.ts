import { type NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"

import { inputErrorMessage, uuidField } from "@/lib/security/input"
import { createServiceClient } from "@/lib/supabase/service"
import { stripe } from "@/lib/stripe/server"
import type { Json } from "@/lib/supabase/database.types"
import { normalizePlanStatus, planFromPriceId, type PlanTier } from "@/lib/plans"
import {
  renderPaymentReceivedContractorHtml,
  renderPaymentReceivedClientHtml,
} from "@/lib/email/payment-email-template"

// Next.js App Router: must NOT parse the body before signature verification.
export const dynamic = "force-dynamic"
const MAX_STRIPE_WEBHOOK_BYTES = 1_000_000

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!webhookSecret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET is not set")
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_STRIPE_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 })
  }

  // ── 1. Read raw body and verify signature ────────────────────────────────────
  const rawBody   = await req.text()
  const signature = req.headers.get("stripe-signature")

  if (rawBody.length > MAX_STRIPE_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 })
  }

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    console.error("[stripe/webhook] Signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const service = createServiceClient()

  // ── 2. Idempotency: skip already-processed events ────────────────────────────
  const { data: existing } = await service
    .from("stripe_webhook_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ received: true, skipped: true })
  }

  // ── 3. Record event before processing (best-effort idempotency insert) ────────
  await service.from("stripe_webhook_events").insert({
    id:      event.id,
    type:    event.type,
    payload: JSON.parse(JSON.stringify(event)) as Json,
  })

  // ── 4. Handle event types ─────────────────────────────────────────────────────
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session
        // Subscription Checkout (contractor's own plan) vs. Connect payment.
        if (session.mode === "subscription") {
          await handleSubscriptionCheckout(session, service)
        } else {
          await handleCheckoutSuccess(session, service)
        }
        break
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionChange(event.data.object as Stripe.Subscription, service)
        break

      case "checkout.session.async_payment_failed":
        await handleCheckoutFailed(event.data.object as Stripe.Checkout.Session, service)
        break

      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent, service)
        break

      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent, service)
        break

      case "charge.refunded":
        await handleRefund(event.data.object as Stripe.Charge, service)
        break

      case "charge.dispute.created":
        await handleDispute(event.data.object as Stripe.Dispute, service)
        break

      default:
        // Unknown event type — no action needed, return 200 so Stripe stops retrying.
        break
    }
  } catch (err) {
    console.error(`[stripe/webhook] Error handling ${event.type}:`, err)
    // Still return 200 — we've already inserted the event so duplicates won't
    // re-enter. Let monitoring catch persistent failures.
    return NextResponse.json({ received: true, error: "Handler failed" })
  }

  return NextResponse.json({ received: true })
}

// ── Handlers ──────────────────────────────────────────────────────────────────

type ServiceClient = ReturnType<typeof createServiceClient>

async function handleCheckoutSuccess(
  session: Stripe.Checkout.Session,
  service: ServiceClient
) {
  const estimateId   = safeMetadataUuid(session.metadata?.estimate_id, "estimate_id")
  const sessionId    = session.id
  const isFullPayment = session.metadata?.is_full_payment === "true"

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null

  if (!estimateId) {
    console.warn("[stripe/webhook] checkout.session.completed missing estimate_id metadata")
    return
  }

  const now = new Date().toISOString()

  if (isFullPayment) {
    // Full payment — mark estimate paid
    await service
      .from("estimates")
      .update({
        payment_status:           "paid",
        paid_at:                  now,
        stripe_payment_intent_id: paymentIntentId,
      })
      .eq("id", estimateId)
  } else {
    // Deposit only — mark deposit paid, leave room for remaining balance
    await service
      .from("estimates")
      .update({
        payment_status:              "deposit_paid",
        deposit_paid_at:             now,
        deposit_payment_intent_id:   paymentIntentId,
        stripe_payment_intent_id:    paymentIntentId,
      })
      .eq("id", estimateId)
  }

  // Update payment record
  await service
    .from("payments")
    .update({
      status:                   isFullPayment ? "paid" : "deposit_paid",
      paid_at:                  now,
      stripe_payment_intent_id: paymentIntentId,
    })
    .eq("stripe_checkout_session_id", sessionId)

  // Send email notifications if Resend is configured
  await sendPaymentEmails(estimateId, service)
}

// ── Subscription (contractor's own plan) ────────────────────────────────────

async function handleSubscriptionCheckout(
  session: Stripe.Checkout.Session,
  service: ServiceClient
) {
  // The subscription.created/updated event carries the full picture; here we just
  // make sure we have the subscription and apply it (covers races where the
  // checkout.session.completed lands first).
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription as Stripe.Subscription | null)?.id ?? null
  if (!subscriptionId) return

  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  await handleSubscriptionChange(subscription, service)
}

async function handleSubscriptionChange(
  subscription: Stripe.Subscription,
  service: ServiceClient
) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null

  // Resolve which plan/interval this subscription's price maps to.
  const priceId = subscription.items.data[0]?.price?.id ?? null
  const mapped = priceId ? planFromPriceId(priceId) : null

  const canceled = subscription.status === "canceled"
  // Note: past_due is stored as-is and still counts as an active Pro plan
  // (see isPlanActive in lib/plans.ts) — the contractor keeps access during
  // Stripe's dunning window; canceled/unpaid downgrades to Free.
  const status = normalizePlanStatus(subscription.status)

  // A canceled/ended subscription drops the contractor back to Free. An
  // unrecognized price also maps to Free — log it so a misconfigured
  // STRIPE_PRICE_PRO_MONTH doesn't silently downgrade paying users.
  if (!canceled && !mapped) {
    console.warn(
      `[stripe/webhook] Subscription ${subscription.id} has unmapped price ${priceId}; treating as Free. Check STRIPE_PRICE_PRO_MONTH.`
    )
  }
  const plan: PlanTier = canceled ? "free" : mapped?.plan ?? "free"
  const interval = canceled ? null : mapped?.interval ?? null

  const periodEnd = subscription.items.data[0]?.current_period_end ?? null

  // Find the profile: prefer metadata, fall back to customer id.
  const profileUserId = subscription.metadata?.profile_user_id ?? null

  const update = {
    plan,
    plan_status: status,
    plan_interval: interval,
    stripe_subscription_id: canceled ? null : subscription.id,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    // Keep the customer id in sync (covers profiles created before checkout
    // saved it, or restored from a backup).
    ...(customerId ? { stripe_customer_id: customerId } : {}),
  }

  let query = service.from("profiles").update(update)
  if (profileUserId) {
    query = query.eq("user_id", profileUserId)
  } else if (customerId) {
    query = query.eq("stripe_customer_id", customerId)
  } else {
    console.warn("[stripe/webhook] subscription change with no profile reference")
    return
  }

  const { error } = await query
  if (error) {
    console.error("[stripe/webhook] Failed to update plan:", error)
  }
}

async function handleCheckoutFailed(
  session: Stripe.Checkout.Session,
  service: ServiceClient
) {
  const estimateId  = safeMetadataUuid(session.metadata?.estimate_id, "estimate_id")
  const paymentType = session.metadata?.payment_type
  if (!estimateId) return

  // Balance payment failed → restore deposit_paid so client can retry
  // Deposit payment failed → mark as failed
  const estimateRevertStatus = paymentType === "balance" ? "deposit_paid" : "failed"

  await service
    .from("estimates")
    .update({ payment_status: estimateRevertStatus })
    .eq("id", estimateId)

  await service
    .from("payments")
    .update({ status: "failed" })
    .eq("stripe_checkout_session_id", session.id)
}

async function handlePaymentIntentSucceeded(
  intent: Stripe.PaymentIntent,
  service: ServiceClient
) {
  const estimateId   = safeMetadataUuid(intent.metadata?.estimate_id, "estimate_id")
  const isFullPayment = intent.metadata?.is_full_payment === "true"
  if (!estimateId) return

  const now = new Date().toISOString()

  if (isFullPayment) {
    await service
      .from("estimates")
      .update({
        payment_status:           "paid",
        paid_at:                  now,
        stripe_payment_intent_id: intent.id,
      })
      .eq("id", estimateId)
      .not("payment_status", "in", '("paid")')
  } else {
    await service
      .from("estimates")
      .update({
        payment_status:            "deposit_paid",
        deposit_paid_at:           now,
        deposit_payment_intent_id: intent.id,
        stripe_payment_intent_id:  intent.id,
      })
      .eq("id", estimateId)
      .not("payment_status", "in", '("paid","deposit_paid")')
  }

  await service
    .from("payments")
    .update({
      status:                   isFullPayment ? "paid" : "deposit_paid",
      paid_at:                  now,
      stripe_payment_intent_id: intent.id,
    })
    .eq("stripe_payment_intent_id", intent.id)
}

async function handlePaymentIntentFailed(
  intent: Stripe.PaymentIntent,
  service: ServiceClient
) {
  const estimateId  = safeMetadataUuid(intent.metadata?.estimate_id, "estimate_id")
  const paymentType = intent.metadata?.payment_type
  if (!estimateId) return

  // Balance payment failed → restore deposit_paid; deposit failed → mark failed
  const revertStatus = paymentType === "balance" ? "deposit_paid" : "failed"

  await service
    .from("estimates")
    .update({ payment_status: revertStatus })
    .eq("id", estimateId)
    .not("payment_status", "in", '("paid")')

  await service
    .from("payments")
    .update({ status: "failed" })
    .eq("stripe_payment_intent_id", intent.id)
}

async function handleRefund(charge: Stripe.Charge, service: ServiceClient) {
  const estimateId = safeMetadataUuid(charge.metadata?.estimate_id, "estimate_id")
  if (!estimateId) return

  // TODO: implement full refund workflow (notify contractor, update job status)
  await service
    .from("estimates")
    .update({ payment_status: "refunded" })
    .eq("id", estimateId)

  await service
    .from("payments")
    .update({ status: "refunded" })
    .eq("estimate_id", estimateId)
}

async function handleDispute(dispute: Stripe.Dispute, service: ServiceClient) {
  // Disputes don't carry estimate metadata directly — look up via payment intent.
  const paymentIntentId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : (dispute.payment_intent as Stripe.PaymentIntent | null)?.id ?? null

  if (!paymentIntentId) return

  // TODO: implement full dispute management workflow
  await service
    .from("payments")
    .update({ status: "disputed" })
    .eq("stripe_payment_intent_id", paymentIntentId)
}

// ── Email notifications ───────────────────────────────────────────────────────

function safeMetadataUuid(value: string | undefined, label: string) {
  if (!value) return null
  try {
    return uuidField(value, label)
  } catch (error) {
    console.warn(`[stripe/webhook] Invalid ${label}:`, inputErrorMessage(error))
    return null
  }
}

async function sendPaymentEmails(estimateId: string, service: ServiceClient) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return

  const { data: estimate } = await service
    .from("estimates")
    .select("*, profiles!estimates_user_id_fkey(company_name, owner_name)")
    .eq("id", estimateId)
    .single()

  if (!estimate) return

  const contractorAmountCents = estimate.contractor_amount_cents ?? 0
  const clientTotalCents      = estimate.client_total_cents      ?? 0

  const { Resend } = await import("resend")
  const resend     = new Resend(process.env.RESEND_API_KEY)

  // Email to contractor
  const contractorProfile = estimate.profiles as { company_name?: string; owner_name?: string } | null
  const contractorUser = await service.auth.admin.getUserById(estimate.user_id)
  const contractorEmail = contractorUser.data?.user?.email

  if (contractorEmail) {
    const estimateNumber = estimate.estimate_number
    try {
      await resend.emails.send({
        from:    process.env.RESEND_FROM_EMAIL,
        to:      contractorEmail,
        subject: `Payment received for Estimate ${estimateNumber}`,
        html:    renderPaymentReceivedContractorHtml({
          contractorName:        contractorProfile?.owner_name ?? contractorProfile?.company_name ?? "Contractor",
          estimateNumber,
          clientTotalCents,
          contractorAmountCents,
        }),
      })
    } catch (err) {
      console.error("[stripe/webhook] Contractor email failed:", err)
    }
  }

  // Email to client (if estimate is linked to a job_request with a client email)
  if (estimate.job_request_id) {
    const { data: jobRequest } = await service
      .from("job_requests")
      .select("client_email, client_name")
      .eq("id", estimate.job_request_id)
      .single()

    if (jobRequest?.client_email) {
      try {
        await resend.emails.send({
          from:    process.env.RESEND_FROM_EMAIL,
          to:      jobRequest.client_email,
          subject: "Payment receipt for your project",
          html:    renderPaymentReceivedClientHtml({
            clientName:       jobRequest.client_name ?? "Client",
            estimateNumber:   estimate.estimate_number,
            clientTotalCents,
          }),
        })
      } catch (err) {
        console.error("[stripe/webhook] Client email failed:", err)
      }
    }
  }
}
