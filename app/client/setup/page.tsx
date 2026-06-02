import { redirect } from "next/navigation"

import { claimGuestAccess } from "@/lib/guest-access"
import { hasSupabaseEnv } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { getProfileRole } from "@/lib/user-role"
import { ClientSetupWizard } from "./client-setup-wizard"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ claim_token?: string }>
}) {
  const { claim_token: claimToken } = await searchParams

  if (hasSupabaseEnv()) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      // Preserve claim_token through the login redirect so we return here after auth.
      const next = claimToken
        ? `/client/setup?claim_token=${encodeURIComponent(claimToken)}`
        : "/client/setup"
      redirect(`/login?next=${encodeURIComponent(next)}`)
    }

    const role = await getProfileRole(supabase, user.id, user.user_metadata)
    if (role !== "client") redirect("/dashboard/setup")

    // If a guest claim token is present, claim the job and redirect to the portal.
    if (claimToken) {
      const service = createServiceClient()
      const result  = await claimGuestAccess(service, claimToken, user.id)

      if (result) {
        redirect(`/client/portal/${result.jobRequestId}`)
      }
      // Token invalid / already claimed — fall through to wizard
    }
  }

  return <ClientSetupWizard />
}
