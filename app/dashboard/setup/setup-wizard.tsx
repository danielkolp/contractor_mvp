"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ClipboardCopy,
  CreditCard,
  ExternalLink,
  Info,
  Link2,
  Loader2,
  RefreshCw,
  Settings2,
  Sparkles,
  Timer,
  Wrench,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StatusPulse } from "@/components/ui/status-pulse"
import { ServiceAreaSelect } from "@/components/ui/service-area-select"
import { CONTRACTOR_TRADES, TradeMultiSelect } from "@/components/ui/trade-multi-select"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatPhoneNumberInput } from "@/lib/phone-format"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import type { Database } from "@/lib/supabase/database.types"

// ── Types ──────────────────────────────────────────────────────────────────────

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"]
type SettingsRow = Database["public"]["Tables"]["settings"]["Row"]

type ProfileForm = {
  company_name: string
  owner_name: string
  phone: string
  website: string
}

type ServicesForm = {
  trade: string
  service_area: string
}

type EstimateForm = {
  currency: string
  default_payment_terms: string
  late_fee_percentage: string
}

type FollowUpForm = {
  first_reminder_days: string
  second_reminder_days: string
  final_notice_days: string
  default_tone: string
}

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

// ── Validation Helpers ─────────────────────────────────────────────────────────

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

function nullableText(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

// ── Stage config ────────────────────────────────────────────────────────────────

const STAGES = [
  { id: 0, label: "Welcome",           icon: Sparkles     },
  { id: 1, label: "Business profile",  icon: Building2    },
  { id: 2, label: "Services",          icon: Wrench       },
  { id: 3, label: "Estimate defaults", icon: Settings2    },
  { id: 4, label: "Follow-up timing",  icon: Timer        },
  { id: 5, label: "Request link",      icon: Link2        },
  { id: 6, label: "Online payments",   icon: CreditCard   },
  { id: 7, label: "Test a job",        icon: Sparkles     },
  { id: 8, label: "Summary",           icon: CheckCircle2 },
] as const

const TOTAL = STAGES.length

// ── Small reusable pieces ──────────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive">{message}</p>
}

function SetupInsight({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-ef-200 bg-ef-mist/60 px-4 py-3.5 dark:border-ef-navy/40 dark:bg-ef-ink/20">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-ef-ocean dark:text-ef-cyan" />
      <div>
        <p className="text-sm font-semibold text-ef-ocean dark:text-ef-300">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-ef-ocean/80 dark:text-ef-300/70">{description}</p>
      </div>
    </div>
  )
}

function CompletionRow({
  label,
  complete,
  optional,
}: {
  label: string
  complete: boolean
  optional?: boolean
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full",
          complete
            ? "bg-emerald-500 text-white"
            : optional
              ? "border border-amber-300 bg-amber-50 text-amber-500 dark:border-amber-700 dark:bg-amber-950/30"
              : "border border-border bg-muted"
        )}
      >
        {complete ? (
          <Check className="size-3 stroke-[3]" />
        ) : optional ? (
          <span className="text-[9px] font-bold">?</span>
        ) : (
          <span className="size-1.5 rounded-full bg-muted-foreground/40" />
        )}
      </span>
      <span className={cn("text-sm", complete ? "text-foreground" : "text-muted-foreground")}>
        {label}
        {optional && !complete && (
          <span className="ml-1.5 text-xs text-amber-500 dark:text-amber-400">(optional)</span>
        )}
      </span>
    </div>
  )
}

// ── Progress sidebar (desktop) ─────────────────────────────────────────────────

