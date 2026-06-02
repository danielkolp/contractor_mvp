/**
 * Full end-to-end Stripe checkout flow test
 * Uses a temporarily "activated" contractor profile to test checkout creation
 */
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL   = "https://lgjsatykcfkwatczyvla.supabase.co"
const ANON_KEY       = "sb_publishable_HbywljquenZqY2F3G_zJ9Q_8W1g9HmG"
const SVC_KEY        = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnanNhdHlrY2Zrd2F0Y3p5dmxhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgxODczNiwiZXhwIjoyMDk1Mzk0NzM2fQ.go3KUNAL3OjcyvU6wgdtbojlYWJ4gw2ytZtyoeHRZqA"
const APP_URL        = "http://localhost:3000"
const CONTRACTOR_ID  = "fe5124bc-0757-470c-85b9-ec64c1ff6ca0"
const ESTIMATE_ID    = "fe72f1de-d3ca-41c7-84bc-67e27025ac58"  // EST-25562, Won, $1150 total

const client = createClient(SUPABASE_URL, ANON_KEY)
const svc    = createClient(SUPABASE_URL, SVC_KEY, { auth: { persistSession: false } })

const pass = [], fail = [], warn = []
function log(status, name, detail = "") {
  const icon = { PASS: "✅", FAIL: "❌", WARN: "⚠️" }[status]
  console.log(`${icon} [${status}] ${name}${detail ? ": " + detail : ""}`)
  ;({ PASS: pass, FAIL: fail, WARN: warn }[status]).push({ name, detail })
}

const { data: auth } = await client.auth.signInWithPassword({
  email: "danielkolpakov00@gmail.com", password: "ChichenItza999458"
})
const session = auth.session
const cookieKey = "sb-lgjsatykcfkwatczyvla-auth-token"
const cookieVal = encodeURIComponent(JSON.stringify({
  access_token: session.access_token, token_type: session.token_type,
  expires_in: session.expires_in, expires_at: session.expires_at,
  refresh_token: session.refresh_token, user: session.user,
}))
const authCookie = `${cookieKey}=${cookieVal}`

