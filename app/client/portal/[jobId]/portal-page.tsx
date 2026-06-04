"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

import {
  buildTimeline,
  DeclinedByContractorCard,
  EstimatesSection,
  FlowBar,
  InspectionCard,
  InvoicesSection,
  MoreDetailsCard,
  PortalSkeleton,
  RatingCard,
  StatusCard,
  Timeline,
  WorkScheduleCard,
} from "@/components/client/portal-sections"
import { Button } from "@/components/ui/button"
import {
  INPUT_LIMITS,
  enumField,
  inputErrorMessage,
  isoDateTimeField,
  optionalTextField,
  textField,
  uuidField,
} from "@/lib/security/input"
import { createClient } from "@/lib/supabase/client"
import type { WorkDay } from "@/lib/scheduling"
import type { Database } from "@/lib/supabase/database.types"

type JobRequest    = Database["public"]["Tables"]["job_requests"]["Row"]
type Estimate      = Database["public"]["Tables"]["estimates"]["Row"]
type Invoice       = Database["public"]["Tables"]["invoices"]["Row"]
type TimelineEvent = Database["public"]["Tables"]["project_timeline_events"]["Row"]
const DECLINE_REASONS = [
  "price_too_high",
  "scope_changed",
  "hired_another",
  "no_longer_needed",
  "timeline",
  "other",
] as const

