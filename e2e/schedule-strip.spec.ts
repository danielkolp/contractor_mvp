/**
 * Verifies the Today screen "agenda strip" — seeds a today-dated inspection
 * (on a job_request) and a today-dated work day (on an estimate) for the
 * contractor, loads the dashboard, and confirms the contractor can see where
 * they need to be. Cleans up after itself.
 */
import fs from "node:fs"
import path from "node:path"

import { expect, type Page, test } from "@playwright/test"

import { loadEnv, requiredEnv } from "./helpers/env"
import { createServiceRoleClient } from "./helpers/supabase"

loadEnv()

const SHOT_DIR = path.join(process.cwd(), "audit-screens")
fs.mkdirSync(SHOT_DIR, { recursive: true })

function todayAt(hour: number, minute = 0): string {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function tomorrowAt(hour: number, minute = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
}

test.describe("today schedule strip", () => {
  test.skip(
    !process.env.E2E_CONTRACTOR_EMAIL || !process.env.E2E_CONTRACTOR_PASSWORD,
    "Set E2E_CONTRACTOR_EMAIL and E2E_CONTRACTOR_PASSWORD."
  )

  test("shows today's inspection and work day", async ({ page }) => {
    test.setTimeout(90_000)
    const svc = createServiceRoleClient()
    const email = requiredEnv("E2E_CONTRACTOR_EMAIL").toLowerCase()
    const password = requiredEnv("E2E_CONTRACTOR_PASSWORD")

    const { data: contractorId } = await svc.rpc("get_auth_user_id_by_email", {
      lookup_email: email,
    })
    if (!contractorId) throw new Error("Could not resolve contractor id")

    // ── Seed: inspection today @ 9am (job_request) + work day today @ 2pm (estimate)
    const { data: job, error: jobErr } = await svc
      .from("job_requests")
      .insert({
        contractor_id: contractorId,
        client_id: contractorId, // any valid auth user id satisfies the FK
        client_name: "Site Visit Co",
        title: "Plumbing",
        description: "Seeded inspection for schedule-strip verification.",
        service_area: "Vancouver, BC",
        status: "inspection_confirmed",
        scheduled_visit_type: "inspection",
        scheduled_visit_starts_at: todayAt(9),
      })
      .select()
      .single()
    if (jobErr) throw new Error(`seed job: ${jobErr.message}`)

    const { data: est, error: estErr } = await svc
      .from("estimates")
      .insert({
        user_id: contractorId,
        estimate_number: "SCHED-TEST",
        amount: 1000,
        status: "Accepted",
        client_name: "Work Day Co",
        scheduled_visit_type: "job_start",
        scheduled_visit_starts_at: todayAt(14),
      })
      .select()
      .single()
    if (estErr) throw new Error(`seed estimate: ${estErr.message}`)

    // ── Seed: a busy day tomorrow (3 work days) for the "and X more…" + modal
    const tomorrowEst: string[] = []
    for (const [i, hour] of [8, 11, 15].entries()) {
      const { data, error } = await svc
        .from("estimates")
        .insert({
          user_id: contractorId,
          estimate_number: `SCHED-TMRW-${i}`,
          amount: 500,
          status: "Accepted",
          client_name: `Busy Day Co ${i + 1}`,
          scheduled_visit_type: "job_start",
          scheduled_visit_starts_at: tomorrowAt(hour),
        })
        .select()
        .single()
      if (error) throw new Error(`seed tomorrow estimate: ${error.message}`)
      if (data) tomorrowEst.push(data.id)
    }

    try {
      await login(page, email, password)
      await expect(page).toHaveURL(/\/dashboard(?:\?|$|\/$)/)
      await page.waitForTimeout(2500)

      // 1. Agenda line blended into the hero summary.
      await expect(page.getByText(/inspection with Site Visit Co at/i)).toBeVisible()
      await expect(page.getByText(/work day with Work Day Co at/i)).toBeVisible()

      // 2. Calendar present with today's marked day.
      const calendar = page.getByTestId("hero-calendar")
      await expect(calendar).toBeVisible()
      const todayKey = (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
          d.getDate()
        ).padStart(2, "0")}`
      })()
      const todayCell = calendar.locator(`[data-daykey="${todayKey}"]`)
      await expect(todayCell).toHaveAttribute("data-has-events", "true")

      await page.screenshot({
        path: path.join(SHOT_DIR, "schedule-strip.png"),
        fullPage: true,
      })

      // 3. Hovering the marked day reveals its events in the calendar detail.
      await todayCell.hover()
      await expect(calendar.getByText(/Work day · Work Day Co/i)).toBeVisible()
      await expect(calendar.getByText(/Inspection · Site Visit Co/i)).toBeVisible()

      // Focused element shot of just the hero card for visual review.
      const heroCard = page
        .locator('.rounded-2xl:has([data-testid="hero-calendar"])')
        .first()
      await heroCard.screenshot({
        path: path.join(SHOT_DIR, "schedule-hero-card.png"),
      })

      // 4. Busy day → preview is capped and shows "and X more…" in muted text.
      const tomorrowCell = calendar.locator(`[data-daykey="${dayKey(tomorrowAt(8))}"]`)
      await expect(tomorrowCell).toHaveAttribute("data-has-events", "true")
      await tomorrowCell.hover()
      // Preview is capped at 2; the rest collapse into a muted "and N more…".
      const moreBtn = calendar.getByRole("button", { name: /and \d+ more/i })
      await expect(moreBtn).toBeVisible()
      await heroCard.screenshot({
        path: path.join(SHOT_DIR, "schedule-and-more.png"),
      })

      // 5. Clicking it opens the full-day modal listing every visit that day.
      await moreBtn.click()
      const dialog = page.getByRole("dialog")
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText(/\d+ visits/i)).toBeVisible()
      await expect(dialog.getByText("Busy Day Co 1")).toBeVisible()
      await expect(dialog.getByText("Busy Day Co 3")).toBeVisible()
      await page.screenshot({
        path: path.join(SHOT_DIR, "schedule-day-modal.png"),
        fullPage: true,
      })
      await page.keyboard.press("Escape")
      await expect(dialog).toBeHidden()

      // 6. THE BUG: the hero card must NOT resize as the calendar changes state.
      const cardHeight = async () => (await heroCard.boundingBox())!.height
      await page.mouse.move(5, 5) // leave calendar → hint state
      const hHint = await cardHeight()
      await todayCell.hover() // 2 events, no overflow
      const hToday = await cardHeight()
      await tomorrowCell.hover() // many events → "and N more…"
      const hBusy = await cardHeight()
      expect(Math.abs(hToday - hHint)).toBeLessThanOrEqual(1)
      expect(Math.abs(hBusy - hHint)).toBeLessThanOrEqual(1)

      // Sweep 13 months forward — months differ in occupied week-rows (4–6),
      // which previously collapsed the grid and resized the card.
      const nextBtn = calendar.getByRole("button", { name: "Next month" })
      for (let i = 0; i < 13; i++) {
        await nextBtn.click()
        await page.mouse.move(5, 5)
        const h = await cardHeight()
        expect(Math.abs(h - hHint)).toBeLessThanOrEqual(1)
      }

      // 7. Dark mode must not wash out the ocean hero (fixed-navy vignettes),
      //    and the "Euroflo" sidebar logo must be white (not charcoal).
      await page.evaluate(() => document.documentElement.classList.add("dark"))
      await page.waitForTimeout(400)
      await heroCard.screenshot({
        path: path.join(SHOT_DIR, "schedule-hero-dark.png"),
      })
      await page.screenshot({
        path: path.join(SHOT_DIR, "dark-full.png"),
      })
    } finally {
      if (est) await svc.from("estimates").delete().eq("id", est.id)
      if (job) await svc.from("job_requests").delete().eq("id", job.id)
      if (tomorrowEst.length > 0)
        await svc.from("estimates").delete().in("id", tomorrowEst)
    }
  })
})
