"use client"

import { type FormEvent, useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ImagePlus, Send } from "lucide-react"
import { toast } from "sonner"

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
import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { CONTRACTOR_TRADES } from "@/components/ui/trade-multi-select"

type JobRequestInsert = Database["public"]["Tables"]["job_requests"]["Insert"]
type JobUrgency = Database["public"]["Enums"]["job_request_urgency"]

type ContractorProfile = {
  company_name: string | null
  owner_name: string | null
  trade: string | null
  service_area: string | null
}

function nullableNumber(value: FormDataEntryValue | null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export default function NewClientJobPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const contractorId = searchParams.get("contractor")
  const supabase = useMemo(() => createClient(), [])
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submittedTitle, setSubmittedTitle] = useState<string | null>(null)
  const [contractorProfile, setContractorProfile] = useState<ContractorProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [contractorNotFound, setContractorNotFound] = useState(false)

  useEffect(() => {
    if (!contractorId) {
      setProfileLoading(false)
      return
    }
    void (async () => {
      const { data, error } = await supabase.rpc("contractor_public_profile", {
        contractor_user_id: contractorId,
      })
      if (error) {
        // Function not yet deployed — fall through with null profile.
        // The form still works; RLS enforces contractor validity at insert time.
      } else if (!data || data.length === 0) {
        setContractorNotFound(true)
      } else {
        setContractorProfile(data[0])
      }
      setProfileLoading(false)
    })()
  }, [contractorId, supabase])

  if (!contractorId) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-lg font-semibold text-foreground">Invalid request link</p>
        <p className="mt-2 text-sm text-muted-foreground">
          This link is missing the contractor reference. Please use the link
          your contractor shared with you.
        </p>
      </div>
    )
  }

  if (!profileLoading && contractorNotFound) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-lg font-semibold text-foreground">Contractor not found</p>
        <p className="mt-2 text-sm text-muted-foreground">
          This link does not match an active contractor. Please use the link
          your contractor shared with you.
        </p>
      </div>
    )
  }

  // Parse contractor trades — only keep values that exist in the canonical list so
  // stale or mistyped values (e.g. "Trades") never reach the client dropdown.
  const contractorTrades = contractorProfile?.trade
    ? contractorProfile.trade
        .split(",")
        .map((t) => t.trim())
        .filter((t): t is string => (CONTRACTOR_TRADES as readonly string[]).includes(t))
    : []

  const contractorName =
    contractorProfile?.company_name ||
    contractorProfile?.owner_name ||
    null

  const pageTitle = contractorName
    ? `Request an estimate from ${contractorName}`
    : "Request an estimate"

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      setErrorMessage(null)

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        setErrorMessage("You must be signed in to submit a request.")
        return
      }

      // For single-trade contractors the field is hidden; inject the value directly.
      const trade =
        contractorTrades.length === 1
          ? contractorTrades[0]
          : String(formData.get("trade") ?? "").trim() || null

      const { data: clientProfile } = await supabase
        .from("profiles")
        .select("owner_name")
        .eq("user_id", user.id)
        .maybeSingle()

      const title = String(formData.get("title") ?? "").trim()
      const description = String(formData.get("description") ?? "").trim()
      const serviceArea = String(formData.get("service_area") ?? "").trim()
      const urgency = String(formData.get("urgency") ?? "flexible") as JobUrgency
      const contactPreference = String(formData.get("contact_preference") ?? "Email")

      const payload: JobRequestInsert = {
        client_id: user.id,
        contractor_id: contractorId,
        client_name: clientProfile?.owner_name || user.email || null,
        client_email: user.email ?? null,
        title,
        description,
        trade: trade ?? null,
        service_area: serviceArea,
        urgency,
        budget_min: nullableNumber(formData.get("budget_min")),
        budget_max: nullableNumber(formData.get("budget_max")),
        contact_preference: contactPreference,
        photo_notes: String(formData.get("photo_notes") ?? "").trim() || null,
        status: "new",
      }

      const { error } = await supabase.from("job_requests").insert(payload)

      if (error) {
        setErrorMessage(error.message)
        return
      }

      setSubmittedTitle(title)
      toast.success("Estimate requested")
    })
  }

  if (submittedTitle) {
    return (
      <div className="mx-auto grid max-w-2xl gap-6 p-4 sm:p-6 lg:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Estimate requested</CardTitle>
            <CardDescription>
              {contractorName
                ? `${contractorName} will review your details and be in touch soon.`
                : "Your contractor will review your details and be in touch soon."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-ef-200 bg-ef-mist p-4 text-sm text-ef-navy dark:border-ef-navy/60 dark:bg-ef-ink/30 dark:text-ef-mist">
              {submittedTitle}
            </div>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button
                className="bg-ef-ocean text-white hover:bg-ef-ocean"
                onClick={() => router.push("/client/dashboard")}
              >
                Return to dashboard
              </Button>
              <Button variant="outline" onClick={() => setSubmittedTitle(null)}>
                Submit another request
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-6 p-4 sm:p-6 lg:p-8">
      <Button variant="ghost" className="w-fit" asChild>
        <Link href="/client/dashboard">
          <ArrowLeft className="size-4" />
          Back to dashboard
        </Link>
      </Button>

      <Card>
        <CardHeader>
          {profileLoading ? (
            <>
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="mt-2 h-4 w-full" />
            </>
          ) : (
            <>
              <CardTitle>{pageTitle}</CardTitle>
              <CardDescription>
                Share the details your contractor needs to prepare an estimate.
              </CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent>
          <form className="grid gap-5" onSubmit={handleSubmit}>
            {errorMessage ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {errorMessage}
              </div>
            ) : null}

            {/* Hidden when contractor has exactly one trade; that value is submitted programmatically. */}
            {contractorTrades.length !== 1 ? (
              <div className="grid gap-2">
                <Label htmlFor="trade">Type of work</Label>
                <select
                  id="trade"
                  name="trade"
                  required
                  defaultValue=""
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="" disabled>Select a trade…</option>
                  {(contractorTrades.length > 1 ? contractorTrades : CONTRACTOR_TRADES).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Helps your contractor understand what kind of work you need.
                </p>
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="title">Job title</Label>
              <Input
                id="title"
                name="title"
                placeholder="Kitchen backsplash repair"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Job description</Label>
              <textarea
                id="description"
                name="description"
                className="min-h-32 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder="Describe the work, measurements, access details, preferred timing, and anything your contractor should know."
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="service_area">Location / service area</Label>
                <Input
                  id="service_area"
                  name="service_area"
                  placeholder="Vancouver, BC"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="urgency">Urgency</Label>
                <select
                  id="urgency"
                  name="urgency"
                  defaultValue="flexible"
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="flexible">Flexible</option>
                  <option value="soon">Soon</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="budget_min">Budget min optional</Label>
                <Input
                  id="budget_min"
                  name="budget_min"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="1000"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="budget_max">Budget max optional</Label>
                <Input
                  id="budget_max"
                  name="budget_max"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="3500"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="contact_preference">Contact preference</Label>
              <select
                id="contact_preference"
                name="contact_preference"
                defaultValue="Email"
                className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option>Email</option>
                <option>Phone</option>
                <option>Text</option>
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="photo_notes">Photos optional</Label>
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-background text-muted-foreground">
                    <ImagePlus className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Share photo details</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Photo uploads are not available yet. Describe any photos
                      or files you can share with your contractor later.
                    </p>
                    <textarea
                      id="photo_notes"
                      name="photo_notes"
                      className="mt-3 min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      placeholder="Example: I have photos of the damaged tile and the access panel."
                    />
                  </div>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isPending || profileLoading}
              className="bg-ef-ocean text-white hover:bg-ef-ocean"
            >
              <Send className="size-4" />
              {isPending ? "Sending..." : "Request estimate"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