async function post(path, body, cookie = "") {
  const res = await fetch(`${APP_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  })
  let data; try { data = await res.json() } catch { data = null }
  return { status: res.status, data }
}

// ── Test 1: Checkout with charges_enabled=false (current real state) ──────────

console.log("\n═══ STEP 1: Checkout with inactive Stripe account ═══")
const r1 = await post("/api/payments/create-checkout-session", { estimateId: ESTIMATE_ID }, authCookie)
console.log(`  charges_enabled=false: ${r1.status} ${JSON.stringify(r1.data)}`)
if (r1.status === 422 && r1.data?.error?.includes("not fully active")) {
  log("PASS", "Checkout with inactive Stripe account → 422 'not fully active'")
} else {
  log("FAIL", "Checkout inactive contractor", `got ${r1.status}: ${JSON.stringify(r1.data)}`)
}

// ── Test 2: Temporarily activate contractor, create checkout, then reset ──────

console.log("\n═══ STEP 2: Temporarily activate contractor for checkout test ═══")
// Temporarily set charges_enabled and payouts_enabled = true
const { error: activateErr } = await svc
  .from("profiles")
  .update({ stripe_charges_enabled: true, stripe_payouts_enabled: true, stripe_onboarding_complete: true })
  .eq("user_id", CONTRACTOR_ID)

if (activateErr) {
  log("FAIL", "Could not activate contractor for test", activateErr.message)
} else {
  log("PASS", "Temporarily activated contractor Stripe status in DB")

  // Reset estimate payment_status to unpaid before test
  await client.from("estimates").update({ payment_status: "unpaid", stripe_checkout_session_id: null }).eq("id", ESTIMATE_ID)

  // Create checkout session
  const r2 = await post("/api/payments/create-checkout-session", { estimateId: ESTIMATE_ID }, authCookie)
  console.log(`  checkout creation: ${r2.status} ${JSON.stringify(r2.data)?.substring(0, 150)}`)

  if (r2.status === 200 && r2.data?.url) {
    log("PASS", "Checkout session created with active Stripe account → 200 with URL")
    console.log(`  ↳ Stripe URL: ${r2.data.url.substring(0, 80)}...`)

    // Verify DB was updated
    const { data: updatedEst } = await client
      .from("estimates")
      .select("payment_status,stripe_checkout_session_id")
      .eq("id", ESTIMATE_ID)
      .single()
    console.log(`  estimate after checkout: payment_status=${updatedEst?.payment_status}, session_id=${updatedEst?.stripe_checkout_session_id}`)

    if (updatedEst?.payment_status === "checkout_created") {
      log("PASS", "estimates.payment_status updated to 'checkout_created' after session creation")
    } else if (updatedEst?.payment_status === "unpaid") {
      log("FAIL", "BUG-01: estimates.payment_status NOT updated (still 'unpaid') — service_role GRANT missing",
        "Run: GRANT SELECT, UPDATE ON public.estimates TO service_role; in Supabase SQL Editor")
    } else {
      log("WARN", `estimates.payment_status = ${updatedEst?.payment_status}`)
    }

    // Check payments table
    const { data: paymentRow } = await svc
      .from("payments")
      .select("id,status,stripe_checkout_session_id,contractor_amount_cents,platform_fee_cents,client_total_cents")
      .eq("estimate_id", ESTIMATE_ID)
      .limit(1)
      .maybeSingle()
    console.log(`  payments row: ${JSON.stringify(paymentRow)}`)
    if (paymentRow?.status === "pending") {
      log("PASS", "payments row created with status='pending'")
    } else if (paymentRow) {
      log("WARN", `payments row exists but status=${paymentRow.status}`)
    } else {
      log("FAIL", "No payments row created")
    }

    // Test double-pay after checkout_created
    const r3 = await post("/api/payments/create-checkout-session", { estimateId: ESTIMATE_ID }, authCookie)
    console.log(`  second checkout attempt (after checkout_created): ${r3.status} ${JSON.stringify(r3.data)}`)
    if (r3.status === 409) {
      log("PASS", "Double-pay: second checkout attempt while 'checkout_created' → 409")
    } else if (r3.status === 200) {
      log("FAIL", "Double-pay: second checkout session was created — payment_status not updated (BUG-01)")
    } else {
      log("WARN", `Second checkout attempt: ${r3.status}: ${JSON.stringify(r3.data)}`)
    }

    // ── Simulate webhook: mark estimate as paid ───────────────────────────────
    console.log("\n═══ STEP 3: Simulate webhook payment completion ═══")

    // Direct DB update as service_role (simulates what webhook does)
    const now = new Date().toISOString()
    const { error: webhookSimErr } = await svc
      .from("estimates")
      .update({ payment_status: "paid", paid_at: now })
      .eq("id", ESTIMATE_ID)

    if (webhookSimErr) {
      log("FAIL", "BUG-01 CONFIRMED: service_role cannot UPDATE estimates.payment_status",
        `${webhookSimErr.code}: ${webhookSimErr.message}`)
      log("FAIL", "BUG-01 downstream: webhook cannot mark estimate as paid → success page broken")
    } else {
      log("PASS", "BUG-01 FIXED: service_role can UPDATE estimates — GRANT applied successfully")

      // Verify payment_status is now paid
      const { data: paidEst } = await client
        .from("estimates")
        .select("payment_status,paid_at")
        .eq("id", ESTIMATE_ID)
        .single()
      if (paidEst?.payment_status === "paid") {
        log("PASS", "estimates.payment_status = 'paid' after webhook update")
      }

      // Test double-pay prevention after real payment
      const r4 = await post("/api/payments/create-checkout-session", { estimateId: ESTIMATE_ID }, authCookie)
      if (r4.status === 409) {
        log("PASS", "Double-pay: paid estimate → 409 (end-to-end)")
      } else {
        log("FAIL", "Double-pay after real payment", `got ${r4.status}`)
      }
    }

  } else {
    log("FAIL", "Checkout session creation", `${r2.status}: ${JSON.stringify(r2.data)}`)
  }

  // ── Reset contractor Stripe status ────────────────────────────────────────
  console.log("\n═══ CLEANUP ═══")
  const { error: resetErr } = await svc
    .from("profiles")
    .update({ stripe_charges_enabled: false, stripe_payouts_enabled: false, stripe_onboarding_complete: false })
    .eq("user_id", CONTRACTOR_ID)
  if (resetErr) console.log("⚠️  Could not reset contractor Stripe status:", resetErr.message)
  else console.log("✅ Contractor Stripe status reset to inactive")

  // Reset estimate
  await client.from("estimates")
    .update({ payment_status: "unpaid", paid_at: null, stripe_checkout_session_id: null, stripe_payment_intent_id: null })
    .eq("id", ESTIMATE_ID)
  console.log("✅ Estimate reset to unpaid")

  // Clean up test payment records
  await svc.from("payments").delete().eq("estimate_id", ESTIMATE_ID)
  console.log("✅ Test payment records deleted")
}

console.log("\n═══ SUMMARY ═══")
console.log(`✅ PASS: ${pass.length}`)
console.log(`❌ FAIL: ${fail.length}`)
console.log(`⚠️  WARN: ${warn.length}`)
if (fail.length > 0) {
  console.log("\nFailures:")
  fail.forEach(f => console.log(`  ❌ ${f.name}: ${f.detail}`))
}
