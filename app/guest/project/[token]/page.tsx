import { notFound } from "next/navigation"

import { validateGuestToken } from "@/lib/guest-access"
import type { WorkDay } from "@/lib/scheduling"
import { hasSupabaseEnv } from "@/lib/supabase/env"
import { createServiceClient } from "@/lib/supabase/service"
import { GuestPortalPage } from "./guest-portal-page"

export default async function GuestPortalRoute({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  if (!hasSupabaseEnv()) {
    return (
      <GuestPortalPage
        token={token}
        job={null}
        estimates={[]}
        invoices={[]}
        events={[]}
        workDays={[]}
        contractorName="Your Contractor"
      />
    )
  }

  const supabase = createServiceClient()

  const access = await validateGuestToken(supabase, token)
  if (!access) {
    notFound()
  }

  const { jobRequestId } = access

  const [jobResult, estsResult, invsResult, eventsResult, profileResult] =
    await Promise.all([
      supabase
        .from("job_requests")
        .select("*")
        .eq("id", jobRequestId)
        .maybeSingle(),
      supabase
        .from("estimates")
        .select("*")
        .eq("job_request_id", jobRequestId)
        .neq("status", "Draft"),
      supabase
        .from("invoices")
        .select("*")
        .eq("job_request_id", jobRequestId),
      supabase
        .from("project_timeline_events")
        .select("*")
        .eq("job_request_id", jobRequestId)
        .order("event_date", { ascending: true }),
      // Load contractor name for the banner
      supabase
        .from("job_requests")
        .select("contractor_id")
        .eq("id", jobRequestId)
        .maybeSingle(),
    ])

  if (!jobResult.data) {
    notFound()
  }

  // Fetch contractor profile for display name
  let contractorName = "Your Contractor"
  if (profileResult.data?.contractor_id) {
    const { data: contractor } = await supabase
      .from("profiles")
      .select("company_name, owner_name")
      .eq("user_id", profileResult.data.contractor_id)
      .maybeSingle()
    contractorName =
      contractor?.company_name ?? contractor?.owner_name ?? "Your Contractor"
  }

  // Work schedule for this job's estimates.
  const estimateIds = (estsResult.data ?? []).map((e) => e.id)
  let workDays: WorkDay[] = []
  if (estimateIds.length > 0) {
    const { data } = await supabase
      .from("scheduled_work_days")
      .select("*")
      .in("estimate_id", estimateIds)
      .order("starts_at", { ascending: true })
    workDays = data ?? []
  }

  return (
    <GuestPortalPage
      token={token}
      job={jobResult.data}
      estimates={estsResult.data ?? []}
      invoices={invsResult.data ?? []}
      events={eventsResult.data ?? []}
      workDays={workDays}
      contractorName={contractorName}
    />
  )
}
