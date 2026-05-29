"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Check, ClipboardCopy, RotateCcw, Save } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/dashboard/page-header"
import { SettingsSkeleton } from "@/components/dashboard/skeleton-loaders"
import { ContentReveal } from "@/components/ui/content-reveal"
import { Button } from "@/components/ui/button"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ServiceAreaSelect } from "@/components/ui/service-area-select"
import { CONTRACTOR_TRADES, TradeMultiSelect } from "@/components/ui/trade-multi-select"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"

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
    currency: settings?.currency ?? "CAD",
    first_reminder_days: String(settings?.first_reminder_days ?? 3),
    second_reminder_days: String(settings?.second_reminder_days ?? 7),
    final_notice_days: String(settings?.final_notice_days ?? 14),
    default_tone: settings?.default_tone ?? "friendly",
  }
}

function nullableText(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function ClientRequestLinkCard({ userId }: { userId: string }) {
  const [copied, setCopied] = useState(false)
  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/client/jobs/new?contractor=${userId}`
      : `/client/jobs/new?contractor=${userId}`

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
          <code className="flex-1 truncate rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
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
                <Check className="size-3.5 text-green-600" />
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
          Clients must be signed in to submit. Requests appear in your Job Requests page.
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
  }

  if (!form.owner_name.trim()) {
    errors.owner_name = "Owner name is required."
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
  }

  if (lateFeePercentage === null) {
    errors.late_fee_percentage = "Late fee cannot be negative."
  }

  if (firstReminderDays === null) {
    errors.first_reminder_days = "First reminder must be a positive whole number."
  }

  if (secondReminderDays === null) {
    errors.second_reminder_days = "Second reminder must be a positive whole number."
  }

  if (finalNoticeDays === null) {
    errors.final_notice_days = "Final notice must be a positive whole number."
  }

  if (
    firstReminderDays !== null &&
    secondReminderDays !== null &&
    finalNoticeDays !== null &&
    !(firstReminderDays < secondReminderDays && secondReminderDays < finalNoticeDays)
  ) {
    errors.first_reminder_days =
      "Reminder timing must be first < second < final notice."
    errors.second_reminder_days =
      "Reminder timing must be first < second < final notice."
    errors.final_notice_days =
      "Reminder timing must be first < second < final notice."
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

    const payload: ProfileUpdate = {
      company_name: profileForm.company_name.trim(),
      owner_name: profileForm.owner_name.trim(),
      trade: nullableText(profileForm.trade),
      phone: nullableText(profileForm.phone),
      website: nullableText(profileForm.website),
      service_area: nullableText(profileForm.service_area),
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

    const payload: SettingsUpdate = {
      default_payment_terms: validation.values.paymentTerms,
      late_fee_percentage: validation.values.lateFeePercentage,
      currency: settingsForm.currency,
      first_reminder_days: validation.values.firstReminderDays,
      second_reminder_days: validation.values.secondReminderDays,
      final_notice_days: validation.values.finalNoticeDays,
      default_tone: settingsForm.default_tone,
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
        <div className="grid gap-6 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-3xl grid gap-6">
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
                  Select all that apply — used in your profile and client job request matching.
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

              <div className="grid gap-2 sm:max-w-xs">
                <Label htmlFor="default_tone">Default follow-up tone</Label>
                <Select
                  value={settingsForm.default_tone}
                  onValueChange={(v) => updateSettings("default_tone", v)}
                >
                  <SelectTrigger id="default_tone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="friendly">Friendly — warm, polite reminder</SelectItem>
                    <SelectItem value="firm">Firm — direct, professional</SelectItem>
                    <SelectItem value="final">Final notice — urgent, last warning</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </form>

        {/* ── Client request link ── */}
        {userId && (
          <ClientRequestLinkCard userId={userId} />
        )}

        {/* ── Account ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
            <CardDescription>
              Your login email and password are managed by the sign-in system.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              To change your email or password, contact support.
            </p>
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="grid gap-0.5">
                <p className="text-sm font-medium">Setup wizard</p>
                <p className="text-xs text-muted-foreground">
                  Re-run the guided setup to add a customer or load demo data.
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
