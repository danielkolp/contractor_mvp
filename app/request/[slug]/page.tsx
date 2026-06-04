"use client"

import { type FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { use } from "react"
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Copy,
  HardHat,
  Loader2,
  MapPin,
  MessageSquare,
  Unlink,
  Upload,
  User,
  X,
} from "lucide-react"

import { CONTRACTOR_TRADES } from "@/components/ui/trade-multi-select"
import {
  INPUT_LIMITS,
  emailField,
  inputErrorMessage,
  optionalPhoneField,
  optionalTextField,
  requestSlugField,
  textField,
} from "@/lib/security/input"
import { createClient } from "@/lib/supabase/client"

// ── Types ─────────────────────────────────────────────────────────────────────

type ContractorProfile = {
  company_name: string | null
  owner_name:   string | null
  trade:        string | null
  service_area: string | null
}

type SubmitResult = {
  jobRequestId:         string
  contractorName:       string
  emailSent:            boolean
  clientAccountCreated: boolean
  fallbackGuestToken?:  string
  projectTitle:         string
  submittedAt:          string
  email:                string
}

type ContactOption = "Text" | "Call" | "Email"

const CONTACT_OPTIONS: ContactOption[] = ["Text", "Call", "Email"]
const MAX_PHOTOS = 6
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp"

// ── Helpers ───────────────────────────────────────────────────────────────────

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ")
}

