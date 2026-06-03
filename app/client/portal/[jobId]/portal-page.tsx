"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import {
  buildTimeline,
  EstimatesSection,
  FlowBar,
  InspectionCard,
  InvoicesSection,
  MoreDetailsCard,
  PortalSkeleton,
  StatusCard,
  Timeline,
} from "@/components/client/portal-sections"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"

type JobRequest    = Database["public"]["Tables"]["job_requests"]["Row"]
type Estimate      = Database["public"]["Tables"]["estimates"]["Row"]
type Invoice       = Database["public"]["Tables"]["invoices"]["Row"]
type TimelineEvent = Database["public"]["Tables"]["project_timeline_events"]["Row"]

export function PortalPage({ jobId }: { jobId: string }) {
  const supabase = useMemo(() => createClient(), [])

  const [job,       setJob]     = useState<JobRequest | null>(null)
  const [estimates, setEsts]    = useState<Estimate[]>([])
  const [invoices,  setInvs]    = useState<Invoice[]>([])
  const [events,    setEvents]  = useState<TimelineEvent[]>([])
  const [loading,   setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const [jobResult, estsResult, invsResult, eventsResult] =
      await Promise.all([
        supabase.from("job_requests").select("*").eq("id", jobId).maybeSingle(),
        supabase.from("estimates").select("*").eq("job_request_id", jobId).neq("status", "Draft"),
        supabase.from("invoices").select("*").eq("job_request_id", jobId),
        supabase
          .from("project_timeline_events")
          .select("*")
          .eq("job_request_id", jobId)
          .order("event_date", { ascending: true }),
      ])

    if (jobResult.data) setJob(jobResult.data)
    setEsts(estsResult.data ?? [])
    setInvs(invsResult.data ?? [])
    setEvents(eventsResult.data ?? [])
    setLoading(false)
  }, [supabase, jobId])

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(id)
  }, [load])

  async function respondToDetails(response: string) {
    if (!job) return
    const { data, error } = await supabase
      .from("job_requests")
      .update({ more_details_response: response })
      .eq("id", jobId)
      .select()
      .single()
    if (error) { toast.error("Could not send your response. Please try again."); return }
    if (data) setJob(data)
    toast.success("Response sent to your contractor")
  }

  async function confirmInspection() {
    if (!job) return
    const { data, error } = await supabase
      .from("job_requests")
      .update({ status: "inspection_confirmed" })
      .eq("id", jobId)
      .select()
      .single()
    if (error) { toast.error("Could not confirm inspection. Please try again."); return }
    if (data) setJob(data)
    toast.success("Inspection confirmed")
  }

  async function respondToEstimate(est: Estimate, response: "Accepted" | "Declined") {
    if (!job) return

    const [estResult, jobResult] = await Promise.all([
      supabase
        .from("estimates")
        .update({ status: response })
        .eq("id", est.id)
        .select()
        .single(),
      supabase
        .from("job_requests")
        .update({ status: response === "Accepted" ? "accepted" : "declined" })
        .eq("id", jobId)
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
          <StatusCard job={job} hasEstimate={hasEstimate} />
          <FlowBar job={job} hasEstimate={hasEstimate} invoices={invoices} estimates={visibleEstimates} />
          {timeline.length > 0 && <Timeline items={timeline} />}
          {job.status === "needs_info" && (
            <MoreDetailsCard job={job} onRespond={(r) => void respondToDetails(r)} />
          )}
          {(job.status === "inspection_scheduled" || job.status === "inspection_confirmed") && (
            <InspectionCard job={job} onConfirm={() => void confirmInspection()} />
          )}
          <EstimatesSection
            estimates={visibleEstimates}
            onRespond={(est, r) => void respondToEstimate(est, r)}
          />
          <InvoicesSection invoices={invoices} />
        </>
      )}
    </div>
  )
}
