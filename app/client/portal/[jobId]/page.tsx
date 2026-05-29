import { redirect } from "next/navigation"

import { hasSupabaseEnv } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"
import { PortalPage } from "./portal-page"

export default async function ProjectPortalPage({
  params,
}: {
  params: Promise<{ jobId: string }>
}) {
  const { jobId } = await params

  if (!hasSupabaseEnv()) {
    return <PortalPage jobId={jobId} />
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=/client/portal/${jobId}`)
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

  return <PortalPage jobId={jobId} />
}