function ProgressSidebar({
  currentStage,
  completedStages,
  onNavigate,
}: {
  currentStage: number
  completedStages: Set<number>
  onNavigate: (stage: number) => void
}) {
  return (
    <nav aria-label="Setup steps" className="flex flex-col gap-0.5 py-2">
      {STAGES.map((stage) => {
        const isCurrent = stage.id === currentStage
        const isCompleted = completedStages.has(stage.id)
        const canClick = isCompleted || stage.id <= currentStage

        return (
          <button
            key={stage.id}
            type="button"
            disabled={!canClick}
            onClick={() => canClick && onNavigate(stage.id)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
              isCurrent
                ? "bg-ef-mist font-semibold text-ef-ocean dark:bg-ef-ink/40 dark:text-ef-200"
                : isCompleted
                  ? "cursor-pointer text-foreground hover:bg-muted/60"
                  : "cursor-default text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                isCurrent
                  ? "bg-ef-ocean text-white"
                  : isCompleted
                    ? "bg-emerald-500 text-white"
                    : "border border-border bg-muted text-muted-foreground"
              )}
            >
              {isCompleted && !isCurrent ? (
                <Check className="size-3 stroke-[3]" />
              ) : (
                stage.id + 1
              )}
            </span>
            <span className="min-w-0 truncate">{stage.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

// ── Mobile progress bar ────────────────────────────────────────────────────────

function MobileProgress({ currentStage }: { currentStage: number }) {
  const stage = STAGES[currentStage]
  const pct = currentStage === 0 ? 4 : Math.round((currentStage / (TOTAL - 1)) * 100)

  return (
    <div className="flex flex-col gap-2 px-4 pb-3 pt-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{stage.label}</span>
        <span className="text-xs text-muted-foreground">
          Step {currentStage + 1} of {TOTAL}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={currentStage + 1}
        aria-valuemin={1}
        aria-valuemax={TOTAL}
      >
        <div
          className="h-full rounded-full bg-ef-ocean transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── StepNav (bottom nav buttons) ───────────────────────────────────────────────

function StepNav({
  onBack,
  onNext,
  onSkip,
  nextLabel = "Save and continue",
  isSaving,
  hideBack,
  hideSkip,
  nextDisabled,
}: {
  onBack?: () => void
  onNext: () => void
  onSkip?: () => void
  nextLabel?: string
  isSaving?: boolean
  hideBack?: boolean
  hideSkip?: boolean
  nextDisabled?: boolean
}) {
  return (
    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-2">
        {!hideBack && onBack && (
          <Button type="button" variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="size-3.5" />
            Back
          </Button>
        )}
        {!hideSkip && onSkip && (
          <Button type="button" variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
            Skip for now
          </Button>
        )}
      </div>
      <Button
        type="button"
        onClick={onNext}
        disabled={isSaving || nextDisabled}
        className="gap-2 bg-ef-ocean text-white hover:bg-ef-ocean/90 sm:w-auto w-full"
      >
        {isSaving && <Loader2 className="size-4 animate-spin" />}
        {nextLabel}
        {!isSaving && <ArrowRight className="size-4" />}
      </Button>
    </div>
  )
}

// ── Main wizard component ──────────────────────────────────────────────────────

export function SetupWizard() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // ── Meta state ──
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // ── Stage state ──
  const [currentStage, setCurrentStage] = useState(0)
  const [completedStages, setCompletedStages] = useState<Set<number>>(new Set())

  // ── Loaded data ──
  const [profileRow, setProfileRow] = useState<ProfileRow | null>(null)
  const [settingsRow, setSettingsRow] = useState<SettingsRow | null>(null)

  // ── Form states ──
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    company_name: "",
    owner_name: "",
    phone: "",
    website: "",
  })
  const [profileErrors, setProfileErrors] = useState<Partial<Record<keyof ProfileForm, string>>>({})

  const [servicesForm, setServicesForm] = useState<ServicesForm>({
    trade: "",
    service_area: "",
  })

  const [estimateForm, setEstimateForm] = useState<EstimateForm>({
    currency: "CAD",
    default_payment_terms: "30",
    late_fee_percentage: "0",
  })
  const [estimateErrors, setEstimateErrors] = useState<Partial<Record<keyof EstimateForm, string>>>({})

  const [followUpForm, setFollowUpForm] = useState<FollowUpForm>({
    first_reminder_days: "3",
    second_reminder_days: "7",
    final_notice_days: "14",
    default_tone: "friendly",
  })
  const [followUpErrors, setFollowUpErrors] = useState<Partial<Record<keyof FollowUpForm, string>>>({})

  // ── Stripe ──
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isRefreshingStripe, setIsRefreshingStripe] = useState(false)

  // ── Copy link ──
  const [copied, setCopied] = useState(false)

  // ── Load data on mount ──
  const loadData = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setLoadError("You must be logged in.")
      setIsLoading(false)
      return
    }

    setUserId(user.id)

    const [profileResult, settingsResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("settings").select("*").eq("user_id", user.id).maybeSingle(),
    ])

    if (profileResult.error) {
      setLoadError(profileResult.error.message)
      setIsLoading(false)
      return
    }

    const profile = profileResult.data
    const settings = settingsResult.data

    setProfileRow(profile)
    setSettingsRow(settings)

    if (profile) {
      setProfileForm({
        company_name: profile.company_name ?? "",
        owner_name: profile.owner_name ?? "",
        phone: profile.phone ?? "",
        website: profile.website ?? "",
      })

      const validTrades = (profile.trade ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter((t): t is string => t.length > 0 && (CONTRACTOR_TRADES as readonly string[]).includes(t))

      setServicesForm({
        trade: validTrades.join(","),
        service_area: profile.service_area ?? "",
      })

      if (profile.stripe_account_id) {
        // Inline Stripe status fetch to avoid forward-reference issues
        setStripeStatus(null)
        try {
          const stripeRes = await fetch("/api/stripe/connect/status", { method: "POST" })
          if (stripeRes.ok) {
            const stripeData = (await stripeRes.json()) as StripeStatus
            setStripeStatus(stripeData)
          } else {
            setStripeStatus(disconnectedStripeStatus)
          }
        } catch {
          setStripeStatus(disconnectedStripeStatus)
        }
      } else {
        setStripeStatus(disconnectedStripeStatus)
      }
    } else {
      setStripeStatus(disconnectedStripeStatus)
    }

    if (settings) {
      setEstimateForm({
        currency: settings.currency,
        default_payment_terms: String(settings.default_payment_terms),
        late_fee_percentage: String(settings.late_fee_percentage),
      })
      setFollowUpForm({
        first_reminder_days: String(settings.first_reminder_days),
        second_reminder_days: String(settings.second_reminder_days),
        final_notice_days: String(settings.final_notice_days),
        default_tone: settings.default_tone,
      })
    }

    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    const id = window.setTimeout(() => void loadData(), 0)
    return () => window.clearTimeout(id)
  }, [loadData])

  // ── Stripe helpers (plain async, called imperatively) ──
  async function fetchStripeStatus() {
    if (!profileRow?.stripe_account_id) {
      setStripeStatus(disconnectedStripeStatus)
      return
    }

    setIsRefreshingStripe(true)
    try {
      const res = await fetch("/api/stripe/connect/status", { method: "POST" })
      if (res.ok) {
        const data = (await res.json()) as StripeStatus
        setStripeStatus(data)
      } else {
        setStripeStatus(disconnectedStripeStatus)
      }
    } catch {
      setStripeStatus(disconnectedStripeStatus)
    } finally {
      setIsRefreshingStripe(false)
    }
  }

  async function handleStripeConnect() {
    setIsConnecting(true)
    try {
      const res = await fetch("/api/stripe/connect/onboard", { method: "POST" })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        toast.error(data.error ?? "Could not start Stripe onboarding")
        return
      }
      window.location.href = data.url
    } catch {
      toast.error("Could not reach Stripe. Please try again.")
    } finally {
      setIsConnecting(false)
    }
  }

  // ── Navigation helpers ──
  function markCompleted(stage: number) {
    setCompletedStages((prev) => new Set([...prev, stage]))
  }

  function goToStage(n: number) {
    setCurrentStage(Math.max(0, Math.min(n, TOTAL - 1)))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function advance() {
    markCompleted(currentStage)
    goToStage(currentStage + 1)
  }

  function goBack() {
    goToStage(currentStage - 1)
  }

  function skipToDashboard() {
    router.push("/dashboard")
  }

  // ── Save: business profile ──
  async function handleSaveProfile() {
    if (!userId) return

    const errors: Partial<Record<keyof ProfileForm, string>> = {}
    if (!profileForm.company_name.trim()) errors.company_name = "Business name is required."
    if (!profileForm.owner_name.trim()) errors.owner_name = "Owner name is required."
    if (!isValidWebsite(profileForm.website))
      errors.website = "Enter a full URL starting with https://"

    setProfileErrors(errors)
    if (Object.keys(errors).length > 0) {
      toast.error("Fix the highlighted fields before continuing.")
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        company_name: profileForm.company_name.trim(),
        owner_name: profileForm.owner_name.trim(),
        phone: nullableText(profileForm.phone),
        website: nullableText(profileForm.website),
      }

      const result = profileRow
        ? await supabase.from("profiles").update(payload).eq("user_id", userId).select().single()
        : await supabase.from("profiles").insert({ user_id: userId, ...payload }).select().single()

      if (result.error) {
        toast.error("Failed to save profile.")
        return
      }

      setProfileRow(result.data)
      toast.success("Business profile saved.")
      advance()
    } finally {
      setIsSaving(false)
    }
  }

  // ── Save: services ──
  async function handleSaveServices() {
    if (!userId) return

    setIsSaving(true)
    try {
      const payload = {
        trade: nullableText(servicesForm.trade),
        service_area: nullableText(servicesForm.service_area),
      }

      const result = profileRow
        ? await supabase.from("profiles").update(payload).eq("user_id", userId).select().single()
        : await supabase.from("profiles").insert({ user_id: userId, ...payload }).select().single()

      if (result.error) {
        toast.error("Failed to save services.")
        return
      }

      setProfileRow(result.data)
      toast.success("Services saved.")
      advance()
    } finally {
      setIsSaving(false)
    }
  }

  // ── Save: estimate defaults ──
  async function handleSaveEstimateDefaults() {
    if (!userId) return

    const errors: Partial<Record<keyof EstimateForm, string>> = {}
    const paymentTerms = parsePositiveInteger(estimateForm.default_payment_terms)
    const lateFee = parseNonNegativeNumber(estimateForm.late_fee_percentage)

    if (paymentTerms === null)
      errors.default_payment_terms = "Payment terms must be a positive whole number."
    if (lateFee === null) errors.late_fee_percentage = "Late fee cannot be negative."

    setEstimateErrors(errors)
    if (Object.keys(errors).length > 0) {
      toast.error("Fix the highlighted fields before continuing.")
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        currency: estimateForm.currency,
        default_payment_terms: paymentTerms as number,
        late_fee_percentage: lateFee as number,
      }

      const result = settingsRow
        ? await supabase.from("settings").update(payload).eq("user_id", userId).select().single()
        : await supabase
            .from("settings")
            .insert({
              user_id: userId,
              ...payload,
              first_reminder_days: Number(followUpForm.first_reminder_days) || 3,
              second_reminder_days: Number(followUpForm.second_reminder_days) || 7,
              final_notice_days: Number(followUpForm.final_notice_days) || 14,
              default_tone: followUpForm.default_tone || "friendly",
            })
            .select()
            .single()

      if (result.error) {
        toast.error("Failed to save estimate defaults.")
        return
      }

      setSettingsRow(result.data)
      toast.success("Estimate defaults saved.")
      advance()
    } finally {
      setIsSaving(false)
    }
  }

  // ── Save: follow-up defaults ──
  async function handleSaveFollowUpDefaults() {
    if (!userId) return

    const errors: Partial<Record<keyof FollowUpForm, string>> = {}
    const first = parsePositiveInteger(followUpForm.first_reminder_days)
    const second = parsePositiveInteger(followUpForm.second_reminder_days)
    const final_ = parsePositiveInteger(followUpForm.final_notice_days)

    if (first === null) errors.first_reminder_days = "Must be a positive whole number."
    if (second === null) errors.second_reminder_days = "Must be a positive whole number."
    if (final_ === null) errors.final_notice_days = "Must be a positive whole number."

    if (first !== null && second !== null && final_ !== null) {
      if (!(first < second && second < final_)) {
        const msg = "Each reminder should come later than the one before it (e.g. 3, 7, 14 days)."
        errors.first_reminder_days = msg
        errors.second_reminder_days = msg
        errors.final_notice_days = msg
      }
    }

    setFollowUpErrors(errors)
    if (Object.keys(errors).length > 0) {
      toast.error("Fix the highlighted fields before continuing.")
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        first_reminder_days: first as number,
        second_reminder_days: second as number,
        final_notice_days: final_ as number,
        default_tone: followUpForm.default_tone,
      }

      const result = settingsRow
        ? await supabase.from("settings").update(payload).eq("user_id", userId).select().single()
        : await supabase
            .from("settings")
            .insert({
              user_id: userId,
              ...payload,
              currency: estimateForm.currency || "CAD",
              default_payment_terms: Number(estimateForm.default_payment_terms) || 30,
              late_fee_percentage: Number(estimateForm.late_fee_percentage) || 0,
            })
            .select()
            .single()

      if (result.error) {
        toast.error("Failed to save follow-up defaults.")
        return
      }

      setSettingsRow(result.data)
      toast.success("Follow-up timing saved.")
      advance()
    } finally {
      setIsSaving(false)
    }
  }

  // ── Copy link ──
  const requestLink = useMemo(() => {
    const slug = profileRow?.request_slug
    if (!slug) return null
    if (typeof window === "undefined") return `/request/${slug}`
    return `${window.location.origin}/request/${slug}`
  }, [profileRow?.request_slug])

  async function handleCopyLink() {
    if (!requestLink) return
    await navigator.clipboard.writeText(requestLink)
    setCopied(true)
    toast.success("Link copied to clipboard.")
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Completion checks ──
  const isProfileComplete = Boolean(profileRow?.company_name && profileRow?.owner_name)
  const isServicesComplete = Boolean(profileRow?.trade || profileRow?.service_area)
  const isEstimateDefaultsComplete = Boolean(settingsRow?.currency && settingsRow?.default_payment_terms)
  const isFollowUpComplete = Boolean(
    settingsRow?.first_reminder_days &&
    settingsRow?.second_reminder_days &&
    settingsRow?.final_notice_days
  )
  const isRequestLinkReady = Boolean(profileRow?.request_slug)
  const isPaymentsComplete = Boolean(stripeStatus?.onboarding_complete)

  // ── Guard: loading ──
  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-md p-8">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-medium">Could not load your setup</p>
          <p className="mt-1">{loadError}</p>
        </div>
        <Button className="mt-4" onClick={() => void loadData()}>
          Retry
        </Button>
      </div>
    )
  }

  // ── Stage renderers ────────────────────────────────────────────────────────────

  // STAGE 0 — Welcome
  function renderWelcome() {
    const checklist = [
      "Share one request link with clients",
      "Build estimates and collect deposits",
      "Set follow-up timing for quiet jobs",
    ]

    return (
      <div className="flex flex-col gap-6">
        <div>
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-ef-mist text-ef-ocean dark:bg-ef-ink/40 dark:text-ef-300">
            <span className="text-2xl">🐊</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Get one job request link working first
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Text clients this link instead of collecting job details across
            messages, notes, photos, and missed calls. You can finish the rest
            of setup later.
          </p>
        </div>

        {requestLink ? (
          <div className="grid gap-3 rounded-xl border border-ef-200 bg-ef-mist/50 p-4 dark:border-ef-navy/40 dark:bg-ef-ink/20">
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-ef-ocean shadow-sm dark:bg-ef-ink">
                <Link2 className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ef-ocean dark:text-ef-300">
                  Your request link is ready
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  This is the first thing worth testing with a real customer.
                </p>
              </div>
            </div>
            <div className="truncate rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              {requestLink}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" onClick={() => void handleCopyLink()} className="gap-2 sm:w-auto w-full">
                {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
                Copy request link
              </Button>
              <Button type="button" variant="outline" className="gap-2 sm:w-auto w-full" asChild>
                <a href={requestLink} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" />
                  Preview form
                </a>
              </Button>
            </div>
          </div>
        ) : null}

        <SetupInsight
          title="Keep setup short"
          description="Set the basics now. Skip anything you do not need yet and finish it later from Settings."
        />

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Setup covers
          </p>
          <div className="grid gap-1">
            {checklist.map((item) => (
              <div key={item} className="flex items-center gap-2.5 py-1">
                <span className="size-1.5 rounded-full bg-ef-ocean/40" />
                <span className="text-sm text-muted-foreground">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={advance}
            className="gap-2 bg-ef-ocean text-white hover:bg-ef-ocean/90 sm:w-auto w-full"
          >
            Set up basics
            <ArrowRight className="size-4" />
          </Button>
          <Button
            variant="ghost"
            onClick={skipToDashboard}
            className="text-muted-foreground sm:w-auto w-full"
          >
            Go to dashboard
          </Button>
        </div>
      </div>
    )
  }

  // STAGE 1 — Business profile
  function renderBusinessProfile() {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-bold">Business profile</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your name and contact details shown on estimates and client pages.
          </p>
        </div>

        <SetupInsight
          title="Why this matters"
          description="This information appears on estimates, follow-up messages, and your client-facing request page."
        />

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="company_name">
                Business name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="company_name"
                value={profileForm.company_name}
                onChange={(e) => {
                  setProfileForm((p) => ({ ...p, company_name: e.target.value }))
                  setProfileErrors((p) => ({ ...p, company_name: undefined }))
                }}
                placeholder="e.g. North Shore Contracting"
                aria-invalid={Boolean(profileErrors.company_name)}
              />
              <FieldError message={profileErrors.company_name} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="owner_name">
                Owner name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="owner_name"
                value={profileForm.owner_name}
                onChange={(e) => {
                  setProfileForm((p) => ({ ...p, owner_name: e.target.value }))
                  setProfileErrors((p) => ({ ...p, owner_name: undefined }))
                }}
                placeholder="e.g. Sam Carter"
                aria-invalid={Boolean(profileErrors.owner_name)}
              />
              <FieldError message={profileErrors.owner_name} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                value={profileForm.phone}
                onChange={(e) =>
                  setProfileForm((p) => ({
                    ...p,
                    phone: formatPhoneNumberInput(e.target.value),
                  }))
                }
                placeholder="(604) 555-0100"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="website">Website (optional)</Label>
              <Input
                id="website"
                type="url"
                value={profileForm.website}
                onChange={(e) => {
                  setProfileForm((p) => ({ ...p, website: e.target.value }))
                  setProfileErrors((p) => ({ ...p, website: undefined }))
                }}
                placeholder="https://yoursite.ca"
                aria-invalid={Boolean(profileErrors.website)}
              />
              <FieldError message={profileErrors.website} />
            </div>
          </div>
        </div>

        <StepNav
          onBack={goBack}
          onNext={() => void handleSaveProfile()}
          onSkip={advance}
          isSaving={isSaving}
        />
      </div>
    )
  }

  // STAGE 2 — Services & service area
  function renderServices() {
    const selectedTrades = servicesForm.trade
      ? servicesForm.trade
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : []

    return (
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-bold">Services and service area</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select what kind of work you do and where you work.
          </p>
        </div>

        <SetupInsight
          title="How this helps"
          description="Clients see your trades and service area before submitting a job request, so you get better-matched requests."
        />

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Trades and services</Label>
            <p className="text-xs text-muted-foreground">
              Select all that apply.
            </p>
            <TradeMultiSelect
              value={selectedTrades}
              onChange={(trades) =>
                setServicesForm((p) => ({ ...p, trade: trades.join(",") }))
              }
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="service_area">Service area</Label>
            <ServiceAreaSelect
              value={servicesForm.service_area}
              onChange={(area) =>
                setServicesForm((p) => ({ ...p, service_area: area }))
              }
            />
          </div>
        </div>

        <StepNav
          onBack={goBack}
          onNext={() => void handleSaveServices()}
          onSkip={advance}
          isSaving={isSaving}
        />
      </div>
    )
  }

  // STAGE 3 — Estimate defaults
  function renderEstimateDefaults() {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-bold">Estimate and invoice defaults</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These values are pre-filled when you create new estimates and invoices.
          </p>
        </div>

        <SetupInsight
          title="Why this saves time"
          description="Set your standard payment terms once here and they will be pre-filled every time you create an estimate."
        />

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="currency">Currency</Label>
            <Select
              value={estimateForm.currency}
              onValueChange={(v) => setEstimateForm((p) => ({ ...p, currency: v }))}
            >
              <SelectTrigger id="currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CAD">CAD — Canadian Dollar</SelectItem>
                <SelectItem value="USD">USD — US Dollar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="payment_terms">Payment terms (days)</Label>
              <Input
                id="payment_terms"
                type="number"
                min="1"
                max="365"
                value={estimateForm.default_payment_terms}
                onChange={(e) => {
                  setEstimateForm((p) => ({ ...p, default_payment_terms: e.target.value }))
                  setEstimateErrors((p) => ({ ...p, default_payment_terms: undefined }))
                }}
                aria-invalid={Boolean(estimateErrors.default_payment_terms)}
              />
              <FieldError message={estimateErrors.default_payment_terms} />
              <p className="text-xs text-muted-foreground">
                How many days after the estimate a client has to pay.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="late_fee">Late fee (%)</Label>
              <Input
                id="late_fee"
                type="number"
                min="0"
                step="0.5"
                value={estimateForm.late_fee_percentage}
                onChange={(e) => {
                  setEstimateForm((p) => ({ ...p, late_fee_percentage: e.target.value }))
                  setEstimateErrors((p) => ({ ...p, late_fee_percentage: undefined }))
                }}
                aria-invalid={Boolean(estimateErrors.late_fee_percentage)}
              />
              <FieldError message={estimateErrors.late_fee_percentage} />
              <p className="text-xs text-muted-foreground">
                Set to 0 if you do not charge a late fee.
              </p>
            </div>
          </div>
        </div>

        <StepNav
          onBack={goBack}
          onNext={() => void handleSaveEstimateDefaults()}
          onSkip={advance}
          isSaving={isSaving}
        />
      </div>
    )
  }

  // STAGE 4 — Follow-up timing
  function renderFollowUpDefaults() {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-bold">Follow-up timing</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            When to follow up after sending an estimate or invoice.
          </p>
        </div>

        <SetupInsight
          title="How follow-ups work"
          description="Euroflo uses these defaults to remind you when to follow up with clients. You stay in control — messages are never sent automatically."
        />

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="first_reminder">First reminder (days)</Label>
              <Input
                id="first_reminder"
                type="number"
                min="1"
                value={followUpForm.first_reminder_days}
                onChange={(e) => {
                  setFollowUpForm((p) => ({ ...p, first_reminder_days: e.target.value }))
                  setFollowUpErrors((p) => ({ ...p, first_reminder_days: undefined }))
                }}
                aria-invalid={Boolean(followUpErrors.first_reminder_days)}
              />
              <FieldError message={followUpErrors.first_reminder_days} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="second_reminder">Second reminder (days)</Label>
              <Input
                id="second_reminder"
                type="number"
                min="1"
                value={followUpForm.second_reminder_days}
                onChange={(e) => {
                  setFollowUpForm((p) => ({ ...p, second_reminder_days: e.target.value }))
                  setFollowUpErrors((p) => ({ ...p, second_reminder_days: undefined }))
                }}
                aria-invalid={Boolean(followUpErrors.second_reminder_days)}
              />
              <FieldError message={followUpErrors.second_reminder_days} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="final_notice">Final notice (days)</Label>
              <Input
                id="final_notice"
                type="number"
                min="1"
                value={followUpForm.final_notice_days}
                onChange={(e) => {
                  setFollowUpForm((p) => ({ ...p, final_notice_days: e.target.value }))
                  setFollowUpErrors((p) => ({ ...p, final_notice_days: undefined }))
                }}
                aria-invalid={Boolean(followUpErrors.final_notice_days)}
              />
              <FieldError message={followUpErrors.final_notice_days} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Example with defaults: remind on day 3, then day 7, then send a final
            notice on day 14.
          </p>

          <div className="grid gap-2">
            <Label htmlFor="tone">Default message tone</Label>
            <Select
              value={followUpForm.default_tone}
              onValueChange={(v) =>
                setFollowUpForm((p) => ({ ...p, default_tone: v }))
              }
            >
              <SelectTrigger id="tone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="firm">Firm</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <StepNav
          onBack={goBack}
          onNext={() => void handleSaveFollowUpDefaults()}
          onSkip={advance}
          isSaving={isSaving}
        />
      </div>
    )
  }

  // STAGE 5 — Client request link
  function renderRequestLink() {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-bold">Your client request link</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Share this link so clients can submit job requests directly to you.
          </p>
        </div>

        <SetupInsight
          title="Where to share it"
          description="Add this link to your website, Instagram, Facebook page, or Google Business profile. Clients can submit a request without creating an account."
        />

        {requestLink ? (
          <div className="grid gap-3">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted px-3 py-2.5 text-xs text-muted-foreground">
                {requestLink}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => void handleCopyLink()}
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

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                asChild
                className="gap-1.5"
              >
                <a href={requestLink} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" />
                  Open link
                </a>
              </Button>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
              <StatusPulse variant="success" />
              <span>
                Clients can submit a request without creating an account. Requests
                appear in your Job Requests page.
              </span>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Save your business profile first to generate your request link.
          </div>
        )}

        <div className="rounded-xl border border-ef-200/60 bg-ef-mist/30 p-4 dark:border-ef-navy/30 dark:bg-ef-ink/10">
          <p className="text-xs font-semibold text-ef-ocean dark:text-ef-300">
            Where to share your link
          </p>
          <ul className="mt-2 grid gap-1 text-xs text-muted-foreground">
            {[
              "Your website contact or quote page",
              "Instagram and Facebook bio link",
              "Google Business profile",
              "Email signature",
              "Business card QR code",
            ].map((place) => (
              <li key={place} className="flex items-center gap-2">
                <span className="size-1 rounded-full bg-ef-ocean/40" />
                {place}
              </li>
            ))}
          </ul>
        </div>

        <StepNav
          onBack={goBack}
          onNext={advance}
          nextLabel="Continue"
          isSaving={isSaving}
        />
      </div>
    )
  }

  // STAGE 6 — Online payments
  function renderPayments() {
    const connected = stripeStatus?.connected ?? false
    const complete = stripeStatus?.onboarding_complete ?? false
    const isCheckingStripe = Boolean(profileRow?.stripe_account_id && stripeStatus === null)

    return (
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-bold">Online payments</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect Stripe so clients can pay accepted estimates online.
          </p>
        </div>

        <SetupInsight
          title="How payments work"
          description="Connect Stripe so clients can pay accepted estimates online. You receive the full amount you set — Euroflo adds a 15% platform fee on top, which your client pays."
        />

        {/* Status card */}
        {isCheckingStripe ? (
          <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Checking Stripe connection...</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Euroflo is confirming whether this account can accept payments.
              </p>
            </div>
          </div>
        ) : !connected ? (
          <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-medium">Stripe not connected</p>
              <p className="mt-1 text-xs text-muted-foreground">
                You can skip this for now and still use job requests, estimates,
                and follow-ups. Connect Stripe when you are ready to accept online
                payments.
              </p>
            </div>
          </div>
        ) : !complete ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200/70 bg-amber-50/60 p-4 dark:border-amber-800/30 dark:bg-amber-950/20">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Stripe setup is started, but not finished yet
              </p>
              <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-400/80">
                Finish Stripe onboarding to accept client payments.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-4 dark:border-emerald-800/30 dark:bg-emerald-950/20">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500 dark:text-emerald-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                Stripe connected. You can accept client payments.
              </p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                {[
                  { label: "Charges", value: stripeStatus?.charges_enabled },
                  { label: "Payouts", value: stripeStatus?.payouts_enabled },
                  { label: "Verified", value: stripeStatus?.details_submitted },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="rounded-md border border-border bg-card px-2 py-2 text-center"
                  >
                    <dt className="text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">
                      {label}
                    </dt>
                    <dd
                      className={cn(
                        "mt-0.5 font-semibold",
                        value
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-500 dark:text-red-400"
                      )}
                    >
                      {value ? "Yes" : "No"}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {!complete && !isCheckingStripe && (
            <Button
              onClick={() => void handleStripeConnect()}
              disabled={isConnecting}
              className="gap-2"
            >
              {isConnecting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ExternalLink className="size-4" />
              )}
              {connected ? "Continue Stripe setup" : "Connect Stripe"}
            </Button>
          )}

          {connected && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchStripeStatus()}
              disabled={isRefreshingStripe}
              className="gap-1.5"
            >
              <RefreshCw
                className={cn("size-3.5", isRefreshingStripe && "animate-spin")}
              />
              Refresh status
            </Button>
          )}
        </div>

        <StepNav
          onBack={goBack}
          onNext={advance}
          nextLabel={complete ? "Continue" : "Skip payments for now"}
          isSaving={isSaving}
        />
      </div>
    )
  }

  // STAGE 7 — Test your first job
  function renderTestJob() {
    const slug = profileRow?.request_slug

    return (
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-bold">Test your first job flow</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The fastest way to understand Euroflo is to run through the flow once
            yourself.
          </p>
        </div>

        <SetupInsight
          title="What the full flow looks like"
          description="Client submits a request → you create an estimate → client accepts → you get paid. It takes about 2 minutes to test end to end."
        />

        <div className="grid gap-3">
          {[
            {
              step: 1,
              label: "Open your request form",
              desc: "This is what clients see when they use your link.",
              action: slug ? (
                <a
                  href={`/request/${slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-muted"
                >
                  <ExternalLink className="size-3.5" />
                  Open form
                </a>
              ) : null,
            },
            {
              step: 2,
              label: "Submit a fake job request",
              desc: "Use a test name and email. The request will appear in Job Requests.",
            },
            {
              step: 3,
              label: "Create an estimate from the request",
              desc: "Go to Job Requests, open the request, and create an estimate.",
              action: (
                <Link
                  href="/dashboard/job-requests"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-muted"
                >
                  Job Requests
                  <ArrowRight className="size-3.5" />
                </Link>
              ),
            },
            {
              step: 4,
              label: "Accept the estimate as the client",
              desc: "Euroflo sends the client a link. Open it to see their experience.",
            },
            {
              step: 5,
              label: "Confirm the payment button appears",
              desc: isPaymentsComplete
                ? "Stripe is connected — the pay button will appear on accepted estimates."
                : "Skip this step if you have not connected Stripe yet.",
              optional: !isPaymentsComplete,
            },
          ].map(({ step, label, desc, action, optional }) => (
            <div
              key={step}
              className="flex gap-4 rounded-xl border border-border bg-card p-4"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ef-mist text-sm font-bold text-ef-ocean dark:bg-ef-ink/40 dark:text-ef-300">
                {step}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="text-sm font-semibold">
                  {label}
                  {optional && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (optional)
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{desc}</p>
                {action && <div className="pt-0.5">{action}</div>}
              </div>
            </div>
          ))}
        </div>

        <StepNav
          onBack={goBack}
          onNext={advance}
          nextLabel="Continue to summary"
          isSaving={isSaving}
        />
      </div>
    )
  }

  // STAGE 8 — Summary
  function renderSummary() {
    const items = [
      {
        label: "Business profile",
        complete: isProfileComplete,
        href: "/dashboard/settings",
      },
      {
        label: "Services and service area",
        complete: isServicesComplete,
        href: "/dashboard/settings",
      },
      {
        label: "Estimate defaults",
        complete: isEstimateDefaultsComplete,
        href: "/dashboard/settings",
      },
      {
        label: "Follow-up timing",
        complete: isFollowUpComplete,
        href: "/dashboard/settings",
      },
      {
        label: "Client request link",
        complete: isRequestLinkReady,
        href: "/dashboard/settings",
      },
      {
        label: "Online payments (Stripe)",
        complete: isPaymentsComplete,
        optional: true,
        href: "/dashboard/settings",
      },
    ]

    const requiredComplete = items
      .filter((i) => !i.optional)
      .every((i) => i.complete)

    return (
      <div className="flex flex-col gap-5">
        <div>
          {requiredComplete ? (
            <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <CheckCircle2 className="size-6" />
            </div>
          ) : (
            <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              <AlertCircle className="size-6" />
            </div>
          )}
          <h2 className="text-xl font-bold">
            {requiredComplete ? "You are set up." : "Almost there."}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {requiredComplete
              ? "Your workspace is ready. Go to your dashboard or start receiving job requests."
              : "A few items are still incomplete. You can finish them in Settings anytime."}
          </p>
        </div>

        <Card>
          <CardContent className="divide-y divide-border p-4">
            {items.map((item) => (
              <CompletionRow
                key={item.label}
                label={item.label}
                complete={item.complete}
                optional={item.optional}
              />
            ))}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          You can come back to Settings anytime to update these details.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            asChild
            className="gap-2 bg-ef-ocean text-white hover:bg-ef-ocean/90"
          >
            <Link href="/dashboard">
              <ArrowRight className="size-4" />
              Go to Dashboard
            </Link>
          </Button>
          <Button variant="outline" asChild className="gap-2">
            <Link href="/dashboard/job-requests">Open Job Requests</Link>
          </Button>
          <Button variant="outline" asChild className="gap-2">
            <Link href="/dashboard/settings">Open Settings</Link>
          </Button>
        </div>
      </div>
    )
  }

  // ── Layout ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col">
      {/* Mobile progress bar */}
      <div className="lg:hidden border-b border-border bg-card/80">
        <MobileProgress currentStage={currentStage} />
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex w-52 xl:w-60 shrink-0 flex-col border-r border-border bg-card/50 px-3 py-6 min-h-[calc(100vh-4rem)]">
          <p className="mb-2 px-3 text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground">
            Setup
          </p>
          <ProgressSidebar
            currentStage={currentStage}
            completedStages={completedStages}
            onNavigate={goToStage}
          />
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-4 py-6 sm:px-6 lg:px-8 xl:px-10">
          <div className="mx-auto max-w-xl">
            <div
              key={currentStage}
              className="animate-[content-reveal_0.2s_ease-out_both] motion-reduce:animate-none"
            >
              {currentStage === 0 && renderWelcome()}
              {currentStage === 1 && renderBusinessProfile()}
              {currentStage === 2 && renderServices()}
              {currentStage === 3 && renderEstimateDefaults()}
              {currentStage === 4 && renderFollowUpDefaults()}
              {currentStage === 5 && renderRequestLink()}
              {currentStage === 6 && renderPayments()}
              {currentStage === 7 && renderTestJob()}
              {currentStage === 8 && renderSummary()}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
