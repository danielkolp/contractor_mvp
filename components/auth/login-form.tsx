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

function safeInternalPath(path?: string) {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return null
  return path
}

export function LoginForm({ message, next }: { message?: string; next?: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isResending, startResendTransition] = useTransition()
  const [isMagicLinkPending, startMagicLinkTransition] = useTransition()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(
    message ?? null
  )
  const [resendMessage, setResendMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)
  const [magicLinkState, setMagicLinkState] = useState<"idle" | "sent" | "error">("idle")

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedEmail = normalizeAuthEmail(email)

    if (!normalizedEmail) {
      setErrorMessage("Enter a valid email address.")
      return
    }
    if (password.length === 0 || password.length > 256) {
      setErrorMessage("Password is required and must be 256 characters or fewer.")
      return
    }

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

      router.push(safeInternalPath(next) ?? dashboardPathForRole(role))
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

  function handleMagicLink() {
    const normalizedEmail = normalizeAuthEmail(email)

    if (!normalizedEmail) {
      setErrorMessage("Enter your email address above first.")
      return
    }

    startMagicLinkTransition(async () => {
      setMagicLinkState("idle")

      if (!hasSupabaseEnv()) {
        setMagicLinkState("sent")
        return
      }

      const supabase = createClient()
      const nextPath = safeInternalPath(next) ?? "/client/dashboard"
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      })

      setMagicLinkState(error ? "error" : "sent")
    })
  }

  return (
    <div className="grid gap-4">
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

      {/* Magic link section for passwordless clients */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">or</span>
        </div>
      </div>

      {magicLinkState === "sent" ? (
        <div className="rounded-lg border border-ef-200 bg-ef-mist p-3 text-sm text-ef-ocean">
          <p className="font-medium">Check your email for your private login link.</p>
          <p className="mt-1 text-xs text-ef-navy/80">No password needed. Just click the link.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a secure login link. No password needed.
          </p>
          {magicLinkState === "error" && (
            <p className="text-xs text-destructive">Could not send the link. Try again.</p>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={isMagicLinkPending}
            onClick={handleMagicLink}
            className="w-full"
          >
            {isMagicLinkPending ? "Sending..." : "Email me a login link"}
          </Button>
        </div>
      )}
    </div>
  )
}
