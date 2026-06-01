"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { MailCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  normalizeAuthEmail,
  resendSignupVerificationEmail,
} from "@/lib/auth-verification"
import { createClient } from "@/lib/supabase/client"
import { hasSupabaseEnv } from "@/lib/supabase/env"
import { dashboardPathForRole, getProfileRole } from "@/lib/user-role"

export function LoginForm({ message }: { message?: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isResending, startResendTransition] = useTransition()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(
    message ?? null
  )
  const [resendMessage, setResendMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedEmail = normalizeAuthEmail(email)

    startTransition(async () => {
      setErrorMessage(null)

      if (!hasSupabaseEnv()) {
        router.push("/dashboard")
        return
      }

      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

      if (error) {
        setErrorMessage(
          error.message.toLowerCase().includes("email not confirmed")
            ? "Please verify your email before signing in."
            : error.message
        )
        return
      }

      let role = data.user
        ? await getProfileRole(supabase, data.user.id)
        : "contractor"

      // Repair any mismatch between signup metadata and profile role,
      // same as the auth callback does for email-verified users.
      if (data.user) {
        const metaRole =
          data.user.user_metadata?.role === "client" ? "client" : "contractor"
        if (role !== metaRole) {
          await supabase
            .from("profiles")
            .update({ role: metaRole })
            .eq("user_id", data.user.id)
          role = metaRole
        }
      }

      router.push(dashboardPathForRole(role))
      router.refresh()
    })
  }

  function handleResendVerification() {
    const normalizedEmail = normalizeAuthEmail(email)

    if (!normalizedEmail) {
      setResendMessage({
        type: "error",
        text: "Enter your email above first.",
      })
      return
    }

    startResendTransition(async () => {
      setResendMessage(null)

      if (!hasSupabaseEnv()) {
        setResendMessage({
          type: "success",
          text: "Demo mode is active, so no verification email was sent.",
        })
        return
      }

      const supabase = createClient()
      const { error } = await resendSignupVerificationEmail(
        supabase,
        normalizedEmail,
        window.location.origin
      )

      if (error) {
        setResendMessage({ type: "error", text: error.message })
        return
      }

      setResendMessage({
        type: "success",
        text: `Verification email sent to ${normalizedEmail}.`,
      })
    })
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@example.com"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <div className="rounded-lg border border-ef-200 bg-ef-mist p-3 text-sm text-ef-ink">
        <div className="flex items-start gap-3">
          <MailCheck className="mt-0.5 size-4 shrink-0 text-ef-ocean" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">Need to verify your email?</div>
            <p className="mt-1 leading-5 text-ef-navy/80">
              Resend the confirmation link to the email above.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full border-ef-300 bg-white text-ef-ocean hover:bg-ef-mist"
          disabled={isResending}
          onClick={handleResendVerification}
        >
          {isResending ? "Sending..." : "Resend verification email"}
        </Button>
        {resendMessage ? (
          <p
            className={
              resendMessage.type === "success"
                ? "mt-2 text-xs leading-5 text-ef-ocean"
                : "mt-2 text-xs leading-5 text-destructive"
            }
          >
            {resendMessage.text}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  )
}
