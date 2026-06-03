import { redirect } from "next/navigation"

import { hasSupabaseEnv } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"
import { PortalPage } from "./portal-page"

export default async function ProjectPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>
  searchParams?: Promise<{ payment?: string }>
}) {
  const { jobId } = await params
  const query = searchParams ? await searchParams : {}
  const paymentStatus = query.payment === "success" ? "success" : undefined
  const portalPath = `/client/portal/${jobId}${paymentStatus ? "?payment=success" : ""}`

  if (!hasSupabaseEnv()) {
    return <PortalPage jobId={jobId} paymentStatus={paymentStatus} />
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(portalPath)}`)
  }

  // Verify the client owns this job request.
  const { data: job } = await supabase
    .from("job_requests")
    .select("*")
    .eq("id", jobId)
    .eq("client_id", user.id)
    .maybeSingle()

  if (!job) {
    redirect("/client/dashboard")
  }

  return <PortalPage jobId={jobId} paymentStatus={paymentStatus} />
}
