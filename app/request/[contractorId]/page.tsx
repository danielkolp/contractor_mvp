"use client"

import { type FormEvent, useEffect, useState, useTransition } from "react"
import { use } from "react"
import {
  ArrowRight,
  CheckCircle2,
  ImagePlus,
  Loader2,
  MapPin,
  MessageSquare,
  Phone,
  User,
} from "lucide-react"

import { CONTRACTOR_TRADES } from "@/components/ui/trade-multi-select"
import { createClient } from "@/lib/supabase/client"

// ── Types ─────────────────────────────────────────────────────────────────────

type ContractorProfile = {
  company_name: string | null
  owner_name:   string | null
  trade:        string | null
  service_area: string | null
}

type SubmitResult = {
  jobRequestId:   string
  contractorName: string
  emailSent:      boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ")
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldLabel({
  htmlFor,
  children,
  optional,
}: {
  htmlFor: string
  children: React.ReactNode
  optional?: boolean
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-sm font-semibold text-gray-800"
    >
      {children}
      {optional && (
        <span className="ml-1.5 text-xs font-normal text-gray-400">optional</span>
      )}
    </label>
  )
}

const inputClass =
  "mt-1.5 block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-xs outline-none transition placeholder:text-gray-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/20"

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  )
}

// ── Confirmed screen ──────────────────────────────────────────────────────────