function validatePhotoFiles(files: File[]) {
  if (files.length > MAX_PHOTOS) {
    return `Add up to ${MAX_PHOTOS} photos.`
  }

  const invalidType = files.find((file) => !ALLOWED_PHOTO_TYPES.has(file.type))
  if (invalidType) {
    return "Photos must be JPEG, PNG, or WebP images."
  }

  const oversized = files.find((file) => file.size > MAX_PHOTO_SIZE_BYTES)
  if (oversized) {
    return "Each photo must be 5MB or smaller."
  }

  return null
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
    <label htmlFor={htmlFor} className="block text-sm font-semibold text-gray-800">
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

// ── Post-submit screen ────────────────────────────────────────────────────────

const WHAT_NEXT = [
  "Your contractor reviews the request.",
  "If it's a fit, they send you an estimate.",
  "You can accept, decline, or pay from your private link.",
]

function PostSubmitScreen({
  contractorName,
  emailSent,
  fallbackGuestToken,
  submittedAt,
  projectTitle,
  email,
  jobRequestId,
}: {
  contractorName:       string
  emailSent:            boolean
  fallbackGuestToken?:  string
  submittedAt:          string
  projectTitle:         string
  email:                string
  jobRequestId:         string
}) {
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [guestLink,   setGuestLink]   = useState<string | null>(null)
  const [copiedLink,  setCopiedLink]  = useState(false)

  useEffect(() => {
    if (fallbackGuestToken) {
      setGuestLink(`${window.location.origin}/guest/project/${fallbackGuestToken}`)
    }
  }, [fallbackGuestToken])

  async function handleResend() {
    if (resendState === "sending" || resendState === "sent") return
    setResendState("sending")
    try {
      const { createClient } = await import("@/lib/supabase/client")
      const supabase = createClient()
      const redirectTo = `${window.location.origin}/auth/callback?next=/client/portal/${jobRequestId}`
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      })
      setResendState(error ? "error" : "sent")
    } catch {
      setResendState("error")
    }
  }

  return (
    <div data-testid="request-confirmed" className="force-light min-h-screen bg-gradient-to-b from-[#f6f5f2] via-[#faf9f7] to-ef-mist/40 px-4 pb-16 pt-12">
      <div className="mx-auto max-w-lg space-y-5">

        {/* Check + headline */}
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-ef-mist">
            <CheckCircle2 className="h-8 w-8 text-ef-ocean" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            Request submitted
          </h1>
          {emailSent ? (
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              We emailed you a private link to track this job, review estimates, and pay securely.{" "}
              <span className="font-medium text-gray-700">No password needed.</span>
            </p>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              Your request was submitted, but we could not send the tracking email. Use the
              login page with this same email address to request a new secure link.
            </p>
          )}
        </div>

        {/* Email action card */}
        <div className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-md">
          {emailSent ? (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ef-mist">
                  <MessageSquare className="h-5 w-5 text-ef-ocean" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Check your email</p>
                  <p className="text-xs text-gray-500">{email}</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-gray-500">
                Your private Euroflo link is waiting in your inbox. Click it to track the job — no
                account creation needed.
              </p>
              <div className="mt-4 border-t border-gray-100 pt-4">
                {resendState === "sent" ? (
                  <p className="text-center text-xs text-ef-ocean">
                    Login link sent — check your email.
                  </p>
                ) : resendState === "error" ? (
                  <p className="text-center text-xs text-red-600">
                    Could not send the link. Try the{" "}
                    <a href="/login" className="underline">login page</a>.
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={resendState === "sending"}
                    onClick={() => void handleResend()}
                    className="w-full rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 shadow-xs transition hover:bg-gray-50 disabled:opacity-60"
                  >
                    {resendState === "sending" ? "Sending…" : "Send login link again"}
                  </button>
                )}
              </div>
            </>
          ) : (
            <a
              href="/login"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-ef-ocean px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ef-ocean active:scale-[0.99]"
            >
              Go to login
              <ArrowRight className="h-4 w-4" />
            </a>
          )}
        </div>

        {/* Project summary card */}
        <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
            Your request
          </p>

          <div className="mt-3 space-y-2.5">
            <div className="flex items-start gap-3">
              <HardHat className="mt-0.5 h-4 w-4 shrink-0 text-ef-ocean" />
              <div>
                <p className="text-xs text-gray-400">Project</p>
                <p className="text-sm font-semibold text-gray-900">{projectTitle}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-ef-ocean" />
              <div>
                <p className="text-xs text-gray-400">Contractor</p>
                <p className="text-sm font-semibold text-gray-900">{contractorName}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-ef-ocean" />
              <div>
                <p className="text-xs text-gray-400">Submitted</p>
                <p className="text-sm font-semibold text-gray-900">{submittedAt}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-ef-200 bg-ef-mist/60 p-3.5">
            <p className="text-xs font-semibold text-ef-ocean">What happens next</p>
            <ol className="mt-2 space-y-1.5">
              {WHAT_NEXT.map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-gray-600">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ef-ocean text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Bookmarkable portal link — always shown when token exists */}
        {guestLink && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
              Your portal link
            </p>
            <p className="mt-2 text-xs leading-relaxed text-gray-500">
              Copy or bookmark this link to access your job portal at any time — no sign-in needed.
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
              <span className="flex-1 truncate text-xs text-gray-600 select-all">{guestLink}</span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(guestLink).then(() => {
                    setCopiedLink(true)
                    setTimeout(() => setCopiedLink(false), 2000)
                  })
                }}
                className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-xs transition hover:bg-gray-100 active:scale-95 flex items-center gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" />
                {copiedLink ? "Copied!" : "Copy"}
              </button>
            </div>
            <a
              href={guestLink}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 shadow-xs transition hover:bg-gray-50"
            >
              Open portal
            </a>
          </div>
        )}

        <p className="text-center text-xs text-gray-400">
          Use your email anytime to sign back in. We&apos;ll send a fresh login link.
        </p>

      </div>
    </div>
  )
}

// ── Contact preference ────────────────────────────────────────────────────────

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
          data-testid={`request-contact-${option.toLowerCase()}`}
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
    <div className="relative aspect-square" data-testid="request-photo-thumbnail">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={file.name}
        className="h-full w-full rounded-xl border border-gray-200 object-cover"
      />
      <button
        type="button"
        aria-label={`Remove ${file.name}`}
        onClick={onRemove}
        className="absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full bg-ef-ink text-white shadow-md ring-2 ring-white transition active:scale-95"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

