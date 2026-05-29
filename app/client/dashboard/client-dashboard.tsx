"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  FolderOpen,
  HardHat,
  Plus,
  RefreshCw,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { ContentReveal } from "@/components/ui/content-reveal"
import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"

type JobRequest = Database["public"]["Tables"]["job_requests"]["Row"]
type Estimate   = Database["public"]["Tables"]["estimates"]["Row"]
type Invoice    = Database["public"]["Tables"]["invoices"]["Row"]

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  new:              "Under Review",
  reviewed:         "Estimate Pending",
  estimate_created: "Estimate Ready",
  accepted:         "Accepted",
  declined:         "Declined",
  closed:           "Closed",
}

const STATUS_NEXT: Record<string, string> = {
  new:              "Your contractor is reviewing your request.",
  reviewed:         "Your contractor is preparing an estimate.",
  estimate_created: "An estimate is ready — open the project to review it.",
  accepted:         "Your contractor will be in touch to schedule the work.",
  declined:         "The estimate was not accepted.",
  closed:           "This project has been closed.",
}

type StatusColor = "gray" | "yellow" | "green" | "red"

const STATUS_COLOR: Record<string, StatusColor> = {
  new:              "gray",
  reviewed:         "yellow",
  estimate_created: "green",
  accepted:         "green",
  declined:         "red",
  closed:           "gray",
}

const colorClasses: Record<StatusColor, { badge: string; dot: string }> = {
  gray:   { badge: "bg-gray-100 text-gray-700",           dot: "bg-gray-400" },
  yellow: { badge: "bg-amber-50 text-amber-700",           dot: "bg-amber-400" },
  green:  { badge: "bg-green-50 text-green-700",           dot: "bg-green-500" },
  red:    { badge: "bg-red-50 text-red-700",               dot: "bg-red-400" },
}

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins  = Math.floor(diff / 60_000)
  if (mins < 60)      return mins <= 1 ? "Just now" : `${mins} minutes ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24)     return hours === 1 ? "1 hour ago" : `${hours} hours ago`
  const days  = Math.floor(hours / 24)
  if (days < 7)       return days === 1 ? "Yesterday" : `${days} days ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5)      return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(
    new Date(isoString)
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2].map((i) => (
        <Skeleton key={i} className="h-44 rounded-2xl" />
      ))}
    </div>
  )
}

// ── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({
  job,
  hasNewEstimate,
}: {
  job:            JobRequest
  hasNewEstimate: boolean
}) {
  const status    = job.status as keyof typeof STATUS_LABEL
  const color     = STATUS_COLOR[status] ?? "gray"
  const classes   = colorClasses[color]
  const label     = STATUS_LABEL[status] ?? status
  const next      = STATUS_NEXT[status] ?? ""

  return (
    <Link
      href={`/client/portal/${job.id}`}
      className="group block rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm transition hover:border-gray-300 hover:shadow-md sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${classes.badge}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${classes.dot}`} />
              {label}
            </span>
            {hasNewEstimate && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                <FileText className="h-3 w-3" />
                New estimate
              </span>
            )}
          </div>
          <h3 className="mt-2.5 truncate text-base font-semibold text-gray-900 group-hover:text-green-700 transition-colors">
            {job.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-gray-500">
            {next}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-2 text-gray-400 transition group-hover:border-green-200 group-hover:bg-green-50 group-hover:text-green-600">
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          Updated {relativeTime(job.updated_at)}
        </span>
        {job.service_area && job.service_area !== "Not specified" && (
          <span>{job.service_area}</span>
        )}
      </div>
    </Link>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
        <FolderOpen className="h-7 w-7 text-gray-400" />
      </div>
      <h3 className="text-base font-semibold text-gray-900">No projects yet</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-500">
        Use the request link your contractor shared with you to submit your first
        project — no account setup needed.
      </p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ClientDashboardPage() {
  const supabase = useMemo(() => createClient(), [])

  const [jobs,     setJobs]     = useState<JobRequest[]>([])
  const [estimates, setEsts]    = useState<Estimate[]>([])
  const [isLoading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: requests } = await supabase
      .from("job_requests")
      .select("*")
      .eq("client_id", user.id)
      .order("updated_at", { ascending: false })

    const rows = requests ?? []
    setJobs(rows)

    if (rows.length === 0) { setLoading(false); return }

    const ids = rows.map((r) => r.id)
    const { data: ests } = await supabase
      .from("estimates")
      .select("id, job_request_id, status, created_at")
      .in("job_request_id", ids)
      .in("status", ["Sent", "Follow-up Needed", "Follow-up Sent", "Interested"])

    setEsts(ests ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(id)
  }, [load])

  // Map job_request_id → whether there's a pending estimate
  const newEstimateByJob = useMemo(() => {
    const map: Record<string, boolean> = {}
    for (const e of estimates) {
      if (e.job_request_id) map[e.job_request_id] = true
    }
    return map
  }, [estimates])

  // Summary counts
  const pendingCount  = jobs.filter((j) => j.status === "new" || j.status === "reviewed").length
  const actionCount   = jobs.filter((j) => j.status === "estimate_created").length

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">

      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Your Projects
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Track the status of your contractor projects in one place.
        </p>
      </div>

      {/* Quick-glance stat row */}
      {!isLoading && jobs.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-200 bg-white p-3 text-center shadow-xs">
            <div className="text-2xl font-bold text-gray-900">{jobs.length}</div>
            <div className="mt-0.5 text-xs text-gray-500">Total</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3 text-center shadow-xs">
            <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
            <div className="mt-0.5 text-xs text-gray-500">In progress</div>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-center shadow-xs">
            <div className="text-2xl font-bold text-green-700">{actionCount}</div>
            <div className="mt-0.5 text-xs text-gray-500">Need action</div>
          </div>
        </div>
      )}

      {/* Project list */}
      <ContentReveal isLoading={isLoading} skeleton={<DashboardSkeleton />}>
        {jobs.length > 0 ? (
          <div className="space-y-3">
            {jobs.map((job) => (
              <ProjectCard
                key={job.id}
                job={job}
                hasNewEstimate={!!newEstimateByJob[job.id]}
              />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </ContentReveal>

      {/* Refresh helper */}
      {!isLoading && jobs.length > 0 && (
        <div className="text-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-gray-600"
            onClick={() => void load()}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      )}
    </div>
  )
}
