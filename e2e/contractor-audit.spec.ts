/**
 * CONTRACTOR-PERSPECTIVE AUDIT (not a pass/fail test).
 *
 * Drives the real product end-to-end against the running dev server + live
 * Supabase + Stripe TEST mode, captures a screenshot at every screen, and logs
 * plain observations. Steps are wrapped so one breakage still yields evidence —
 * a broken step IS a finding. Screenshots land in ./audit-screens.
 */
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import { expect, type Page, test } from "@playwright/test"

import { loadEnv } from "./helpers/env"
import {
  cleanupFlowTestData,
  createAuthenticatedClient,
  createFlowTestData,
  createServiceRoleClient,
  getEstimate,
  getEstimatesForJob,
  getJobRequest,
  setClientPassword,
  type FlowTestData,
} from "./helpers/supabase"

loadEnv()

const SHOT_DIR = path.join(process.cwd(), "audit-screens")
fs.mkdirSync(SHOT_DIR, { recursive: true })

const log: string[] = []
function note(msg: string) {
  log.push(msg)
  console.log(`AUDIT: ${msg}`)
}

let shotN = 0
async function shot(page: Page, name: string) {
  shotN += 1
  const file = path.join(SHOT_DIR, `${String(shotN).padStart(2, "0")}-${name}.png`)
  try {
    await page.screenshot({ path: file, fullPage: true })
  } catch (e) {
    note(`screenshot failed for ${name}: ${String(e)}`)
  }
}

const pngBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
)

async function login(page: Page, email: string, password: string) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
}

