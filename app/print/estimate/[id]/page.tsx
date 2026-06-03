import { notFound, redirect } from "next/navigation"

import { PrintToolbar } from "@/components/print/print-toolbar"
import { hasSupabaseEnv } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/database.types"
import { getProfileRole } from "@/lib/user-role"

type ClientRow   = Database["public"]["Tables"]["clients"]["Row"]
type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"]
type JobRequestRow = Database["public"]["Tables"]["job_requests"]["Row"]

type LineItem = { description: string; quantity: number; unit_price: number }
type TaxLine  = { name: string; rate: number }
type ScheduledVisitType = "inspection" | "job_start" | "job_completion" | "site_visit"
type ScheduledSource = {
  work_address?: string | null
  address_street?: string | null
  scheduled_visit_type?: ScheduledVisitType | null
  scheduled_visit_starts_at?: string | null
  scheduled_visit_ends_at?: string | null
  scheduled_visit_notes?: string | null
}

function parseLineItems(raw: unknown): LineItem[] {
  if (!Array.isArray(raw)) return []
  return (raw as Record<string, unknown>[]).map((i) => ({
    description: String(i.description ?? ""),
    quantity:    Number(i.quantity ?? 1),
    unit_price:  Number(i.unit_price ?? 0),
  }))
}

function parseTaxLines(raw: unknown, legacyRate: number): TaxLine[] {
  if (Array.isArray(raw) && raw.length > 0)
    return (raw as Record<string, unknown>[]).map((t) => ({
      name: String(t.name ?? "Tax"),
      rate: Number(t.rate ?? 0),
    }))
  if (legacyRate > 0) return [{ name: "Tax", rate: legacyRate }]
  return []
}

const money = new Intl.NumberFormat("en-CA", {
  style: "currency", currency: "CAD",
  minimumFractionDigits: 2, maximumFractionDigits: 2,
})

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  month: "long", day: "numeric", year: "numeric",
})

const fmt = (iso: string | null | undefined) =>
  iso ? dateFmt.format(new Date(`${iso}T00:00:00`)) : "—"

