import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

import { AppShell } from "@/components/dashboard/app-shell"
import { effectivePlan, normalizePlan } from "@/lib/plans"
import { hasSupabaseEnv } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"
import { getProfileRole } from "@/lib/user-role"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let userEmail: string | undefined
  let plan: ReturnType<typeof normalizePlan> = "free"

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

    const { data: profile } = await supabase
      .from("profiles")
      .select("plan, plan_status")
      .eq("user_id", user.id)
      .maybeSingle()

    plan = effectivePlan(normalizePlan(profile?.plan), profile?.plan_status ?? "active")
  }

  return (
    <AppShell userEmail={userEmail} plan={plan}>
      {children}
    </AppShell>
  )
}
