import { redirect } from "next/navigation"
import Link from "next/link"
import { CheckCircle2, Clock, ArrowLeft } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { hasSupabaseEnv } from "@/lib/supabase/env"

export default async function PaymentSuccessPage({
  params,
}: {
  params: Promise<{ jobId: string }>
}) {
  const { jobId } = await params

  if (!hasSupabaseEnv()) {
    return (
      <div className="p-8 text-center text-sm text-red-600">
        Supabase is not configured.
      </div>
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=/client/portal/${jobId}/success`)

  // Load the job request (verifies client ownership via RLS)
  const { data: job } = await supabase
    .from("job_requests")
    .select("id, title, status")
    .eq("id", jobId)
    .maybeSingle()

  if (!job) redirect("/client/dashboard")

  // Load estimates for this job to find payment status
  const { data: estimates } = await supabase
    .from("estimates")
    .select("id, estimate_number, client_total_cents, payment_status, amount")
    .eq("job_request_id", jobId)
    .neq("status", "Draft")
    .order("created_at", { ascending: false })

  const paidEstimate    = estimates?.find((e) => e.payment_status === "paid")
  const processingEst   = estimates?.find((e) => e.payment_status === "checkout_created")
  const relevantEstimate = paidEstimate ?? processingEst

  const isPaid       = Boolean(paidEstimate)
  const isProcessing = !isPaid && Boolean(processingEst)

  const totalCents = relevantEstimate?.client_total_cents
  const formattedTotal = totalCents
    ? new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(totalCents / 100)
    : null

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6 sm:py-16">
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        {isPaid ? (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h1 className="mt-5 text-2xl font-bold text-gray-900">Payment received</h1>
            {formattedTotal && (
              <p className="mt-2 text-3xl font-black tabular-nums text-ef-ocean">
                {formattedTotal}
              </p>
            )}
            <p className="mt-3 text-sm leading-relaxed text-gray-500">
              Your payment has been received and your contractor has been notified.
              They will be in touch to schedule the work.
            </p>
          </>
        ) : isProcessing ? (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
              <Clock className="h-8 w-8 text-amber-600" />
            </div>
            <h1 className="mt-5 text-2xl font-bold text-gray-900">Payment processing</h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-500">
              Your payment is being confirmed. This page will reflect the final status
              once the transaction settles — usually within a few minutes.
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <CheckCircle2 className="h-8 w-8 text-gray-400" />
            </div>
            <h1 className="mt-5 text-2xl font-bold text-gray-900">
              {job.title}
            </h1>
            <p className="mt-3 text-sm text-gray-500">
              No payment found for this project yet.
            </p>
          </>
        )}

        <div className="mt-8">
          <Link
            href={`/client/portal/${jobId}`}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to project
          </Link>
        </div>
      </div>
    </div>
  )
}