test.describe("contractor audit", () => {
  test.skip(
    !process.env.E2E_CONTRACTOR_EMAIL || !process.env.E2E_CONTRACTOR_PASSWORD,
    "Set E2E_CONTRACTOR_EMAIL and E2E_CONTRACTOR_PASSWORD."
  )

  test("full money path + mobile", async ({ browser, page }) => {
    test.setTimeout(240_000)
    const data: FlowTestData = await createFlowTestData()
    const supabase = createServiceRoleClient()
    const contractorDb = await createAuthenticatedClient(
      data.contractorEmail,
      data.contractorPassword
    )

    const clientName = `Audit Client ${data.runId}`
    const estimateNumber = `AUD-${data.runId.slice(-8).toUpperCase()}`
    const payout = "1000"

    try {
      // ── 0. Public marketing/landing & auth screens ───────────────────────────
      await page.goto("/")
      await shot(page, "landing")
      await page.goto("/signup")
      await shot(page, "signup")

      // ── 1/2. Contractor login ────────────────────────────────────────────────
      await login(page, data.contractorEmail, data.contractorPassword)
      await expect(page).toHaveURL(/\/dashboard(?:\?|$|\/$)/)
      note(`login OK → ${page.url()}`)

      // ── 3. Dashboard (Today) ─────────────────────────────────────────────────
      await page.waitForTimeout(1500)
      await shot(page, "dashboard-today")

      // ── 4. Request link discoverability ──────────────────────────────────────
      const todayLink = page.getByTestId("today-request-link")
      note(`request link visible on dashboard home: ${await todayLink.count()} match(es)`)
      await page.getByRole("link", { name: "Job Requests" }).click()
      await expect(page).toHaveURL(/\/dashboard\/job-requests/)
      await shot(page, "job-requests-empty")
      await expect(page.getByTestId("contractor-request-link")).toContainText(
        `/request/${data.requestSlug}`
      )

      // ── 5. Client submits a job request (new tab = real public form) ─────────
      const [requestPage] = await Promise.all([
        page.context().waitForEvent("page"),
        page.getByTestId("public-request-preview-link").click(),
      ])
      await requestPage.waitForLoadState("domcontentloaded")
      await shot(requestPage, "public-request-form")
      await requestPage.getByLabel("Full name").fill(clientName)
      await requestPage.getByLabel("Phone number").fill("604-555-0142")
      await requestPage.getByLabel("Email address").fill(data.clientEmail)
      // trade select (only appears for 0 or 2+ trades) — tolerate absence
      try {
        const sel = requestPage.locator('select[name="trade"], [data-testid="request-trade-select"]')
        if ((await sel.count()) > 0) await sel.first().selectOption({ index: 1 }).catch(() => {})
      } catch {}
      await requestPage.getByTestId("request-title-input").fill("Leaky kitchen sink")
      await requestPage.getByLabel("Project description").fill(
        `Leaking shutoff valve under the kitchen sink, needs replacing. ${data.runId}`
      )
      await requestPage.getByLabel("Street address").fill("123 Audit Lane")
      await requestPage.getByLabel("City").fill("Vancouver, BC")
      await requestPage.getByTestId("request-photo-input").setInputFiles({
        name: "leak.png",
        mimeType: "image/png",
        buffer: pngBuffer,
      })
      const submitResp = requestPage.waitForResponse(
        (r) => r.url().includes("/api/client-request") && r.request().method() === "POST"
      )
      await requestPage.getByTestId("request-submit-button").click()
      const resp = await submitResp
      const body = (await resp.json()) as { jobRequestId: string; emailSent?: boolean }
      data.jobRequestId = body.jobRequestId
      note(`client submit status=${resp.status()} emailSent=${body.emailSent}`)
      await expect(requestPage.getByTestId("request-confirmed")).toBeVisible()
      await shot(requestPage, "client-request-confirmed")
      await requestPage.close()

      // ── 6. Contractor reviews the request ────────────────────────────────────
      await page.bringToFront()
      await page.getByTestId?.("job-requests-refresh")?.click?.().catch(() => {})
      await page.getByTestId("job-requests-refresh").click().catch(() => {})
      const card = page.locator(
        `[data-testid="job-request-card"][data-request-id="${data.jobRequestId}"]`
      )
      await expect(card).toBeVisible()
      await shot(page, "job-requests-with-new")
      await card.getByTestId("job-request-view-details").click()
      const detail = page.getByTestId("job-request-detail-dialog")
      await expect(detail).toBeVisible()
      await shot(page, "request-detail-dialog")
      // close dialog
      await page.keyboard.press("Escape").catch(() => {})

      // ── 7. Create estimate (with an online-payable payout amount) ────────────
      await card.getByTestId("job-request-create-estimate").click()
      const dlg = page.getByTestId("create-estimate-dialog")
      await expect(dlg).toBeVisible()
      await shot(page, "create-estimate-dialog")
      await dlg.getByTestId("estimate-number-input").fill(estimateNumber)
      await dlg.getByTestId("estimate-add-line-item").click()
      const row = dlg.getByTestId("estimate-line-item-row").first()
      await row.getByTestId("estimate-line-item-description").fill("Replace kitchen shutoff valve")
      await row.getByTestId("estimate-line-item-quantity").fill("1")
      await row.getByTestId("estimate-line-item-unit-price").fill("1000")
      // payout amount drives online payment
      const payoutInput = dlg.getByTestId("estimate-contractor-amount-input")
      if ((await payoutInput.count()) > 0) {
        await payoutInput.fill(payout)
        note("payout amount field present — filled for online payment")
      } else {
        note("WARNING: payout amount field NOT found in create-estimate dialog")
      }
      await shot(page, "create-estimate-filled")

      // Send to client directly if available, else save draft then share.
      const sendBtn = dlg.getByRole("button", { name: /send to client/i })
      if ((await sendBtn.count()) > 0) {
        await sendBtn.first().click()
      } else {
        await dlg.getByTestId("estimate-save-draft").click()
      }
      await expect(dlg).toBeHidden({ timeout: 20_000 }).catch(() => {})
      await page.waitForTimeout(1500)
      await shot(page, "after-estimate-create")

      let estimates = await getEstimatesForJob(contractorDb, data.jobRequestId!)
      data.estimateId = estimates[0]?.id
      note(`estimate created status=${estimates[0]?.status} amount=${estimates[0]?.amount}`)

      // ── 8. Ensure estimate is Sent (share if still draft) ────────────────────
      if (estimates[0]?.status === "Draft") {
        const share = card.getByTestId("job-request-share-estimate")
        if ((await share.count()) > 0) {
          await share.click()
          await page.waitForTimeout(1500)
        }
      }
      await expect
        .poll(async () => (await getEstimate(contractorDb, data.estimateId!))?.status, {
          timeout: 15_000,
        })
        .toBe("Sent")
        .catch(() => note("estimate did not reach Sent state"))
      await shot(page, "estimate-sent-toast")

      // ── 9-11. Client views, accepts, pays ────────────────────────────────────
      const job = await getJobRequest(supabase, data.jobRequestId!)
      data.clientUserId = job!.client_id
      await setClientPassword(supabase, data.clientUserId!, data.clientPassword)

      const clientCtx = await browser.newContext()
      const clientPage = await clientCtx.newPage()
      try {
        await login(clientPage, data.clientEmail, data.clientPassword)
        await clientPage.waitForURL(/\/client/, { timeout: 20_000 }).catch(() => {})
        await clientPage.goto(`/client/portal/${data.jobRequestId}`)
        await clientPage.waitForLoadState("networkidle").catch(() => {})
        await expect(clientPage.getByTestId("client-portal-status-card")).toBeVisible({
          timeout: 30_000,
        })
        await shot(clientPage, "client-portal-estimate-ready")

        const estCard = clientPage.getByTestId("client-portal-estimate-card")
        await expect(estCard).toBeVisible()
        await estCard.getByTestId("estimate-accept-button").click()
        await expect
          .poll(async () => (await getEstimate(contractorDb, data.estimateId!))?.status, {
            timeout: 15_000,
          })
          .toBe("Accepted")
          .catch(() => note("estimate did not reach Accepted"))
        await clientPage.waitForTimeout(1200)
        await shot(clientPage, "client-portal-accepted")

        // Pay
        const payBtn = clientPage.getByTestId("estimate-pay-button")
        if ((await payBtn.count()) === 0) {
          note("NO pay button after acceptance — online payment not offered to client")
        } else {
          note(`pay button label: "${(await payBtn.first().innerText()).trim()}"`)
          await payBtn.first().click()
          // Either redirects to Stripe Checkout or shows an error toast
          await clientPage.waitForTimeout(4000)
          note(`after pay click, url = ${clientPage.url()}`)
          await shot(clientPage, "after-pay-click")

          if (clientPage.url().includes("checkout.stripe.com")) {
            note("reached Stripe Checkout")
            try {
              await clientPage.getByRole("textbox", { name: /card number/i }).fill("4242424242424242", { timeout: 10_000 })
              await clientPage.getByRole("textbox", { name: /expir/i }).fill("12 / 34")
              await clientPage.getByRole("textbox", { name: /cvc/i }).fill("123")
              const nameField = clientPage.getByRole("textbox", { name: /name on card/i })
              if ((await nameField.count()) > 0) await nameField.fill(clientName)
              const zip = clientPage.getByRole("textbox", { name: /zip|postal/i })
              if ((await zip.count()) > 0) await zip.fill("V5K0A1")
              await shot(clientPage, "stripe-checkout-filled")
              await clientPage.getByTestId("hosted-payment-submit-button").click().catch(async () => {
                await clientPage.getByRole("button", { name: /pay/i }).first().click()
              })
              await clientPage.waitForTimeout(8000)
              note(`after stripe pay, url = ${clientPage.url()}`)
              await shot(clientPage, "after-stripe-pay")
            } catch (e) {
              note(`Stripe Checkout form interaction failed: ${String(e).slice(0, 160)}`)
              await shot(clientPage, "stripe-checkout-state")
            }
          }
        }

        // ── 13. Payment confirmation state in portal ──────────────────────────
        await clientPage.goto(`/client/portal/${data.jobRequestId}`).catch(() => {})
        await clientPage.waitForTimeout(1500)
        await shot(clientPage, "client-portal-after-payment")
        const est = await getEstimate(contractorDb, data.estimateId!)
        note(`estimate payment_status after flow = ${(est as { payment_status?: string })?.payment_status}`)

        // ── 17. Mobile pass ───────────────────────────────────────────────────
        const mobileCtx = await browser.newContext({
          viewport: { width: 390, height: 844 },
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
        })
        const m = await mobileCtx.newPage()
        try {
          await m.goto(`/request/${data.requestSlug}`)
          await m.waitForTimeout(800)
          await shot(m, "mobile-public-request-form")
          await login(m, data.clientEmail, data.clientPassword)
          await m.goto(`/client/portal/${data.jobRequestId}`)
          await m.waitForTimeout(1200)
          await shot(m, "mobile-client-portal")
        } finally {
          await mobileCtx.close()
        }
      } finally {
        await clientCtx.close()
      }

      // ── 14/15. Contractor: follow-ups + invoices screens ─────────────────────
      await page.bringToFront()
      await page.goto("/dashboard/recoveries").catch(() => {})
      await page.waitForTimeout(1200)
      await shot(page, "follow-ups")
      await page.goto("/dashboard/invoices").catch(() => {})
      await page.waitForTimeout(1200)
      await shot(page, "invoices")
      await page.goto("/dashboard/settings").catch(() => {})
      await page.waitForTimeout(1200)
      await shot(page, "settings-stripe")
    } finally {
      fs.writeFileSync(path.join(SHOT_DIR, "_observations.txt"), log.join("\n"), "utf8")
      await cleanupFlowTestData(data).catch((e) =>
        note(`cleanup warning: ${String(e).slice(0, 200)}`)
      )
    }
  })
})
