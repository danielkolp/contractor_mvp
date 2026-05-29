import { redirect } from "next/navigation"

import { hasSupabaseEnv } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"
import { getProfileRole } from "@/lib/user-role"
import { SetupWizard } from "./setup-wizard"

export default async function Page() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) redirect("/login")

    const role = await getProfileRole(supabase, user.id, user.user_metadata)
    if (role === "client") redirect("/client/setup")
  }

  return <SetupWizard />
}
