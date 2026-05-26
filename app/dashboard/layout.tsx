import { redirect } from "next/navigation"

import { AppShell } from "@/components/dashboard/app-shell"
import { hasSupabaseEnv } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"

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

    userEmail = user.email ?? undefined
  }

  return <AppShell userEmail={userEmail}>{children}</AppShell>
}
