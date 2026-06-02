import { redirect } from "next/navigation"

import { hasSupabaseEnv } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"
import { ClientDashboardPage } from "./client-dashboard"

export default async function Page() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect("/login")
    }

    const { data, error } = await supabase
      .from("job_requests")
      .select("id")
      .eq("client_id", user.id)
      .limit(1)

    // Only redirect to setup if the table exists and has no rows.
    // If the table doesn't exist yet (migration pending), skip the check.
    if (!error && (!data || data.length === 0)) {
      redirect("/client/setup")
    }
  }

  return <ClientDashboardPage />
}
