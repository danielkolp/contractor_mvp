import Link from "next/link"
import { redirect } from "next/navigation"
import { CheckCircle2, ShieldCheck } from "lucide-react"

import { BrandLogo } from "@/components/brand-logo"
import { SignupForm } from "@/components/auth/signup-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { hasSupabaseEnv } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"
import { dashboardPathForRole, getProfileRole } from "@/lib/user-role"

const bullets = [
  "Follow up on estimates that went quiet",
  "Chase overdue invoices without the awkward ask",
  "Win back past customers automatically",
  "Approve every message before it sends",
]

export default async function SignupPage() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      const role = await getProfileRole(supabase, user.id)
      redirect(dashboardPathForRole(role))
    }
  }

  return (
    <main className="force-light min-h-screen overflow-x-hidden bg-zinc-50 px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center">
        <div className="grid min-w-0 w-full gap-10 lg:grid-cols-[0.95fr_1.05fr]">
          {/* Left: pitch */}
          <section className="flex min-w-0 flex-col justify-center">
            <Link href="/" className="mb-10 flex items-center" aria-label="Euroflo home">
              <BrandLogo className="h-10" priority />
            </Link>

            <h1 className="max-w-xl break-words text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              Find missed money and follow up, without doing it yourself.
            </h1>
            <p className="mt-4 max-w-xl break-words text-base leading-7 text-zinc-600">
              Create a contractor workspace for invoices, clients, and
              ready-to-send follow-up messages you approve before they go out.
            </p>

            <div className="mt-8 grid gap-3">
              {bullets.map((bullet) => (
                <div key={bullet} className="flex items-start gap-3">
                  <CheckCircle2 className="size-5 shrink-0 text-ef-ocean mt-0.5" />
                  <span className="text-sm text-zinc-700">{bullet}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 flex items-start gap-3 rounded-xl border border-ef-200 bg-ef-mist p-4">
              <ShieldCheck className="size-5 shrink-0 text-ef-ocean mt-0.5" />
              <p className="text-sm leading-6 text-ef-navy">
                <span className="font-medium">You stay in control.</span> Every
                follow-up message is drafted for your review. Nothing is sent
                without your approval.
              </p>
            </div>
          </section>

          {/* Right: form */}
          <Card className="min-w-0 overflow-hidden border-zinc-200 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">Create your account</CardTitle>
              <CardDescription>
                Sign up with email and password. Free to try, no credit card
                required.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SignupForm />
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-medium text-ef-ocean hover:underline"
                >
                  Log in
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
