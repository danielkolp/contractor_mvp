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

async function chooseRequestTitle(page: Page) {
  await expect(page.getByTestId("request-submit-button")).toBeEnabled()

  // Trade is now stored separately from the title. Pick a trade (from the
  // dropdown when present; the single-trade case uses a hidden input) so the
  // request is categorized, then fill the required free-text job title.
  const tradeSelect = page.locator(
    '[data-testid="request-trade-select"], select[name="trade"]'
  )

  if ((await tradeSelect.count()) > 0 && (await tradeSelect.first().isVisible())) {
    const optionValues = await tradeSelect
      .first()
      .locator("option:not([disabled])")
      .evaluateAll((options) =>
        options
          .map((option) => (option as HTMLOptionElement).value.trim())
          .filter(Boolean)
      )

    const selectedTrade = optionValues.includes("Plumbing")
      ? "Plumbing"
      : optionValues[0]

    if (selectedTrade) {
      await tradeSelect.first().selectOption(selectedTrade)
    }
  }

  const title = "Leaky kitchen sink"
  await page.getByTestId("request-title-input").fill(title)
  return title
}

test.describe("contractor/client request flow", () => {
  test.beforeEach(() => {
    test.skip(
      !process.env.E2E_CONTRACTOR_EMAIL ||
        !process.env.E2E_CONTRACTOR_PASSWORD,
      "Set E2E_CONTRACTOR_EMAIL and E2E_CONTRACTOR_PASSWORD to run this suite."
    )
  })

  test("public request with photo becomes a shared estimate the client can accept", async ({
    browser,
    page,
  }) => {
    const data: FlowTestData = await createFlowTestData()
    const supabase = createServiceRoleClient()
    const contractorDb = await createAuthenticatedClient(
      data.contractorEmail,
      data.contractorPassword
    )

    const clientName = `E2E Client ${data.runId}`
    const clientPhone = "604-555-0199"
    const address = "123 E2E Test Lane"
    const city = "Vancouver, BC"
    const description = `Please replace the shutoff valve and install a utility sink. ${data.runId}`
    const photoNotes = `Photo shows the existing valve. ${data.runId}`
    const lineItem = `Utility sink and shutoff replacement ${data.runId}`
    const estimateNotes = `Includes disposal, cleanup, and standard parts. ${data.runId}`
    const estimateNumber = `E2E-${data.runId.slice(-8).toUpperCase()}`

    try {
      await login(page, data.contractorEmail, data.contractorPassword)
      await expect(page).toHaveURL(/\/dashboard(?:\?|$|\/$)/)

      await page.getByRole("link", { name: "Job Requests" }).click()
      await expect(page).toHaveURL(/\/dashboard\/job-requests/)
      await expect(page.getByTestId("contractor-request-link")).toContainText(
        `/request/${data.requestSlug}`
      )

      const [requestPage] = await Promise.all([
        page.context().waitForEvent("page"),
        page.getByTestId("public-request-preview-link").click(),
      ])
      await requestPage.waitForLoadState("domcontentloaded")
      await expect(requestPage.getByTestId("request-form")).toBeVisible()

      await requestPage.getByLabel("Full name").fill(clientName)
      await requestPage.getByLabel("Phone number").fill(clientPhone)
      await requestPage.getByLabel("Email address").fill(data.clientEmail)
      await requestPage.getByTestId("request-contact-text").click({ force: true })
      await requestPage.waitForTimeout(300)
      const requestTitle = await chooseRequestTitle(requestPage)
      await requestPage.getByLabel("Project description").fill(description)
      await requestPage.getByLabel("Street address").fill(address)
      await requestPage.getByLabel("City").fill(city)
      await requestPage.getByTestId("request-photo-input").setInputFiles({
        name: "leak.png",
        mimeType: "image/png",
        buffer: pngBuffer,
      })
      await expect(requestPage.getByTestId("request-photo-thumbnail")).toHaveCount(1)
      await requestPage.getByLabel("Additional notes").fill(photoNotes)

      const submitResponsePromise = requestPage.waitForResponse(
        (response) =>
          response.url().includes("/api/client-request") &&
          response.request().method() === "POST"
      )
      await requestPage.getByTestId("request-submit-button").click()
      const submitResponse = await submitResponsePromise
      expect(submitResponse.ok()).toBeTruthy()
      const submitBody = (await submitResponse.json()) as {
        jobRequestId: string
      }
      data.jobRequestId = submitBody.jobRequestId

      await expect(requestPage.getByTestId("request-confirmed")).toBeVisible()

      await expect
        .poll(async () => {
          const job = await getJobRequest(supabase, data.jobRequestId!)
          return job?.photo_urls.length ?? 0
        })
        .toBe(1)

      const job = await getJobRequest(supabase, data.jobRequestId!)
      expect(job).toMatchObject({
        contractor_id: data.contractorId,
        client_name: clientName,
        client_email: data.clientEmail,
        client_phone: clientPhone,
        title: requestTitle,
        description,
        address_street: address,
        service_area: city,
        photo_notes: photoNotes,
        status: "new",
      })
      expect(job?.photo_urls[0]).toContain(
        "/storage/v1/object/public/job-request-photos/"
      )
      data.clientUserId = job!.client_id

      await page.bringToFront()
      await page.getByTestId("job-requests-refresh").click()
      const requestCard = page.locator(
        `[data-testid="job-request-card"][data-request-id="${data.jobRequestId}"]`
      )
      await expect(requestCard).toBeVisible()

      await requestCard.getByTestId("job-request-view-details").click()
      const detailDialog = page.getByTestId("job-request-detail-dialog")
      await expect(detailDialog).toBeVisible()
      await expect(
        detailDialog.getByTestId("job-request-client-name-value")
      ).toHaveText(clientName)
      await expect(
        detailDialog.getByTestId("job-request-client-email-value")
      ).toHaveText(data.clientEmail)
      await expect(
        detailDialog.getByTestId("job-request-client-phone-value")
      ).toHaveText(clientPhone)
      await expect(
        detailDialog.getByTestId("job-request-contact-preference-value")
      ).toHaveText("Text")
      await expect(detailDialog.getByTestId("job-request-title-value")).toHaveText(
        requestTitle
      )
      await expect(
        detailDialog.getByTestId("job-request-description-value")
      ).toHaveText(description)
      await expect(detailDialog.getByTestId("job-request-photo")).toHaveCount(1)

      await detailDialog.getByTestId("job-request-create-estimate").click()
      const createDialog = page.getByTestId("create-estimate-dialog")
      await expect(createDialog).toBeVisible()
      expect(await getEstimatesForJob(contractorDb, data.jobRequestId!)).toHaveLength(0)
      await expect(createDialog.getByTestId("job-request-photo")).toHaveCount(1)

      await createDialog.getByTestId("estimate-number-input").fill(estimateNumber)
      await createDialog.getByTestId("estimate-add-line-item").click()
      const itemRow = createDialog.getByTestId("estimate-line-item-row").first()
      await itemRow.getByTestId("estimate-line-item-description").fill(lineItem)
      await itemRow.getByTestId("estimate-line-item-quantity").fill("1")
      await itemRow.getByTestId("estimate-line-item-unit-price").fill("1200")
      await createDialog.getByTestId("estimate-add-tax-gst").click()
      await createDialog.getByTestId("estimate-notes-input").fill(estimateNotes)
      await createDialog.getByTestId("estimate-save-draft").click()
      await expect(createDialog).toBeHidden()

      await expect
        .poll(async () => {
          const estimates = await getEstimatesForJob(contractorDb, data.jobRequestId!)
          return estimates[0]?.status
        })
        .toBe("Draft")

      const [draftEstimate] = await getEstimatesForJob(
        contractorDb,
        data.jobRequestId!
      )
      data.estimateId = draftEstimate.id
      expect(draftEstimate).toMatchObject({
        estimate_number: estimateNumber,
        amount: 1260,
        status: "Draft",
        notes: estimateNotes,
      })
      expect(draftEstimate.line_items).toEqual([
        { description: lineItem, quantity: 1, unit_price: 1200 },
      ])
      expect(draftEstimate.tax_lines).toEqual([{ name: "GST", rate: 5 }])
      await expect(requestCard.getByTestId("job-request-view-estimate")).toBeVisible()
      await expect(requestCard.getByTestId("job-request-share-estimate")).toBeVisible()

      await setClientPassword(supabase, data.clientUserId!, data.clientPassword)
      const clientContext = await browser.newContext()
      const clientPage = await clientContext.newPage()

      try {
        await login(clientPage, data.clientEmail, data.clientPassword)
        await expect(clientPage).toHaveURL(/\/client\/dashboard/)
        await clientPage.goto(`/client/portal/${data.jobRequestId}`)
        await expect(clientPage.getByTestId("client-portal-status-card")).toBeVisible()
        await expect(clientPage.getByText(estimateNumber)).toHaveCount(0)
        await expect(clientPage.getByTestId("client-portal-estimates")).toHaveCount(0)

        await page.bringToFront()
        await requestCard.getByTestId("job-request-share-estimate").click()
        await expect
          .poll(async () => (await getEstimate(contractorDb, data.estimateId!))?.status)
          .toBe("Sent")
        await expect
          .poll(async () => (await getJobRequest(supabase, data.jobRequestId!))?.status)
          .toBe("estimate_created")

        await clientPage.bringToFront()
        await clientPage.reload()
        await expect(clientPage.getByTestId("client-portal-status")).toHaveText(
          "Estimate Ready"
        )
        const estimateCard = clientPage.getByTestId("client-portal-estimate-card")
        await expect(estimateCard).toBeVisible()
        await expect(estimateCard.getByText(estimateNumber)).toBeVisible()
        await expect(estimateCard.getByTestId("estimate-accept-button")).toBeVisible()
        await expect(estimateCard.getByTestId("estimate-decline-button")).toBeVisible()

        const [pdfPage] = await Promise.all([
          clientContext.waitForEvent("page"),
          estimateCard.getByTestId("estimate-pdf-link").click(),
        ])
        await pdfPage.waitForLoadState("domcontentloaded")
        await expect(pdfPage.getByTestId("estimate-print-page")).toBeVisible()
        await expect(
          pdfPage.getByText(`#${estimateNumber}`, { exact: true })
        ).toBeVisible()
        await pdfPage.close()

        await estimateCard.getByTestId("estimate-accept-button").click()
        await expect
          .poll(async () => (await getEstimate(contractorDb, data.estimateId!))?.status)
          .toBe("Accepted")
        await expect
          .poll(async () => (await getJobRequest(supabase, data.jobRequestId!))?.status)
          .toBe("accepted")
        await expect(clientPage.getByTestId("client-portal-status")).toHaveText(
          "Accepted"
        )
      } finally {
        await clientContext.close()
      }
    } finally {
      await cleanupFlowTestData(data)
    }
  })
})
