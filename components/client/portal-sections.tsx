"use client"

// Shared portal UI sub-components used by both the authenticated portal
// (app/client/portal/[jobId]/portal-page.tsx) and the guest portal
// (app/guest/project/[token]/guest-portal-page.tsx).

import { useState } from "react"
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  CreditCard,
  Download,
  FileText,
  HelpCircle,
  Loader2,
  MapPin,
  Printer,
  Receipt,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { money } from "@/lib/format-money"
import type { Database } from "@/lib/supabase/database.types"

export type JobRequest    = Database["public"]["Tables"]["job_requests"]["Row"]
export type Estimate      = Database["public"]["Tables"]["estimates"]["Row"]
export type Invoice       = Database["public"]["Tables"]["invoices"]["Row"]
export type TimelineEvent = Database["public"]["Tables"]["project_timeline_events"]["Row"]

// ── Status helpers ─────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<string, string> = {
  new:                    "Under Review",
  reviewed:               "Estimate Pending",
  needs_info:             "More Info Requested",
  declined_by_contractor: "Request Declined",
  inspection_scheduled:   "Site Visit Proposed",
  inspection_confirmed:   "Site Visit Confirmed",
  visit_completed:        "Site Visit Completed",
  estimate_created:       "Estimate Ready",
  accepted:               "Accepted",
  declined:               "Estimate Declined",
  closed:                 "Closed",
}

export const STATUS_NEXT: Record<string, string> = {
  new:                    "Your contractor is reviewing your request. You'll be notified when there's an update.",
  reviewed:               "Your contractor is working on an estimate. We'll notify you when it's ready.",
  needs_info:             "Your contractor needs more information before preparing an estimate. Please respond below.",
  declined_by_contractor: "Your contractor has declined this request.",
  inspection_scheduled:   "A site visit has been proposed. Please confirm or suggest a different time below.",
  inspection_confirmed:   "Site visit confirmed. Your contractor will prepare an estimate after the visit.",
  visit_completed:        "The site visit is complete. Your contractor is preparing an estimate.",
  estimate_created:       "An estimate is ready for your review. Accept or decline it below.",
  accepted:               "You accepted the estimate. Your contractor will schedule the work.",
  declined:               "You declined the estimate. Your contractor is reviewing your feedback.",
  closed:                 "This project has been closed.",
}

type StatusColor = "gray" | "yellow" | "green" | "red"

export const STATUS_COLOR: Record<string, StatusColor> = {
  new:                    "gray",
  reviewed:               "yellow",
  needs_info:             "yellow",
  declined_by_contractor: "red",
  inspection_scheduled:   "yellow",
  inspection_confirmed:   "green",
  visit_completed:        "green",
  estimate_created:       "green",
  accepted:               "green",
  declined:               "red",
  closed:                 "gray",
}

const colorMap: Record<StatusColor, { bg: string; text: string; border: string; dot: string }> = {
  gray:   { bg: "bg-gray-50",   text: "text-gray-600",   border: "border-gray-200",  dot: "bg-gray-400" },
  yellow: { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200", dot: "bg-amber-400" },
  green:  { bg: "bg-ef-mist",   text: "text-ef-ocean",   border: "border-ef-200",    dot: "bg-ef-sky" },
  red:    { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200",   dot: "bg-red-400" },
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `${days}d ago`
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(
    new Date(iso)
  )
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day:   "numeric",
    year:  "numeric",
  }).format(new Date(iso))
}

function jobWorkAddress(job: JobRequest): string | null {
  return job.work_address || job.address_street || null
}

// ── Timeline builder ──────────────────────────────────────────────────────────

export type TimelineItem = {
  id:       string
  title:    string
  notes:    string | null
  date:     string
  done:     boolean
  isLatest: boolean
}

