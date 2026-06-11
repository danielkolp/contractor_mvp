"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertCircle, Check, CheckCircle2, ClipboardCopy, CreditCard, ExternalLink, Loader2, RefreshCw, RotateCcw, Save } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/dashboard/page-header"
import { SettingsSkeleton } from "@/components/dashboard/skeleton-loaders"
import { ContentReveal } from "@/components/ui/content-reveal"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatPhoneNumberInput } from "@/lib/phone-format"
import { ServiceAreaSelect } from "@/components/ui/service-area-select"
import { CONTRACTOR_TRADES, TradeMultiSelect } from "@/components/ui/trade-multi-select"
import {
  INPUT_LIMITS,
  enumField,
  inputErrorMessage,
  optionalPhoneField,
  optionalTextField,
  optionalUrlField,
  textField,
} from "@/lib/security/input"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import {
  PAID_PLANS,
  PLAN_META,
  comparePlans,
  isPlanActive,
  normalizePlan,
  type BillingInterval,
  type PlanTier,
} from "@/lib/plans"
import { formatMoney } from "@/lib/format-money"

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"]
type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"]
type SettingsRow = Database["public"]["Tables"]["settings"]["Row"]
type SettingsUpdate = Database["public"]["Tables"]["settings"]["Update"]
type SettingsInsert = Database["public"]["Tables"]["settings"]["Insert"]

type ProfileForm = {
  company_name: string
  owner_name: string
  trade: string
  phone: string
  website: string
  service_area: string
}

type SettingsForm = {
  default_payment_terms: string
  late_fee_percentage: string
  currency: string
  first_reminder_days: string
  second_reminder_days: string
  final_notice_days: string
  default_tone: string
}

type ProfileErrors = Partial<Record<keyof ProfileForm, string>>
type SettingsErrors = Partial<Record<keyof SettingsForm, string>>

type ValidSettingsValues = {
  paymentTerms: number
  lateFeePercentage: number
  firstReminderDays: number
  secondReminderDays: number
  finalNoticeDays: number
}

function toProfileForm(profile: ProfileRow | null): ProfileForm {
  const validTrades = (profile?.trade ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t): t is string => t.length > 0 && (CONTRACTOR_TRADES as readonly string[]).includes(t))
  return {
    company_name: profile?.company_name ?? "",
    owner_name: profile?.owner_name ?? "",
    trade: validTrades.join(","),
    phone: profile?.phone ?? "",
    website: profile?.website ?? "",
    service_area: profile?.service_area ?? "",
  }
}

function toSettingsForm(settings: SettingsRow | null): SettingsForm {
  return {
    default_payment_terms: String(settings?.default_payment_terms ?? 30),
    late_fee_percentage: String(settings?.late_fee_percentage ?? 0),
    // CAD-only for now; ignore any legacy stored currency so saves never block.
    currency: "CAD",
    first_reminder_days: String(settings?.first_reminder_days ?? 3),
    second_reminder_days: String(settings?.second_reminder_days ?? 7),
    final_notice_days: String(settings?.final_notice_days ?? 14),
    default_tone: settings?.default_tone ?? "friendly",
  }
}

// ── Account (self-serve email / password) ─────────────────────────────────────

