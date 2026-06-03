"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, UserPlus } from "lucide-react"
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
  WorkScheduleCard,
} from "@/components/client/portal-sections"
import { Button } from "@/components/ui/button"
import type { Database } from "@/lib/supabase/database.types"

type JobRequest    = Database["public"]["Tables"]["job_requests"]["Row"]
type Estimate      = Database["public"]["Tables"]["estimates"]["Row"]
type Invoice       = Database["public"]["Tables"]["invoices"]["Row"]
type TimelineEvent = Database["public"]["Tables"]["project_timeline_events"]["Row"]

// ── Account upsell banner ──────────────────────────────────────────────────────

function AccountBanner({ token }: { token: string }) {
  return (
    <div className="rounded-2xl border border-ef-200 bg-ef-mist p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ef-ocean/10">
          <UserPlus className="h-4 w-4 text-ef-ocean" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">
            Save this project to your account
          </p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Create a free Euroflo account to manage all your jobs, receive updates,
            and track payments in one place.
          </p>
          <a
            href={`/client/setup?claim_token=${token}`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-ef-ocean px-4 py-2 text-xs font-semibold text-white transition hover:bg-ef-ocean"
          >
            Create free account
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function GuestPortalPage({
  token,
  job:           initialJob,
  estimates:     initialEstimates,
  invoices:      initialInvoices,
  events:        initialEvents,
  contractorName,
}: {
  token:          string
  job:            JobRequest | null
  estimates:      Estimate[]
  invoices:       Invoice[]
  events:         TimelineEvent[]
  contractorName: string
}) {
  const [job,       setJob]  = useState<JobRequest | null>(initialJob)
  const [estimates, setEsts] = useState<Estimate[]>(initialEstimates)

  async function respondToDetails(response: string) {
    try {
      const res = await fetch("/api/guest/project/respond-details", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ guestToken: token, response }),
      })
      const data = await res.json() as { job?: JobRequest; error?: string }
      if (!res.ok || data.error) { toast.error(data.error ?? "Could not send your response."); return }
      if (data.job) setJob(data.job)
      toast.success("Response sent to your contractor")
    } catch {
      toast.error("Could not reach the server. Please try again.")
    }
  }

  async function confirmInspection() {
    try {
      const res = await fetch("/api/guest/project/confirm-inspection", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ guestToken: token }),
      })
      const data = await res.json() as { job?: JobRequest; error?: string }
      if (!res.ok || data.error) { toast.error(data.error ?? "Could not confirm inspection."); return }
      if (data.job) setJob(data.job)
      toast.success("Inspection confirmed")
    } catch {
      toast.error("Could not reach the server. Please try again.")
    }
  }

  async function respondToEstimate(est: Estimate, response: "Accepted" | "Declined") {
    try {
      const res = await fetch("/api/guest/project/respond-estimate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ guestToken: token, estimateId: est.id, response }),
      })
      const data = await res.json() as { estimate?: Estimate; job?: JobRequest; error?: string }

      if (!res.ok || data.error) {
        toast.error(data.error ?? "Could not save your response. Please try again.")
        return
      }

      if (data.estimate) {
        setEsts((prev) => prev.map((e) => (e.id === est.id ? data.estimate! : e)))
      }
      if (data.job) setJob(data.job)

      toast.success(response === "Accepted" ? "Estimate accepted" : "Estimate declined")
    } catch {
      toast.error("Could not reach the server. Please try again.")
    }
  }

  const timeline = useMemo(
    () => (job ? buildTimeline(job, estimates, initialEvents) : []),
    [job, estimates, initialEvents]
  )

  const visibleEstimates = estimates.filter((e) => e.status !== "Draft")
  const hasEstimate      = visibleEstimates.length > 0

  if (!job) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm text-gray-500">This link is no longer valid or has expired.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/">Go home</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="force-light mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">

      {/* Guest notice / account CTA */}
      <AccountBanner token={token} />

      {/* Status card */}
      <StatusCard job={job} hasEstimate={hasEstimate} />

      {/* Flow bar */}
      <FlowBar
        job={job}
        hasEstimate={hasEstimate}
        invoices={initialInvoices}
        estimates={visibleEstimates}
      />

      {/* Timeline */}
      {timeline.length > 0 && <Timeline items={timeline} />}

      {job.status === "needs_info" && (
        <MoreDetailsCard job={job} onRespond={(r) => void respondToDetails(r)} />
      )}
      {(job.status === "inspection_scheduled" || job.status === "inspection_confirmed") && (
        <InspectionCard job={job} onConfirm={() => void confirmInspection()} />
      )}

      <WorkScheduleCard estimates={visibleEstimates} />

      {/* Estimates — accept/decline + pay (via guest routes) */}
      <EstimatesSection
        estimates={visibleEstimates}
        guestToken={token}
        onRespond={(est, r) => void respondToEstimate(est, r)}
      />

      {/* Invoices */}
      <InvoicesSection invoices={initialInvoices} />

      {/* Footer banner */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center">
        <p className="text-xs text-gray-400">
          Viewing as guest &mdash; this link is private to you.{" "}
          <a
            href={`/client/setup?claim_token=${token}`}
            className="font-medium text-ef-ocean underline-offset-2 hover:underline"
          >
            Create an account
          </a>{" "}
          to save this project and manage future jobs.
        </p>
      </div>

    </div>
  )
}
