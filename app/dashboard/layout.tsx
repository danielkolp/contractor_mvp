import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

import { AppShell } from "@/components/dashboard/app-shell"
import { hasSupabaseEnv } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"
import { getProfileRole } from "@/lib/user-role"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let userEmail: string | undefined

  if (hasSupabaseEnv()) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect("/login")
    }

    const role = await getProfileRole(supabase, user.id, user.user_metadata)
    if (role === "client") {
      redirect("/client/dashboard")
    }

    userEmail = user.email ?? undefined
  }

  return <AppShell userEmail={userEmail}>{children}</AppShell>
}
