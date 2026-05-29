"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import {
  BriefcaseBusiness,
  CheckCircle2,
  Eye,
  EyeOff,
  Home,
  MailCheck,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ServiceAreaSelect } from "@/components/ui/service-area-select"
import { TradeMultiSelect } from "@/components/ui/trade-multi-select"
import {
  emailVerificationRedirectUrl,
  normalizeAuthEmail,
  resendSignupVerificationEmail,
} from "@/lib/auth-verification"
import { createClient } from "@/lib/supabase/client"
import { hasSupabaseEnv } from "@/lib/supabase/env"
import { cn } from "@/lib/utils"

type SignupRole = "contractor" | "client"

const roleOptions: {
  value: SignupRole
  title: string
  description: string
  icon: typeof BriefcaseBusiness
}[] = [
  {
    value: "contractor",
    title: "Contractor",
    description: "Create estimates, invoices, follow-ups, and recovery work.",
    icon: BriefcaseBusiness,
  },
  {
    value: "client",
    title: "Client",
    description: "Submit job requests and review estimates or invoices.",
    icon: Home,
  },
]

const roleCopy: Record<
  SignupRole,
  {
    heading: string
    description: string
    ownerLabel: string
    ownerPlaceholder: string
    areaLabel: string
  }
> = {
  contractor: {
    heading: "Contractor profile",
    description:
      "Set up the business details that appear across your workspace.",
    ownerLabel: "Owner name",
    ownerPlaceholder: "Alex Rivera",
    areaLabel: "Service area",
  },
  client: {
    heading: "Client profile",
    description:
      "Add the details contractors will use when reviewing your job requests.",
    ownerLabel: "Your name",
    ownerPlaceholder: "Jordan Lee",
    areaLabel: "Location",
  },
}

const quickTransition = {
  duration: 0.18,
  ease: [0.22, 1, 0.36, 1],
} as const

function passwordScore(password: string) {
  let score = 0
  if (password.length >= 8) score += 1
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1
  return score
}