export function buildTimeline(
  job:       JobRequest,
  estimates: Estimate[],
  events:    TimelineEvent[]
): TimelineItem[] {
  const items: { title: string; notes: string | null; date: string; priority: number }[] = []

  items.push({ title: "Request Submitted", notes: null, date: job.created_at, priority: 0 })

  if (job.status !== "new") {
    items.push({
      title:    "Contractor Reviewed Your Request",
      notes:    null,
      date:     job.updated_at,
      priority: 1,
    })
  }

  const sentEstimate = estimates.find(
    (e) => e.status !== "Draft" && e.status !== "Archived"
  )
  if (sentEstimate) {
    items.push({
      title:    "Estimate Sent",
      notes:    `${sentEstimate.estimate_number} — ${money.format(sentEstimate.amount)}`,
      date:     sentEstimate.sent_date ?? sentEstimate.created_at,
      priority: 2,
    })
  }

  if (job.status === "accepted") {
    items.push({ title: "Estimate Accepted", notes: null, date: job.updated_at, priority: 3 })
  }

  if (job.status === "declined") {
    items.push({ title: "Estimate Declined", notes: null, date: job.updated_at, priority: 3 })
  }

  for (const ev of events) {
    items.push({ title: ev.title, notes: ev.notes, date: ev.event_date, priority: 4 })
  }

  items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return items.map((item, idx) => ({
    id:       `${item.priority}-${idx}`,
    title:    item.title,
    notes:    item.notes,
    date:     item.date,
    done:     true,
    isLatest: idx === items.length - 1,
  }))
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

export function PortalSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-44 animate-pulse rounded-2xl bg-gray-100" />
      <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
      <div className="h-52 animate-pulse rounded-2xl bg-gray-100" />
    </div>
  )
}

// ── Flow bar ──────────────────────────────────────────────────────────────────

const flowSteps = ["Request", "Estimate", "Approved", "Job", "Paid"] as const