function ConfirmedScreen({
  contractorName,
  emailSent,
}: {
  contractorName: string
  emailSent: boolean
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-gray-900">
        Request Submitted
      </h1>
      <p className="mt-4 max-w-sm text-base leading-relaxed text-gray-500">
        Your request has been submitted to{" "}
        <span className="font-semibold text-gray-800">{contractorName}</span>.
        {emailSent
          ? " We sent a tracking link to your email — check your inbox."
          : " You'll be notified when there are updates."}
      </p>

      {emailSent && (
        <div className="mt-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800">
          <strong>Check your email</strong> for a link to track your project
          anytime — no password needed.
        </div>
      )}

      <button
        type="button"
        onClick={() => window.close()}
        className="mt-8 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-600 shadow-xs transition hover:border-gray-300 hover:bg-gray-50"
      >
        Close
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RequestPage({
  params,
}: {
  params: Promise<{ contractorId: string }>
}) {
  const { contractorId } = use(params)

  const [profile, setProfile]       = useState<ContractorProfile | null>(null)
  const [profileLoading, setLoading] = useState(true)
  const [notFound, setNotFound]     = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [result, setResult]         = useState<SubmitResult | null>(null)
  const [isPending, startTransition] = useTransition()

  // Load contractor profile so we can show their name + trades.
  useEffect(() => {
    const supabase = createClient()
    void (async () => {
      const { data, error: rpcError } = await supabase.rpc("contractor_public_profile", {
        contractor_user_id: contractorId,
      })

      if (rpcError) {
        // RPC not yet deployed — still render the generic form.
        setLoading(false)
        return
      }

      if (!data || data.length === 0) {
        setNotFound(true)
      } else {
        setProfile(data[0] as ContractorProfile)
      }
      setLoading(false)
    })()
  }, [contractorId])

  // Resolve trades from contractor profile.
  const trades: string[] =
    profile?.trade
      ? profile.trade
          .split(",")
          .map((t) => t.trim())
          .filter((t) => (CONTRACTOR_TRADES as readonly string[]).includes(t))
      : []

  const contractorName =
    profile?.company_name || profile?.owner_name || null

  // ── Error states ─────────────────────────────────────────────────────────────

  if (!profileLoading && notFound) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 text-5xl">🔗</div>
        <h1 className="text-xl font-bold text-gray-900">Link not found</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          This request link does not match any active contractor. Please use the
          link your contractor shared with you.
        </p>
      </div>
    )
  }

  // ── Success screen ────────────────────────────────────────────────────────────

  if (result) {
    return (
      <ConfirmedScreen
        contractorName={result.contractorName}
        emailSent={result.emailSent}
      />
    )
  }

  // ── Form submission ───────────────────────────────────────────────────────────

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const fd = new FormData(e.currentTarget)

    const trade =
      trades.length === 1
        ? trades[0]
        : String(fd.get("trade") ?? "").trim()

    startTransition(async () => {
      try {
        const res = await fetch("/api/client-request", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            contractor_id: contractorId,
            name:          String(fd.get("name") ?? "").trim(),
            email:         String(fd.get("email") ?? "").trim(),
            phone:         String(fd.get("phone") ?? "").trim() || null,
            title:         trade || String(fd.get("title") ?? "").trim(),
            description:   String(fd.get("description") ?? "").trim(),
            location:      String(fd.get("location") ?? "").trim() || null,
            photo_notes:   String(fd.get("photo_notes") ?? "").trim() || null,
          }),
        })

        const json = (await res.json()) as
          | { success: true; jobRequestId: string; contractorName: string; emailSent: boolean }
          | { error: string }

        if (!res.ok || "error" in json) {
          setError("error" in json ? json.error : "Something went wrong. Please try again.")
          return
        }

        setResult({
          jobRequestId:   json.jobRequestId,
          contractorName: json.contractorName,
          emailSent:      json.emailSent,
        })
      } catch {
        setError("Could not reach the server. Please check your connection and try again.")
      }
    })
  }

  // ── Form UI ───────────────────────────────────────────────────────────────────

  const pageTitle = contractorName
    ? `Request an estimate from ${contractorName}`
    : "Request an estimate"

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-green-50/30 px-4 pb-16 pt-8">
      {/* Header */}
      <div className="mx-auto max-w-lg">
        <div className="mb-8 text-center">
          {profileLoading ? (
            <div className="mx-auto h-7 w-48 animate-pulse rounded-lg bg-gray-200" />
          ) : (
            <>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-green-700">
                Project Request
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                {pageTitle}
              </h1>
              <p className="mt-2 text-sm text-gray-500">
                Fill out the form below and you'll receive a tracking link by email.
              </p>
            </>
          )}
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-md sm:p-8">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && <ErrorMessage message={error} />}

            {/* Contact info */}
            <div className="space-y-1">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400">
                <User className="h-3.5 w-3.5" />
                Your info
              </h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="name">Full Name</FieldLabel>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Jane Smith"
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel htmlFor="phone">Phone Number</FieldLabel>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="(604) 555-0100"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="email">Email Address</FieldLabel>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="jane@example.com"
                className={inputClass}
              />
              <p className="mt-1.5 text-xs text-gray-400">
                Your tracking link will be sent here.
              </p>
            </div>

            {/* Divider */}
            <div className="my-2 border-t border-gray-100" />

            {/* Project info */}
            <div className="space-y-1">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400">
                <MessageSquare className="h-3.5 w-3.5" />
                Project details
              </h2>
            </div>

            {/* Trade selector — hidden when contractor has exactly one trade */}
            {trades.length !== 1 ? (
              <div>
                <FieldLabel htmlFor="trade">Type of work</FieldLabel>
                <select
                  id="trade"
                  name="trade"
                  required
                  defaultValue=""
                  className={cn(
                    inputClass,
                    "appearance-none cursor-pointer"
                  )}
                >
                  <option value="" disabled>
                    Select a trade…
                  </option>
                  {(trades.length > 1 ? trades : CONTRACTOR_TRADES).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <input type="hidden" name="trade" value={trades[0]} />
            )}

            <div>
              <FieldLabel htmlFor="description">Project Description</FieldLabel>
              <textarea
                id="description"
                name="description"
                required
                rows={5}
                placeholder="Describe the work you need done — include any measurements, materials, timeline, or other details that will help your contractor prepare an accurate estimate."
                className={cn(inputClass, "resize-y")}
              />
            </div>

            <div>
              <FieldLabel htmlFor="location" optional>
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-gray-400" />
                  City or neighborhood
                </span>
              </FieldLabel>
              <input
                id="location"
                name="location"
                type="text"
                placeholder="Vancouver, BC"
                className={inputClass}
              />
            </div>

            {/* Photo notes */}
            <div>
              <FieldLabel htmlFor="photo_notes" optional>
                <span className="flex items-center gap-1.5">
                  <ImagePlus className="h-3.5 w-3.5 text-gray-400" />
                  Photos
                </span>
              </FieldLabel>
              <div className="mt-1.5 rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-4">
                <p className="mb-2 text-xs text-gray-400">
                  Photo uploads are coming soon. Describe any photos you can share
                  with your contractor later.
                </p>
                <textarea
                  id="photo_notes"
                  name="photo_notes"
                  rows={2}
                  placeholder="e.g. I have photos of the damaged area I can send."
                  className={cn(inputClass, "resize-none bg-white")}
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isPending || profileLoading}
              className={cn(
                "mt-2 flex w-full items-center justify-center gap-2.5 rounded-xl px-6 py-3.5",
                "bg-green-700 text-sm font-semibold text-white shadow-sm",
                "transition hover:bg-green-800 active:scale-[0.99]",
                "disabled:cursor-not-allowed disabled:opacity-60"
              )}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  Submit Request
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-gray-400">
          By submitting, a project tracking account is created for your email
          address. No password required.
        </p>
      </div>
    </div>
  )
}
