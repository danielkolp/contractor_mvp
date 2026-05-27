import Link from "next/link"
import { redirect } from "next/navigation"
import { Hammer } from "lucide-react"

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

type LoginPageProps = {
  searchParams?: Promise<{
    message?: string
  }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (hasSupabaseEnv()) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      redirect("/dashboard")
    }
  }

  const params = await searchParams

  return (
    <main className="grid min-h-screen overflow-x-hidden bg-zinc-50 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[0.9fr_1.1fr] lg:p-0">
      <section className="mx-auto flex min-w-0 w-full max-w-md flex-col justify-center lg:px-8">
        <Link href="/" className="mb-8 flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-lg bg-teal-700 text-sm font-semibold text-white">
            RR
          </div>
          <span className="text-sm font-semibold tracking-tight">
            Revenue Recovery
          </span>
        </Link>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-xl">Welcome back</CardTitle>
            <CardDescription>
              Sign in to review unpaid invoices and recovery tasks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm message={params?.message} />
            <p className="mt-5 text-center text-sm text-muted-foreground">
              New here?{" "}
              <Link
                href="/signup"
                className="font-medium text-teal-700 hover:underline"
              >
                Create an account
              </Link>
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="hidden border-l border-border bg-background lg:block">
        <div className="flex h-full flex-col justify-center px-12">
          <div className="max-w-xl">
            <div className="mb-6 grid size-12 place-items-center rounded-lg bg-amber-100 text-amber-700">
              <Hammer className="size-6" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Keep payment follow-up clear, polite, and on schedule.
            </h1>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              Sign in with Supabase Auth to review overdue invoices, client
              balances, and recovery tasks.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
