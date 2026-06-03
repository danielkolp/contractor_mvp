/**
 * Retest QA — focused re-test of 4 areas flagged in FULL_FLOW_QA_REPORT.md
 *
 * 1. Stripe webhook/payment status (longer webhook wait)
 * 2. Online payment field in create-estimate-from-request dialog
 * 3. Site visit flow (confirm + suggest-different-time paths)
 * 4. Decline reason flow + contractor post-decline actions
 */

import { expect, type Page, type BrowserContext, test } from "@playwright/test"
import { loadEnv } from "./helpers/env"
import {
  cleanupFlowTestData,
  createAuthenticatedClient,
  createFlowTestData,
  createServiceRoleClient,
  getEstimate,
  getEstimatesForJob,
  getJobRequest,
  type FlowTestData,
} from "./helpers/supabase"

loadEnv()

const pngBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
)

async function login(page: Page, email: string, password: string) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/(dashboard|client)/, { timeout: 20_000 })
}

/** Submit a job request as an unauthenticated client, return jobRequestId and guestLink */
async function submitJobRequest(
  page: Page,
  requestUrl: string,
  clientName: string,
  clientEmail: string,
  description: string,
  address: string,
): Promise<{ jobRequestId: string; guestLink: string | null }> {
  await page.goto(requestUrl)
  await expect(page.getByTestId("request-form")).toBeVisible()

  await page.getByLabel("Full name").fill(clientName)
  await page.getByLabel("Email address").fill(clientEmail)
  await page.getByLabel("Project description").fill(description)
  await page.getByLabel("Street address").fill(address)
  await page.getByLabel("City").fill("North Vancouver, BC")

  const submitResponsePromise = page.waitForResponse(
    (r) => r.url().includes("/api/client-request") && r.request().method() === "POST"
  )
  await page.getByTestId("request-submit-button").click()
  const submitResponse = await submitResponsePromise
  expect(submitResponse.ok()).toBeTruthy()
  const body = (await submitResponse.json()) as { jobRequestId: string }

  await expect(page.getByTestId("request-confirmed")).toBeVisible()

  // Grab guest portal link from the post-submit screen
  const linkEl = page.locator("text=/guest\\/project\\/[a-f0-9]+/")
  const guestLink = await linkEl.first().textContent().catch(() => null)

  return { jobRequestId: body.jobRequestId, guestLink: guestLink?.trim() ?? null }
}

// ── Suite ────────────────────────────────────────────────────────────────────

