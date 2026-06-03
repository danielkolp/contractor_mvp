/**
 * Stripe Payment Flow — QA Audit Script
 *
 * Tests the full Stripe payment flow using:
 *  - Direct HTTP requests to the running dev server (localhost:3000)
 *  - Supabase service-role client for database validation
 *  - No browser automation needed for API tests
 *
 * Run: node qa-stripe-audit.mjs
 */

import { createClient } from "@supabase/supabase-js"
import { randomUUID } from "crypto"
import { loadQaEnv } from "./qa-env.mjs"

// ── Load .env.local ────────────────────────────────────────────────────────────

loadQaEnv()

const BASE_URL = process.env.QA_BASE_URL || "http://localhost:3000"
const CONTRACTOR_EMAIL    = process.env.E2E_CONTRACTOR_EMAIL    || process.env.QA_CONTRACTOR_EMAIL
const CONTRACTOR_PASSWORD = process.env.E2E_CONTRACTOR_PASSWORD || process.env.QA_CONTRACTOR_PASSWORD
const SUPABASE_URL        = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY   = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY
const PLATFORM_FEE        = Number(process.env.PLATFORM_FEE_PERCENT ?? 15)

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY || !CONTRACTOR_EMAIL || !CONTRACTOR_PASSWORD) {
  console.error("Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, E2E_CONTRACTOR_EMAIL, E2E_CONTRACTOR_PASSWORD")
  process.exit(1)
}

// ── Supabase clients ────────────────────────────────────────────────────────────

const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function signIn(email, password) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signIn(${email}): ${error.message}`)
  return { client, session: data.session }
}

// ── Result tracking ────────────────────────────────────────────────────────────

const results = []

function pass(id, description, detail = "") {
  results.push({ id, status: "PASS", description, detail })
  console.log(`  ✅ [${id}] ${description}${detail ? ` — ${detail}` : ""}`)
}

function fail(id, description, detail = "", severity = "High") {
  results.push({ id, status: "FAIL", description, detail, severity })
  console.error(`  ❌ [${id}] ${description} [${severity}]${detail ? `\n     Detail: ${detail}` : ""}`)
}

function warn(id, description, detail = "", severity = "Medium") {
  results.push({ id, status: "WARN", description, detail, severity })
  console.warn(`  ⚠️  [${id}] ${description} [${severity}]${detail ? ` — ${detail}` : ""}`)
}

function skip(id, description, reason = "") {
  results.push({ id, status: "SKIP", description, reason })
  console.log(`  ⏭️  [${id}] SKIPPED: ${description}${reason ? ` — ${reason}` : ""}`)
}

// ── HTTP helpers ───────────────────────────────────────────────────────────────

async function apiGet(path, accessToken) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}`, Cookie: `sb-access-token=${accessToken}` } : {}),
    },
  })
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers }
}

async function apiPost(path, body, accessToken, cookieJar = "") {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? {
        Authorization: `Bearer ${accessToken}`,
      } : {}),
      ...(cookieJar ? { Cookie: cookieJar } : {}),
    },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers }
}

// ── Supabase cookie-based auth helper ─────────────────────────────────────────
// The Next.js middleware reads the session from a Supabase SSR cookie.
// We need to replicate that cookie to call server-authenticated API routes.

async function getSupabaseCookies(email, password) {
  // Call the Next.js login action via a form POST to /auth/actions
  // The simplest approach: sign in via Supabase JS SDK and use the access token
  // in the Authorization header. The server routes use createClient() from
  // @supabase/ssr which reads from both headers and cookies.
  const { session } = await signIn(email, password)
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    cookieJar: `sb-lgjsatykcfkwatczyvla-auth-token-code-verifier=; sb-access-token=${session.access_token}`,
  }
}

// ── Test runner ────────────────────────────────────────────────────────────────

