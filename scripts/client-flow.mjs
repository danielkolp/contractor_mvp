/**
 * Real client → contractor → accept walkthrough, driven through the live UI.
 *
 * Targets the deployed app. Reads contractor credentials from env so nothing
 * sensitive is written to disk or committed:
 *   QA_BASE_URL              e.g. https://contractor-mvp.vercel.app
 *   E2E_CONTRACTOR_EMAIL     your login email
 *   E2E_CONTRACTOR_PASSWORD  your login password
 *
 * Screenshots land in /tmp/flow. Selectors are best-effort from the current
 * code; I'll tighten them on the first live run (the app isn't reachable from
 * the sandbox yet, so this hasn't been executed end-to-end).
 */
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const BASE = process.env.QA_BASE_URL ?? "https://contractor-mvp.vercel.app"
const EMAIL = process.env.E2E_CONTRACTOR_EMAIL
const PASSWORD = process.env.E2E_CONTRACTOR_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error("Set E2E_CONTRACTOR_EMAIL and E2E_CONTRACTOR_PASSWORD in the env.")
  process.exit(1)
}

const OUT = "/tmp/flow"
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--disable-gpu", "--use-gl=swiftshader"],
})

const shot = async (page, name) => {
  await page.waitForTimeout(3500) // let entrance animations settle
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log("shot", name)
}

// ── 1. Contractor logs in, grab the public request link ──────────────────────
const cctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
const cpage = await cctx.newPage()
await cpage.goto(`${BASE}/login`, { waitUntil: "networkidle" })
await cpage.getByLabel(/email/i).fill(EMAIL)
await cpage.getByLabel(/password/i).first().fill(PASSWORD)
await cpage.getByRole("button", { name: /^sign in$/i }).click()
await cpage.waitForURL(/\/dashboard/, { timeout: 30000 })
await shot(cpage, "01-contractor-dashboard")

const requestLink = await cpage
  .getByTestId("today-request-link")
  .innerText()
  .catch(() => null)
console.log("request link:", requestLink)

// ── 2. Client (separate context, no login) fills out the request form ────────
const clctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
const clpage = await clctx.newPage()
await clpage.goto(requestLink ?? `${BASE}/request/demo`, { waitUntil: "networkidle" })
await shot(clpage, "02-request-form-blank")

await clpage.getByLabel(/full name/i).fill("Pat the Customer")
await clpage.getByLabel(/email/i).fill("pat.customer+euroflo@example.com")
await clpage.getByRole("button", { name: /^call$/i }).click().catch(() => {})
await clpage.getByLabel(/project description/i)
  .fill("Kitchen sink drains super slow and the shutoff valve under it weeps. Need it looked at this week.")
await clpage.getByLabel(/city/i).fill("Vancouver, BC").catch(() => {})
await shot(clpage, "03-request-form-filled")

await clpage.getByRole("button", { name: /submit request/i }).click()
await clpage.waitForTimeout(4000)
await shot(clpage, "04-request-submitted")

// Guest tracking link surfaced on the success screen (no email inbox needed).
const guestLink = await clpage
  .getByRole("link", { name: /open portal|track|view/i })
  .first()
  .getAttribute("href")
  .catch(() => null)
console.log("guest portal link:", guestLink)

// ── 3. Contractor reviews the request and creates an estimate ────────────────
await cpage.goto(`${BASE}/dashboard/job-requests`, { waitUntil: "networkidle" })
await shot(cpage, "05-contractor-job-requests")
await cpage.getByRole("button", { name: /create estimate/i }).first().click().catch(() => {})
await cpage.waitForTimeout(2500)
await shot(cpage, "06-create-estimate")
// NOTE: estimate dialog fields (line items, amount, "send to client") to be
// filled here — exact selectors confirmed on first live run.

// ── 4. Client opens the portal and accepts ───────────────────────────────────
if (guestLink) {
  await clpage.goto(guestLink.startsWith("http") ? guestLink : `${BASE}${guestLink}`, {
    waitUntil: "networkidle",
  })
  await shot(clpage, "07-client-portal")
  await clpage.getByRole("button", { name: /accept estimate|accept/i }).first().click().catch(() => {})
  await clpage.waitForTimeout(3000)
  await shot(clpage, "08-client-accepted")
}

await browser.close()
console.log("DONE — screenshots in", OUT)
