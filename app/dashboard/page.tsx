import { redirect } from "next/navigation"

import { TodayPage } from "@/components/dashboard/today-page"
import { hasSupabaseEnv } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"

export default async function Page() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      // New-user gate: redirect to setup if the contractor has not completed
      // their business profile yet (company_name is the reliable indicator).
      const profileResult = await supabase
        .from("profiles")
        .select("company_name")
        .eq("user_id", user.id)
        .maybeSingle()

      const hasProfile = Boolean(profileResult.data?.company_name)

      if (!hasProfile) {
        redirect("/dashboard/setup")
      }
    }
  }

  return <TodayPage />
}