function AccountCard({ currentEmail }: { currentEmail: string | null }) {
  const supabase = useMemo(() => createClient(), [])
  const [email, setEmail] = useState(currentEmail ?? "")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [savingEmail, setSavingEmail] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  async function saveEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const next = email.trim().toLowerCase()
    if (!next || next === (currentEmail ?? "").toLowerCase()) {
      toast.error("Enter a new email address.")
      return
    }
    setSavingEmail(true)
    const { error } = await supabase.auth.updateUser({ email: next })
    if (error) {
      toast.error(error.message)
    } else {
      toast.success("Check both inboxes. We sent a confirmation link to update your email.")
    }
    setSavingEmail(false)
  }

  async function savePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.")
      return
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.")
      return
    }
    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      toast.error(error.message)
    } else {
      toast.success("Password updated.")
      setPassword("")
      setConfirmPassword("")
    }
    setSavingPassword(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Account</CardTitle>
        <CardDescription>Update your sign-in email and password.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <form noValidate onSubmit={(e) => void saveEmail(e)} className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="account_email">Email</Label>
            <Input
              id="account_email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
            <p className="text-xs text-muted-foreground">
              Changing this sends a confirmation link to the new address.
            </p>
          </div>
          <Button type="submit" size="sm" variant="outline" className="w-fit" disabled={savingEmail}>
            {savingEmail ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Update email
          </Button>
        </form>

        <form noValidate onSubmit={(e) => void savePassword(e)} className="grid gap-3 border-t border-border pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="account_password">New password</Label>
              <Input
                id="account_password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account_password_confirm">Confirm password</Label>
              <Input
                id="account_password_confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                autoComplete="new-password"
              />
            </div>
          </div>
          <Button type="submit" size="sm" variant="outline" className="w-fit" disabled={savingPassword}>
            {savingPassword ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ── Billing / subscription card ───────────────────────────────────────────────

function BillingCard({ profile, onChanged }: { profile: ProfileRow | null; onChanged: () => void }) {
  const [interval, setInterval] = useState<BillingInterval>(
    (profile?.plan_interval as BillingInterval) ?? "month"
  )
  const [pendingPlan, setPendingPlan] = useState<PlanTier | null>(null)
  const [openingPortal, setOpeningPortal] = useState(false)

  const currentPlan = normalizePlan(profile?.plan)
  const status = profile?.plan_status ?? "active"
  const active = isPlanActive(status)
  const periodEnd = profile?.current_period_end
    ? new Date(profile.current_period_end).toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null

  // Surface the post-checkout redirect once.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const billing = params.get("billing")
    if (billing === "success") {
      toast.success("Subscription updated. Your plan is now active.")
      onChanged()
    } else if (billing === "cancelled") {
      toast("Checkout cancelled. Your plan is unchanged.")
    }
    if (billing) {
      params.delete("billing")
      const qs = params.toString()
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`)
    }
  }, [onChanged])

  async function startCheckout(plan: PlanTier) {
    setPendingPlan(plan)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval }),
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        toast.error(data.error ?? "Could not start checkout")
        return
      }
      window.location.assign(data.url)
    } catch {
      toast.error("Could not reach Stripe. Please try again.")
    } finally {
      setPendingPlan(null)
    }
  }

  async function openPortal() {
    setOpeningPortal(true)
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        toast.error(data.error ?? "Could not open billing portal")
        return
      }
      window.location.assign(data.url)
    } catch {
      toast.error("Could not reach Stripe. Please try again.")
    } finally {
      setOpeningPortal(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Plan &amp; billing</CardTitle>
            <CardDescription>
              Your Euroflo subscription. Lower plans mean a lower card fee on every job you collect.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={currentPlan === "free" ? "secondary" : "default"} className="capitalize">
              {PLAN_META[currentPlan].name}
              {currentPlan !== "free" && !active ? " (inactive)" : ""}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {currentPlan !== "free" && periodEnd && (
          <p className="text-xs text-muted-foreground">
            {status === "canceled"
              ? `Access ends ${periodEnd}.`
              : status === "past_due"
                ? `Payment past due. Update your card to keep ${PLAN_META[currentPlan].name}.`
                : `Renews ${periodEnd}.`}
          </p>
        )}

        {/* Monthly / annual toggle */}
        <div className="inline-flex w-fit items-center gap-1 rounded-lg border border-border bg-muted/40 p-1 text-xs">
          {(["month", "year"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setInterval(opt)}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                interval === opt ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt === "month" ? "Monthly" : "Annual"}
              {opt === "year" && <span className="ml-1 text-ef-ocean">save ~17%</span>}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {(["free", ...PAID_PLANS] as PlanTier[]).map((tier) => {
            const meta = PLAN_META[tier]
            const isCurrent = tier === currentPlan
            const direction = comparePlans(tier, currentPlan)
            const priceDollars = tier === "free" ? 0 : interval === "year" ? meta.annualPrice : meta.monthlyPrice

            return (
              <div
                key={tier}
                className={`flex flex-col rounded-lg border p-4 ${
                  isCurrent ? "border-ef-ocean bg-ef-ocean/5" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{meta.name}</p>
                  {isCurrent && (
                    <span className="text-[0.6rem] font-bold uppercase tracking-wider text-ef-ocean">
                      Current
                    </span>
                  )}
                </div>
                <p className="mt-1 text-lg font-bold">
                  {tier === "free" ? "$0" : formatMoney(priceDollars)}
                  <span className="text-xs font-normal text-muted-foreground">
                    {tier === "free" ? "" : interval === "year" ? "/yr" : "/mo"}
                  </span>
                </p>
                <p className="mt-0.5 text-xs font-medium text-ef-ocean">{meta.feeLabel}</p>
                <ul className="mt-3 flex flex-1 flex-col gap-1.5">
                  {meta.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Check className="mt-0.5 size-3 shrink-0 text-ef-ocean" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  {isCurrent ? (
                    tier === "free" ? (
                      <p className="text-center text-xs text-muted-foreground">Your current plan</p>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => void openPortal()}
                        disabled={openingPortal}
                      >
                        {openingPortal ? <Loader2 className="size-3.5 animate-spin" /> : <CreditCard className="size-3.5" />}
                        Manage billing
                      </Button>
                    )
                  ) : tier === "free" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => void openPortal()}
                      disabled={openingPortal || !profile?.stripe_customer_id}
                    >
                      Downgrade
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full"
                      variant={direction > 0 ? "default" : "outline"}
                      onClick={() => void startCheckout(tier)}
                      disabled={pendingPlan !== null}
                    >
                      {pendingPlan === tier ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : null}
                      {direction > 0 ? `Upgrade to ${meta.name}` : `Switch to ${meta.name}`}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Plans and cancellation are handled securely by Stripe. Downgrades and cancellations take effect at the end of your billing period.
        </p>
      </CardContent>
    </Card>
  )
}

// ── Stripe Connect card ───────────────────────────────────────────────────────

type StripeStatus = {
  connected: boolean
  charges_enabled: boolean
  payouts_enabled: boolean
  details_submitted: boolean
  onboarding_complete: boolean
}

const disconnectedStripeStatus: StripeStatus = {
  connected: false,
  charges_enabled: false,
  payouts_enabled: false,
  details_submitted: false,
  onboarding_complete: false,
}

function StripeConnectCard({ stripeAccountId }: { stripeAccountId: string | null }) {
  const [status, setStatus]       = useState<StripeStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchStatus = useCallback(async () => {
    if (!stripeAccountId) {
      setStatus(disconnectedStripeStatus)
      return
    }
    setIsRefreshing(true)
    try {
      const res = await fetch("/api/stripe/connect/status", { method: "POST" })
      if (res.ok) {
        const data = await res.json() as StripeStatus
        setStatus(data)
      } else {
        setStatus(disconnectedStripeStatus)
      }
    } catch {
      setStatus(disconnectedStripeStatus)
    } finally {
      setIsRefreshing(false)
    }
  }, [stripeAccountId])

  useEffect(() => {
    if (stripeAccountId) {
      setStatus(null)
      void fetchStatus()
    } else {
      setStatus(disconnectedStripeStatus)
    }
  }, [stripeAccountId, fetchStatus])

  async function handleConnect() {
    setIsLoading(true)
    try {
      const res = await fetch("/api/stripe/connect/onboard", { method: "POST" })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        toast.error(data.error ?? "Could not start Stripe onboarding")
        return
      }
      window.location.href = data.url
    } catch {
      toast.error("Could not reach Stripe. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const connected = status?.connected ?? false
  const complete  = status?.onboarding_complete ?? false
  const isCheckingStripe = Boolean(stripeAccountId && status === null)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payments</CardTitle>
        <CardDescription>
          Connect Stripe to accept online payments from clients.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {isCheckingStripe ? (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Checking Stripe connection...</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Euroflo is confirming whether this account can accept payments.
              </p>
            </div>
          </div>
        ) : !connected ? (
          <>
            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-medium">Stripe not connected</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Connect your Stripe account so clients can pay estimates online. Euroflo
                  adds a platform fee on top of your payout, so you receive the amount you
                  set on each estimate.
                </p>
              </div>
            </div>
            <Button
              onClick={() => void handleConnect()}
              disabled={isLoading}
              className="w-fit"
            >
              {isLoading ? (
                <><Loader2 className="size-4 animate-spin" />Connecting…</>
              ) : (
                <><ExternalLink className="size-4" />Connect Stripe</>
              )}
            </Button>
          </>
        ) : !complete ? (
          <>
            <div className="flex items-start gap-3 rounded-lg border border-amber-200/70 bg-amber-50/60 p-4 dark:border-amber-800/30 dark:bg-amber-950/20">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Onboarding incomplete</p>
                <p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-400/80">
                  Finish Stripe onboarding to accept client payments.
                </p>
              </div>
            </div>
            <Button
              onClick={() => void handleConnect()}
              disabled={isLoading}
              className="w-fit"
            >
              {isLoading ? (
                <><Loader2 className="size-4 animate-spin" />Opening…</>
              ) : (
                <><ExternalLink className="size-4" />Continue Stripe Setup</>
              )}
            </Button>
          </>
        ) : (
          <div className="flex items-start gap-3 rounded-lg border border-emerald-200/70 bg-emerald-50/60 p-4 dark:border-emerald-800/30 dark:bg-emerald-950/20">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500 dark:text-emerald-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Stripe connected</p>
              <p className="mt-0.5 text-xs text-emerald-700/80 dark:text-emerald-400/80">You can accept client payments.</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                {[
                  { label: "Charges",  value: status?.charges_enabled },
                  { label: "Payouts",  value: status?.payouts_enabled },
                  { label: "Verified", value: status?.details_submitted },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-md border border-border bg-card px-2 py-2 text-center">
                    <dt className="text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
                    <dd className={`mt-0.5 font-semibold ${value ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                      {value ? "Yes" : "No"}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}

        {connected && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchStatus()}
              disabled={isRefreshing}
            >
              <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh status
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ClientRequestLinkCard({ requestSlug }: { requestSlug: string }) {
  const [copied, setCopied] = useState(false)
  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/request/${requestSlug}`
      : `/request/${requestSlug}`

  async function handleCopy() {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Client request link</CardTitle>
        <CardDescription>
          Share this link so clients can submit job requests directly to your workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            {link}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => void handleCopy()}
          >
            {copied ? (
              <>
                <Check className="size-3.5 text-ef-ocean" />
                Copied
              </>
            ) : (
              <>
                <ClipboardCopy className="size-3.5" />
                Copy
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Clients can submit a request without creating an account. Requests appear in your Job Requests page.
        </p>
      </CardContent>
    </Card>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null

  return <p className="text-xs text-destructive">{message}</p>
}

function parsePositiveInteger(value: string) {
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parseNonNegativeNumber(value: string) {
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function isValidWebsite(value: string) {
  const trimmed = value.trim()

  if (!trimmed) return true

  try {
    const url = new URL(trimmed)
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname)
  } catch {
    return false
  }
}

function validateProfileForm(form: ProfileForm): ProfileErrors {
  const errors: ProfileErrors = {}

  if (!form.company_name.trim()) {
    errors.company_name = "Business name is required."
  } else if (form.company_name.trim().length > INPUT_LIMITS.businessName) {
    errors.company_name = `Business name must be ${INPUT_LIMITS.businessName} characters or fewer.`
  }

  if (!form.owner_name.trim()) {
    errors.owner_name = "Owner name is required."
  } else if (form.owner_name.trim().length > INPUT_LIMITS.name) {
    errors.owner_name = `Owner name must be ${INPUT_LIMITS.name} characters or fewer.`
  }

  if (form.trade.length > INPUT_LIMITS.mediumText) {
    errors.trade = `Trades must be ${INPUT_LIMITS.mediumText} characters or fewer.`
  }

  if (form.phone.trim()) {
    try {
      optionalPhoneField(form.phone)
    } catch (error) {
      errors.phone = inputErrorMessage(error)
    }
  }

  if (form.service_area.length > INPUT_LIMITS.serviceArea) {
    errors.service_area = `Service area must be ${INPUT_LIMITS.serviceArea} characters or fewer.`
  }

  if (!isValidWebsite(form.website)) {
    errors.website = "Enter a full website URL, like https://example.com."
  }

  return errors
}

function validateSettingsForm(form: SettingsForm): {
  errors: SettingsErrors
  values?: ValidSettingsValues
} {
  const errors: SettingsErrors = {}
  const paymentTerms = parsePositiveInteger(form.default_payment_terms)
  const lateFeePercentage = parseNonNegativeNumber(form.late_fee_percentage)
  const firstReminderDays = parsePositiveInteger(form.first_reminder_days)
  const secondReminderDays = parsePositiveInteger(form.second_reminder_days)
  const finalNoticeDays = parsePositiveInteger(form.final_notice_days)

  if (paymentTerms === null) {
    errors.default_payment_terms = "Payment terms must be a positive whole number."
  } else if (paymentTerms > 365) {
    errors.default_payment_terms = "Payment terms must be 365 days or fewer."
  }

  if (lateFeePercentage === null) {
    errors.late_fee_percentage = "Late fee cannot be negative."
  } else if (lateFeePercentage > 100) {
    errors.late_fee_percentage = "Late fee must be 100% or less."
  }

  if (firstReminderDays === null) {
    errors.first_reminder_days = "First reminder must be a positive whole number."
  } else if (firstReminderDays > 365) {
    errors.first_reminder_days = "First reminder must be 365 days or fewer."
  }

  if (secondReminderDays === null) {
    errors.second_reminder_days = "Second reminder must be a positive whole number."
  } else if (secondReminderDays > 365) {
    errors.second_reminder_days = "Second reminder must be 365 days or fewer."
  }

  if (finalNoticeDays === null) {
    errors.final_notice_days = "Final notice must be a positive whole number."
  } else if (finalNoticeDays > 365) {
    errors.final_notice_days = "Final notice must be 365 days or fewer."
  }

  if (
    firstReminderDays !== null &&
    secondReminderDays !== null &&
    finalNoticeDays !== null &&
    !(firstReminderDays < secondReminderDays && secondReminderDays < finalNoticeDays)
  ) {
    errors.first_reminder_days =
      "Each reminder should come later than the one before it (e.g. 3, 7, 14 days)."
    errors.second_reminder_days =
      "Each reminder should come later than the one before it (e.g. 3, 7, 14 days)."
    errors.final_notice_days =
      "Each reminder should come later than the one before it (e.g. 3, 7, 14 days)."
  }

  if (Object.keys(errors).length > 0) {
    return { errors }
  }

  return {
    errors,
    values: {
      paymentTerms: paymentTerms as number,
      lateFeePercentage: lateFeePercentage as number,
      firstReminderDays: firstReminderDays as number,
      secondReminderDays: secondReminderDays as number,
      finalNoticeDays: finalNoticeDays as number,
    },
  }
}

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [settings, setSettings] = useState<SettingsRow | null>(null)
  const [profileForm, setProfileForm] = useState<ProfileForm>(toProfileForm(null))
  const [settingsForm, setSettingsForm] = useState<SettingsForm>(toSettingsForm(null))
  const [profileErrors, setProfileErrors] = useState<ProfileErrors>({})
  const [settingsErrors, setSettingsErrors] = useState<SettingsErrors>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setErrorMessage(userError?.message || "You must be logged in.")
      setIsLoading(false)
      return
    }

    setUserId(user.id)
    setUserEmail(user.email ?? null)

    const [profileResult, settingsResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("settings").select("*").eq("user_id", user.id).maybeSingle(),
    ])

    if (profileResult.error) {
      setErrorMessage(profileResult.error.message)
    } else if (settingsResult.error) {
      setErrorMessage(settingsResult.error.message)
    }

    setProfile(profileResult.data)
    setSettings(settingsResult.data)
    setProfileForm(toProfileForm(profileResult.data))
    setSettingsForm(toSettingsForm(settingsResult.data))
    setProfileErrors({})
    setSettingsErrors({})
    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    const id = window.setTimeout(() => void loadData(), 0)
    return () => window.clearTimeout(id)
  }, [loadData])

  function updateProfile(field: keyof ProfileForm, value: string) {
    setProfileForm((curr) => ({ ...curr, [field]: value }))
    setProfileErrors((curr) => ({ ...curr, [field]: undefined }))
  }

  function updateSettings(field: keyof SettingsForm, value: string) {
    setSettingsForm((curr) => ({ ...curr, [field]: value }))
    setSettingsErrors((curr) => ({ ...curr, [field]: undefined }))
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId) return

    const errors = validateProfileForm(profileForm)
    setProfileErrors(errors)

    if (Object.keys(errors).length > 0) {
      toast.error("Fix the highlighted profile fields before saving.")
      return
    }

    setIsSavingProfile(true)

    let payload: ProfileUpdate
    try {
      payload = {
        company_name: textField(profileForm.company_name, "Business name", {
          required: true,
          maxLength: INPUT_LIMITS.businessName,
        }),
        owner_name: textField(profileForm.owner_name, "Owner name", {
          required: true,
          maxLength: INPUT_LIMITS.name,
        }),
        trade: optionalTextField(profileForm.trade, "Trades", {
          maxLength: INPUT_LIMITS.mediumText,
        }),
        phone: optionalPhoneField(profileForm.phone),
        website: optionalUrlField(profileForm.website, "Website"),
        service_area: optionalTextField(profileForm.service_area, "Service area", {
          maxLength: INPUT_LIMITS.serviceArea,
        }),
      }
    } catch (error) {
      toast.error(inputErrorMessage(error))
      setIsSavingProfile(false)
      return
    }

    let error: Error | null = null

    if (profile) {
      const result = await supabase
        .from("profiles")
        .update(payload)
        .eq("user_id", userId)
        .select()
        .single()
      error = result.error
      if (result.data) setProfile(result.data)
    } else {
      const result = await supabase
        .from("profiles")
        .insert({ user_id: userId, ...payload })
        .select()
        .single()
      error = result.error
      if (result.data) setProfile(result.data)
    }

    if (error) {
      toast.error("Failed to save profile")
    } else {
      toast.success("Business profile saved")
    }

    setIsSavingProfile(false)
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId) return

    const validation = validateSettingsForm(settingsForm)
    setSettingsErrors(validation.errors)

    if (!validation.values) {
      toast.error("Fix the highlighted invoice settings before saving.")
      return
    }

    setIsSavingSettings(true)

    let currency: string
    let defaultTone: string
    try {
      // USD is not supported end-to-end yet — currency is CAD-only for now.
      currency = enumField(settingsForm.currency, "Currency", ["CAD"] as const)
      defaultTone = enumField(settingsForm.default_tone, "Default tone", [
        "friendly",
        "professional",
        "firm",
      ] as const)
    } catch (error) {
      toast.error(inputErrorMessage(error))
      setIsSavingSettings(false)
      return
    }

    const payload: SettingsUpdate = {
      default_payment_terms: validation.values.paymentTerms,
      late_fee_percentage: validation.values.lateFeePercentage,
      currency,
      first_reminder_days: validation.values.firstReminderDays,
      second_reminder_days: validation.values.secondReminderDays,
      final_notice_days: validation.values.finalNoticeDays,
      default_tone: defaultTone,
    }

    let error: Error | null = null

    if (settings) {
      const result = await supabase
        .from("settings")
        .update(payload)
        .eq("user_id", userId)
        .select()
        .single()
      error = result.error
      if (result.data) setSettings(result.data)
    } else {
      const insertPayload: SettingsInsert = {
        user_id: userId,
        default_payment_terms: payload.default_payment_terms ?? 30,
        late_fee_percentage: payload.late_fee_percentage ?? 0,
        currency: payload.currency ?? "CAD",
        first_reminder_days: payload.first_reminder_days ?? 3,
        second_reminder_days: payload.second_reminder_days ?? 7,
        final_notice_days: payload.final_notice_days ?? 14,
        default_tone: payload.default_tone ?? "friendly",
      }
      const result = await supabase
        .from("settings")
        .insert(insertPayload)
        .select()
        .single()
      error = result.error
      if (result.data) setSettings(result.data)
    }

    if (error) {
      toast.error("Failed to save settings")
    } else {
      toast.success("Settings saved")
    }

    setIsSavingSettings(false)
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Business profile, invoice defaults, and follow-up preferences."
      />

      <ContentReveal isLoading={isLoading} skeleton={<SettingsSkeleton />} minDisplayMs={300}>
        <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6">
        {errorMessage ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="font-medium">Error loading settings</div>
            <p className="mt-1 leading-6">{errorMessage}</p>
          </div>
        ) : null}

        {/* ── Business profile ── */}
        <form noValidate onSubmit={(e) => void saveProfile(e)}>
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Business profile</CardTitle>
                  <CardDescription>
                    Your name and company details used in follow-up messages.
                  </CardDescription>
                </div>
                <Button
                  type="submit"
                  disabled={isSavingProfile}
                  className="w-full sm:w-fit"
                >
                  <Save className="size-4" />
                  {isSavingProfile ? "Saving…" : "Save profile"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="company_name">Business name</Label>
                  <Input
                    id="company_name"
                    value={profileForm.company_name}
                    onChange={(e) => updateProfile("company_name", e.target.value)}
                    placeholder="e.g. North Shore Contracting"
                    required
                    aria-invalid={Boolean(profileErrors.company_name)}
                  />
                  <FieldError message={profileErrors.company_name} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="owner_name">Owner name</Label>
                  <Input
                    id="owner_name"
                    value={profileForm.owner_name}
                    onChange={(e) => updateProfile("owner_name", e.target.value)}
                    placeholder="e.g. Daniel Smith"
                    required
                    aria-invalid={Boolean(profileErrors.owner_name)}
                  />
                  <FieldError message={profileErrors.owner_name} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Trades</Label>
                <p className="text-xs text-muted-foreground">
                  Select all that apply. These show in your profile and help match client job requests.
                </p>
                <TradeMultiSelect
                  value={
                    profileForm.trade
                      ? profileForm.trade.split(",").map((t) => t.trim()).filter(Boolean)
                      : []
                  }
                  onChange={(trades) => updateProfile("trade", trades.join(","))}
                  disabled={isSavingProfile}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    value={profileForm.phone}
                    onChange={(e) =>
                      updateProfile("phone", formatPhoneNumberInput(e.target.value))
                    }
                    placeholder="e.g. (604)-555-0100"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    type="url"
                    value={profileForm.website}
                    onChange={(e) => updateProfile("website", e.target.value)}
                    placeholder="e.g. https://yoursite.ca"
                    aria-invalid={Boolean(profileErrors.website)}
                  />
                  <FieldError message={profileErrors.website} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="service_area">Service area</Label>
                <ServiceAreaSelect
                  value={profileForm.service_area}
                  onChange={(area) => updateProfile("service_area", area)}
                />
              </div>
            </CardContent>
          </Card>
        </form>

        {/* ── Invoice & follow-up settings ── */}
        <form noValidate onSubmit={(e) => void saveSettings(e)}>
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Invoice defaults</CardTitle>
                  <CardDescription>
                    Default values applied to new invoices and follow-up timing.
                  </CardDescription>
                </div>
                <Button
                  type="submit"
                  disabled={isSavingSettings}
                  className="w-full sm:w-fit"
                >
                  <Save className="size-4" />
                  {isSavingSettings ? "Saving…" : "Save settings"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="payment_terms">Payment terms (days)</Label>
                  <Input
                    id="payment_terms"
                    type="number"
                    min="1"
                    max="365"
                    value={settingsForm.default_payment_terms}
                    onChange={(e) => updateSettings("default_payment_terms", e.target.value)}
                    aria-invalid={Boolean(settingsErrors.default_payment_terms)}
                  />
                  <FieldError message={settingsErrors.default_payment_terms} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="late_fee">Late fee (%)</Label>
                  <Input
                    id="late_fee"
                    type="number"
                    min="0"
                    step="0.5"
                    value={settingsForm.late_fee_percentage}
                    onChange={(e) => updateSettings("late_fee_percentage", e.target.value)}
                    aria-invalid={Boolean(settingsErrors.late_fee_percentage)}
                  />
                  <FieldError message={settingsErrors.late_fee_percentage} />
                </div>
              </div>

              <div>
                <div className="mb-3 text-sm font-medium">Follow-up schedule</div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="grid gap-2">
                    <Label htmlFor="first_reminder">First reminder (days after due)</Label>
                    <Input
                      id="first_reminder"
                      type="number"
                      min="1"
                      value={settingsForm.first_reminder_days}
                      onChange={(e) => updateSettings("first_reminder_days", e.target.value)}
                      aria-invalid={Boolean(settingsErrors.first_reminder_days)}
                    />
                    <FieldError message={settingsErrors.first_reminder_days} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="second_reminder">Second reminder (days after due)</Label>
                    <Input
                      id="second_reminder"
                      type="number"
                      min="1"
                      value={settingsForm.second_reminder_days}
                      onChange={(e) => updateSettings("second_reminder_days", e.target.value)}
                      aria-invalid={Boolean(settingsErrors.second_reminder_days)}
                    />
                    <FieldError message={settingsErrors.second_reminder_days} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="final_notice">Final notice (days after due)</Label>
                    <Input
                      id="final_notice"
                      type="number"
                      min="1"
                      value={settingsForm.final_notice_days}
                      onChange={(e) => updateSettings("final_notice_days", e.target.value)}
                      aria-invalid={Boolean(settingsErrors.final_notice_days)}
                    />
                    <FieldError message={settingsErrors.final_notice_days} />
                  </div>
                </div>
              </div>

              {/* default_tone is stored in DB but not yet wired to message generation */}
            </CardContent>
          </Card>
        </form>

        {/* ── Plan & billing (contractor's own subscription) ── */}
        {profile?.role === "contractor" && (
          <BillingCard profile={profile} onChanged={() => void loadData()} />
        )}

        {/* ── Stripe Connect payments ── */}
        {profile?.role === "contractor" && (
          <StripeConnectCard stripeAccountId={profile?.stripe_account_id ?? null} />
        )}

        {/* ── Client request link ── */}
        {profile?.request_slug && (
          <ClientRequestLinkCard requestSlug={profile.request_slug} />
        )}

        {/* ── Account (self-serve email / password) ── */}
        <AccountCard currentEmail={userEmail} />

        {/* ── Setup wizard ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Guided setup</CardTitle>
            <CardDescription>
              Re-run the guided setup to update your profile, services, and defaults.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="grid gap-0.5">
                <p className="text-sm font-medium">Setup wizard</p>
                <p className="text-xs text-muted-foreground">
                  Walk through your profile, services, and follow-up defaults again.
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/setup">
                  <RotateCcw className="size-3.5" />
                  Redo setup
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
          </div>
        </div>
      </ContentReveal>
    </>
  )
}