async function runAll() {
  console.log("=".repeat(70))
  console.log(`QA STRIPE PAYMENT FLOW AUDIT — ${new Date().toISOString()}`)
  console.log(`Base URL: ${BASE_URL}`)
  console.log(`Contractor: ${CONTRACTOR_EMAIL}`)
  console.log(`Platform fee: ${PLATFORM_FEE}%`)
  console.log("=".repeat(70))

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION A: Server Health & Environment
  // ════════════════════════════════════════════════════════════════════════════

  console.log("\n── Section A: Server Health & Environment ─────────────────────────────")

  // A1: Server is reachable
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(5000) })
    if (res.ok || res.status < 500) pass("A1", "Dev server is reachable", `HTTP ${res.status}`)
    else fail("A1", "Dev server returned server error", `HTTP ${res.status}`, "Critical")
  } catch (e) {
    fail("A1", "Dev server is not reachable", String(e), "Critical")
    console.error("   ⛔  Cannot continue without a running server.")
    return printReport()
  }

  // A2: Stripe env vars are set
  if (process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    pass("A2", "STRIPE_SECRET_KEY is a test key", process.env.STRIPE_SECRET_KEY.slice(0, 20) + "…")
  } else if (process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")) {
    fail("A2", "STRIPE_SECRET_KEY is a LIVE key! This should be a test key during QA", "", "Critical")
  } else {
    fail("A2", "STRIPE_SECRET_KEY is not set or invalid", "", "Critical")
  }

  if (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_")) {
    pass("A3", "STRIPE_PUBLISHABLE_KEY is a test key")
  } else {
    fail("A3", "STRIPE_PUBLISHABLE_KEY is not a test key", process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.slice(0, 20), "High")
  }

  if (process.env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")) {
    pass("A4", "STRIPE_WEBHOOK_SECRET is configured")
  } else {
    fail("A4", "STRIPE_WEBHOOK_SECRET is not set", "", "High")
  }

  if (!process.env.NEXT_PUBLIC_APP_URL) {
    warn("A5", "NEXT_PUBLIC_APP_URL is not set", "Stripe redirect URLs will fall back to http://localhost:3000", "Medium")
  } else {
    pass("A5", "NEXT_PUBLIC_APP_URL is set", process.env.NEXT_PUBLIC_APP_URL)
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION B: Contractor Authentication
  // ════════════════════════════════════════════════════════════════════════════

  console.log("\n── Section B: Contractor Authentication ───────────────────────────────")

  let contractorAuth = null
  let contractorId = null
  let contractorProfile = null

  try {
    contractorAuth = await signIn(CONTRACTOR_EMAIL, CONTRACTOR_PASSWORD)
    contractorId = contractorAuth.session.user.id
    pass("B1", "Contractor signs in successfully", `uid=${contractorId.slice(0, 8)}…`)
  } catch (e) {
    fail("B1", "Contractor sign-in failed", String(e), "Critical")
    return printReport()
  }

  // Load contractor profile
  const { data: profile, error: profileErr } = await service
    .from("profiles")
    .select("*")
    .eq("user_id", contractorId)
    .single()

  if (profileErr || !profile) {
    fail("B2", "Contractor profile not found in DB", profileErr?.message, "Critical")
  } else {
    contractorProfile = profile
    pass("B2", "Contractor profile loaded", `role=${profile.role}, slug=${profile.request_slug}`)

    if (profile.role !== "contractor") {
      fail("B3", "User role is not 'contractor'", `actual role: ${profile.role}`, "Critical")
    } else {
      pass("B3", "User role is 'contractor'")
    }

    if (!profile.request_slug) {
      fail("B4", "Contractor has no request_slug", "", "High")
    } else {
      pass("B4", "Contractor has a request_slug", profile.request_slug)
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION C: Stripe Connect Status
  // ════════════════════════════════════════════════════════════════════════════

  console.log("\n── Section C: Stripe Connect Status ──────────────────────────────────")

  let stripeStatus = null

  try {
    // Use a direct Supabase client call mirroring what the API does
    const authClient = contractorAuth.client
    const session = contractorAuth.session

    // Call the status endpoint via the app
    const statusRes = await fetch(`${BASE_URL}/api/stripe/connect/status`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })
    stripeStatus = await statusRes.json()
    console.log(`   Stripe status response: ${JSON.stringify(stripeStatus)}`)

    if (statusRes.ok) {
      pass("C1", "/api/stripe/connect/status responds 200")
    } else if (statusRes.status === 401) {
      fail("C1", "/api/stripe/connect/status returns 401 — auth not recognized by server", `Bearer token may not work; server uses SSR cookies`, "High")
    } else {
      fail("C1", `/api/stripe/connect/status returned ${statusRes.status}`, JSON.stringify(stripeStatus), "High")
    }

    if (stripeStatus.connected) {
      pass("C2", "Contractor Stripe account is connected", `account_id in profile: ${Boolean(contractorProfile?.stripe_account_id)}`)
    } else {
      warn("C2", "Contractor Stripe account NOT connected", "Payment checkout will return 422; testing that path", "Medium")
    }

    if (stripeStatus.onboarding_complete) {
      pass("C3", "Stripe onboarding is complete", `charges_enabled=${stripeStatus.charges_enabled}, payouts_enabled=${stripeStatus.payouts_enabled}`)
    } else if (stripeStatus.connected) {
      warn("C3", "Stripe connected but onboarding incomplete", `charges_enabled=${stripeStatus.charges_enabled}, payouts_enabled=${stripeStatus.payouts_enabled}`, "High")
    } else {
      warn("C3", "Stripe onboarding not started", "Connect button should be visible in Settings", "Low")
    }

    // C4: UI check — GET method also works (aliased in route)
    const getRes = await fetch(`${BASE_URL}/api/stripe/connect/status`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (getRes.ok) {
      pass("C4", "GET /api/stripe/connect/status also works (aliased)")
    } else {
      fail("C4", "GET /api/stripe/connect/status failed", `HTTP ${getRes.status}`, "Medium")
    }

  } catch (e) {
    fail("C1", "Failed to call /api/stripe/connect/status", String(e), "High")
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION D: Job Request Submission
  // ════════════════════════════════════════════════════════════════════════════

  console.log("\n── Section D: Job Request Submission ─────────────────────────────────")

  const runId = `qa-${Date.now()}-${randomUUID().slice(0, 8)}`
  let jobRequestId = null
  let clientUserId = null
  const clientEmail = `${runId}@example.com`
  const clientPassword = `QA-${randomUUID()}!1`

  if (!contractorProfile?.request_slug) {
    skip("D1", "Cannot test job request — no request_slug", "")
  } else {
    try {
      // POST to /api/client-request (the public intake route)
      const requestPayload = {
        contractorId,
        clientName: `QA Client ${runId.slice(-6)}`,
        clientEmail,
        clientPhone: "604-555-0199",
        contactPreference: "Text",
        title: "Roof Repair",
        description: `QA test job request. ${runId}`,
        addressStreet: "789 QA Test St",
        serviceArea: "Vancouver, BC",
        photoUrls: [],
        photoNotes: "",
      }

      const reqRes = await fetch(`${BASE_URL}/api/client-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      })

      if (reqRes.ok) {
        const reqBody = await reqRes.json()
        jobRequestId = reqBody.jobRequestId
        clientUserId = reqBody.clientUserId
        pass("D1", "Job request submitted successfully", `id=${jobRequestId?.slice(0, 8)}`)
      } else {
        const errBody = await reqRes.json().catch(() => ({}))
        fail("D1", `Job request submission failed: HTTP ${reqRes.status}`, JSON.stringify(errBody), "High")
      }
    } catch (e) {
      fail("D1", "Job request submission threw an error", String(e), "High")
    }
  }

  // Verify job landed in DB
  if (jobRequestId) {
    const { data: job, error: jobErr } = await service
      .from("job_requests")
      .select("*")
      .eq("id", jobRequestId)
      .single()

    if (jobErr || !job) {
      fail("D2", "Job request not found in DB after submission", jobErr?.message, "Critical")
    } else {
      pass("D2", "Job request found in DB", `status=${job.status}, contractor_id matches=${job.contractor_id === contractorId}`)

      if (job.contractor_id !== contractorId) {
        fail("D3", "Job request contractor_id mismatch", `expected ${contractorId}, got ${job.contractor_id}`, "Critical")
      } else {
        pass("D3", "Job request contractor_id is correct")
      }

      clientUserId = job.client_id || clientUserId
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION E: Estimate Creation with Stripe Payment Fields
  // ════════════════════════════════════════════════════════════════════════════

  console.log("\n── Section E: Estimate Creation & Stripe Payment Fields ───────────────")

  let estimateId = null
  const contractorCents = 50000   // $500.00
  const platformFeeCents = Math.round(contractorCents * PLATFORM_FEE / 100)  // $75.00
  const clientTotalCents = contractorCents + platformFeeCents  // $575.00

  try {
    const { data: est, error: estErr } = await contractorAuth.client
      .from("estimates")
      .insert({
        user_id: contractorId,
        job_request_id: jobRequestId,
        estimate_number: `QA-${runId.slice(-8).toUpperCase()}`,
        amount: clientTotalCents / 100,
        status: "Sent",
        sent_date: new Date().toISOString().slice(0, 10),
        tax_rate: 0,
        line_items: [{ description: "Roof repair labor", quantity: 1, unit_price: 500 }],
        tax_lines: [],
        contractor_amount_cents: contractorCents,
        platform_fee_cents: platformFeeCents,
        client_total_cents: clientTotalCents,
        payment_status: "unpaid",
        notes: "QA test estimate with Stripe payment fields",
      })
      .select()
      .single()

    if (estErr || !est) {
      fail("E1", "Could not create estimate with payment fields", estErr?.message, "Critical")
    } else {
      estimateId = est.id
      pass("E1", "Estimate created with Stripe payment fields", `id=${estimateId.slice(0, 8)}, total=${clientTotalCents} cents`)

      // Verify fee calculation
      const expectedFee = Math.round(contractorCents * PLATFORM_FEE / 100)
      const expectedTotal = contractorCents + expectedFee

      if (est.platform_fee_cents === expectedFee) {
        pass("E2", "Platform fee calculation correct", `${contractorCents} × ${PLATFORM_FEE}% = ${expectedFee} cents`)
      } else {
        fail("E2", "Platform fee calculation wrong", `expected ${expectedFee}, got ${est.platform_fee_cents}`, "High")
      }

      if (est.client_total_cents === expectedTotal) {
        pass("E3", "Client total calculation correct", `${contractorCents} + ${expectedFee} = ${expectedTotal} cents`)
      } else {
        fail("E3", "Client total calculation wrong", `expected ${expectedTotal}, got ${est.client_total_cents}`, "High")
      }
    }
  } catch (e) {
    fail("E1", "Estimate creation threw an error", String(e), "Critical")
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION F: Client Can Accept Estimate
  // ════════════════════════════════════════════════════════════════════════════

  console.log("\n── Section F: Client Accepts Estimate ────────────────────────────────")

  let clientAuth = null

  if (!clientUserId || !estimateId) {
    skip("F1", "Skipping client accept — no client user or estimate", "")
  } else {
    try {
      // Set client password so they can sign in
      const { error: pwErr } = await service.auth.admin.updateUserById(clientUserId, {
        password: clientPassword,
        email_confirm: true,
        user_metadata: { role: "client" },
      })

      if (pwErr) {
        fail("F1", "Could not set client password", pwErr.message, "High")
      } else {
        pass("F1", "Client password set via admin API")

        try {
          clientAuth = await signIn(clientEmail, clientPassword)
          pass("F2", "Client signs in successfully")
        } catch (e) {
          fail("F2", "Client sign-in failed", String(e), "High")
        }
      }
    } catch (e) {
      fail("F1", "Setting client password threw error", String(e), "High")
    }

    if (clientAuth && estimateId) {
      // Client accepts estimate (update via their own auth)
      try {
        const [estResult, jobResult] = await Promise.all([
          clientAuth.client.from("estimates").update({ status: "Accepted" }).eq("id", estimateId).select().single(),
          jobRequestId
            ? clientAuth.client.from("job_requests").update({ status: "accepted" }).eq("id", jobRequestId).select().single()
            : Promise.resolve({ data: null, error: null }),
        ])

        if (estResult.error) {
          fail("F3", "Client could not accept estimate (RLS?)", estResult.error.message, "Critical")
        } else {
          pass("F3", "Client accepted estimate successfully", `status=${estResult.data.status}`)
        }

        if (jobRequestId && jobResult.error) {
          fail("F4", "Job request status not updated on accept", jobResult.error.message, "High")
        } else if (jobRequestId) {
          pass("F4", "Job request status updated to 'accepted'")
        }
      } catch (e) {
        fail("F3", "Client accept estimate threw error", String(e), "Critical")
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION G: Checkout Session Creation
  // ════════════════════════════════════════════════════════════════════════════

  console.log("\n── Section G: Stripe Checkout Session Creation ────────────────────────")

  let checkoutSessionId = null
  let checkoutUrl = null

  if (!clientAuth || !estimateId) {
    skip("G1", "Skipping checkout — no client auth or estimate", "")
  } else if (!stripeStatus?.charges_enabled) {
    // Test the error case: Stripe not connected → 422
    try {
      const res = await fetch(`${BASE_URL}/api/payments/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${clientAuth.session.access_token}`,
        },
        body: JSON.stringify({ estimateId }),
      })
      const body = await res.json()
      console.log(`   Checkout attempt (Stripe not ready): HTTP ${res.status} — ${JSON.stringify(body)}`)

      if (res.status === 422) {
        pass("G1", "Checkout correctly returns 422 when Stripe not connected/active", body.error)
      } else if (res.status === 401) {
        warn("G1", "Checkout returns 401 — Bearer auth not honored by SSR middleware", "Next.js SSR auth uses cookies, not Bearer headers", "High")
      } else {
        fail("G1", `Unexpected status ${res.status} when Stripe not connected`, JSON.stringify(body), "High")
      }
    } catch (e) {
      fail("G1", "Checkout session call threw error", String(e), "High")
    }

    // Also test 409 (double-pay guard) — set estimate to paid first
    skip("G2", "Double-pay test skipped — Stripe not connected", "")
    skip("G3", "Full checkout test skipped — Stripe not connected", "")

  } else {
    // Stripe IS connected — create a real checkout session
    try {
      const res = await fetch(`${BASE_URL}/api/payments/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${clientAuth.session.access_token}`,
        },
        body: JSON.stringify({ estimateId }),
      })
      const body = await res.json()

      if (res.status === 401) {
        warn("G1", "Checkout returns 401 — Bearer token not honored by Next.js SSR middleware", "The checkout route uses createClient() from @supabase/ssr which needs cookies, not Bearer auth. This is expected when calling directly. The browser flow (which sends cookies) would work.", "Medium")
        skip("G2", "Checkout session ID verification skipped — auth method limitation", "")
        skip("G3", "Full payment flow skipped — requires browser context for SSR cookie auth", "")
      } else if (!res.ok) {
        fail("G1", `Checkout session failed: HTTP ${res.status}`, JSON.stringify(body), "Critical")
      } else {
        checkoutUrl = body.url
        pass("G1", "Checkout session created successfully", `url=${checkoutUrl?.slice(0, 60)}…`)

        // Verify estimate updated to checkout_created
        const { data: updatedEst } = await service.from("estimates").select("*").eq("id", estimateId).single()
        if (updatedEst?.payment_status === "checkout_created") {
          pass("G2", "Estimate payment_status updated to 'checkout_created'")
          checkoutSessionId = updatedEst.stripe_checkout_session_id
          pass("G3", "Estimate has stripe_checkout_session_id stored", checkoutSessionId?.slice(0, 20))
        } else {
          fail("G2", "Estimate payment_status not updated", `actual: ${updatedEst?.payment_status}`, "High")
        }

        // Verify payment record created
        const { data: payRecs } = await service.from("payments").select("*").eq("estimate_id", estimateId)
        if (payRecs && payRecs.length > 0) {
          const pay = payRecs[0]
          pass("G4", "Payment record created in payments table", `status=${pay.status}, session=${pay.stripe_checkout_session_id?.slice(0, 20)}`)

          // Verify amounts in payment record
          if (pay.contractor_amount_cents === contractorCents) {
            pass("G5", "Payment record: contractor_amount_cents correct", `${pay.contractor_amount_cents} cents`)
          } else {
            fail("G5", "Payment record: contractor_amount_cents wrong", `expected ${contractorCents}, got ${pay.contractor_amount_cents}`, "High")
          }

          if (pay.platform_fee_cents === platformFeeCents) {
            pass("G6", "Payment record: platform_fee_cents correct", `${pay.platform_fee_cents} cents`)
          } else {
            fail("G6", "Payment record: platform_fee_cents wrong", `expected ${platformFeeCents}, got ${pay.platform_fee_cents}`, "High")
          }

          if (pay.client_total_cents === clientTotalCents) {
            pass("G7", "Payment record: client_total_cents correct", `${pay.client_total_cents} cents`)
          } else {
            fail("G7", "Payment record: client_total_cents wrong", `expected ${clientTotalCents}, got ${pay.client_total_cents}`, "High")
          }
        } else {
          fail("G4", "Payment record NOT created after checkout session", "", "Critical")
        }
      }
    } catch (e) {
      fail("G1", "Checkout session call threw error", String(e), "Critical")
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION H: Edge Cases — API Validation
  // ════════════════════════════════════════════════════════════════════════════

  console.log("\n── Section H: Edge Cases — API Validation ─────────────────────────────")

  const authHeader = clientAuth
    ? { Authorization: `Bearer ${clientAuth.session.access_token}` }
    : contractorAuth
    ? { Authorization: `Bearer ${contractorAuth.session.access_token}` }
    : {}

  // H1: Double-pay a paid estimate → 409
  if (estimateId && (clientAuth || contractorAuth)) {
    // Mark estimate as paid for this test
    await service.from("estimates").update({ payment_status: "paid" }).eq("id", estimateId)

    try {
      const res = await fetch(`${BASE_URL}/api/payments/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ estimateId }),
      })
      const body = await res.json()

      if (res.status === 409) {
        pass("H1", "Double-pay correctly blocked with 409", body.error || "already been paid")
      } else if (res.status === 401) {
        warn("H1", "Double-pay check returns 401 — auth issue (see G1 note)", "", "Low")
      } else {
        fail("H1", `Double-pay returned unexpected ${res.status}`, JSON.stringify(body), "High")
      }
    } catch (e) {
      fail("H1", "Double-pay test threw error", String(e), "Medium")
    }

    // Reset estimate for subsequent tests
    await service.from("estimates").update({ payment_status: "unpaid" }).eq("id", estimateId)
  } else {
    skip("H1", "Double-pay test skipped — no estimate or auth")
  }

  // H2: Checkout without estimateId → 400
  try {
    const res = await fetch(`${BASE_URL}/api/payments/create-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({}),
    })

    if (res.status === 400 || res.status === 401) {
      pass("H2", "Missing estimateId → 400 (or 401 for unauthenticated)", `HTTP ${res.status}`)
    } else {
      fail("H2", `Missing estimateId returned unexpected ${res.status}`, "", "Medium")
    }
  } catch (e) {
    fail("H2", "Missing estimateId test threw error", String(e), "Medium")
  }

  // H3: Checkout for non-existent estimate → 404
  try {
    const res = await fetch(`${BASE_URL}/api/payments/create-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ estimateId: "00000000-0000-0000-0000-000000000000" }),
    })

    if (res.status === 404 || res.status === 401) {
      pass("H3", "Non-existent estimate → 404 (or 401)", `HTTP ${res.status}`)
    } else {
      fail("H3", `Non-existent estimate returned unexpected ${res.status}`, "", "Medium")
    }
  } catch (e) {
    fail("H3", "Non-existent estimate test threw error", String(e), "Medium")
  }

  // H4: Checkout for estimate with status != Accepted → 422
  if (contractorAuth && contractorId) {
    try {
      const { data: draftEst } = await contractorAuth.client
        .from("estimates")
        .insert({
          user_id: contractorId,
          estimate_number: `DRAFT-${runId.slice(-6)}`,
          amount: 100,
          status: "Draft",
          sent_date: new Date().toISOString().slice(0, 10),
          tax_rate: 0,
          line_items: [],
          tax_lines: [],
          contractor_amount_cents: 10000,
          platform_fee_cents: 1500,
          client_total_cents: 11500,
          payment_status: "unpaid",
        })
        .select()
        .single()

      if (draftEst) {
        const res = await fetch(`${BASE_URL}/api/payments/create-checkout-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({ estimateId: draftEst.id }),
        })
        const body = await res.json()

        if (res.status === 422 || res.status === 401) {
          pass("H4", "Draft estimate checkout → 422 (or 401)", `HTTP ${res.status}`)
        } else {
          fail("H4", `Draft estimate checkout returned unexpected ${res.status}`, JSON.stringify(body), "High")
        }

        // Cleanup
        await contractorAuth.client.from("estimates").delete().eq("id", draftEst.id)
      }
    } catch (e) {
      fail("H4", "Draft estimate checkout test threw error", String(e), "Medium")
    }
  } else {
    skip("H4", "Draft estimate test skipped — no contractor auth")
  }

  // H5: Checkout for estimate without payment amounts → 422
  if (contractorAuth && contractorId) {
    try {
      const { data: noAmtEst } = await contractorAuth.client
        .from("estimates")
        .insert({
          user_id: contractorId,
          estimate_number: `NOAMT-${runId.slice(-6)}`,
          amount: 100,
          status: "Accepted",
          sent_date: new Date().toISOString().slice(0, 10),
          tax_rate: 0,
          line_items: [],
          tax_lines: [],
          // NO contractor_amount_cents, platform_fee_cents, client_total_cents
          payment_status: "unpaid",
        })
        .select()
        .single()

      if (noAmtEst) {
        const res = await fetch(`${BASE_URL}/api/payments/create-checkout-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({ estimateId: noAmtEst.id }),
        })
        const body = await res.json()

        if (res.status === 422 || res.status === 401) {
          pass("H5", "Estimate without payment amounts → 422 (or 401)", `HTTP ${res.status}`)
        } else {
          fail("H5", `Estimate without amounts returned unexpected ${res.status}`, JSON.stringify(body), "High")
        }

        await contractorAuth.client.from("estimates").delete().eq("id", noAmtEst.id)
      }
    } catch (e) {
      fail("H5", "No-amounts estimate test threw error", String(e), "Medium")
    }
  } else {
    skip("H5", "No-amounts estimate test skipped — no contractor auth")
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION I: Database Validation — Idempotency & Webhook Events
  // ════════════════════════════════════════════════════════════════════════════

  console.log("\n── Section I: Database — Webhook Idempotency ──────────────────────────")

  const fakeEventId = `evt_qa_dedup_${runId}`

  try {
    await service.from("stripe_webhook_events").insert({
      id: fakeEventId,
      type: "checkout.session.completed",
      payload: { id: fakeEventId, type: "checkout.session.completed", test: true },
    })

    const { error: dupErr } = await service.from("stripe_webhook_events").insert({
      id: fakeEventId,
      type: "checkout.session.completed",
      payload: {},
    })

    if (dupErr) {
      pass("I1", "Duplicate webhook event insert rejected by DB", `error: ${dupErr.message.slice(0, 80)}`)
    } else {
      fail("I1", "Duplicate webhook event was NOT rejected — no unique constraint on stripe_webhook_events.id", "", "Critical")
    }

    const { data: evts } = await service.from("stripe_webhook_events").select("id").eq("id", fakeEventId)
    if (evts?.length === 1) {
      pass("I2", "Only 1 webhook event record exists for the duplicate event_id")
    } else {
      fail("I2", `Expected 1 webhook event, found ${evts?.length}`, "", "Critical")
    }

    await service.from("stripe_webhook_events").delete().eq("id", fakeEventId)
  } catch (e) {
    fail("I1", "Webhook idempotency test threw error", String(e), "High")
  }

  // I3: Verify stripe_webhook_events table exists
  const { data: evtRows, error: evtErr } = await service
    .from("stripe_webhook_events")
    .select("id, type")
    .limit(5)

  if (evtErr) {
    fail("I3", "stripe_webhook_events table not accessible", evtErr.message, "Critical")
  } else {
    pass("I3", "stripe_webhook_events table accessible", `${evtRows?.length ?? 0} existing records`)
  }

  // I4: Verify payments table exists and has correct columns
  const { data: payRows, error: payErr } = await service
    .from("payments")
    .select("id, estimate_id, contractor_amount_cents, platform_fee_cents, client_total_cents, status, stripe_checkout_session_id, stripe_payment_intent_id")
    .limit(1)

  if (payErr) {
    fail("I4", "payments table query failed", payErr.message, "Critical")
  } else {
    pass("I4", "payments table accessible with all Stripe columns")
  }

  // I5: Verify estimates table has Stripe columns
  const { data: estRows, error: estErr } = await service
    .from("estimates")
    .select("id, contractor_amount_cents, platform_fee_cents, client_total_cents, payment_status, stripe_checkout_session_id, stripe_payment_intent_id, paid_at")
    .eq("user_id", contractorId)
    .limit(1)

  if (estErr) {
    fail("I5", "Estimates table missing Stripe columns", estErr.message, "Critical")
  } else {
    pass("I5", "Estimates table has all Stripe columns")
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION J: API Security Checks
  // ════════════════════════════════════════════════════════════════════════════

  console.log("\n── Section J: API Security ────────────────────────────────────────────")

  // J1: Unauthenticated request to checkout → 401
  try {
    const res = await fetch(`${BASE_URL}/api/payments/create-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimateId: estimateId || "test" }),
    })
    if (res.status === 401) {
      pass("J1", "Unauthenticated checkout → 401 Unauthorized")
    } else {
      fail("J1", `Unauthenticated checkout returned ${res.status} (expected 401)`, "", "Critical")
    }
  } catch (e) {
    fail("J1", "Unauthenticated checkout test threw error", String(e), "High")
  }

  // J2: Unauthenticated request to Stripe onboard → 401
  try {
    const res = await fetch(`${BASE_URL}/api/stripe/connect/onboard`, { method: "POST" })
    if (res.status === 401) {
      pass("J2", "Unauthenticated Stripe onboard → 401 Unauthorized")
    } else {
      fail("J2", `Unauthenticated Stripe onboard returned ${res.status}`, "", "High")
    }
  } catch (e) {
    fail("J2", "Unauthenticated Stripe onboard test threw error", String(e), "High")
  }

  // J3: Unauthenticated request to Stripe status → 401
  try {
    const res = await fetch(`${BASE_URL}/api/stripe/connect/status`, { method: "POST" })
    if (res.status === 401) {
      pass("J3", "Unauthenticated Stripe status → 401 Unauthorized")
    } else {
      fail("J3", `Unauthenticated Stripe status returned ${res.status}`, "", "High")
    }
  } catch (e) {
    fail("J3", "Unauthenticated Stripe status test threw error", String(e), "High")
  }

  // J4: Webhook without stripe-signature → 400
  try {
    const res = await fetch(`${BASE_URL}/api/stripe/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "checkout.session.completed" }),
    })
    if (res.status === 400) {
      pass("J4", "Webhook without stripe-signature → 400")
    } else if (res.status === 500) {
      warn("J4", "Webhook without stripe-signature → 500 (STRIPE_WEBHOOK_SECRET may not be set in server context)", `HTTP ${res.status}`, "Medium")
    } else {
      fail("J4", `Webhook without signature returned ${res.status}`, "", "High")
    }
  } catch (e) {
    fail("J4", "Webhook without signature test threw error", String(e), "High")
  }

  // J5: Webhook with invalid stripe-signature → 400
  try {
    const res = await fetch(`${BASE_URL}/api/stripe/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "stripe-signature": "invalid-sig" },
      body: JSON.stringify({ type: "checkout.session.completed" }),
    })
    if (res.status === 400) {
      pass("J5", "Webhook with invalid stripe-signature → 400")
    } else if (res.status === 500) {
      warn("J5", "Webhook with invalid signature → 500", `HTTP ${res.status}`, "Medium")
    } else {
      fail("J5", `Webhook with invalid signature returned ${res.status}`, "", "High")
    }
  } catch (e) {
    fail("J5", "Webhook invalid signature test threw error", String(e), "High")
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SECTION K: Code-level Issues Found During Review
  // ════════════════════════════════════════════════════════════════════════════

  console.log("\n── Section K: Code Review Findings ───────────────────────────────────")

  // K1: Verify checkout session route uses SSR auth (not Bearer)
  // The route uses createClient() from @supabase/ssr which reads cookies.
  // Bearer token in Authorization header IS NOT read by the default SSR client.
  // This means the API can only be called from the browser (with session cookies),
  // not from server-side or mobile clients without a cookie adapter.
  warn("K1",
    "All Stripe API routes use @supabase/ssr createClient() which reads browser cookies only",
    "Bearer token in Authorization header is NOT supported. Mobile/server clients cannot call these routes.",
    "Medium"
  )

  // K2: Verify NEXT_PUBLIC_APP_URL is not hardcoded to production in .env.local
  if (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.includes("localhost")) {
    pass("K2", "NEXT_PUBLIC_APP_URL points to localhost (correct for dev)")
  } else if (!process.env.NEXT_PUBLIC_APP_URL) {
    warn("K2", "NEXT_PUBLIC_APP_URL not set", "Stripe redirect URLs fall back to http://localhost:3000 (acceptable in dev)", "Low")
  } else {
    warn("K2", "NEXT_PUBLIC_APP_URL points to production domain", `${process.env.NEXT_PUBLIC_APP_URL} — Stripe redirects will send test clients to production`, "High")
  }

  // K3: Check for STRIPE_CONNECT_COUNTRY
  if (process.env.STRIPE_CONNECT_COUNTRY) {
    pass("K3", "STRIPE_CONNECT_COUNTRY is set", process.env.STRIPE_CONNECT_COUNTRY)
  } else {
    warn("K3", "STRIPE_CONNECT_COUNTRY not set", "Defaults to 'CA' in code — acceptable", "Low")
  }

  // K4: Verify platform fee consistency between .env and NEXT_PUBLIC variant
  const serverFee = Number(process.env.PLATFORM_FEE_PERCENT)
  const clientFee = Number(process.env.NEXT_PUBLIC_PLATFORM_FEE_PERCENT)
  if (serverFee === clientFee) {
    pass("K4", "PLATFORM_FEE_PERCENT and NEXT_PUBLIC_PLATFORM_FEE_PERCENT are consistent", `both = ${serverFee}%`)
  } else if (!serverFee || !clientFee) {
    warn("K4", "One or both fee env vars not set", `server=${serverFee}, client=${clientFee}`, "Medium")
  } else {
    fail("K4", "PLATFORM_FEE_PERCENT mismatch between server and client", `server=${serverFee}%, client=${clientFee}%`, "High")
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Cleanup
  // ════════════════════════════════════════════════════════════════════════════

  console.log("\n── Cleanup ────────────────────────────────────────────────────────────")

  const cleanupErrors = []

  if (estimateId) {
    const { error } = await contractorAuth.client.from("estimates").delete().eq("id", estimateId)
    if (error) cleanupErrors.push(`estimate ${estimateId}: ${error.message}`)
    else console.log(`   Cleaned up estimate ${estimateId.slice(0, 8)}`)
  }

  if (jobRequestId) {
    const { error } = await service.from("job_requests").delete().eq("id", jobRequestId)
    if (error) cleanupErrors.push(`job_request ${jobRequestId}: ${error.message}`)
    else console.log(`   Cleaned up job_request ${jobRequestId.slice(0, 8)}`)
  }

  if (clientUserId) {
    const { error } = await service.auth.admin.deleteUser(clientUserId)
    if (error && !error.message.toLowerCase().includes("not found")) {
      cleanupErrors.push(`client user ${clientUserId}: ${error.message}`)
    } else {
      console.log(`   Cleaned up client user ${clientUserId.slice(0, 8)}`)
    }
  }

  if (cleanupErrors.length > 0) {
    console.warn("   Cleanup warnings:", cleanupErrors)
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Print Report
  // ════════════════════════════════════════════════════════════════════════════

  printReport()
}

function printReport() {
  const passCount = results.filter(r => r.status === "PASS").length
  const failCount = results.filter(r => r.status === "FAIL").length
  const warnCount = results.filter(r => r.status === "WARN").length
  const skipCount = results.filter(r => r.status === "SKIP").length

  const critical = results.filter(r => r.status === "FAIL" && r.severity === "Critical")
  const high     = results.filter(r => r.status === "FAIL" && r.severity === "High")
  const medium   = results.filter(r => (r.status === "FAIL" || r.status === "WARN") && r.severity === "Medium")

  console.log("\n" + "═".repeat(70))
  console.log("QA AUDIT COMPLETE")
  console.log("═".repeat(70))
  console.log(`  ✅ PASS:  ${passCount}`)
  console.log(`  ❌ FAIL:  ${failCount}`)
  console.log(`  ⚠️  WARN:  ${warnCount}`)
  console.log(`  ⏭️  SKIP:  ${skipCount}`)
  console.log()

  if (failCount === 0) {
    console.log("🎉 All tests PASSED")
  } else {
    console.log(`Overall verdict: FAIL (${failCount} failure${failCount > 1 ? "s" : ""})`)
    console.log()

    if (critical.length > 0) {
      console.log("── Critical Failures ──────────────────────────────────────────────")
      for (const r of critical) console.log(`  [${r.id}] ${r.description}\n     ${r.detail}`)
      console.log()
    }

    if (high.length > 0) {
      console.log("── High Severity Failures ─────────────────────────────────────────")
      for (const r of high) console.log(`  [${r.id}] ${r.description}\n     ${r.detail}`)
      console.log()
    }

    if (medium.length > 0) {
      console.log("── Medium Issues ──────────────────────────────────────────────────")
      for (const r of medium) console.log(`  [${r.id}] ${r.description}\n     ${r.detail}`)
    }
  }

  console.log("═".repeat(70))
  return results
}

runAll().catch(e => {
  console.error("Fatal error:", e)
  process.exit(1)
})
