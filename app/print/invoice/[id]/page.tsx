import { notFound, redirect } from "next/navigation"

import { PrintToolbar } from "@/components/print/print-toolbar"
import { hasSupabaseEnv } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/database.types"
import { getProfileRole } from "@/lib/user-role"

type ClientRow = Database["public"]["Tables"]["clients"]["Row"]
type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"]
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
  Draft: "Draft", Sent: "Unpaid", Overdue: "Overdue",
  "Follow-up Sent": "Follow-up Sent", "Payment Plan": "Payment Plan",
  Paid: "Paid", Escalated: "Escalated",
}
const STATUS_STYLE: Record<string, string> = {
  Draft:           "bg-zinc-100 text-zinc-500",
  Sent:            "bg-blue-50 text-blue-700",
  Overdue:         "bg-red-50 text-red-700",
  "Follow-up Sent":"bg-amber-50 text-amber-700",
  "Payment Plan":  "bg-violet-50 text-violet-700",
  Paid:            "bg-emerald-50 text-emerald-700",
  Escalated:       "bg-red-100 text-red-800",
}

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!hasSupabaseEnv())
    return <div className="p-8 text-center text-sm text-red-600">Supabase is not configured.</div>

  const supabase  = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const role = await getProfileRole(supabase, user.id)

  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", id).single()
  if (!invoice) notFound()

  const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", invoice.user_id).single()

  let client: ClientRow | null = null
  if (invoice.client_id) {
    const { data } = await supabase.from("clients").select("*").eq("id", invoice.client_id).single()
    client = data
  }

  let jobRequest: JobRequestRow | null = null
  if (invoice.job_request_id) {
    const { data } = await supabase
      .from("job_requests")
      .select("*")
      .eq("id", invoice.job_request_id)
      .maybeSingle()
    jobRequest = data
  }

  const lineItems   = parseLineItems(invoice.line_items)
  const taxLines    = parseTaxLines((invoice as Record<string, unknown>).tax_lines, Number(invoice.tax_rate ?? 0))
  const hasLineItems = lineItems.length > 0
  const subtotal    = lineItems.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const totalTax    = taxLines.reduce((s, t) => s + subtotal * (t.rate / 100), 0)
  const total       = hasLineItems ? subtotal + totalTax : invoice.amount

  const companyName = profile?.company_name || profile?.owner_name || "Your Company"
  const ownerName   = profile?.owner_name || ""
  const clientName  = client?.name || invoice.client_name || "Client"
  const clientCo    = client?.company || ""
  const clientEmail = client?.email || ""
  const clientPhone = client?.phone || ""
  const invoiceDetails = invoice as InvoiceRow & ScheduledSource
  const jobDetails = jobRequest as (JobRequestRow & ScheduledSource) | null
  const workAddress = workAddressFor(invoiceDetails, jobDetails)
  const scheduledVisit = scheduledVisitFor(invoiceDetails, jobDetails)

  const isPaid    = invoice.status === "Paid"
  const isOverdue = !isPaid && invoice.due_date != null &&
    new Date(`${invoice.due_date}T00:00:00`) < new Date()

  return (
    <>
      <PrintToolbar backHref={role === "client" ? "/client/dashboard" : "/dashboard/invoices"} />

      {/* Screen chrome — grey bg, page shadow */}
      <div className="print-document pt-16 print:pt-0 min-h-screen bg-zinc-200 print:bg-white">
        <div
          className="print-page relative mx-auto my-6 bg-white shadow-2xl print:my-0 print:shadow-none"
          data-testid="invoice-print-page"
        >

          {/* PAID watermark */}
          {isPaid && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden">
              <p className="-rotate-[32deg] text-[9rem] font-black tracking-[0.2em] text-emerald-500/[0.10] select-none leading-none">
                PAID
              </p>
            </div>
          )}

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
              <p className="text-[2rem] font-black tracking-widest text-ef-ocean leading-none">INVOICE</p>
              <p className="mt-1.5 text-base font-bold text-zinc-700">#{invoice.invoice_number}</p>
              <div className="mt-2">
                <span className={`inline-block rounded px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide
                  ${STATUS_STYLE[invoice.status] ?? "bg-zinc-100 text-zinc-500"}`}>
                  {STATUS_LABEL[invoice.status] ?? invoice.status}
                </span>
              </div>
            </div>
          </div>

          {/* ── Dates strip ── */}
          <div className="print-avoid-break flex flex-wrap border-y border-zinc-200 text-xs">
            {invoice.issue_date && (
              <div className="flex-1 min-w-[110px] border-r border-zinc-200 px-8 py-3 print:py-2">
                <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400">Invoice Date</p>
                <p className="mt-0.5 font-semibold text-zinc-800">{fmt(invoice.issue_date)}</p>
              </div>
            )}
            {invoice.due_date && (
              <div className="flex-1 min-w-[110px] border-r border-zinc-200 px-8 py-3 print:py-2">
                <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400">Payment Due</p>
                <p className={`mt-0.5 font-bold ${isOverdue ? "text-red-600" : "text-zinc-800"}`}>
                  {fmt(invoice.due_date)}
                  {isOverdue && (
                    <span className="ml-1.5 rounded bg-red-100 px-1 py-0.5 text-[0.55rem] font-bold uppercase text-red-600">Overdue</span>
                  )}
                </p>
              </div>
            )}
            {invoice.project_name && (
              <div className="flex-1 min-w-[110px] px-8 py-3 print:py-2">
                <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400">Project</p>
                <p className="mt-0.5 font-semibold text-zinc-800">{invoice.project_name}</p>
              </div>
            )}
          </div>

          {/* ── From / Bill To ── */}
          <div className="print-avoid-break grid grid-cols-2 gap-px bg-zinc-200 border-b border-zinc-200 text-xs">
            <div className="bg-zinc-50 px-8 py-4 print:py-3">
              <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">From</p>
              <p className="font-bold text-zinc-900 text-sm">{companyName}</p>
              {profile?.phone   && <p className="text-zinc-500 mt-0.5">{profile.phone}</p>}
              {profile?.website && <p className="text-blue-600 mt-0.5">{profile.website}</p>}
              {profile?.service_area && <p className="text-zinc-400 mt-0.5">{profile.service_area}</p>}
            </div>
            <div className="bg-white px-8 py-4 print:py-3">
              <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">Bill To</p>
              <p className="font-bold text-zinc-900 text-sm">{clientName}</p>
              {clientCo    && clientCo !== clientName && <p className="text-zinc-600 mt-0.5">{clientCo}</p>}
              {clientEmail && <p className="text-zinc-500 mt-0.5">{clientEmail}</p>}
              {clientPhone && <p className="text-zinc-500 mt-0.5">{clientPhone}</p>}
            </div>
          </div>

          {/* ── Line items / flat amount ── */}
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
                      <span className="text-xs font-bold uppercase tracking-wide">{isPaid ? "Total Paid" : "Total Due"}</span>
                      <span className="text-base font-black tabular-nums">{money.format(total)}</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="print-avoid-break flex items-center justify-between rounded-lg border-2 border-zinc-200 bg-zinc-50 px-6 py-4 print:py-3">
                <div>
                  <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400">
                    {isPaid ? "Amount Paid" : "Amount Due"}
                  </p>
                  {invoice.project_name && <p className="text-xs text-zinc-500 mt-0.5">{invoice.project_name}</p>}
                </div>
                <p className={`text-2xl font-black tabular-nums
                  ${isPaid ? "text-emerald-600" : isOverdue ? "text-red-600" : "text-ef-ocean"}`}>
                  {money.format(invoice.amount)}
                </p>
              </div>
            )}
          </div>

          {/* ── Notes ── */}
          {invoice.notes && (
            <div className="print-avoid-break border-t border-zinc-200 px-8 py-4 print:py-3">
              <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">Notes</p>
              <p className="text-xs leading-relaxed whitespace-pre-wrap text-zinc-600">{invoice.notes}</p>
            </div>
          )}

          {/* ── Payment instructions ── */}
          {!isPaid && (
            <div className="print-avoid-break border-t border-zinc-200 bg-zinc-50 px-8 py-4 print:py-3">
              <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400 mb-2">Payment Instructions</p>
              <div className="grid grid-cols-2 gap-4 text-xs text-zinc-600">
                <div className="space-y-1">
                  <p><span className="font-semibold text-zinc-700">Payable to:</span> {companyName}</p>
                  <p><span className="font-semibold text-zinc-700">Reference:</span> #{invoice.invoice_number}</p>
                  {invoice.due_date && (
                    <p>
                      <span className="font-semibold text-zinc-700">Due date:</span>{" "}
                      <span className={isOverdue ? "text-red-600 font-semibold" : ""}>{fmt(invoice.due_date)}</span>
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  {profile?.phone && <p><span className="font-semibold text-zinc-700">Phone:</span> {profile.phone}</p>}
                  {profile?.website && <p><span className="font-semibold text-zinc-700">Website:</span> {profile.website}</p>}
                  {isOverdue && <p className="text-red-600 font-medium">⚠ This invoice is past due. Please remit payment immediately.</p>}
                </div>
              </div>
            </div>
          )}

          {/* Paid confirmation */}
          {isPaid && invoice.paid_at && (
            <div className="print-avoid-break border-t border-emerald-200 bg-emerald-50 px-8 py-3 print:py-2">
              <p className="text-xs font-semibold text-emerald-700">
                ✓ Payment received —{" "}
                {new Intl.DateTimeFormat("en-CA", { month: "long", day: "numeric", year: "numeric" }).format(new Date(invoice.paid_at))}
              </p>
            </div>
          )}

          {/* ── Bottom accent ── */}
          <div className="h-[5px] bg-ef-ocean print:bg-ef-ocean" />

          {/* ── Footer ── */}
          <div className="print-avoid-break flex items-center justify-between px-8 py-2 text-[0.6rem] text-zinc-400">
            <span>Generated with Euroflo</span>
            <span>{companyName} &middot; #{invoice.invoice_number}</span>
          </div>
        </div>
      </div>
    </>
  )
}
