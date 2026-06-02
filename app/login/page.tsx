import Link from "next/link"
import { redirect } from "next/navigation"
import { CheckCircle2 } from "lucide-react"

import { BrandLogo } from "@/components/brand-logo"
import { LoginForm } from "@/components/auth/login-form"
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

type LoginPageProps = {
  searchParams?: Promise<{
    message?: string
  }>
}

const trustPoints = [
  "Nothing sent without your approval",
  "Plain-English follow-ups",
  "Built for trades owners",
]

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (hasSupabaseEnv()) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      const role = await getProfileRole(supabase, user.id, user.user_metadata)
      redirect(dashboardPathForRole(role))
    }
  }

  const params = await searchParams

  return (
    <main className="force-light grid min-h-screen overflow-x-hidden bg-zinc-50 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[0.9fr_1.1fr] lg:p-0">
      {/* Left: form */}
      <section className="mx-auto flex min-w-0 w-full max-w-md flex-col justify-center lg:px-10">
        <Link href="/" className="mb-10 flex items-center" aria-label="Euroflo home">
          <BrandLogo className="h-10" priority />
        </Link>

        <Card className="min-w-0 overflow-hidden border-zinc-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Welcome back</CardTitle>
            <CardDescription>
              Sign in with your password, or get a secure email login link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm message={params?.message} />
            <p className="mt-6 text-center text-sm text-muted-foreground">
              New here?{" "}
              <Link
                href="/signup"
                className="font-medium text-ef-ocean hover:underline"
              >
                Create an account
              </Link>
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Right: brand panel */}
      <section className="hidden border-l border-border bg-white lg:flex lg:flex-col lg:justify-center">
        <div className="flex h-full flex-col justify-center px-12 xl:px-16">
          <div className="max-w-lg">
            <div className="mb-6 grid size-16 place-items-center rounded-2xl bg-ef-mist shadow-lg shadow-ef-navy/10">
              <BrandLogo variant="mark" className="size-12" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 xl:text-4xl">
              Recover revenue that slipped through the cracks.
            </h1>
            <p className="mt-4 text-base leading-7 text-zinc-600">
              See who owes money, what needs a follow-up today, and the next
              practical step — all in one clean dashboard.
            </p>
            <div className="mt-8 grid gap-3">
              {trustPoints.map((point) => (
                <div key={point} className="flex items-center gap-3">
                  <CheckCircle2 className="size-5 shrink-0 text-ef-ocean" />
                  <span className="text-sm text-zinc-700">{point}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