export function FlowBar({
  job,
  hasEstimate,
  invoices,
  estimates,
}: {
  job:         JobRequest
  hasEstimate: boolean
  invoices:    Invoice[]
  estimates:   Estimate[]
}) {
  const hasApproved = job.status === "accepted" || job.status === "closed"
  const hasInvoice  = invoices.length > 0
  const isPaid =
    invoices.some((inv) => inv.status === "Paid") ||
    estimates.some(
      (e) =>
        (e as Estimate & { payment_status?: string | null }).payment_status === "paid"
    )
  const complete = [true, hasEstimate, hasApproved, hasInvoice, isPaid]

  return (
    <div className="rounded-2xl border border-ef-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ef-ocean">
            Project flow
          </p>
          <h3 className="mt-1 text-base font-semibold text-gray-900">
            Every step in order
          </h3>
        </div>
        <span className="rounded-full bg-ef-mist px-3 py-1 text-xs font-semibold text-ef-ocean">
          {STATUS_LABEL[job.status] ?? "In progress"}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {flowSteps.map((step, index) => {
          const done    = complete[index]
          const current = !done && complete.slice(0, index).every(Boolean)
          return (
            <div key={step} className="min-w-0">
              <div
                className={`h-1.5 rounded-full ${
                  done ? "bg-ef-ocean" : current ? "bg-ef-orange" : "bg-gray-200"
                }`}
              />
              <div className="mt-2 flex items-center gap-1.5">
                {done ? (
                  <CheckCircle2 className="size-3.5 shrink-0 text-ef-ocean" />
                ) : (
                  <Circle
                    className={`size-3.5 shrink-0 ${current ? "text-ef-orange" : "text-gray-300"}`}
                  />
                )}
                <span
                  className={`truncate text-xs font-semibold ${
                    done || current ? "text-gray-800" : "text-gray-400"
                  }`}
                >
                  {step}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Status card ───────────────────────────────────────────────────────────────

export function StatusCard({ job, hasEstimate }: { job: JobRequest; hasEstimate: boolean }) {
  const status  = job.status as keyof typeof STATUS_LABEL
  const color   = STATUS_COLOR[status] ?? "gray"
  const c       = colorMap[color]
  const label   = STATUS_LABEL[status] ?? status
  const nextMsg = STATUS_NEXT[status] ?? ""
  const address = jobWorkAddress(job)

  return (
    <div
      className={`rounded-2xl border ${c.border} ${c.bg} p-6`}
      data-testid="client-portal-status-card"
    >
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
        <span
          className={`text-xs font-bold uppercase tracking-widest ${c.text}`}
          data-testid="client-portal-status"
        >
          {label}
        </span>
      </div>

      <h2 className="mt-3 text-xl font-bold text-gray-900 sm:text-2xl">
        {job.title}
      </h2>

      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500">
        <Clock className="h-3.5 w-3.5" />
        Last updated {relativeTime(job.updated_at)}
      </p>

      {address && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-gray-500">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{address}</span>
        </p>
      )}

      <div className="mt-4 rounded-xl border border-white/80 bg-white/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Next step
        </p>
        <p className="mt-1 text-sm leading-relaxed text-gray-700">{nextMsg}</p>
      </div>

      {hasEstimate && (
        <div className="mt-4">
          <a
            href="#estimates"
            className={`inline-flex items-center gap-2 rounded-xl ${
              c.dot === "bg-ef-sky"
                ? "bg-ef-ocean hover:bg-ef-ocean"
                : "bg-gray-700 hover:bg-gray-800"
            } px-4 py-2.5 text-sm font-semibold text-white transition`}
          >
            <FileText className="h-4 w-4" />
            View Estimate
          </a>
        </div>
      )}
    </div>
  )
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400">
        Project Timeline
      </h3>

      <ol className="mt-5 space-y-0">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1
          return (
            <li key={item.id} className="relative flex gap-4">
              {!isLast && (
                <div className="absolute left-[10px] top-5 h-full w-px bg-gray-200" />
              )}
              <div className="relative mt-1 flex h-5 w-5 shrink-0 items-center justify-center">
                {item.done ? (
                  <CheckCircle2 className="h-5 w-5 text-ef-sky" />
                ) : (
                  <Circle className="h-5 w-5 text-gray-300" />
                )}
              </div>
              <div className={`min-w-0 flex-1 pb-6 ${isLast ? "pb-0" : ""}`}>
                <p className={`text-sm font-semibold ${item.isLatest ? "text-gray-900" : "text-gray-700"}`}>
                  {item.title}
                </p>
                {item.notes && (
                  <p className="mt-0.5 text-xs text-gray-500">{item.notes}</p>
                )}
                <p className="mt-0.5 text-xs text-gray-400">{formatDate(item.date)}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ── Pay button ────────────────────────────────────────────────────────────────

export function PayButton({
  estimate,
  guestToken,
}: {
  estimate:   Estimate
  guestToken?: string
}) {
  const [isLoading, setIsLoading] = useState(false)

  const stripeEst        = estimate as Estimate & { client_total_cents?: number | null; payment_status?: string | null }
  const clientTotalCents = stripeEst.client_total_cents
  const paymentStatus    = stripeEst.payment_status ?? "unpaid"

  if (!clientTotalCents || clientTotalCents <= 0) return null

  if (paymentStatus === "paid") {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-ef-mist px-3 py-1.5 text-sm font-semibold text-ef-ocean">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Paid
      </div>
    )
  }

  const label = new Intl.NumberFormat("en-CA", {
    style:                 "currency",
    currency:              "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(clientTotalCents / 100)

  async function handlePay() {
    setIsLoading(true)
    try {
      const endpoint = guestToken
        ? "/api/payments/create-guest-checkout-session"
        : "/api/payments/create-checkout-session"

      const body = guestToken
        ? JSON.stringify({ estimateId: estimate.id, guestToken })
        : JSON.stringify({ estimateId: estimate.id })

      const res  = await fetch(endpoint, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body,
      })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        toast.error(data.error ?? "Could not start payment. Please try again.")
        return
      }
      window.location.href = data.url
    } catch {
      toast.error("Could not reach the payment server. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button
      size="sm"
      className="bg-ef-ocean text-white hover:bg-ef-ocean"
      disabled={isLoading}
      data-testid="estimate-pay-button"
      onClick={() => void handlePay()}
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <CreditCard className="h-3.5 w-3.5" />
      )}
      {isLoading ? "Redirecting…" : `Pay ${label}`}
    </Button>
  )
}

// ── Declined by contractor card ───────────────────────────────────────────────

export function DeclinedByContractorCard({ job }: { job: JobRequest }) {
  const reason = job.contractor_decline_reason
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-5" data-testid="declined-by-contractor-card">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
          <Circle className="h-4 w-4 text-red-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Your contractor has declined this request</p>
          {reason && (
            <p className="mt-1 text-sm text-gray-600">{reason}</p>
          )}
          <p className="mt-2 text-xs text-gray-400">
            If you believe this is an error, you can reach out to your contractor directly.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── More details card ─────────────────────────────────────────────────────────

export function MoreDetailsCard({
  job,
  onRespond,
}: {
  job:       JobRequest
  onRespond: (response: string) => void
}) {
  const [response, setResponse] = useState("")
  const [isSaving, setIsSaving]  = useState(false)
  const hasResponse   = Boolean(job.more_details_response)
  const message       = job.more_details_message
  const savedResponse = job.more_details_response

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5" data-testid="more-details-card">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <HelpCircle className="h-4 w-4 text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">Your contractor needs more information</p>
          {message && (
            <p className="mt-2 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{message}</p>
          )}
        </div>
      </div>

      {hasResponse ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3.5">
          <p className="text-xs font-semibold text-amber-700">Your response</p>
          <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{savedResponse}</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="Provide the additional details your contractor needs…"
            disabled={isSaving}
            rows={4}
            className="w-full rounded-xl border border-amber-200 bg-white px-3.5 py-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-60"
          />
          <Button
            size="sm"
            className="bg-ef-ocean text-white hover:bg-ef-ocean"
            disabled={!response.trim() || isSaving}
            data-testid="more-details-submit"
            onClick={() => {
              setIsSaving(true)
              onRespond(response.trim())
            }}
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Submit response
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Inspection / site-visit card ──────────────────────────────────────────────

const VISIT_DT_FMT = new Intl.DateTimeFormat("en-CA", {
  weekday: "long", month: "long", day: "numeric",
  year: "numeric", hour: "numeric", minute: "2-digit",
})

export function InspectionCard({
  job,
  onConfirm,
  onSuggestTime,
}: {
  job:           JobRequest
  onConfirm:     () => void
  onSuggestTime: (proposedAt: string, notes: string) => void
}) {
  const [isSaving,        setIsSaving]        = useState(false)
  const [showSuggest,     setShowSuggest]     = useState(false)
  const [suggestDate,     setSuggestDate]     = useState("")
  const [suggestTime,     setSuggestTime]     = useState("")
  const [suggestNotes,    setSuggestNotes]    = useState("")

  const confirmed    = job.status === "inspection_confirmed" || job.status === "visit_completed"
  const awaitingAck  = Boolean(job.visit_client_proposed_at)
  const startsAt     = job.scheduled_visit_starts_at
  const notes        = job.scheduled_visit_notes
  const clientProp   = job.visit_client_proposed_at

  const fmtDate = (d: string | null) =>
    d ? VISIT_DT_FMT.format(new Date(d)) : null

  function handleSuggest() {
    if (!suggestDate) return
    setIsSaving(true)
    const timeStr  = suggestTime || "09:00"
    const proposed = new Date(`${suggestDate}T${timeStr}`).toISOString()
    onSuggestTime(proposed, suggestNotes.trim())
  }

  return (
    <div
      className={`rounded-2xl border p-5 ${confirmed ? "border-ef-200 bg-ef-mist" : "border-amber-200 bg-amber-50"}`}
      data-testid="inspection-card"
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${confirmed ? "bg-white" : "bg-amber-100"}`}>
          <CalendarDays className={`h-4 w-4 ${confirmed ? "text-ef-ocean" : "text-amber-600"}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">
            {confirmed ? "Site visit confirmed" : "Site visit proposed"}
          </p>
          {startsAt && <p className="mt-1 text-sm text-gray-700">{fmtDate(startsAt)}</p>}
          {notes && <p className="mt-1 text-xs text-gray-500 whitespace-pre-wrap">{notes}</p>}
          {awaitingAck && (
            <p className="mt-2 text-xs text-amber-700 font-medium">
              You suggested {fmtDate(clientProp)} — waiting for contractor to confirm.
            </p>
          )}
        </div>
      </div>

      {!confirmed && !awaitingAck && (
        <div className="mt-4 space-y-3">
          {!showSuggest ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="bg-ef-ocean text-white hover:bg-ef-ocean"
                disabled={isSaving}
                data-testid="inspection-confirm-button"
                onClick={() => { setIsSaving(true); onConfirm() }}
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Confirm this time
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-300 bg-white text-amber-700 hover:bg-amber-50"
                onClick={() => setShowSuggest(true)}
              >
                Suggest a different time
              </Button>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-amber-200 bg-white p-3.5">
              <p className="text-xs font-semibold text-amber-700">Suggest a different time</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500">Date</label>
                  <input
                    type="date"
                    value={suggestDate}
                    onChange={(e) => setSuggestDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Time (optional)</label>
                  <input
                    type="time"
                    value={suggestTime}
                    onChange={(e) => setSuggestTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>
              </div>
              <textarea
                value={suggestNotes}
                onChange={(e) => setSuggestNotes(e.target.value)}
                placeholder="Any notes for your contractor? (optional)"
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-ef-ocean text-white hover:bg-ef-ocean"
                  disabled={!suggestDate || isSaving}
                  onClick={handleSuggest}
                >
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Send suggestion
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-gray-300 bg-white text-gray-700"
                  onClick={() => setShowSuggest(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Work schedule card ────────────────────────────────────────────────────────

const dtFmt = new Intl.DateTimeFormat("en-CA", {
  weekday: "long",
  month:   "long",
  day:     "numeric",
  year:    "numeric",
  hour:    "numeric",
  minute:  "2-digit",
})

export function WorkScheduleCard({ estimates }: { estimates: Estimate[] }) {
  const work = estimates.find(
    (e) =>
      (e.scheduled_visit_type === "job_start" || e.scheduled_visit_type === "site_visit") &&
      e.scheduled_visit_starts_at
  )
  if (!work) return null

  const start = dtFmt.format(new Date(work.scheduled_visit_starts_at!))
  const end   = work.scheduled_visit_ends_at
    ? dtFmt.format(new Date(work.scheduled_visit_ends_at))
    : null

  return (
    <div className="rounded-2xl border border-ef-200 bg-ef-mist p-5" data-testid="work-schedule-card">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white">
          <CalendarDays className="h-4 w-4 text-ef-ocean" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">Work day scheduled</p>
          <p className="mt-1 text-sm text-gray-700">{start}</p>
          {end && <p className="mt-0.5 text-xs text-gray-500">Through {end}</p>}
          {work.scheduled_visit_notes && (
            <p className="mt-2 text-xs leading-relaxed text-gray-500 whitespace-pre-wrap">
              {work.scheduled_visit_notes}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Estimates section ─────────────────────────────────────────────────────────

const DECLINE_REASONS: { value: string; label: string }[] = [
  { value: "price_too_high",    label: "Price is too high" },
  { value: "scope_changed",     label: "Scope of work has changed" },
  { value: "hired_another",     label: "I hired someone else" },
  { value: "no_longer_needed",  label: "No longer needed" },
  { value: "timeline",          label: "Timeline doesn't work" },
  { value: "other",             label: "Other" },
]

export function EstimatesSection({
  estimates,
  onRespond,
  guestToken,
}: {
  estimates:  Estimate[]
  onRespond:  (est: Estimate, response: "Accepted" | "Declined", declineReason?: string, declineComment?: string) => void
  guestToken?: string
}) {
  const [isSaving,        setIsSaving]       = useState(false)
  const [decliningEst,    setDecliningEst]   = useState<Estimate | null>(null)
  const [declineReason,   setDeclineReason]  = useState("")
  const [declineComment,  setDeclineComment] = useState("")

  if (estimates.length === 0) return null

  return (
    <div className="space-y-3" id="estimates" data-testid="client-portal-estimates">
      <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400">
        Estimates
      </h3>
      {estimates.map((est) => {
        const canRespond =
          est.status !== "Accepted" &&
          est.status !== "Declined" &&
          est.status !== "Won" &&
          est.status !== "Lost"

        const isAccepted  = est.status === "Accepted" || est.status === "Won"
        const isDeclined  = est.status === "Declined" || est.status === "Lost"
        const stripeEst   = est as Estimate & { payment_status?: string | null }
        const isPaid      = stripeEst.payment_status === "paid"
        const extEst      = est as Estimate & { decline_reason?: string | null; decline_comment?: string | null }
        const isDeclining = decliningEst?.id === est.id

        return (
          <div
            key={est.id}
            className="rounded-2xl border border-gray-200 bg-white p-5"
            data-testid="client-portal-estimate-card"
            data-estimate-id={est.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{est.estimate_number}</p>
                <p className="mt-1 text-2xl font-bold text-ef-ocean">
                  {money.format(est.amount)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    isAccepted
                      ? "bg-ef-mist text-ef-ocean"
                      : isDeclined
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {est.status}
                </span>
                {isPaid && (
                  <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                    Paid
                  </span>
                )}
              </div>
            </div>

            {est.notes && (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-500">
                {est.notes}
              </p>
            )}

            {isDeclined && extEst.decline_reason && (
              <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3">
                <p className="text-xs font-semibold text-red-700">
                  {DECLINE_REASONS.find((r) => r.value === extEst.decline_reason)?.label ?? extEst.decline_reason}
                </p>
                {extEst.decline_comment && (
                  <p className="mt-1 text-xs text-red-600">{extEst.decline_comment}</p>
                )}
              </div>
            )}

            {/* Inline decline reason form */}
            {isDeclining && (
              <div className="mt-4 space-y-3 rounded-xl border border-red-100 bg-red-50 p-3.5">
                <p className="text-sm font-semibold text-gray-900">Why are you declining?</p>
                <div className="grid gap-2">
                  {DECLINE_REASONS.map((r) => (
                    <label key={r.value} className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="radio"
                        name={`decline-reason-${est.id}`}
                        value={r.value}
                        checked={declineReason === r.value}
                        onChange={() => setDeclineReason(r.value)}
                        className="accent-red-600"
                      />
                      <span className="text-sm text-gray-700">{r.label}</span>
                    </label>
                  ))}
                </div>
                <textarea
                  value={declineComment}
                  onChange={(e) => setDeclineComment(e.target.value)}
                  placeholder="Optional comment for your contractor…"
                  rows={2}
                  className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-300"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!declineReason || isSaving}
                    className="bg-red-600 text-white hover:bg-red-700"
                    data-testid="estimate-decline-confirm"
                    onClick={() => {
                      setIsSaving(true)
                      onRespond(est, "Declined", declineReason, declineComment || undefined)
                      setDecliningEst(null)
                      setDeclineReason("")
                      setDeclineComment("")
                    }}
                  >
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Confirm decline
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-gray-300 bg-white text-gray-700"
                    onClick={() => { setDecliningEst(null); setDeclineReason(""); setDeclineComment("") }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {!isDeclining && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="border-gray-300 bg-white text-gray-700 hover:bg-gray-50" asChild>
                  <a
                    href={`/print/estimate/${est.id}`}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="estimate-pdf-link"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    View PDF
                  </a>
                </Button>

                {canRespond && (
                  <>
                    <Button
                      size="sm"
                      disabled={isSaving}
                      className="bg-ef-ocean text-white hover:bg-ef-ocean"
                      data-testid="estimate-accept-button"
                      onClick={() => {
                        setIsSaving(true)
                        onRespond(est, "Accepted")
                      }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Accept Estimate
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSaving}
                      className="border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      data-testid="estimate-decline-button"
                      onClick={() => { setDecliningEst(est); setDeclineReason(""); setDeclineComment("") }}
                    >
                      Decline
                    </Button>
                  </>
                )}

                {isAccepted && !isPaid && (
                  <PayButton estimate={est} guestToken={guestToken} />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Invoices section ──────────────────────────────────────────────────────────

export function InvoicesSection({ invoices }: { invoices: Invoice[] }) {
  if (invoices.length === 0) return null

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400">
        Invoices
      </h3>
      {invoices.map((inv) => (
        <div key={inv.id} className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-gray-900">{inv.invoice_number}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {money.format(inv.amount)}
              </p>
              {inv.due_date && (
                <p className="mt-1 text-xs text-gray-400">
                  Due {formatDate(inv.due_date)}
                </p>
              )}
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                inv.status === "Paid"
                  ? "bg-ef-mist text-ef-ocean"
                  : inv.status === "Overdue"
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {inv.status}
            </span>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={`/print/invoice/${inv.id}`} target="_blank" rel="noreferrer">
                <Printer className="h-3.5 w-3.5" />
                View Invoice
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/print/invoice/${inv.id}`} target="_blank" rel="noreferrer">
                <Download className="h-3.5 w-3.5" />
                Download PDF
              </a>
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