function PhotoUpload({
  files,
  onChange,
  onError,
}: {
  files: File[]
  onChange: (files: File[]) => void
  onError: (message: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? [])
    const nextFiles = [...files, ...selected]
    const validationError = validatePhotoFiles(nextFiles)

    if (validationError) {
      onError(validationError)
      if (inputRef.current) inputRef.current.value = ""
      return
    }

    onError(null)
    onChange(nextFiles)
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
      {files.length < MAX_PHOTOS && (
        <button
          type="button"
          data-testid="request-add-photos"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ef-200 bg-ef-mist/30 py-4 text-sm font-medium text-ef-ocean transition hover:border-ef-sky hover:bg-ef-mist/60"
        >
          <Upload className="size-4" />
          {files.length === 0 ? "Add photos" : "Add more"}
          <span className="text-xs text-gray-400">({files.length}/{MAX_PHOTOS})</span>
        </button>
      )}
      <input
        ref={inputRef}
        id="photos"
        data-testid="request-photo-input"
        type="file"
        accept={PHOTO_ACCEPT}
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RequestPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)

  const [profile,      setProfile]      = useState<ContractorProfile | null>(null)
  const [profileLoading, setLoading]    = useState(true)
  const [notFound,     setNotFound]     = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [result,       setResult]       = useState<SubmitResult | null>(null)
  const [isPending,    startTransition] = useTransition()
  const [contactPref,  setContactPref]  = useState<ContactOption>("Email")
  const [photoFiles,   setPhotoFiles]   = useState<File[]>([])

  useEffect(() => {
    let safeSlug: string
    try {
      safeSlug = requestSlugField(slug)
    } catch {
      setNotFound(true)
      setLoading(false)
      return
    }

    const supabase = createClient()
    void (async () => {
      const { data, error: rpcError } = await supabase.rpc("contractor_profile_by_slug", { slug: safeSlug })

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
      <PostSubmitScreen
        contractorName={result.contractorName}
        emailSent={result.emailSent}
        fallbackGuestToken={result.fallbackGuestToken}
        projectTitle={result.projectTitle}
        submittedAt={result.submittedAt}
        email={result.email}
        jobRequestId={result.jobRequestId}
      />
    )
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const validationError = validatePhotoFiles(photoFiles)
    if (validationError) {
      setError(validationError)
      return
    }

    const fd = new FormData(e.currentTarget)

    const trade =
      trades.length === 1
        ? trades[0]
        : String(fd.get("trade") ?? "").trim()

    let safeSlug: string
    let name: string
    let email: string
    let phone: string | null
    let title: string
    let description: string
    let addressStreet: string | null
    let location: string
    let photoNotes: string | null

    try {
      safeSlug = requestSlugField(slug)
      name = textField(fd.get("name"), "Full name", {
        required: true,
        maxLength: INPUT_LIMITS.name,
      })
      email = emailField(fd.get("email"))
      phone = optionalPhoneField(fd.get("phone"))
      title = textField(fd.get("title"), "Job title", {
        required: true,
        maxLength: INPUT_LIMITS.title,
      })
      description = textField(fd.get("description"), "Description", {
        required: true,
        maxLength: INPUT_LIMITS.description,
        multiline: true,
      })
      addressStreet = optionalTextField(fd.get("address_street"), "Street address", {
        maxLength: INPUT_LIMITS.mediumText,
      })
      location = textField(fd.get("city") ?? "", "City", {
        required: false,
        maxLength: INPUT_LIMITS.serviceArea,
      })
      photoNotes = optionalTextField(fd.get("photo_notes"), "Additional notes", {
        maxLength: INPUT_LIMITS.notes,
        multiline: true,
      })
    } catch (validationError) {
      setError(inputErrorMessage(validationError))
      return
    }

    startTransition(async () => {
      try {
        const payload = new FormData()
        payload.append("request_slug",     safeSlug)
        payload.append("name",             name)
        payload.append("email",            email)
        payload.append("phone",            phone ?? "")
        payload.append("title",            title)
        payload.append("trade",            trade)
        payload.append("description",      description)
        payload.append("address_street",   addressStreet ?? "")
        payload.append("location",         location)
        payload.append("contact_preference", contactPref)
        payload.append("photo_notes",      photoNotes ?? "")
        photoFiles.forEach((file) => payload.append("photos", file))

        const res = await fetch("/api/client-request", {
          method: "POST",
          body:   payload,
        })

        const json = (await res.json()) as
          | { success: true; jobRequestId: string; contractorName: string; emailSent: boolean; clientAccountCreated: boolean; fallbackGuestToken?: string }
          | { error: string }

        if (!res.ok || "error" in json) {
          setError("error" in json ? json.error : "Something went wrong. Please try again.")
          return
        }

        setResult({
          jobRequestId:         json.jobRequestId,
          contractorName:       json.contractorName,
          emailSent:            json.emailSent,
          clientAccountCreated: json.clientAccountCreated,
          fallbackGuestToken:   json.fallbackGuestToken,
          projectTitle:         title,
          submittedAt:          new Date().toLocaleDateString("en-CA", {
            month: "long",
            day:   "numeric",
            year:  "numeric",
          }),
          email,
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
    <div className="force-light min-h-screen bg-gradient-to-b from-[#f6f5f2] via-[#faf9f7] to-ef-mist/40 px-4 pb-16 pt-8">
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
          <form className="space-y-5" onSubmit={handleSubmit} data-testid="request-form">
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

            <div>
              <FieldLabel htmlFor="title">Job title</FieldLabel>
              <input
                id="title"
                name="title"
                type="text"
                required
                maxLength={INPUT_LIMITS.title}
                data-testid="request-title-input"
                placeholder="e.g. Leaky kitchen sink"
                className={inputClass}
              />
              <p className="mt-1.5 text-xs text-gray-400">
                A short summary so your contractor can tell jobs apart at a glance.
              </p>
            </div>

            {trades.length !== 1 ? (
              <div>
                <FieldLabel htmlFor="trade">Type of work</FieldLabel>
                <select
                  id="trade"
                  name="trade"
                  data-testid="request-trade-select"
                  required
                  defaultValue=""
                  className={cn(inputClass, "appearance-none cursor-pointer")}
                >
                  <option value="" disabled>Select a trade...</option>
                  {(trades.length > 1 ? trades : CONTRACTOR_TRADES).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                  <option value="Something else">Something else / not sure</option>
                </select>
              </div>
            ) : (
              <input
                type="hidden"
                name="trade"
                value={trades[0]}
                data-testid="request-trade-hidden"
              />
            )}

            <div>
              <FieldLabel htmlFor="description">Project description</FieldLabel>
              <textarea
                id="description"
                name="description"
                required
                rows={5}
                placeholder="Describe the work you need done. A sentence or two is fine to start — add measurements, materials, or timing if you have them."
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
              <PhotoUpload
                files={photoFiles}
                onChange={setPhotoFiles}
                onError={setError}
              />
            </div>

            <div>
              <FieldLabel htmlFor="photo_notes" optional>Additional notes</FieldLabel>
              <textarea
                id="photo_notes"
                name="photo_notes"
                rows={2}
                placeholder="Anything else your contractor should know — reference photos, access instructions, materials on hand, etc."
                className={cn(inputClass, "resize-none")}
              />
            </div>

            <button
              type="submit"
              data-testid="request-submit-button"
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
          We&apos;ll email you a private link to track this job. No password, no
          account to manage.
        </p>
      </div>
    </div>
  )
}
