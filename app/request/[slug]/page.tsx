"use client"

import { type FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { use } from "react"
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  MapPin,
  MessageSquare,
  Unlink,
  Upload,
  User,
  X,
} from "lucide-react"

import { CONTRACTOR_TRADES } from "@/components/ui/trade-multi-select"
import { createClient } from "@/lib/supabase/client"

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

type ContactOption = "Text" | "Call" | "Email"

const CONTACT_OPTIONS: ContactOption[] = ["Text", "Call", "Email"]

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ")
}

// â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  "mt-1.5 block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-xs outline-none transition placeholder:text-gray-400 focus:border-ef-sky focus:ring-2 focus:ring-ef-sky/20"

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  )
}

// â”€â”€ Confirmed screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ContactPreference({
  value,
  onChange,
}: {
  value: ContactOption
  onChange: (value: ContactOption) => void
}) {
  return (
    <div id="contact_preference" className="mt-1.5 flex overflow-hidden rounded-xl border border-gray-200">
      {CONTACT_OPTIONS.map((option, index) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            "flex-1 py-3 text-sm font-medium transition",
            index > 0 && "border-l border-gray-200",
            value === option
              ? "bg-ef-ocean text-white"
              : "bg-white text-gray-600 hover:bg-ef-mist/40"
          )}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

function PhotoThumbnail({ file, onRemove }: { file: File; onRemove: () => void }) {
  const url = useMemo(() => URL.createObjectURL(file), [file])

  useEffect(() => () => URL.revokeObjectURL(url), [url])

  return (
    <div className="relative aspect-square">
      <img
        src={url}
        alt={file.name}
        className="h-full w-full rounded-xl border border-gray-200 object-cover"
      />
      <button
        type="button"
        onClick={onRemove}
        className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-ef-ink text-white shadow-sm"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

function PhotoUpload({
  files,
  onChange,
}: {
  files: File[]
  onChange: (files: File[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? [])
    onChange([...files, ...selected].slice(0, 6))
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <div className="mt-1.5 space-y-3">
      {files.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {files.map((file, index) => (
            <PhotoThumbnail
              key={`${file.name}-${index}`}
              file={file}
              onRemove={() => onChange(files.filter((_, itemIndex) => itemIndex !== index))}
            />
          ))}
        </div>
      )}
      {files.length < 6 && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ef-200 bg-ef-mist/30 py-4 text-sm font-medium text-ef-ocean transition hover:border-ef-sky hover:bg-ef-mist/60"
        >
          <Upload className="size-4" />
          {files.length === 0 ? "Add photos" : "Add more"}
          <span className="text-xs text-gray-400">({files.length}/6)</span>
        </button>
      )}
      <input
        ref={inputRef}
        id="photos"
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}

function ConfirmedScreen({
  contractorName,
  emailSent,
}: {
  contractorName: string
  emailSent: boolean
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-ef-mist">
        <CheckCircle2 className="h-10 w-10 text-ef-ocean" />
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-gray-900">
        Request submitted
      </h1>
      <p className="mt-4 max-w-sm text-base leading-relaxed text-gray-500">
        Your request has been submitted to{" "}
        <span className="font-semibold text-gray-800">{contractorName}</span>.
        {emailSent
          ? " We sent a tracking link to your email â€” check your inbox."
          : " You'll be notified when there are updates."}
      </p>

      {emailSent && (
        <div className="mt-6 rounded-xl border border-ef-200 bg-ef-mist px-5 py-4 text-sm text-ef-ocean">
          <strong>Check your email</strong> for a link to track your project
          anytime â€” no password needed.
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

// â”€â”€ Main page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function RequestPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)

  const [profile, setProfile]        = useState<ContractorProfile | null>(null)
  const [profileLoading, setLoading] = useState(true)
  const [notFound, setNotFound]      = useState(false)
  const [error, setError]            = useState<string | null>(null)
  const [result, setResult]          = useState<SubmitResult | null>(null)
  const [isPending, startTransition] = useTransition()
  const [contactPref, setContactPref] = useState<ContactOption>("Email")
  const [photoFiles, setPhotoFiles]  = useState<File[]>([])

  useEffect(() => {
    const supabase = createClient()
    void (async () => {
      const { data, error: rpcError } = await supabase.rpc("contractor_profile_by_slug", {
        slug,
      })

      if (rpcError) {
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
  }, [slug])

  const trades: string[] =
    profile?.trade
      ? profile.trade
          .split(",")
          .map((t) => t.trim())
          .filter((t) => (CONTRACTOR_TRADES as readonly string[]).includes(t))
      : []

  const contractorName = profile?.company_name || profile?.owner_name || null

  if (!profileLoading && notFound) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-ef-mist text-ef-ocean">
          <Unlink className="size-6" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Link not found</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          This request link does not match any active contractor. Please use the
          link your contractor shared with you.
        </p>
      </div>
    )
  }

  if (result) {
    return (
      <ConfirmedScreen
        contractorName={result.contractorName}
        emailSent={result.emailSent}
      />
    )
  }

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
        let photoUrls: string[] = []

        if (photoFiles.length > 0) {
          const supabase = createClient()
          const results = await Promise.all(
            photoFiles.map(async (file) => {
              const ext = file.name.split(".").pop() ?? "jpg"
              const path = `${slug}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
              const { error: uploadError } = await supabase.storage
                .from("job-request-photos")
                .upload(path, file, { contentType: file.type })

              if (uploadError) return null

              const { data } = supabase.storage
                .from("job-request-photos")
                .getPublicUrl(path)

              return data.publicUrl
            })
          )

          photoUrls = results.filter((url): url is string => url !== null)
        }

        const res = await fetch("/api/client-request", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            request_slug:       slug,
            name:               String(fd.get("name") ?? "").trim(),
            email:              String(fd.get("email") ?? "").trim(),
            phone:              String(fd.get("phone") ?? "").trim() || null,
            title:              trade || String(fd.get("title") ?? "").trim(),
            description:        String(fd.get("description") ?? "").trim(),
            address_street:     String(fd.get("address_street") ?? "").trim() || null,
            location:           String(fd.get("city") ?? "").trim() || null,
            contact_preference: contactPref,
            photo_notes:        String(fd.get("photo_notes") ?? "").trim() || null,
            photo_urls:         photoUrls,
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

  const pageTitle = contractorName
    ? `Request an estimate from ${contractorName}`
    : "Request an estimate"

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-ef-mist/30 px-4 pb-16 pt-8">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 text-center">
          {profileLoading ? (
            <div className="mx-auto h-7 w-48 animate-pulse rounded-lg bg-gray-200" />
          ) : (
            <>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-ef-200 bg-ef-mist px-3 py-1 text-xs font-semibold uppercase tracking-widest text-ef-ocean">
                Project request
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                {pageTitle}
              </h1>
              <p className="mt-2 text-sm text-gray-500">
                Fill out the form below and you&apos;ll receive a tracking link by email.
              </p>
            </>
          )}
        </div>

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
                <FieldLabel htmlFor="name">Full name</FieldLabel>
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
                <FieldLabel htmlFor="phone" optional>Phone number</FieldLabel>
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
              <FieldLabel htmlFor="email">Email address</FieldLabel>
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

            <div>
              <FieldLabel htmlFor="contact_preference">Preferred contact method</FieldLabel>
              <ContactPreference value={contactPref} onChange={setContactPref} />
            </div>

            <div className="my-2 border-t border-gray-100" />

            {/* Project info */}
            <div className="space-y-1">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400">
                <MessageSquare className="h-3.5 w-3.5" />
                Project details
              </h2>
            </div>

            {trades.length !== 1 ? (
              <div>
                <FieldLabel htmlFor="trade">Type of work</FieldLabel>
                <select
                  id="trade"
                  name="trade"
                  required
                  defaultValue=""
                  className={cn(inputClass, "appearance-none cursor-pointer")}
                >
                  <option value="" disabled>Select a trade...</option>
                  {(trades.length > 1 ? trades : CONTRACTOR_TRADES).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            ) : (
              <input type="hidden" name="trade" value={trades[0]} />
            )}

            <div>
              <FieldLabel htmlFor="description">Project description</FieldLabel>
              <textarea
                id="description"
                name="description"
                required
                rows={5}
                placeholder="Describe the work you need done â€” include any measurements, materials, timeline, or other details that will help your contractor prepare an accurate estimate."
                className={cn(inputClass, "resize-y")}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="address_street" optional>
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-gray-400" />
                    Street address
                  </span>
                </FieldLabel>
                <input
                  id="address_street"
                  name="address_street"
                  type="text"
                  autoComplete="street-address"
                  placeholder="123 Main St"
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel htmlFor="city" optional>City</FieldLabel>
                <input
                  id="city"
                  name="city"
                  type="text"
                  autoComplete="address-level2"
                  placeholder="Vancouver, BC"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="photos" optional>Photos</FieldLabel>
              <p className="mt-1 text-xs text-gray-400">
                Up to 6 photos. Helps your contractor prepare a more accurate estimate.
              </p>
              <PhotoUpload files={photoFiles} onChange={setPhotoFiles} />
            </div>

            <div>
              <FieldLabel htmlFor="photo_notes" optional>Additional notes</FieldLabel>
              <textarea
                id="photo_notes"
                name="photo_notes"
                rows={2}
                placeholder="Anything else your contractor should know â€” reference photos, access instructions, materials on hand, etc."
                className={cn(inputClass, "resize-none")}
              />
            </div>

            <button
              type="submit"
              disabled={isPending || profileLoading}
              className={cn(
                "mt-2 flex w-full items-center justify-center gap-2.5 rounded-xl px-6 py-3.5",
                "bg-ef-ocean text-sm font-semibold text-white shadow-sm",
                "transition hover:bg-ef-ocean active:scale-[0.99]",
                "disabled:cursor-not-allowed disabled:opacity-60"
              )}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  Submit request
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