export function PortalPage({
  jobId,
  paymentStatus,
}: {
  jobId: string
  paymentStatus?: "success"
}) {
  const supabase = useMemo(() => createClient(), [])

  const [job,       setJob]     = useState<JobRequest | null>(null)
  const [estimates, setEsts]    = useState<Estimate[]>([])
  const [invoices,  setInvs]    = useState<Invoice[]>([])
  const [events,    setEvents]  = useState<TimelineEvent[]>([])
  const [workDays,  setWorkDays] = useState<WorkDay[]>([])
  const [loading,   setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)

    let safeJobId: string
    try {
      safeJobId = uuidField(jobId, "jobId")
    } catch {
      setJob(null)
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const [jobResult, estsResult, invsResult, eventsResult] =
      await Promise.all([
        supabase.from("job_requests").select("*").eq("id", safeJobId).maybeSingle(),
        supabase.from("estimates").select("*").eq("job_request_id", safeJobId).neq("status", "Draft"),
        supabase.from("invoices").select("*").eq("job_request_id", safeJobId),
        supabase
          .from("project_timeline_events")
          .select("*")
          .eq("job_request_id", safeJobId)
          .order("event_date", { ascending: true }),
      ])

    if (jobResult.data) setJob(jobResult.data)
    const ests = estsResult.data ?? []
    setEsts(ests)
    setInvs(invsResult.data ?? [])
    setEvents(eventsResult.data ?? [])

    // Work schedule for this job's estimates (RLS lets the client read them).
    const estimateIds = ests.map((e) => e.id)
    if (estimateIds.length > 0) {
      const { data: days } = await supabase
        .from("scheduled_work_days")
        .select("*")
        .in("estimate_id", estimateIds)
        .order("starts_at", { ascending: true })
      setWorkDays(days ?? [])
    } else {
      setWorkDays([])
    }

    setLoading(false)
  }, [supabase, jobId])

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(id)
  }, [load])

  async function respondToDetails(response: string) {
    if (!job) return
    let safeJobId: string
    let safeResponse: string
    try {
      safeJobId = uuidField(jobId, "jobId")
      safeResponse = textField(response, "Response", {
        required: true,
        maxLength: INPUT_LIMITS.description,
        multiline: true,
      })
    } catch (error) {
      toast.error(inputErrorMessage(error))
      return
    }
    const { data, error } = await supabase
      .from("job_requests")
      .update({ more_details_response: safeResponse })
      .eq("id", safeJobId)
      .select()
      .single()
    if (error) { toast.error("Could not send your response. Please try again."); return }
    if (data) setJob(data)
    toast.success("Response sent to your contractor")
  }

  async function confirmInspection() {
    if (!job) return
    let safeJobId: string
    try {
      safeJobId = uuidField(jobId, "jobId")
    } catch (error) {
      toast.error(inputErrorMessage(error))
      return
    }
    const { data, error } = await supabase
      .from("job_requests")
      .update({ status: "inspection_confirmed" })
      .eq("id", safeJobId)
      .select()
      .single()
    if (error) { toast.error("Could not confirm inspection. Please try again."); return }
    if (data) setJob(data)
    toast.success("Inspection confirmed")
  }

  async function suggestVisitTime(proposedAt: string, notes: string) {
    if (!job) return
    let safeJobId: string
    let safeProposedAt: string
    let safeNotes: string | null
    try {
      safeJobId = uuidField(jobId, "jobId")
      safeProposedAt = isoDateTimeField(proposedAt, "Proposed time")
      safeNotes = optionalTextField(notes, "Notes", {
        maxLength: INPUT_LIMITS.notes,
        multiline: true,
      })
    } catch (error) {
      toast.error(inputErrorMessage(error))
      return
    }
    const { data, error } = await supabase
      .from("job_requests")
      .update({ visit_client_proposed_at: safeProposedAt, visit_client_notes: safeNotes })
      .eq("id", safeJobId)
      .select()
      .single()
    if (error) { toast.error("Could not send your suggestion. Please try again."); return }
    if (data) setJob(data)
    toast.success("Suggestion sent to your contractor")
  }

  async function respondToEstimate(
    est: Estimate,
    response: "Accepted" | "Declined",
    declineReason?: string,
    declineComment?: string,
  ) {
    if (!job) return
    let safeJobId: string
    let safeEstimateId: string
    let safeDeclineReason: (typeof DECLINE_REASONS)[number] | null = null
    let safeDeclineComment: string | null = null

    try {
      safeJobId = uuidField(jobId, "jobId")
      safeEstimateId = uuidField(est.id, "estimateId")
      if (response === "Declined" && declineReason) {
        safeDeclineReason = enumField(declineReason, "Decline reason", DECLINE_REASONS)
      }
      safeDeclineComment = optionalTextField(declineComment, "Decline comment", {
        maxLength: INPUT_LIMITS.notes,
        multiline: true,
      })
    } catch (error) {
      toast.error(inputErrorMessage(error))
      return
    }

    const [estResult, jobResult] = await Promise.all([
      supabase
        .from("estimates")
        .update(
          response === "Declined"
            ? { status: response, decline_reason: safeDeclineReason, decline_comment: safeDeclineComment }
            : { status: response }
        )
        .eq("id", safeEstimateId)
        .select()
        .single(),
      supabase
        .from("job_requests")
        .update({ status: response === "Accepted" ? "accepted" : "declined" })
        .eq("id", safeJobId)
        .select()
        .single(),
    ])

    if (estResult.error || jobResult.error) {
      toast.error("Could not save your response. Please try again.")
      return
    }

    setEsts((prev) => prev.map((e) => (e.id === est.id ? estResult.data : e)))
    if (jobResult.data) setJob(jobResult.data)
    toast.success(response === "Accepted" ? "Estimate accepted" : "Estimate declined")
  }

  const timeline = useMemo(
    () => (job ? buildTimeline(job, estimates, events) : []),
    [job, estimates, events]
  )

  const visibleEstimates = estimates.filter((e) => e.status !== "Draft")
  const hasEstimate      = visibleEstimates.length > 0

  const paidEstimate = visibleEstimates.find(
    (e) => e.payment_status === "paid" || e.payment_status === "deposit_paid"
  )
  const contractorId = job?.contractor_id ?? null

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 text-gray-500" asChild>
          <Link href="/client/dashboard">
            <ArrowLeft className="mr-1 h-4 w-4" />
            All projects
          </Link>
        </Button>
      </div>

      {loading ? (
        <PortalSkeleton />
      ) : !job ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-sm text-gray-500">Project not found.</p>
          <Button variant="outline" className="mt-4" asChild>
            <Link href="/client/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      ) : (
        <>
          {paymentStatus === "success" && (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 shadow-sm">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold">Payment received</p>
                <p className="mt-1 text-sm leading-6 text-emerald-900/80">
                  Your contractor can see this payment and follow up with the next step.
                </p>
              </div>
            </div>
          )}
          <StatusCard job={job} hasEstimate={hasEstimate} />
          <FlowBar job={job} hasEstimate={hasEstimate} invoices={invoices} estimates={visibleEstimates} />
          {timeline.length > 0 && <Timeline items={timeline} />}
          {job.status === "declined_by_contractor" && <DeclinedByContractorCard job={job} />}
          {job.status === "needs_info" && (
            <MoreDetailsCard job={job} onRespond={(r) => void respondToDetails(r)} />
          )}
          {(job.status === "inspection_scheduled" || job.status === "inspection_confirmed" || job.status === "visit_completed") && (
            <InspectionCard
              job={job}
              onConfirm={() => void confirmInspection()}
              onSuggestTime={(at, notes) => void suggestVisitTime(at, notes)}
            />
          )}
          <WorkScheduleCard workDays={workDays} />
          <EstimatesSection
            estimates={visibleEstimates}
            onRespond={(est, r, reason, comment) => void respondToEstimate(est, r, reason, comment)}
          />
          {paidEstimate && contractorId && (
            <RatingCard
              estimate={paidEstimate}
              jobRequestId={jobId}
              contractorId={contractorId}
            />
          )}
          <InvoicesSection invoices={invoices} />
        </>
      )}
    </div>
  )
}
