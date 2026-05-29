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
      // New-user gate: if no data at all, send to the guided setup flow.
      const [riResult, invResult, estResult] = await Promise.all([
        supabase
          .from("recovery_items")
          .select("id")
          .eq("user_id", user.id)
          .limit(1),
        supabase
          .from("invoices")
          .select("id")
          .eq("user_id", user.id)
          .limit(1),
        supabase
          .from("estimates")
          .select("id")
          .eq("user_id", user.id)
          .limit(1),
      ])

      const hasAnyData =
        (riResult.data?.length ?? 0) > 0 ||
        (invResult.data?.length ?? 0) > 0 ||
        (estResult.data?.length ?? 0) > 0

      if (!hasAnyData) {
        redirect("/dashboard/setup")
      }
    }
  }

  return <TodayPage />
}
