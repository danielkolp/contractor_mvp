import Link from "next/link"
import { redirect } from "next/navigation"
import { CheckCircle2 } from "lucide-react"

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

const bullets = [
  "Start with mock invoices and clients",
  "Set friendly reminder timing",
  "Review recovery actions before sending",
]

export default async function SignupPage() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      redirect("/dashboard")
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center">
        <div className="grid w-full gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="flex flex-col justify-center">
            <Link href="/" className="mb-8 flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-teal-700 text-sm font-semibold text-white">
                RR
              </div>
              <span className="text-sm font-semibold tracking-tight">
                Revenue Recovery
              </span>
            </Link>
            <h1 className="max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Build a calmer way to get paid for completed work.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              Create a contractor workspace with placeholder data. Supabase and
              live payments can be connected after the interface is settled.
            </p>
            <div className="mt-6 grid gap-3 text-sm text-muted-foreground">
              {bullets.map((bullet) => (
                <div key={bullet} className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-teal-700" />
                  <span>{bullet}</span>
                </div>
              ))}
            </div>
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Create your account</CardTitle>
              <CardDescription>
                Sign up with email and password. No Supabase keys are stored in
                the app code.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SignupForm />
              <p className="mt-5 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-medium text-teal-700 hover:underline"
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
