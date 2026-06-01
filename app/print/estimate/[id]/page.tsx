import { notFound, redirect } from "next/navigation"

import { PrintToolbar } from "@/components/print/print-toolbar"
import { hasSupabaseEnv } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/database.types"
import { getProfileRole } from "@/lib/user-role"

type ClientRow   = Database["public"]["Tables"]["clients"]["Row"]
type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"]

type LineItem = { description: string; quantity: number; unit_price: number }
type TaxLine  = { name: string; rate: number }

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

  const lineItems    = parseLineItems(estimate.line_items)
  const taxLines     = parseTaxLines((estimate as Record<string, unknown>).tax_lines, Number(estimate.tax_rate ?? 0))
  const hasLineItems = lineItems.length > 0
  const subtotal     = lineItems.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const totalTax     = taxLines.reduce((s, t) => s + subtotal * (t.rate / 100), 0)
  const total        = hasLineItems ? subtotal + totalTax : estimate.amount

  const depositAmt  = total * 0.30
  const progressAmt = total * 0.40
  const finalAmt    = total * 0.30

  const companyName = profile?.company_name || profile?.owner_name || "Your Company"
  const ownerName   = profile?.owner_name || ""
  const clientName  = client?.name || estimate.client_name || "Client"
  const clientCo    = client?.company || ""
  const clientEmail = client?.email || ""
  const clientPhone = client?.phone || ""

  const isAccepted = estimate.status === "Won" || estimate.status === "Accepted"

  return (
    <>
      <PrintToolbar backHref={role === "client" ? "/client/dashboard" : "/dashboard/estimates"} />

      <div className="pt-14 print:pt-0 min-h-screen bg-zinc-200 print:bg-white">
        <div
          className="mx-auto w-[794px] print:w-full my-6 print:my-0 bg-white shadow-2xl print:shadow-none"
          data-testid="estimate-print-page"
        >

          {/* ── Top accent ── */}
          <div className="h-[5px] bg-ef-ocean print:bg-ef-ocean" />

          {/* ── Header ── */}
          <div className="flex items-start justify-between gap-6 px-8 pt-7 pb-5">
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
          <div className="flex flex-wrap border-y border-zinc-200 text-xs">
            <div className="flex-1 min-w-[110px] border-r border-zinc-200 px-8 py-3">
              <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400">Date Issued</p>
              <p className="mt-0.5 font-semibold text-zinc-800">{fmt(estimate.sent_date)}</p>
            </div>
            {estimate.follow_up_date && (
              <div className="flex-1 min-w-[110px] border-r border-zinc-200 px-8 py-3">
                <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400">Valid Until</p>
                <p className="mt-0.5 font-semibold text-zinc-800">{fmt(estimate.follow_up_date)}</p>
              </div>
            )}
            <div className="flex-1 min-w-[110px] px-8 py-3">
              <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400">Estimate Total</p>
              <p className="mt-0.5 font-black text-ef-ocean">{money.format(total)}</p>
            </div>
          </div>

          {/* ── Prepared By / For ── */}
          <div className="grid grid-cols-2 gap-px bg-zinc-200 border-b border-zinc-200 text-xs">
            <div className="bg-zinc-50 px-8 py-4">
              <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">Prepared By</p>
              <p className="font-bold text-zinc-900 text-sm">{companyName}</p>
              {profile?.phone   && <p className="text-zinc-500 mt-0.5">{profile.phone}</p>}
              {profile?.website && <p className="text-blue-600 mt-0.5">{profile.website}</p>}
              {profile?.service_area && <p className="text-zinc-400 mt-0.5">{profile.service_area}</p>}
            </div>
            <div className="bg-white px-8 py-4">
              <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">Prepared For</p>
              <p className="font-bold text-zinc-900 text-sm">{clientName}</p>
              {clientCo    && clientCo !== clientName && <p className="text-zinc-600 mt-0.5">{clientCo}</p>}
              {clientEmail && <p className="text-zinc-500 mt-0.5">{clientEmail}</p>}
              {clientPhone && <p className="text-zinc-500 mt-0.5">{clientPhone}</p>}
            </div>
          </div>

          {/* ── Scope of work ── */}
          <div className="px-8 py-5">
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
              <div className="flex items-center justify-between rounded-lg border-2 border-zinc-200 bg-zinc-50 px-6 py-4">
                <div>
                  <p className="text-xs font-medium text-zinc-500">Estimate Total</p>
                  <p className="text-[0.65rem] text-zinc-400 mt-0.5">All labour, materials, and equipment included.</p>
                </div>
                <p className="text-2xl font-black tabular-nums text-ef-ocean">{money.format(estimate.amount)}</p>
              </div>
            )}
          </div>

          {/* ── Payment schedule + Notes side by side ── */}
          <div className="border-t border-zinc-200 grid grid-cols-[1fr_auto] gap-px bg-zinc-200">
            <div className="bg-white px-8 py-4">
              <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400 mb-2.5">Payment Schedule</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Deposit",          sub: "On acceptance", pct: "30%", amt: depositAmt  },
                  { label: "Progress Payment", sub: "At midpoint",   pct: "40%", amt: progressAmt },
                  { label: "Final Payment",    sub: "On completion", pct: "30%", amt: finalAmt    },
                ].map(({ label, sub, pct, amt }) => (
                  <div key={label} className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                    <p className="text-[0.6rem] font-bold text-zinc-600">{label}</p>
                    <p className="text-[0.55rem] text-zinc-400 mt-0.5">{sub} · {pct}</p>
                    <p className="mt-1.5 text-sm font-black text-ef-ocean tabular-nums">{money.format(amt)}</p>
                  </div>
                ))}
              </div>
            </div>
            {estimate.notes && (
              <div className="bg-zinc-50 px-8 py-4 min-w-[220px]">
                <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">Notes</p>
                <p className="text-xs leading-relaxed whitespace-pre-wrap text-zinc-600">{estimate.notes}</p>
              </div>
            )}
          </div>

          {/* ── Terms & Conditions (2-column) ── */}
          <div className="border-t border-zinc-200 bg-zinc-50 px-8 py-4">
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
          <div className="border-t border-zinc-200 px-8 py-5">
            <p className="text-[0.6rem] font-bold uppercase tracking-widest text-zinc-400 mb-3">Authorization</p>
            {isAccepted && (
              <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-4 py-2">
                <p className="text-xs font-semibold text-emerald-700">✓ This estimate has been accepted.</p>
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
          <div className="flex items-center justify-between px-8 py-2 text-[0.6rem] text-zinc-400">
            <span>Generated with Euroflo</span>
            <span>{companyName} &middot; #{estimate.estimate_number}</span>
          </div>
        </div>
      </div>
    </>
  )
}
