/**
 * QA: Checkout session guards and double-pay prevention
 */
import { createClient } from "@supabase/supabase-js"
import { randomUUID } from "crypto"
import { loadQaEnv, requiredEnv } from "./qa-env.mjs"

loadQaEnv()

const SUPABASE_URL        = requiredEnv("NEXT_PUBLIC_SUPABASE_URL")
const ANON_KEY            = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
const SVC_KEY             = requiredEnv("SUPABASE_SERVICE_ROLE_KEY")
const APP_URL             = process.env.QA_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
const CONTRACTOR_EMAIL    = requiredEnv("E2E_CONTRACTOR_EMAIL")
const CONTRACTOR_PASSWORD = requiredEnv("E2E_CONTRACTOR_PASSWORD")
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

// Sign in as contractor
const { data: auth } = await client.auth.signInWithPassword({
  email: CONTRACTOR_EMAIL,
  password: CONTRACTOR_PASSWORD,
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

console.log("\n═══════════ CHECKOUT GUARDS ═══════════")

// Guard 1: contractor has no Stripe account → 422
const r1 = await post("/api/payments/create-checkout-session", { estimateId: ESTIMATE_ID }, authCookie)
console.log(`  no-stripe: ${r1.status} ${JSON.stringify(r1.data)}`)
if (r1.status === 422 && r1.data?.error?.includes("not connected")) {
  log("PASS", "Checkout: unconnected contractor → 422 with clear error")
} else if (r1.status === 422) {
  log("PASS", "Checkout: unconnected contractor → 422", r1.data?.error)
} else if (r1.status === 404) {
  log("WARN", "Checkout: unconnected contractor → 404 (contractor profile lookup failed)", r1.data?.error)
} else {
  log("FAIL", "Checkout: unconnected contractor guard", `expected 422, got ${r1.status}: ${JSON.stringify(r1.data)}`)
}

// Guard 2: estimate with unpaid status — test with a Sent estimate (not Accepted/Won)
const { data: sentEst } = await svc
  .from("estimates").select("id,status").eq("user_id", CONTRACTOR_ID).eq("status", "Sent").limit(1).maybeSingle()
if (sentEst) {
  const r2 = await post("/api/payments/create-checkout-session", { estimateId: sentEst.id }, authCookie)
  if (r2.status === 422) log("PASS", "Checkout: Sent estimate → 422 (must be Accepted/Won)")
  else log("FAIL", "Checkout: Sent estimate guard", `expected 422, got ${r2.status}: ${JSON.stringify(r2.data)}`)
} else {
  log("WARN", "Checkout: no Sent estimate found — status guard not tested")
}

// Guard 3: draft estimate
const { data: draftEst } = await svc
  .from("estimates").select("id,status").eq("user_id", CONTRACTOR_ID).eq("status", "Draft").limit(1).maybeSingle()
if (draftEst) {
  const r3 = await post("/api/payments/create-checkout-session", { estimateId: draftEst.id }, authCookie)
  if (r3.status === 422) log("PASS", "Checkout: Draft estimate → 422")
  else log("FAIL", "Checkout: Draft estimate guard", `expected 422, got ${r3.status}`)
} else {
  log("WARN", "No Draft estimate found")
}

// Guard 4: estimate with no payment amounts set
const { data: noAmountEst } = await svc
  .from("estimates")
  .select("id,status,client_total_cents")
  .eq("user_id", CONTRACTOR_ID)
  .in("status", ["Accepted", "Won"])
  .is("client_total_cents", null)
  .limit(1)
  .maybeSingle()
if (noAmountEst) {
  const r4 = await post("/api/payments/create-checkout-session", { estimateId: noAmountEst.id }, authCookie)
  if (r4.status === 422) log("PASS", "Checkout: estimate with no payment amounts → 422")
  else log("FAIL", "Checkout: no payment amounts guard", `expected 422, got ${r4.status}: ${JSON.stringify(r4.data)}`)
} else {
  log("WARN", "All accepted/won estimates have payment amounts — guard not tested")
}

// Guard 5: below minimum amount ($0.50 = 50 cents)
const { data: lowAmountEst, error: lowAmountErr } = await client
  .from("estimates").insert({
    user_id: CONTRACTOR_ID,
    job_request_id: "1fc71558-53e7-463e-a304-bc2e9f9561d3",
    estimate_number: "EST-QA-LOW",
    status: "Accepted",
    contractor_amount_cents: 30,
    platform_fee_cents: 5,
    client_total_cents: 35,
    notes: "QA test — below minimum",
    amount: "0.30",
  }).select().single()
if (lowAmountErr) {
  log("WARN", "Could not create low-amount estimate for guard test", lowAmountErr.message)
} else {
  const r5 = await post("/api/payments/create-checkout-session", { estimateId: lowAmountEst.id }, authCookie)
  if (r5.status === 422) log("PASS", "Checkout: below $0.50 minimum → 422")
  else log("FAIL", "Checkout: minimum amount guard", `expected 422, got ${r5.status}: ${JSON.stringify(r5.data)}`)
  // Clean up
  await svc.from("estimates").delete().eq("id", lowAmountEst.id)
}

console.log("\n═══════════ DOUBLE-PAY PREVENTION ═══════════")

// Test double-pay: manually set estimate payment_status = 'paid' and try checkout
// Note: service_role cannot UPDATE estimates — test via user session
const { error: markPaidErr } = await client
  .from("estimates")
  .update({ payment_status: "paid", paid_at: new Date().toISOString() })
  .eq("id", ESTIMATE_ID)

if (markPaidErr) {
  log("WARN", "Cannot mark estimate as paid via user session for double-pay test", markPaidErr.message)
  // Try via svc
  const { error: svcMarkErr } = await svc
    .from("estimates")
    .update({ payment_status: "paid" })
    .eq("id", ESTIMATE_ID)
  if (svcMarkErr) {
    log("WARN", "Cannot mark estimate as paid via service_role either — BUG-01 prevents test", svcMarkErr.message)
  }
} else {
  console.log("  Marked estimate as paid. Testing double-pay...")
  const r6 = await post("/api/payments/create-checkout-session", { estimateId: ESTIMATE_ID }, authCookie)
  console.log(`  double-pay attempt: ${r6.status} ${JSON.stringify(r6.data)}`)
  if (r6.status === 409) {
    log("PASS", "Double-pay prevention: paid estimate → 409")
  } else {
    log("FAIL", "Double-pay prevention", `expected 409, got ${r6.status}: ${JSON.stringify(r6.data)}`)
  }
  // Reset back to unpaid
  await client.from("estimates").update({ payment_status: "unpaid", paid_at: null }).eq("id", ESTIMATE_ID)
}

console.log("\n═══════════ CROSS-ACCOUNT SECURITY ═══════════")

// Create a second user session and try to checkout an estimate owned by contractor
// Sign in as a different email (use Supabase anonymous sign-in as second user)
const secondClient = createClient(SUPABASE_URL, ANON_KEY)
// Sign up a temp user
const tempEmail = `qa-temp-${Date.now()}@example.com`
const tempPassword = `Temp-${randomUUID()}!1`
const { data: tempAuth, error: tempErr } = await secondClient.auth.signUp({
  email: tempEmail,
  password: tempPassword,
})
if (tempErr || !tempAuth?.session) {
  log("WARN", "Could not create temp user for cross-account test", tempErr?.message)
} else {
  const tempSession = tempAuth.session
  const tempCookieVal = encodeURIComponent(JSON.stringify({
    access_token: tempSession.access_token, token_type: tempSession.token_type,
    expires_in: tempSession.expires_in, expires_at: tempSession.expires_at,
    refresh_token: tempSession.refresh_token, user: tempSession.user,
  }))
  const tempCookie = `${cookieKey}=${tempCookieVal}`

  // Temp user tries to checkout contractor's estimate
  const r7 = await post("/api/payments/create-checkout-session", { estimateId: ESTIMATE_ID }, tempCookie)
  console.log(`  cross-account checkout: ${r7.status} ${JSON.stringify(r7.data)}`)

  // Per RLS, temp user cannot read contractor's estimate → should get 404
  if (r7.status === 404) {
    log("PASS", "Cross-account security: other user cannot checkout contractor's estimate → 404")
  } else if (r7.status === 422) {
    log("WARN", "Cross-account: got 422 instead of 404 — RLS may allow read but Stripe blocks it", JSON.stringify(r7.data))
  } else if (r7.status === 401) {
    log("WARN", "Cross-account: got 401 — temp user session not recognized")
  } else {
    log("FAIL", "Cross-account security", `expected 404, got ${r7.status}: ${JSON.stringify(r7.data)}`)
  }

  // Cleanup temp user
  await svc.auth.admin.deleteUser(tempAuth.user.id)
}

console.log("\n═══════════ STATUS RESPONSE FIELDS ═══════════")

// Test that status endpoint returns all expected fields
const statusRes = await post("/api/stripe/connect/status", {}, authCookie)
console.log(`  status response: ${statusRes.status}`, JSON.stringify(statusRes.data))
const expectedFields = ["connected", "charges_enabled", "payouts_enabled", "details_submitted", "onboarding_complete"]
const missingFields = expectedFields.filter(f => !(f in (statusRes.data ?? {})))
if (statusRes.status === 200 && missingFields.length === 0) {
  log("PASS", "Status response has all expected fields")
} else if (missingFields.length > 0) {
  log("FAIL", "Status response missing fields", missingFields.join(", "))
} else {
  log("FAIL", "Status response", `status=${statusRes.status}`)
}

// Check: does status return stripe_account_id?
if ("stripe_account_id" in (statusRes.data ?? {})) {
  log("PASS", "Status includes stripe_account_id in response")
} else {
  log("WARN", "Status does not expose stripe_account_id in response (may be intentional)")
}

console.log("\n═══════════ WEBHOOK IDEMPOTENCY ═══════════")

// Insert a fake event ID into stripe_webhook_events, then confirm duplicate is rejected
const fakeEventId = `evt_qa_test_${Date.now()}`
const { error: insertErr } = await svc.from("stripe_webhook_events").insert({
  id: fakeEventId, type: "checkout.session.completed"
})
if (insertErr) {
  log("FAIL", "Webhook idempotency: cannot insert to stripe_webhook_events", insertErr.message)
} else {
  // Try to insert the same event again
  const { error: dupErr } = await svc.from("stripe_webhook_events").insert({
    id: fakeEventId, type: "checkout.session.completed"
  })
  if (dupErr && dupErr.code === "23505") {
    log("PASS", "Webhook idempotency: duplicate event_id rejected at DB level (UNIQUE primary key)")
  } else if (dupErr) {
    log("WARN", "Webhook idempotency: duplicate rejected but unexpected error code", `code=${dupErr.code}: ${dupErr.message}`)
  } else {
    log("FAIL", "Webhook idempotency: duplicate event was NOT rejected — idempotency is broken!")
  }
  // Clean up
  await svc.from("stripe_webhook_events").delete().eq("id", fakeEventId)
}

console.log("\n═══════════ FEE CALCULATION VERIFICATION ═══════════")

// Verify 15% platform fee math
const contractorAmount = 100000 // $1000.00
const platformFeePercent = 15
const expectedFee   = Math.round(contractorAmount * platformFeePercent / 100) // 15000
const expectedTotal = contractorAmount + expectedFee // 115000

const { data: qaEst } = await svc
  .from("estimates")
  .select("contractor_amount_cents,platform_fee_cents,client_total_cents")
  .eq("id", ESTIMATE_ID)
  .single()

if (!qaEst) {
  log("WARN", "Fee check: estimate not accessible via service_role — BUG-01")
} else {
  const feeOk  = qaEst.platform_fee_cents === expectedFee
  const totalOk = qaEst.client_total_cents  === expectedTotal
  if (feeOk && totalOk) {
    log("PASS", `Fee calculation: contractor=$${contractorAmount/100}, fee=$${expectedFee/100}, total=$${expectedTotal/100}`)
  } else {
    log("FAIL", "Fee calculation mismatch",
      `fee: expected ${expectedFee} got ${qaEst.platform_fee_cents}, total: expected ${expectedTotal} got ${qaEst.client_total_cents}`)
  }
}

// Also verify via user session
const { data: qaEstUser } = await client
  .from("estimates")
  .select("contractor_amount_cents,platform_fee_cents,client_total_cents")
  .eq("id", ESTIMATE_ID)
  .single()
if (qaEstUser) {
  const feeOk   = qaEstUser.platform_fee_cents === expectedFee
  const totalOk = qaEstUser.client_total_cents  === expectedTotal
  if (feeOk && totalOk) log("PASS", "Fee calculation: DB values correct (user session)")
  else log("FAIL", "Fee: user session values wrong", JSON.stringify(qaEstUser))
} else {
  log("WARN", "Fee: user session cannot read estimate")
}

console.log("\n═══════════ SUMMARY ═══════════")
console.log(`✅ PASS: ${pass.length}`)
console.log(`❌ FAIL: ${fail.length}`)
console.log(`⚠️  WARN: ${warn.length}`)
if (fail.length > 0) {
  console.log("\nFailures:")
  fail.forEach(f => console.log(`  ❌ ${f.name}: ${f.detail}`))
}