function PasswordMeter({ password }: { password: string }) {
  const score = passwordScore(password)
  const label =
    score >= 4 ? "Strong" : score >= 3 ? "Good" : score >= 2 ? "Fair" : "Weak"

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-4 gap-1">
        {[1, 2, 3, 4].map((step) => (
          <div
            key={step}
            className={cn(
              "h-1.5 rounded-full bg-muted",
              step <= score &&
                (score >= 4
                  ? "bg-green-600"
                  : score >= 3
                    ? "bg-emerald-500"
                    : score >= 2
                      ? "bg-amber-500"
                      : "bg-zinc-400")
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Password strength</span>
        <span className="font-medium text-foreground">{label}</span>
      </div>
    </div>
  )
}

export function SignupForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isResending, startResendTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [verificationState, setVerificationState] = useState<{
    email: string
    role: SignupRole
    emailConfirmationRequired: boolean
  } | null>(null)
  const [resendMessage, setResendMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)
  const [role, setRole] = useState<SignupRole>("contractor")
  const [contractorFieldsAnimating, setContractorFieldsAnimating] = useState(false)
  const [selectedTrades, setSelectedTrades] = useState<string[]>([])
  const [selectedArea, setSelectedArea] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const activeRoleCopy = roleCopy[role]

  function handleResendVerification(emailOverride?: string) {
    const normalizedEmail = normalizeAuthEmail(emailOverride ?? email)

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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const normalizedEmail = normalizeAuthEmail(String(formData.get("email") ?? ""))
    const password = String(formData.get("password") ?? "")
    const selectedRole =
      String(formData.get("role") ?? role) === "client"
        ? "client"
        : "contractor"
    const ownerName = String(formData.get("owner_name") ?? "").trim()
    const companyName = String(formData.get("company_name") ?? "").trim()
    const trade = String(formData.get("trade") ?? "").trim()
    const serviceArea = String(formData.get("service_area") ?? "").trim()
    const phone = String(formData.get("phone") ?? "").trim()

    startTransition(async () => {
      setErrorMessage(null)
      setResendMessage(null)

      if (!hasSupabaseEnv()) {
        router.push(selectedRole === "client" ? "/client/dashboard" : "/dashboard")
        return
      }

      const supabase = createClient()
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            role: selectedRole,
            owner_name: ownerName || null,
            company_name: selectedRole === "contractor" ? companyName || null : null,
            trade: selectedRole === "contractor" ? trade || null : null,
            service_area: serviceArea || null,
            phone: phone || null,
          },
          emailRedirectTo: emailVerificationRedirectUrl(window.location.origin),
        },
      })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      setVerificationState({
        email: normalizedEmail,
        role: selectedRole,
        emailConfirmationRequired: !data.session,
      })
    })
  }

  if (verificationState) {
    const roleName =
      verificationState.role === "client"
        ? "client portal"
        : "contractor workspace"

    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-emerald-700 shadow-sm">
            <MailCheck className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">
              Verify your {roleName}
            </div>
            <p className="mt-1 leading-6 text-emerald-900/80">
              {verificationState.emailConfirmationRequired
                ? `We sent a verification link to ${verificationState.email}. Confirm your email before signing in.`
                : "Supabase created this account without requiring email confirmation, so no verification email was required."}
            </p>
            {!verificationState.emailConfirmationRequired ? (
              <p className="mt-2 leading-6 text-emerald-900/80">
                Turn on email confirmation in Supabase Auth settings to require
                verification before users can sign in.
              </p>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4 w-full border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100"
          disabled={isResending}
          onClick={() => handleResendVerification(verificationState.email)}
        >
          {isResending ? "Sending..." : "Resend verification email"}
        </Button>
        {resendMessage ? (
          <p
            className={cn(
              "mt-2 text-xs leading-5",
              resendMessage.type === "success"
                ? "text-emerald-800"
                : "text-destructive"
            )}
          >
            {resendMessage.text}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-3">
        <Label>How will you use EstiGator?</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          {roleOptions.map((option) => {
            const Icon = option.icon
            const active = role === option.value

            return (
              <motion.button
                key={option.value}
                layout
                type="button"
                aria-pressed={active}
                onClick={() => setRole(option.value)}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.985 }}
                transition={quickTransition}
                className={cn(
                  "relative min-h-28 overflow-hidden rounded-lg border bg-background p-4 text-left transition-colors hover:border-green-300 hover:bg-green-50/50 dark:hover:bg-green-950/20",
                  active
                    ? "border-green-600 ring-2 ring-green-600/20"
                    : "border-border"
                )}
              >
                {active ? (
                  <motion.div
                    layoutId="signup-role-active-bg"
                    className="absolute inset-0 bg-green-50/70 dark:bg-green-950/20"
                    transition={quickTransition}
                  />
                ) : null}
                <div className="relative flex items-start justify-between gap-3">
                  <motion.div
                    layout
                    className="grid size-9 place-items-center rounded-lg bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                    animate={{ scale: active ? 1.05 : 1 }}
                    transition={quickTransition}
                  >
                    <Icon className="size-4" />
                  </motion.div>
                  <AnimatePresence initial={false}>
                    {active ? (
                      <motion.div
                        key="active-check"
                        initial={{ opacity: 0, scale: 0.75, rotate: -12 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        exit={{ opacity: 0, scale: 0.75, rotate: 12 }}
                        transition={quickTransition}
                      >
                        <CheckCircle2 className="size-5 text-green-700" />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
                <div className="relative mt-3 font-medium">{option.title}</div>
                <p className="relative mt-1 text-sm leading-5 text-muted-foreground">
                  {option.description}
                </p>
              </motion.button>
            )
          })}
        </div>
        <input type="hidden" name="role" value={role} />
      </div>

      <motion.div
        layout
        className="rounded-lg border border-border bg-muted/30 p-4"
        transition={quickTransition}
      >
        <div className="mb-4 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${role}-profile-copy`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={quickTransition}
            >
              <div className="text-sm font-medium">
                {activeRoleCopy.heading}
              </div>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                {activeRoleCopy.description}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="owner_name" className="overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={`${role}-owner-label`}
                  className="block"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={quickTransition}
                >
                  {activeRoleCopy.ownerLabel}
                </motion.span>
              </AnimatePresence>
            </Label>
            <Input
              id="owner_name"
              name="owner_name"
              placeholder={activeRoleCopy.ownerPlaceholder}
              autoComplete="name"
            />
          </div>

          <AnimatePresence initial={false}>
            {role === "contractor" ? (
              <motion.div
                key="contractor-fields"
                layout
                initial={{ height: 0, opacity: 0, y: -8 }}
                animate={{ height: "auto", opacity: 1, y: 0 }}
                exit={{ height: 0, opacity: 0, y: -8 }}
                transition={quickTransition}
                className={contractorFieldsAnimating ? "overflow-hidden" : "overflow-visible"}
                onAnimationStart={() => setContractorFieldsAnimating(true)}
                onAnimationComplete={() => setContractorFieldsAnimating(false)}
              >
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="company_name">Company name</Label>
                    <Input
                      id="company_name"
                      name="company_name"
                      placeholder="Rivera Renovations"
                      autoComplete="organization"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Trades</Label>
                    <p className="text-xs text-muted-foreground -mt-0.5">
                      Select all that apply — clients discover you based on these.
                    </p>
                    <TradeMultiSelect
                      name="trade"
                      value={selectedTrades}
                      onChange={setSelectedTrades}
                    />
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="service_area" className="overflow-hidden">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={`${role}-area-label`}
                    className="block"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={quickTransition}
                  >
                    {activeRoleCopy.areaLabel}
                  </motion.span>
                </AnimatePresence>
              </Label>
              <ServiceAreaSelect
                name="service_area"
                value={selectedArea}
                onChange={setSelectedArea}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone optional</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="(555) 123-4567"
                autoComplete="tel"
              />
            </div>
          </div>
        </div>
      </motion.div>

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
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Already created this account?</span>
          <button
            type="button"
            className="font-medium text-green-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isResending}
            onClick={() => handleResendVerification()}
          >
            {isResending ? "Sending..." : "Resend verification"}
          </button>
        </div>
        {resendMessage ? (
          <p
            className={cn(
              "text-xs leading-5",
              resendMessage.type === "success"
                ? "text-green-700"
                : "text-destructive"
            )}
          >
            {resendMessage.text}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="At least 8 characters"
            minLength={8}
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="pr-10"
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setShowPassword((current) => !current)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
        <PasswordMeter password={password} />
      </div>
      <Button type="submit" disabled={isPending} className="w-full">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={`${role}-${isPending ? "pending" : "ready"}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={quickTransition}
          >
            {isPending
              ? "Creating account..."
              : role === "client"
                ? "Create client portal"
                : "Create contractor workspace"}
          </motion.span>
        </AnimatePresence>
      </Button>
    </form>
  )
}
