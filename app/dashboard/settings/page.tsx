"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { RefreshCw, Save } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/dashboard/page-header"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

function toProfileForm(profile: ProfileRow | null): ProfileForm {
  return {
    company_name: profile?.company_name ?? "",
    owner_name: profile?.owner_name ?? "",
    trade: profile?.trade ?? "",
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

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [settings, setSettings] = useState<SettingsRow | null>(null)
  const [profileForm, setProfileForm] = useState<ProfileForm>(toProfileForm(null))
  const [settingsForm, setSettingsForm] = useState<SettingsForm>(toSettingsForm(null))
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
    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    const id = window.setTimeout(() => void loadData(), 0)
    return () => window.clearTimeout(id)
  }, [loadData])

  function updateProfile(field: keyof ProfileForm, value: string) {
    setProfileForm((curr) => ({ ...curr, [field]: value }))
  }

  function updateSettings(field: keyof SettingsForm, value: string) {
    setSettingsForm((curr) => ({ ...curr, [field]: value }))
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId) return

    setIsSavingProfile(true)

    const payload: ProfileUpdate = {
      company_name: nullableText(profileForm.company_name),
      owner_name: nullableText(profileForm.owner_name),
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

    setIsSavingSettings(true)

    const payload: SettingsUpdate = {
      default_payment_terms: parseInt(settingsForm.default_payment_terms, 10) || 30,
      late_fee_percentage: parseFloat(settingsForm.late_fee_percentage) || 0,
      currency: settingsForm.currency,
      first_reminder_days: parseInt(settingsForm.first_reminder_days, 10) || 3,
      second_reminder_days: parseInt(settingsForm.second_reminder_days, 10) || 7,
      final_notice_days: parseInt(settingsForm.final_notice_days, 10) || 14,
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

  if (isLoading) {
    return (
      <>
        <PageHeader
          title="Settings"
          description="Business profile, invoice defaults, and follow-up preferences."
        />
        <div className="flex items-center gap-3 p-8 text-muted-foreground">
          <RefreshCw className="size-4 animate-spin" />
          <span className="text-sm">Loading settings…</span>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Business profile, invoice defaults, and follow-up preferences."
      />

      <div className="grid gap-6 p-4 sm:p-6 lg:p-8">
        {errorMessage ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="font-medium">Error loading settings</div>
            <p className="mt-1 leading-6">{errorMessage}</p>
          </div>
        ) : null}

        {/* ── Business profile ── */}
        <form onSubmit={(e) => void saveProfile(e)}>
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Business profile</CardTitle>
                  <CardDescription>
                    Your name and company details used in follow-up messages.
                  </CardDescription>
                </div>
                <Button type="submit" disabled={isSavingProfile} className="w-fit">
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
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="owner_name">Owner name</Label>
                  <Input
                    id="owner_name"
                    value={profileForm.owner_name}
                    onChange={(e) => updateProfile("owner_name", e.target.value)}
                    placeholder="e.g. Daniel Smith"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="trade">Trade / service</Label>
                  <Input
                    id="trade"
                    value={profileForm.trade}
                    onChange={(e) => updateProfile("trade", e.target.value)}
                    placeholder="e.g. Electrical, Roofing, Plumbing"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={profileForm.phone}
                    onChange={(e) => updateProfile("phone", e.target.value)}
                    placeholder="e.g. (604) 555-0100"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    type="url"
                    value={profileForm.website}
                    onChange={(e) => updateProfile("website", e.target.value)}
                    placeholder="e.g. https://yoursite.ca"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="service_area">Service area</Label>
                  <Input
                    id="service_area"
                    value={profileForm.service_area}
                    onChange={(e) => updateProfile("service_area", e.target.value)}
                    placeholder="e.g. Greater Vancouver"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </form>

        {/* ── Invoice & follow-up settings ── */}
        <form onSubmit={(e) => void saveSettings(e)}>
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Invoice defaults</CardTitle>
                  <CardDescription>
                    Default values applied to new invoices and follow-up timing.
                  </CardDescription>
                </div>
                <Button type="submit" disabled={isSavingSettings} className="w-fit">
                  <Save className="size-4" />
                  {isSavingSettings ? "Saving…" : "Save settings"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="payment_terms">Payment terms (days)</Label>
                  <Input
                    id="payment_terms"
                    type="number"
                    min="1"
                    max="365"
                    value={settingsForm.default_payment_terms}
                    onChange={(e) => updateSettings("default_payment_terms", e.target.value)}
                  />
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
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select
                    value={settingsForm.currency}
                    onValueChange={(v) => updateSettings("currency", v)}
                  >
                    <SelectTrigger id="currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CAD">CAD — Canadian Dollar</SelectItem>
                      <SelectItem value="USD">USD — US Dollar</SelectItem>
                      <SelectItem value="GBP">GBP — British Pound</SelectItem>
                      <SelectItem value="AUD">AUD — Australian Dollar</SelectItem>
                      <SelectItem value="EUR">EUR — Euro</SelectItem>
                    </SelectContent>
                  </Select>
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
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="second_reminder">Second reminder (days after due)</Label>
                    <Input
                      id="second_reminder"
                      type="number"
                      min="1"
                      value={settingsForm.second_reminder_days}
                      onChange={(e) => updateSettings("second_reminder_days", e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="final_notice">Final notice (days after due)</Label>
                    <Input
                      id="final_notice"
                      type="number"
                      min="1"
                      value={settingsForm.final_notice_days}
                      onChange={(e) => updateSettings("final_notice_days", e.target.value)}
                    />
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

        {/* ── Notification placeholder ── */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Notification preferences</CardTitle>
            <CardDescription>
              Email and SMS delivery for automated reminders. Coming in a future
              update — configure follow-up timing above for now.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* ── Account ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
            <CardDescription>
              Your login email and account details managed through Supabase Auth.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              To change your email or password, use the Supabase Auth dashboard
              or contact support.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