test.describe("Retest QA", () => {
  test.beforeEach(() => {
    test.skip(
      !process.env.E2E_CONTRACTOR_EMAIL || !process.env.E2E_CONTRACTOR_PASSWORD,
      "Set E2E_CONTRACTOR_EMAIL and E2E_CONTRACTOR_PASSWORD to run this suite."
    )
  })

  // ─── 1. Stripe webhook / payment status ─────────────────────────────────────

  test("1 · Stripe webhook — payment_status becomes paid after checkout", async ({ browser, page }) => {
    const data: FlowTestData = await createFlowTestData()
    const service = createServiceRoleClient()
    let clientContext: BrowserContext | null = null

    const estimateNum = `RQA-${data.runId.slice(-8).toUpperCase()}`
    const clientName  = `Jordan Pipeburst ${data.runId.slice(-4)}`
    const address     = "123 Testwater Ave"
    const description = "Emergency bathroom sink pipe burst. Water leaked into cabinet."

    try {
      // ── Contractor: get request link ────────────────────────────────────────
      await login(page, data.contractorEmail, data.contractorPassword)
      await page.goto("/dashboard/job-requests")
      const requestLinkText = await page.getByTestId("contractor-request-link").textContent() ?? ""
      const slugMatch = requestLinkText.match(/\/request\/([^/\s]+)/)
      const requestUrl = `${process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3107"}/request/${slugMatch?.[1] ?? data.requestSlug}`

      // ── Client submits request (new page = incognito) ────────────────────────
      const clientCtx0 = await browser.newContext()
      const clientPage0 = await clientCtx0.newPage()
      const { jobRequestId, guestLink } = await submitJobRequest(
        clientPage0, requestUrl, clientName, data.clientEmail, description, address
      )
      data.jobRequestId = jobRequestId
      console.log(`✓ Job request created: ${jobRequestId}`)
      console.log(`Guest link: ${guestLink ?? "(not found on page)"}`)
      await clientCtx0.close()

      // ── Contractor: create estimate WITH payout amount ──────────────────────
      await page.goto("/dashboard/job-requests")
      await page.getByTestId("job-requests-refresh").click()
      const requestCard = page.locator(`[data-testid="job-request-card"][data-request-id="${jobRequestId}"]`)
      await expect(requestCard).toBeVisible({ timeout: 15_000 })

      await requestCard.getByTestId("job-request-view-details").click()
      const detailDialog = page.getByTestId("job-request-detail-dialog")
      await expect(detailDialog).toBeVisible()
      await detailDialog.getByTestId("job-request-create-estimate").click()

      const createDialog = page.getByTestId("create-estimate-dialog")
      await expect(createDialog).toBeVisible()
      await createDialog.getByTestId("estimate-number-input").fill(estimateNum)

      // Add line item (already pre-filled with default)
      const firstRow = createDialog.getByTestId("estimate-line-item-row").first()
      await firstRow.getByTestId("estimate-line-item-unit-price").fill("400")

      // Assert Online payment section is present in dialog
      await expect(createDialog.getByText("Online payment via Euroflo")).toBeVisible()
      const payoutField = createDialog.getByTestId("estimate-contractor-amount-input")
      await expect(payoutField).toBeVisible()
      console.log("✓ 'Online payment via Euroflo' section found in create dialog")

      // Fill payout: $400 → 15% fee → $460 client total
      await payoutField.fill("400")
      await expect(createDialog.getByText("Client total")).toBeVisible()
      console.log("✓ Payout $400 entered; fee breakdown preview visible")

      await createDialog.getByTestId("estimate-save-draft").click()
      await expect(createDialog).toBeHidden()

      // Verify payout persisted in DB (no DB workaround needed)
      const contractorDb = await createAuthenticatedClient(data.contractorEmail, data.contractorPassword)
      await expect
        .poll(async () => (await getEstimatesForJob(contractorDb, jobRequestId)).length)
        .toBeGreaterThan(0)
      const [draft] = await getEstimatesForJob(contractorDb, jobRequestId)
      data.estimateId = draft.id

      expect(draft.contractor_amount_cents, "contractor_amount_cents saved from dialog").toBe(40000)
      expect(draft.platform_fee_cents,      "platform_fee_cents saved from dialog").toBe(6000)
      expect(draft.client_total_cents,      "client_total_cents saved from dialog").toBe(46000)
      console.log("✓ Payout persisted in DB: $400 contractor / $60 fee / $460 client total")

      // Share estimate
      await page.goto("/dashboard/job-requests")
      await page.getByTestId("job-requests-refresh").click()
      const card2 = page.locator(`[data-testid="job-request-card"][data-request-id="${jobRequestId}"]`)
      await expect(card2).toBeVisible({ timeout: 10_000 })
      await card2.getByTestId("job-request-share-estimate").click()
      await expect
        .poll(async () => (await getEstimate(contractorDb, draft.id))?.status)
        .toBe("Sent")
      console.log("✓ Estimate shared with client")

      // ── Client: accept estimate and pay ─────────────────────────────────────
      const job = await getJobRequest(service, jobRequestId)

      // Use guest portal (no login required)
      // Get guest token from job_request_guest_access table
      const { data: guestRow } = await service
        .from("job_request_guest_access")
        .select("token")
        .eq("job_request_id", jobRequestId)
        .maybeSingle()

      if (!guestRow?.token) {
        console.warn("⚠️  No guest token found — using authenticated portal instead")
      }

      const portalUrl = guestRow?.token
        ? `/guest/project/${guestRow.token}`
        : `/client/portal/${jobRequestId}`

      clientContext = await browser.newContext()
      const clientPage = await clientContext.newPage()

      if (!guestRow?.token) {
        // Fall back to authenticated portal - need to set password
        const { setClientPassword } = await import("./helpers/supabase")
        await setClientPassword(service, job!.client_id!, data.clientPassword)
        await login(clientPage, data.clientEmail, data.clientPassword)
      }

      await clientPage.goto(portalUrl)
      await expect(clientPage.getByTestId("client-portal-status-card")).toBeVisible({ timeout: 15_000 })

      // Accept the estimate
      const estCard = clientPage.getByTestId("client-portal-estimate-card")
      await expect(estCard).toBeVisible({ timeout: 10_000 })
      await estCard.getByTestId("estimate-accept-button").click()
      console.log("✓ Client accepted estimate")

      // Wait for pay button
      await clientPage.waitForTimeout(1000)
      const payBtn = estCard.getByTestId("estimate-pay-button")
      await expect(payBtn).toBeVisible({ timeout: 10_000 })

      // Initiate Stripe checkout
      const [checkoutPage] = await Promise.all([
        clientContext.waitForEvent("page").catch(() => null),
        payBtn.click(),
      ])
      const targetPage = checkoutPage ?? clientPage
      await targetPage.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 })
      console.log("✓ Redirected to Stripe Checkout")

      // Fill card: 4242 4242 4242 4242 / 12/34 / 123 / V7J 1A1
      // Use pressSequentially for email — Stripe's Link input requires it
      const emailInput = targetPage.locator('input[type="email"], input[name="email"], input[autocomplete="email"]').first()
      if (await emailInput.count() > 0) {
        await emailInput.click()
        await emailInput.pressSequentially("jordan.pipeburst@example.com", { delay: 30 })
      }
      await targetPage.getByLabel("Card number").fill("4242424242424242")
      await targetPage.getByLabel("Expiration").fill("12 / 34")
      await targetPage.getByRole("textbox", { name: "CVC" }).fill("123")
      // Fill required cardholder name
      const nameField = targetPage.getByLabel("Cardholder name").or(targetPage.getByPlaceholder("Full name on card"))
      if (await nameField.count() > 0) await nameField.first().fill("Jordan Pipeburst")
      const postalField = targetPage.getByLabel("ZIP").or(targetPage.getByLabel("Postal code"))
      if (await postalField.count() > 0) await postalField.first().fill("V7J1A1")

      // Submit payment
      await targetPage.getByRole("button", { name: /pay|submit|confirm/i }).first().click()
      await targetPage.waitForURL(/\/success/, { timeout: 45_000 })
      const h1Text = await targetPage.locator("h1").first().textContent()
      console.log(`Success page h1: "${h1Text}"`)
      expect(h1Text).toMatch(/payment/i)

      // ── Poll up to 90 seconds for webhook to deliver ────────────────────────
      console.log("Polling DB for payment_status=paid (up to 90 seconds)...")
      let paid = false
      for (let i = 0; i < 18; i++) {
        await new Promise((r) => setTimeout(r, 5000))
        const est = await getEstimate(contractorDb, draft.id)
        if (est?.payment_status === "paid") { paid = true; break }
        console.log(`  ${(i + 1) * 5}s — payment_status: ${est?.payment_status}`)
      }

      const finalEst = await getEstimate(contractorDb, draft.id)
      console.log(`Final payment_status: ${finalEst?.payment_status}`)
      console.log(`paid_at: ${finalEst?.paid_at ?? "null"}`)
      console.log(`stripe_payment_intent_id: ${finalEst?.stripe_payment_intent_id ?? "null"}`)

      const { data: webhookEvents } = await service
        .from("stripe_webhook_events")
        .select("id, type, created_at")
        .eq("metadata->>'session_id'", finalEst?.stripe_checkout_session_id ?? "")
        .order("created_at", { ascending: false })
        .limit(5)
      console.log(`Webhook events for session: ${JSON.stringify(webhookEvents)}`)

      // Also check generic webhook events table
      const { data: allRecent } = await service
        .from("stripe_webhook_events")
        .select("id, type, created_at")
        .order("created_at", { ascending: false })
        .limit(5)
      console.log(`5 most recent webhook events: ${JSON.stringify(allRecent)}`)

      expect(
        finalEst?.payment_status,
        `payment_status should be 'paid' after 90s. Got '${finalEst?.payment_status}'. ` +
        `Stripe webhook endpoint may not be registered in Stripe Dashboard.`
      ).toBe("paid")

      // ── Contractor dashboard: should show Paid ────────────────────────────
      await page.bringToFront()
      await page.goto("/dashboard/estimates")
      await page.waitForLoadState("networkidle")
      const estRow = page.getByText(estimateNum).first().locator("..").locator("..")
      if (await estRow.count() > 0) {
        const rowText = await estRow.textContent()
        console.log(`Contractor estimate row: "${rowText?.slice(0, 200)}"`)
        const showsPaid = rowText?.toLowerCase().includes("paid")
        console.log(`Contractor dashboard shows paid: ${showsPaid ? "✓ YES" : "✗ NO"}`)
        expect(showsPaid).toBe(true)
      }

      // ── Client portal: should show Paid ───────────────────────────────────
      await clientPage.goto(portalUrl)
      await clientPage.waitForLoadState("networkidle")
      const paidBadge = clientPage.getByText(/paid/i).first()
      const clientShowsPaid = (await paidBadge.count()) > 0
      console.log(`Client portal shows paid: ${clientShowsPaid ? "✓ YES" : "✗ NO"}`)
      expect(clientShowsPaid).toBe(true)

      // ── Second payment attempt: should be blocked ──────────────────────────
      const blockResp = await page.request.post(
        `${process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3107"}/api/stripe/create-checkout-session`,
        {
          data: {
            estimateId: draft.id,
            successUrl: "https://example.com/success",
            cancelUrl:  "https://example.com/cancel",
          },
          headers: { "Content-Type": "application/json" },
        }
      )
      console.log(`Second payment attempt: ${blockResp.status()} — ${(await blockResp.text()).slice(0, 200)}`)
      expect(blockResp.status()).toBe(409)

    } finally {
      await clientContext?.close()
      await cleanupFlowTestData(data)
    }
  })

  // ─── 2. Online payment field in create-estimate dialog ──────────────────────

  test("2 · create-estimate dialog includes online payment / payout field", async ({ page }) => {
    const data: FlowTestData = await createFlowTestData()
    const service = createServiceRoleClient()

    try {
      await login(page, data.contractorEmail, data.contractorPassword)
      await page.goto("/dashboard/job-requests")
      const requestLinkText = await page.getByTestId("contractor-request-link").textContent() ?? ""
      const slugMatch = requestLinkText.match(/\/request\/([^/\s]+)/)
      const requestUrl = `${process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3107"}/request/${slugMatch?.[1] ?? data.requestSlug}`

      // Submit a quick request
      const ctx = await page.context().browser()!.newContext()
      const reqPage = await ctx.newPage()
      const { jobRequestId } = await submitJobRequest(
        reqPage, requestUrl, "Jordan Pipeburst", data.clientEmail,
        "Emergency pipe burst under bathroom sink.", "123 Testwater Ave"
      )
      data.jobRequestId = jobRequestId
      await ctx.close()

      await page.goto("/dashboard/job-requests")
      await page.getByTestId("job-requests-refresh").click()
      const card = page.locator(`[data-testid="job-request-card"][data-request-id="${jobRequestId}"]`)
      await expect(card).toBeVisible({ timeout: 15_000 })

      // Open create estimate dialog from job-requests page
      await card.getByTestId("job-request-view-details").click()
      const onlineDlgDetail = page.getByTestId("job-request-detail-dialog")
      await expect(onlineDlgDetail).toBeVisible()
      // Scope to dialog to avoid strict-mode violation from multiple cards on page
      await onlineDlgDetail.getByTestId("job-request-create-estimate").click()
      const dlg = page.getByTestId("create-estimate-dialog")
      await expect(dlg).toBeVisible()

      // Assert all three elements of the Online payment section
      await expect(dlg.getByText("Online payment via Euroflo")).toBeVisible()
      await expect(dlg.getByTestId("estimate-contractor-amount-input")).toBeVisible()
      console.log("✓ 'Online payment via Euroflo' heading visible")
      console.log("✓ estimate-contractor-amount-input visible")

      // Fill payout and verify fee preview appears
      await dlg.getByTestId("estimate-contractor-amount-input").fill("500")
      await expect(dlg.getByText("Client total")).toBeVisible()
      await expect(dlg.getByText(`Euroflo`)).toBeVisible()
      console.log("✓ Fee breakdown preview visible after filling payout amount")

      // Screenshot the completed dialog
      await dlg.screenshot({ path: "test-results/create-estimate-dialog-payment-fields.png" })

    } finally {
      await cleanupFlowTestData(data)
    }
  })

  // ─── 3. Site visit flow ──────────────────────────────────────────────────────

  test("3a · site visit — client confirms proposed time", async ({ browser, page }) => {
    const data: FlowTestData = await createFlowTestData()
    const service = createServiceRoleClient()
    let clientContext: BrowserContext | null = null

    try {
      await login(page, data.contractorEmail, data.contractorPassword)
      await page.goto("/dashboard/job-requests")
      const requestLinkText = await page.getByTestId("contractor-request-link").textContent() ?? ""
      const slugMatch = requestLinkText.match(/\/request\/([^/\s]+)/)
      const requestUrl = `${process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3107"}/request/${slugMatch?.[1] ?? data.requestSlug}`

      // Client submits request
      const ctx0 = await browser.newContext()
      const reqPage = await ctx0.newPage()
      const { jobRequestId } = await submitJobRequest(
        reqPage, requestUrl, "Jordan Pipeburst", data.clientEmail,
        "Emergency pipe burst — need inspection first.", "123 Testwater Ave"
      )
      data.jobRequestId = jobRequestId
      await ctx0.close()
      console.log(`✓ Job request: ${jobRequestId}`)

      // Contractor proposes site visit
      await page.goto("/dashboard/job-requests")
      await page.getByTestId("job-requests-refresh").click()
      const card = page.locator(`[data-testid="job-request-card"][data-request-id="${jobRequestId}"]`)
      await expect(card).toBeVisible({ timeout: 15_000 })

      // Click "Propose site visit"
      const proposeBtn = card.getByTestId("job-request-schedule-inspection")
        .or(card.getByRole("button", { name: /propose site visit|site visit|schedule inspection/i }))
      await expect(proposeBtn.first()).toBeVisible()
      await proposeBtn.first().click()

      // Fill in the inspection dialog
      const inspDlg = page.getByRole("dialog").filter({ hasText: /site visit|inspection/i }).first()
      await expect(inspDlg).toBeVisible()
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateStr = tomorrow.toISOString().slice(0, 10)
      await inspDlg.locator('input[type="date"]').fill(dateStr)
      await inspDlg.locator('input[type="time"]').first().fill("10:00")
      await inspDlg.locator('textarea').fill("Please have access to the bathroom.").catch(() => {})
      await inspDlg.getByRole("button", { name: /schedule|confirm|save/i }).last().click()
      console.log(`✓ Contractor proposed site visit for ${dateStr} 10:00`)

      // Verify DB status
      await expect
        .poll(async () => (await getJobRequest(service, jobRequestId))?.status)
        .toBe("inspection_scheduled")
      console.log("✓ job_request.status = inspection_scheduled")

      // Get guest token for client portal
      const { data: guestRow } = await service
        .from("job_request_guest_access")
        .select("token")
        .eq("job_request_id", jobRequestId)
        .maybeSingle()

      const portalUrl = guestRow?.token
        ? `/guest/project/${guestRow.token}`
        : (() => { throw new Error("No guest token — cannot test client portal") })()

      // Client views portal
      clientContext = await browser.newContext()
      const clientPage = await clientContext.newPage()
      await clientPage.goto(portalUrl)
      await expect(clientPage.getByTestId("client-portal-status-card")).toBeVisible({ timeout: 15_000 })

      // Status should be "Site Visit Proposed"
      const status = await clientPage.getByTestId("client-portal-status").textContent()
      console.log(`Client portal status: "${status}"`)
      expect(status).toMatch(/site visit|inspection/i)

      // Inspection card should be visible
      const inspCard = clientPage.getByTestId("inspection-card")
      await expect(inspCard).toBeVisible()
      console.log("✓ Inspection card visible in client portal")

      // Client confirms the visit
      const confirmBtn = inspCard.getByTestId("inspection-confirm-button")
        .or(inspCard.getByRole("button", { name: /confirm/i }))
      await expect(confirmBtn.first()).toBeVisible()
      await confirmBtn.first().click()
      console.log("✓ Client clicked confirm")

      // Verify DB status → inspection_confirmed
      await expect
        .poll(async () => (await getJobRequest(service, jobRequestId))?.status, { timeout: 15_000 })
        .toBe("inspection_confirmed")
      console.log("✓ job_request.status = inspection_confirmed")

      // Client portal should now show confirmed state
      await clientPage.waitForTimeout(500)
      await clientPage.reload()
      await expect(clientPage.getByTestId("inspection-card")).toBeVisible()
      const cardText = await clientPage.getByTestId("inspection-card").textContent()
      expect(cardText).toMatch(/confirmed/i)
      console.log("✓ Inspection card shows confirmed state")

      // Contractor: mark visit completed
      await page.bringToFront()
      await page.goto("/dashboard/job-requests")
      await page.getByTestId("job-requests-refresh").click()
      await expect(card).toBeVisible({ timeout: 10_000 })
      const completeBtn = card.getByTestId("mark-visit-completed")
        .or(card.getByRole("button", { name: /mark visit complete|visit complete/i }))
      await expect(completeBtn.first()).toBeVisible()
      await completeBtn.first().click()
      console.log("✓ Contractor marked visit completed")

      await expect
        .poll(async () => (await getJobRequest(service, jobRequestId))?.status, { timeout: 10_000 })
        .toBe("visit_completed")
      console.log("✓ job_request.status = visit_completed")

    } finally {
      await clientContext?.close()
      await cleanupFlowTestData(data)
    }
  })

  test("3b · site visit — client suggests different time, contractor accepts", async ({ browser, page }) => {
    const data: FlowTestData = await createFlowTestData()
    const service = createServiceRoleClient()
    let clientContext: BrowserContext | null = null

    try {
      await login(page, data.contractorEmail, data.contractorPassword)
      await page.goto("/dashboard/job-requests")
      const requestLinkText = await page.getByTestId("contractor-request-link").textContent() ?? ""
      const slugMatch = requestLinkText.match(/\/request\/([^/\s]+)/)
      const requestUrl = `${process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3107"}/request/${slugMatch?.[1] ?? data.requestSlug}`

      // Client submits request
      const ctx0 = await browser.newContext()
      const reqPage = await ctx0.newPage()
      const { jobRequestId } = await submitJobRequest(
        reqPage, requestUrl, "Jordan Pipeburst", data.clientEmail,
        "Burst pipe — counter-proposal test.", "123 Testwater Ave"
      )
      data.jobRequestId = jobRequestId
      await ctx0.close()

      // Contractor proposes site visit
      await page.goto("/dashboard/job-requests")
      await page.getByTestId("job-requests-refresh").click()
      const card = page.locator(`[data-testid="job-request-card"][data-request-id="${jobRequestId}"]`)
      await expect(card).toBeVisible({ timeout: 15_000 })

      const proposeBtn = card.getByTestId("job-request-schedule-inspection")
        .or(card.getByRole("button", { name: /propose site visit|site visit|schedule inspection/i }))
      await proposeBtn.first().click()

      const inspDlg = page.getByRole("dialog").filter({ hasText: /site visit|inspection/i }).first()
      await expect(inspDlg).toBeVisible()
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateStr = tomorrow.toISOString().slice(0, 10)
      await inspDlg.locator('input[type="date"]').fill(dateStr)
      await inspDlg.locator('input[type="time"]').first().fill("09:00")
      await inspDlg.getByRole("button", { name: /schedule|confirm|save/i }).last().click()

      await expect
        .poll(async () => (await getJobRequest(service, jobRequestId))?.status)
        .toBe("inspection_scheduled")
      console.log(`✓ Contractor proposed: ${dateStr} 09:00`)

      // Get guest token
      const { data: guestRow } = await service
        .from("job_request_guest_access")
        .select("token")
        .eq("job_request_id", jobRequestId)
        .maybeSingle()
      const portalUrl = `/guest/project/${guestRow!.token}`

      // Client suggests a different time
      clientContext = await browser.newContext()
      const clientPage = await clientContext.newPage()
      await clientPage.goto(portalUrl)
      await expect(clientPage.getByTestId("inspection-card")).toBeVisible({ timeout: 15_000 })

      const suggestBtn = clientPage.getByRole("button", { name: /suggest.*different|different time/i })
      await expect(suggestBtn).toBeVisible()
      await suggestBtn.click()
      console.log("✓ Client clicked 'Suggest a different time'")

      // Fill in counter-proposal form
      const dayAfterTomorrow = new Date()
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2)
      const counterDate = dayAfterTomorrow.toISOString().slice(0, 10)
      await clientPage.locator('input[type="date"]').last().fill(counterDate)
      await clientPage.locator('input[type="time"]').last().fill("14:00")
      await clientPage.getByRole("button", { name: /send suggestion/i }).click()
      console.log(`✓ Client suggested: ${counterDate} 14:00`)

      // Verify DB: visit_client_proposed_at set
      await expect
        .poll(async () => {
          const job = await getJobRequest(service, jobRequestId)
          return job?.visit_client_proposed_at !== null
        }, { timeout: 15_000 })
        .toBe(true)
      const jobAfterSuggest = await getJobRequest(service, jobRequestId)
      console.log(`✓ visit_client_proposed_at: ${jobAfterSuggest?.visit_client_proposed_at}`)
      expect(jobAfterSuggest?.status).toBe("inspection_scheduled")

      // Contractor sees client suggestion and accepts it
      await page.bringToFront()
      await page.goto("/dashboard/job-requests")
      await page.getByTestId("job-requests-refresh").click()
      await expect(card).toBeVisible({ timeout: 10_000 })

      // The card should show "Accept client's time" button
      const acceptProposalBtn = card.getByTestId("accept-client-proposal")
        .or(card.getByRole("button", { name: /accept.*client|client.*time/i }))
      await expect(acceptProposalBtn.first()).toBeVisible()
      await acceptProposalBtn.first().click()
      console.log("✓ Contractor accepted client's proposed time")

      // Verify DB: inspection_confirmed, scheduled_visit_starts_at updated
      await expect
        .poll(async () => (await getJobRequest(service, jobRequestId))?.status, { timeout: 15_000 })
        .toBe("inspection_confirmed")
      const jobAfterAccept = await getJobRequest(service, jobRequestId)
      console.log(`✓ Status: inspection_confirmed`)
      console.log(`✓ scheduled_visit_starts_at: ${jobAfterAccept?.scheduled_visit_starts_at}`)
      // The starts_at should now match the client's counter-proposal
      expect(jobAfterAccept?.visit_client_proposed_at).toBeNull()

      // Client portal should reflect the confirmed state
      await clientPage.reload()
      await clientPage.waitForLoadState("networkidle")
      const cardText = await clientPage.getByTestId("inspection-card").textContent()
      console.log(`Client inspection card text: "${cardText?.slice(0, 100)}"`)
      expect(cardText).toMatch(/confirmed/i)

    } finally {
      await clientContext?.close()
      await cleanupFlowTestData(data)
    }
  })

  // ─── 4. Decline reason flow ──────────────────────────────────────────────────

  test("4 · decline reason — structured form, contractor sees reason + post-decline actions", async ({ browser, page }) => {
    const data: FlowTestData = await createFlowTestData()
    const service = createServiceRoleClient()
    let clientContext: BrowserContext | null = null

    const estimateNum = `DEC-${data.runId.slice(-8).toUpperCase()}`

    try {
      await login(page, data.contractorEmail, data.contractorPassword)
      await page.goto("/dashboard/job-requests")
      const requestLinkText = await page.getByTestId("contractor-request-link").textContent() ?? ""
      const slugMatch = requestLinkText.match(/\/request\/([^/\s]+)/)
      const requestUrl = `${process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3107"}/request/${slugMatch?.[1] ?? data.requestSlug}`

      // Client submits request
      const ctx0 = await browser.newContext()
      const reqPage = await ctx0.newPage()
      const { jobRequestId } = await submitJobRequest(
        reqPage, requestUrl, "Jordan Pipeburst", data.clientEmail,
        "Burst pipe — need estimate.", "123 Testwater Ave"
      )
      data.jobRequestId = jobRequestId
      await ctx0.close()

      // Contractor creates and sends estimate
      await page.goto("/dashboard/job-requests")
      await page.getByTestId("job-requests-refresh").click()
      const card = page.locator(`[data-testid="job-request-card"][data-request-id="${jobRequestId}"]`)
      await expect(card).toBeVisible({ timeout: 15_000 })

      await card.getByTestId("job-request-view-details").click()
      const decDetailDlg = page.getByTestId("job-request-detail-dialog")
      await expect(decDetailDlg).toBeVisible()
      await decDetailDlg.getByTestId("job-request-create-estimate").click()
      const dlg = page.getByTestId("create-estimate-dialog")
      await expect(dlg).toBeVisible()
      await dlg.getByTestId("estimate-number-input").fill(estimateNum)
      const firstRow = dlg.getByTestId("estimate-line-item-row").first()
      await firstRow.getByTestId("estimate-line-item-unit-price").fill("1500")

      await dlg.getByTestId("estimate-send-to-client").click()
      await expect(dlg).toBeHidden()
      console.log("✓ Estimate sent to client")

      const contractorDb = await createAuthenticatedClient(data.contractorEmail, data.contractorPassword)
      await expect
        .poll(async () => (await getEstimatesForJob(contractorDb, jobRequestId))[0]?.status)
        .toBe("Sent")
      const [estimate] = await getEstimatesForJob(contractorDb, jobRequestId)
      data.estimateId = estimate.id

      // Get guest token for client
      const { data: guestRow } = await service
        .from("job_request_guest_access")
        .select("token")
        .eq("job_request_id", jobRequestId)
        .maybeSingle()

      const portalUrl = `/guest/project/${guestRow!.token}`

      // Client views portal and declines estimate
      clientContext = await browser.newContext()
      const clientPage = await clientContext.newPage()
      await clientPage.goto(portalUrl)
      await expect(clientPage.getByTestId("client-portal-estimate-card")).toBeVisible({ timeout: 15_000 })
      console.log("✓ Client sees estimate in portal")

      // Click Decline
      await clientPage.getByTestId("estimate-decline-button").click()
      console.log("✓ Client clicked Decline")

      // The decline reason form should appear inline
      const reasonForm = clientPage.locator("text=Why are you declining?").first()
      await expect(reasonForm).toBeVisible({ timeout: 5_000 })
      console.log("✓ Decline reason form appeared")

      // Check all 6 reason options are present
      const reasons = [
        { value: "price_too_high",   label: /price.*high/i },
        { value: "scope_changed",    label: /scope/i },
        { value: "hired_another",    label: /hired.*another|someone else/i },
        { value: "no_longer_needed", label: /no longer/i },
        { value: "timeline",         label: /timeline/i },
        { value: "other",            label: /other/i },
      ]
      for (const { label } of reasons) {
        const opt = clientPage.getByText(label)
        await expect(opt.first()).toBeVisible()
      }
      console.log("✓ All 6 decline reason options visible")

      // Select "Price is too high"
      await clientPage.locator('input[type="radio"][value="price_too_high"]').click({ force: true })
      console.log("✓ Selected: price_too_high")

      // Add optional comment
      const commentBox = clientPage.locator('textarea').last()
      await commentBox.fill("The quote is $500 over our budget for this repair.")

      // Screenshot the decline form
      await clientPage.getByTestId("client-portal-estimate-card").screenshot({
        path: "test-results/decline-reason-form.png",
      })

      // Submit decline
      await clientPage.getByTestId("estimate-decline-confirm").click()
      console.log("✓ Client submitted decline")

      // Verify DB
      await expect
        .poll(async () => (await getEstimate(contractorDb, estimate.id))?.status, { timeout: 15_000 })
        .toBe("Declined")
      const finalEst = await getEstimate(contractorDb, estimate.id)
      console.log(`✓ estimate.status = Declined`)
      console.log(`✓ estimate.decline_reason = ${finalEst?.decline_reason}`)
      console.log(`✓ estimate.decline_comment = ${finalEst?.decline_comment}`)
      expect(finalEst?.decline_reason).toBe("price_too_high")
      expect(finalEst?.decline_comment).toContain("$500 over our budget")

      const finalJob = await getJobRequest(service, jobRequestId)
      console.log(`✓ job_request.status = ${finalJob?.status}`)
      expect(finalJob?.status).toBe("declined")

      // ── Contractor sees decline reason + post-decline actions ──────────────
      await page.bringToFront()
      await page.goto("/dashboard/job-requests")
      await page.getByTestId("job-requests-refresh").click()
      await expect(card).toBeVisible({ timeout: 10_000 })

      // Open request details — should show decline reason
      await card.getByTestId("job-request-view-details").click()
        .catch(() => {}) // might be in the card buttons directly
      const detailDlg = page.getByTestId("job-request-detail-dialog")
      const dlgVisible = await detailDlg.isVisible()

      if (dlgVisible) {
        const dlgText = await detailDlg.textContent()
        console.log(`Detail dialog text snippet: "${dlgText?.slice(0, 300)}"`)
      }

      // Post-decline action buttons should appear on card
      const reviseBtn = card.getByRole("button", { name: /revise.*estimate|revise/i })
        .or(page.getByRole("button", { name: /revise.*estimate|revise/i }))
      const visitBtn  = card.getByRole("button", { name: /propose.*site|site visit|propose visit/i })
        .or(page.getByRole("button", { name: /propose.*site|site visit|propose visit/i }))
      const closeBtn  = card.getByRole("button", { name: /close.*job|close/i })
        .or(page.getByRole("button", { name: /close.*job|close/i }))

      const hasRevise = await reviseBtn.first().isVisible().catch(() => false)
      const hasVisit  = await visitBtn.first().isVisible().catch(() => false)
      const hasClose  = await closeBtn.first().isVisible().catch(() => false)

      console.log(`Post-decline actions — Revise: ${hasRevise}, Propose visit: ${hasVisit}, Close: ${hasClose}`)

      await card.screenshot({ path: "test-results/post-decline-card.png" })

      expect(hasRevise, "Revise estimate button should appear after client declines").toBe(true)
      expect(hasVisit,  "Propose site visit button should appear after client declines").toBe(true)
      expect(hasClose,  "Close job button should appear after client declines").toBe(true)

    } finally {
      await clientContext?.close()
      await cleanupFlowTestData(data)
    }
  })
})