const dateTimeFmt = new Intl.DateTimeFormat("en-CA", {
  month: "long",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

const VISIT_TYPE_LABEL: Record<ScheduledVisitType, string> = {
  inspection: "Inspection",
  job_start: "Job start",
  job_completion: "Job completion",
  site_visit: "Site visit",
}

function formatDateTime(value: string | null | undefined) {
  return value ? dateTimeFmt.format(new Date(value)) : null
}

function workAddressFor(document: ScheduledSource, job: ScheduledSource | null) {
  return document.work_address || job?.work_address || job?.address_street || null
}

function scheduledVisitFor(document: ScheduledSource, job: ScheduledSource | null) {
  const source = document.scheduled_visit_starts_at ? document : job?.scheduled_visit_starts_at ? job : null
  if (!source?.scheduled_visit_starts_at) return null

  const startsAt = formatDateTime(source.scheduled_visit_starts_at)
  const endsAt = formatDateTime(source.scheduled_visit_ends_at)
  const type = source.scheduled_visit_type

  return {
    label: type ? VISIT_TYPE_LABEL[type] : "Scheduled visit",
    time: endsAt ? `${startsAt} to ${endsAt}` : startsAt,
    notes: source.scheduled_visit_notes ?? null,
  }
}

const STATUS_LABEL: Record<string, string> = {
  Draft: "Draft", Sent: "Sent — Awaiting Response",
  "Follow-up Needed": "Follow-up Needed", "Follow-up Sent": "Follow-up Sent",
  Interested: "Interested", Accepted: "Accepted", Won: "Accepted",
  Declined: "Declined", Lost: "Declined", Archived: "Archived",
}
const STATUS_STYLE: Record<string, string> = {
  Draft:             "bg-zinc-100 text-zinc-500",
  Sent:              "bg-blue-50 text-blue-700",
  "Follow-up Needed":"bg-amber-50 text-amber-700",
  "Follow-up Sent":  "bg-amber-50 text-amber-700",
  Interested:        "bg-sky-50 text-sky-700",
  Accepted:          "bg-emerald-50 text-emerald-700",
  Won:               "bg-emerald-50 text-emerald-700",
  Declined:          "bg-red-50 text-red-600",
  Lost:              "bg-red-50 text-red-600",
  Archived:          "bg-zinc-100 text-zinc-400",
}

export default async function EstimatePrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!hasSupabaseEnv())
    return <div className="p-8 text-center text-sm text-red-600">Supabase is not configured.</div>

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const role = await getProfileRole(supabase, user.id)

  const { data: estimate } = await supabase.from("estimates").select("*").eq("id", id).single()
  if (!estimate) notFound()

  // Clients may not view Draft estimates — the contractor has not shared it yet.
  if (role === "client" && estimate.status === "Draft") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100">
        <div className="rounded-xl border border-border bg-white p-10 text-center shadow">
          <p className="text-base font-semibold text-foreground">Estimate not available</p>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Your contractor is still preparing this estimate. Check back once they share it with you.
          </p>
        </div>
      </div>
    )
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", estimate.user_id).single()

  let client: ClientRow | null = null
  if (estimate.client_id) {
    const { data } = await supabase.from("clients").select("*").eq("id", estimate.client_id).single()
    client = data
  }

  let jobRequest: JobRequestRow | null = null
  if (estimate.job_request_id) {
    const { data } = await supabase
      .from("job_requests")
      .select("*")
      .eq("id", estimate.job_request_id)
      .maybeSingle()
    jobRequest = data
  }

  const lineItems    = parseLineItems(estimate.line_items)
  const taxLines     = parseTaxLines((estimate as Record<string, unknown>).tax_lines, Number(estimate.tax_rate ?? 0))
  const hasLineItems = lineItems.length > 0
  const subtotal     = lineItems.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const totalTax     = taxLines.reduce((s, t) => s + subtotal * (t.rate / 100), 0)

  // When Stripe payment fields are set, client_total_cents is the canonical
  // client-facing total. Contractors always see this on their own print view.
  // Clients never see the contractor_amount_cents or platform_fee_cents breakdown.
  const stripeEst = estimate as EstimateRow & {
    client_total_cents?: number | null
    contractor_amount_cents?: number | null
    platform_fee_cents?: number | null
    gst_cents?: number | null
    deposit_amount_cents?: number | null
    deposit_percentage?: number | null
    deposit_paid_at?: string | null
    payment_status?: string | null
  }
  const clientTotalFromStripe = stripeEst.client_total_cents
    ? stripeEst.client_total_cents / 100
    : null

  const total = clientTotalFromStripe
    ?? (hasLineItems ? subtotal + totalTax : estimate.amount)

  // Resolve deposit for the payment schedule
  const hasStripePricing = !!(stripeEst.contractor_amount_cents && stripeEst.platform_fee_cents && stripeEst.client_total_cents)
  let depositDisplayAmt = 0
  let remainingDisplayAmt = 0
  if (hasStripePricing && stripeEst.client_total_cents) {
    if (stripeEst.deposit_amount_cents && stripeEst.deposit_amount_cents > 0) {
      depositDisplayAmt = stripeEst.deposit_amount_cents / 100
    } else if (stripeEst.deposit_percentage && stripeEst.deposit_percentage > 0) {
      depositDisplayAmt = (stripeEst.client_total_cents * stripeEst.deposit_percentage) / 10000
    } else {
      depositDisplayAmt = stripeEst.client_total_cents * 0.3 / 100
    }
    remainingDisplayAmt = total - depositDisplayAmt
  }

  const companyName = profile?.company_name || profile?.owner_name || "Your Company"
  const ownerName   = profile?.owner_name || ""
  const clientName  = client?.name || estimate.client_name || "Client"
  const clientCo    = client?.company || ""
  const clientEmail = client?.email || ""
  const clientPhone = client?.phone || ""
  const estimateDetails = estimate as EstimateRow & ScheduledSource
  const jobDetails = jobRequest as (JobRequestRow & ScheduledSource) | null
  const workAddress = workAddressFor(estimateDetails, jobDetails)
  const scheduledVisit = scheduledVisitFor(estimateDetails, jobDetails)

  const isAccepted    = estimate.status === "Won" || estimate.status === "Accepted"
  const isPaid        = stripeEst.payment_status === "paid"
  const isDepositPaid = stripeEst.payment_status === "deposit_paid"
  const isContractor  = role !== "client"

  return (
    <>
      <PrintToolbar backHref={role === "client" ? "/client/dashboard" : "/dashboard/estimates"} />

      <div className="print-document pt-16 print:pt-0 min-h-screen bg-zinc-200 print:bg-white">
        <div
          className="print-page mx-auto my-6 bg-white shadow-2xl print:my-0 print:shadow-none"
          data-testid="estimate-print-page"
        >

          {/* ── Top accent ── */}
          <div className="h-[5px] bg-ef-ocean print:bg-ef-ocean" />

          {/* ── Header ── */}
          <div className="print-avoid-break flex items-start justify-between gap-6 px-8 pt-7 pb-5 print:pt-5 print:pb-3">
            <div>
              <p className="text-2xl font-black tracking-tight text-zinc-900 leading-tight">{companyName}</p>
              {ownerName && ownerName !== companyName && (
                <p className="text-xs text-zinc-400 mt-0.5">{ownerName}</p>
              )}
              <div className="mt-2 space-y-0.5 text-xs text-zinc-500">
                {profile?.phone   && <p>{profile.phone}</p>}
                {profile?.website && <p className="text-blue-600">{profile.website}</p>}
                {profile?.service_area && <p>{profile.service_area}</p>}
                {profile?.trade   && (
                  <p className="text-[0.6rem] uppercase tracking-widest text-zinc-400 font-semibold">{profile.trade}</p>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[2rem] font-black tracking-widest text-ef-ocean leading-none">ESTIMATE</p>
              <p className="mt-1.5 text-base font-bold text-zinc-700">#{estimate.estimate_number}</p>
              <div className="mt-2">
                <span className={`inline-block rounded px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide
                  ${STATUS_STYLE[estimate.status] ?? "bg-zinc-100 text-zinc-500"}`}>
                  {STATUS_LABEL[estimate.status] ?? estimate.status}
                </span>
              </div>
            </div>
          </div>

          {/* ── Dates strip ── */}
          <div className="print-avoid-break flex flex-wrap border-y border-zinc-200 text-xs">
            <div className="flex-1 min-w-[110px] border-r border-zinc-200 px-8 py-3 print:py-2">
              <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400">Date Issued</p>
              <p className="mt-0.5 font-semibold text-zinc-800">{fmt(estimate.sent_date)}</p>
            </div>
            {estimate.follow_up_date && (
              <div className="flex-1 min-w-[110px] border-r border-zinc-200 px-8 py-3 print:py-2">
                <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400">Valid Until</p>
                <p className="mt-0.5 font-semibold text-zinc-800">{fmt(estimate.follow_up_date)}</p>
              </div>
            )}
            <div className="flex-1 min-w-[110px] px-8 py-3 print:py-2">
              <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400">Estimate Total</p>
              <p className="mt-0.5 font-black text-ef-ocean">{money.format(total)}</p>
            </div>
          </div>

          {/* ── Prepared By / For ── */}
          <div className="print-avoid-break grid grid-cols-2 gap-px bg-zinc-200 border-b border-zinc-200 text-xs">
            <div className="bg-zinc-50 px-8 py-4 print:py-3">
              <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">Prepared By</p>
              <p className="font-bold text-zinc-900 text-sm">{companyName}</p>
              {profile?.phone   && <p className="text-zinc-500 mt-0.5">{profile.phone}</p>}
              {profile?.website && <p className="text-blue-600 mt-0.5">{profile.website}</p>}
              {profile?.service_area && <p className="text-zinc-400 mt-0.5">{profile.service_area}</p>}
            </div>
            <div className="bg-white px-8 py-4 print:py-3">
              <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">Prepared For</p>
              <p className="font-bold text-zinc-900 text-sm">{clientName}</p>
              {clientCo    && clientCo !== clientName && <p className="text-zinc-600 mt-0.5">{clientCo}</p>}
              {clientEmail && <p className="text-zinc-500 mt-0.5">{clientEmail}</p>}
              {clientPhone && <p className="text-zinc-500 mt-0.5">{clientPhone}</p>}
            </div>
          </div>

          {/* ── Scope of work ── */}
          {(workAddress || scheduledVisit) && (
            <div className={`print-avoid-break grid gap-px bg-zinc-200 border-b border-zinc-200 text-xs ${
              workAddress && scheduledVisit ? "grid-cols-2" : "grid-cols-1"
            }`}>
              {workAddress && (
                <div className="bg-white px-8 py-3">
                  <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">Work Address</p>
                  <p className="font-semibold text-zinc-800">{workAddress}</p>
                </div>
              )}
              {scheduledVisit && (
                <div className="bg-zinc-50 px-8 py-3">
                  <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">{scheduledVisit.label}</p>
                  <p className="font-semibold text-zinc-800">{scheduledVisit.time}</p>
                  {scheduledVisit.notes && <p className="mt-1 text-zinc-500">{scheduledVisit.notes}</p>}
                </div>
              )}
            </div>
          )}

          <div className="print-avoid-break px-8 py-5 print:py-3">
            <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400 mb-3">Scope of Work</p>

            {hasLineItems ? (
              <>
                <div className="grid grid-cols-[1fr_44px_100px_100px] gap-3 border-b-2 border-zinc-800 pb-2 text-[0.6rem] font-bold uppercase tracking-widest text-zinc-500">
                  <span>Description</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Rate</span>
                  <span className="text-right">Amount</span>
                </div>

                <div className="divide-y divide-zinc-100">
                  {lineItems.map((item, i) => (
                    <div key={i} className="grid grid-cols-[1fr_44px_100px_100px] gap-3 py-2.5 text-xs">
                      <span className="text-zinc-800">{item.description || "—"}</span>
                      <span className="text-right tabular-nums text-zinc-500">{item.quantity}</span>
                      <span className="text-right tabular-nums text-zinc-500">{money.format(item.unit_price)}</span>
                      <span className="text-right tabular-nums font-semibold text-zinc-900">{money.format(item.quantity * item.unit_price)}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 border-t border-zinc-200 pt-4 flex justify-end">
                  <div className="w-60 space-y-2">
                    <div className="flex justify-between text-xs text-zinc-500">
                      <span>Subtotal</span>
                      <span className="tabular-nums font-medium text-zinc-700">{money.format(subtotal)}</span>
                    </div>
                    {taxLines.map((t, i) => (
                      <div key={i} className="flex justify-between text-xs text-zinc-500">
                        <span>{t.name} ({t.rate}%)</span>
                        <span className="tabular-nums font-medium text-zinc-700">{money.format(subtotal * (t.rate / 100))}</span>
                      </div>
                    ))}
                    {taxLines.length > 1 && (
                      <div className="flex justify-between text-xs text-zinc-400">
                        <span>Total Tax</span>
                        <span className="tabular-nums">{money.format(totalTax)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center rounded-md bg-ef-ocean px-3 py-2 text-white">
                      <span className="text-xs font-bold uppercase tracking-wide">Estimate Total</span>
                      <span className="text-base font-black tabular-nums">{money.format(total)}</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="print-avoid-break flex items-center justify-between rounded-lg border-2 border-zinc-200 bg-zinc-50 px-6 py-4 print:py-3">
                <div>
                  <p className="text-xs font-medium text-zinc-500">Estimate Total</p>
                  <p className="text-[0.65rem] text-zinc-400 mt-0.5">All labour, materials, and equipment included.</p>
                </div>
                <p className="text-2xl font-black tabular-nums text-ef-ocean">{money.format(estimate.amount)}</p>
              </div>
            )}
          </div>

          {/* ── Price breakdown + Notes side by side ── */}
          <div className="print-avoid-break border-t border-zinc-200 grid grid-cols-[1fr_auto] gap-px bg-zinc-200">
            <div className="bg-white px-8 py-4 print:py-3">
              {hasStripePricing && stripeEst.contractor_amount_cents && stripeEst.platform_fee_cents && stripeEst.client_total_cents ? (
                <>
                  <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400 mb-2.5">Price Breakdown</p>
                  <div className="w-full max-w-xs space-y-1.5">
                    <div className="flex justify-between text-xs text-zinc-500">
                      <span>Contractor subtotal</span>
                      <span className="tabular-nums font-medium text-zinc-700">{money.format(stripeEst.contractor_amount_cents / 100)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-zinc-500">
                      <span>Euroflo platform fee (15%)</span>
                      <span className="tabular-nums font-medium text-zinc-700">{money.format(stripeEst.platform_fee_cents / 100)}</span>
                    </div>
                    {(stripeEst.gst_cents ?? 0) > 0 && (
                      <div className="flex justify-between text-xs text-zinc-500">
                        <span>GST (5%)</span>
                        <span className="tabular-nums font-medium text-zinc-700">{money.format((stripeEst.gst_cents ?? 0) / 100)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs font-bold text-zinc-900 border-t border-zinc-200 pt-1.5">
                      <span>Total</span>
                      <span className="tabular-nums text-ef-ocean">{money.format(stripeEst.client_total_cents / 100)}</span>
                    </div>
                    {depositDisplayAmt > 0 && (
                      <>
                        <div className="flex justify-between text-xs text-zinc-500 pt-1">
                          <span>Deposit due now</span>
                          <span className="tabular-nums font-semibold text-ef-ocean">{money.format(depositDisplayAmt)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-zinc-500">
                          <span>Remaining balance</span>
                          <span className="tabular-nums font-medium text-zinc-700">{money.format(remainingDisplayAmt)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400 mb-2.5">Payment</p>
                  <p className="text-xs text-zinc-500">Full amount due upon completion unless otherwise arranged.</p>
                </>
              )}
            </div>
            {estimate.notes && (
              <div className="bg-zinc-50 px-8 py-4 min-w-[220px] print:py-3">
                <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">Notes</p>
                <p className="text-xs leading-relaxed whitespace-pre-wrap text-zinc-600">{estimate.notes}</p>
              </div>
            )}
          </div>

          {/* ── Terms & Conditions (2-column) ── */}
          <div className="print-avoid-break border-t border-zinc-200 bg-zinc-50 px-8 py-4 print:py-3">
            <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400 mb-2">Terms &amp; Conditions</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {[
                "This estimate is valid for 30 days from the date of issue.",
                "Work commences within 5 business days of receipt of deposit.",
                "Labour and materials are guaranteed for one (1) year from completion.",
                "Changes to scope require a written change order and may affect pricing.",
                `The client is responsible for permits unless otherwise agreed in writing.`,
                `${companyName} carries full liability insurance and WCB/WSIB coverage.`,
                "Invoices unpaid beyond 30 days may be subject to a 1.5%/month service charge.",
                "Prices are exclusive of applicable taxes unless shown separately above.",
              ].map((clause, i) => (
                <p key={i} className="text-[0.6rem] text-zinc-500 leading-snug">• {clause}</p>
              ))}
            </div>
          </div>

          {/* ── Authorization ── */}
          <div className="print-avoid-break border-t border-zinc-200 px-8 py-5 print:py-3">
            <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400 mb-3">Authorization</p>
            {isAccepted && !isPaid && !isDepositPaid && (
              <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-4 py-2">
                <p className="text-xs font-semibold text-emerald-700">✓ This estimate has been accepted.</p>
              </div>
            )}
            {isDepositPaid && !isPaid && (
              <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-4 py-2">
                <p className="text-xs font-semibold text-amber-700">✓ Deposit received. Remaining balance due on completion.</p>
              </div>
            )}
            {isPaid && (
              <div className="mb-3 rounded border border-blue-200 bg-blue-50 px-4 py-2">
                <p className="text-xs font-semibold text-blue-700">✓ Payment received — this estimate has been paid in full.</p>
              </div>
            )}
            {/* Contractor-only: show fee breakdown on print */}
            {isContractor && stripeEst.contractor_amount_cents && stripeEst.platform_fee_cents && (
              <div className="mb-3 rounded border border-zinc-200 bg-zinc-50 px-4 py-2">
                <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">Payment breakdown (contractor view)</p>
                <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <div><span className="text-zinc-400">Your payout: </span><span className="font-semibold text-zinc-800">{money.format(stripeEst.contractor_amount_cents / 100)}</span></div>
                  <div><span className="text-zinc-400">Platform fee 15%: </span><span className="font-semibold text-zinc-800">{money.format(stripeEst.platform_fee_cents / 100)}</span></div>
                  {(stripeEst.gst_cents ?? 0) > 0 && (
                    <div><span className="text-zinc-400">GST 5%: </span><span className="font-semibold text-zinc-800">{money.format((stripeEst.gst_cents ?? 0) / 100)}</span></div>
                  )}
                  <div><span className="text-zinc-400">Client total: </span><span className="font-semibold text-ef-ocean">{money.format(total)}</span></div>
                </div>
              </div>
            )}
            <p className="mb-4 text-[0.6rem] text-zinc-400">
              By signing below, the client accepts the scope of work, pricing, payment schedule, and terms outlined in this estimate.
            </p>
            <div className="grid grid-cols-2 gap-10">
              <div>
                <div className="h-px bg-zinc-300" />
                <p className="mt-1.5 text-[0.6rem] font-semibold text-zinc-500">Client Signature &amp; Date</p>
                <p className="mt-1 text-[0.6rem] text-zinc-400">Print name: ________________________________</p>
              </div>
              <div>
                <div className="h-px bg-zinc-300" />
                <p className="mt-1.5 text-[0.6rem] font-semibold text-zinc-500">Contractor Signature &amp; Date</p>
                <p className="mt-1 text-[0.6rem] text-zinc-400">{companyName}</p>
              </div>
            </div>
          </div>

          {/* ── Bottom accent ── */}
          <div className="h-[5px] bg-ef-ocean print:bg-ef-ocean" />

          {/* ── Footer ── */}
          <div className="print-avoid-break flex items-center justify-between px-8 py-2 text-[0.6rem] text-zinc-400">
            <span>Generated with Euroflo</span>
            <span>{companyName} &middot; #{estimate.estimate_number}</span>
          </div>
        </div>
      </div>
    </>
  )
}
