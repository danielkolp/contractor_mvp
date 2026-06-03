import { randomUUID } from "crypto"
import { type NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"

import {
  renderClientIntakeEmailHtml,
  renderClientIntakeEmailText,
} from "@/lib/email/client-intake-template"
import { createGuestAccess } from "@/lib/guest-access"
import {
  INPUT_LIMITS,
  emailField,
  enumField,
  inputErrorMessage,
  optionalPhoneField,
  optionalTextField,
  optionalUrlField,
  requestSlugField,
  textField,
} from "@/lib/security/input"
import { createServiceClient } from "@/lib/supabase/service"

// Reuse across requests when env is present.
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

function getAppUrl(req: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  const url = new URL(req.url)
  return `${url.protocol}//${url.host}`
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const CONTACT_OPTIONS = ["Text", "Call", "Email"] as const
const PHOTO_BUCKET = "job-request-photos"
const MAX_PHOTOS = 6
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const PHOTO_UPLOAD_ERROR =
  "Your request was not submitted because one or more photos failed to upload. Please try again or remove the photos."

type ParsedClientRequest = {
  name: string
  email: string
  phone: string | null
  title: string
  description: string
  location: string
  requestSlug: string
  addressStreet: string | null
  photoNotes: string | null
  contactPreference: string
  photoUrls: string[]
  photos: File[]
}

function contactPreferenceFrom(value: unknown) {
  return value === undefined || value === null || value === ""
    ? "Email"
    : enumField(value, "Contact preference", CONTACT_OPTIONS)
}

function getStringField(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function isUploadFile(value: FormDataEntryValue): value is File {
  return value instanceof File && value.size > 0
}

function parseJsonBody(body: Record<string, unknown>): ParsedClientRequest {
  const requestSlug = requestSlugField(body.request_slug ?? body.contractor_id)

  return {
    name: textField(body.name, "Full name", {
      required: true,
      maxLength: INPUT_LIMITS.name,
    }),
    email: emailField(body.email),
    phone: optionalPhoneField(body.phone),
    title: textField(body.title, "Project type", {
      required: true,
      maxLength: INPUT_LIMITS.title,
    }),
    description: textField(body.description, "Description", {
      required: true,
      maxLength: INPUT_LIMITS.description,
      multiline: true,
    }),
    location: textField(body.location ?? "Not specified", "Location", {
      required: false,
      maxLength: INPUT_LIMITS.serviceArea,
    }),
    requestSlug,
    addressStreet:
      optionalTextField(body.address_street, "Street address", {
        maxLength: INPUT_LIMITS.mediumText,
      }),
    photoNotes: optionalTextField(body.photo_notes, "Photo notes", {
      maxLength: INPUT_LIMITS.notes,
      multiline: true,
    }),
    contactPreference: contactPreferenceFrom(body.contact_preference),
    photoUrls: Array.isArray(body.photo_urls)
      ? body.photo_urls
          .filter((url): url is string => typeof url === "string" && url.trim().length > 0)
          .slice(0, MAX_PHOTOS)
          .map((url) => optionalUrlField(url, "Photo URL"))
          .filter((url): url is string => Boolean(url))
      : [],
    photos: [],
  }
}

function parseFormBody(formData: FormData): ParsedClientRequest {
  const location = getStringField(formData, "location") || getStringField(formData, "city")
  const requestSlug =
    getStringField(formData, "request_slug") || getStringField(formData, "contractor_id")

  return {
    name: textField(getStringField(formData, "name"), "Full name", {
      required: true,
      maxLength: INPUT_LIMITS.name,
    }),
    email: emailField(getStringField(formData, "email")),
    phone: optionalPhoneField(getStringField(formData, "phone")),
    title: textField(getStringField(formData, "title"), "Project type", {
      required: true,
      maxLength: INPUT_LIMITS.title,
    }),
    description: textField(getStringField(formData, "description"), "Description", {
      required: true,
      maxLength: INPUT_LIMITS.description,
      multiline: true,
    }),
    location: textField(location || "Not specified", "Location", {
      required: false,
      maxLength: INPUT_LIMITS.serviceArea,
    }),
    requestSlug: requestSlugField(requestSlug),
    addressStreet: optionalTextField(getStringField(formData, "address_street"), "Street address", {
      maxLength: INPUT_LIMITS.mediumText,
    }),
    photoNotes: optionalTextField(getStringField(formData, "photo_notes"), "Photo notes", {
      maxLength: INPUT_LIMITS.notes,
      multiline: true,
    }),
    contactPreference: contactPreferenceFrom(getStringField(formData, "contact_preference")),
    photoUrls: [],
    photos: formData.getAll("photos").filter(isUploadFile),
  }
}

function validatePhotos(photos: File[]) {
  if (photos.length > MAX_PHOTOS) {
    return `Upload up to ${MAX_PHOTOS} photos.`
  }

  if (photos.some((photo) => !ALLOWED_PHOTO_TYPES.has(photo.type))) {
    return "Photos must be JPEG, PNG, or WebP images."
  }

  if (photos.some((photo) => photo.size > MAX_PHOTO_SIZE_BYTES)) {
    return "Each photo must be 5MB or smaller."
  }

  return null
}

function extensionForPhoto(photo: File) {
  if (photo.type === "image/png") return "png"
  if (photo.type === "image/webp") return "webp"
  return "jpg"
}

function storageFolderForRequestSlug(requestSlug: string) {
  return (
    requestSlug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "job-temp"
  )
}

async function uploadPhotos(
  supabase: ReturnType<typeof createServiceClient>,
  photos: File[],
  requestSlug: string
) {
  const folder = storageFolderForRequestSlug(requestSlug)
  const photoUrls: string[] = []

  for (const photo of photos) {
    const ext = extensionForPhoto(photo)
    const path = `${folder}/${Date.now()}-${randomUUID()}.${ext}`
    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, await photo.arrayBuffer(), {
        contentType: photo.type,
        cacheControl: "31536000",
        upsert: false,
      })

    if (error) {
      throw error
    }

    const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
    photoUrls.push(data.publicUrl)
  }

  return photoUrls
}

export async function POST(req: NextRequest) {
  // ── Parse body ──────────────────────────────────────────────────────────────
  let parsed: ParsedClientRequest
  const contentType = req.headers.get("content-type") ?? ""

  try {
    if (contentType.includes("multipart/form-data")) {
      parsed = parseFormBody(await req.formData())
    } else {
      parsed = parseJsonBody((await req.json()) as Record<string, unknown>)
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: inputErrorMessage(error, contentType.includes("multipart/form-data")
          ? "Invalid form body"
          : "Invalid JSON body"),
      },
      { status: 400 }
    )
  }

  const {
    name,
    email,
    phone,
    title,
    description,
    location,
    requestSlug,
    addressStreet,
    photoNotes,
    contactPreference,
    photos,
  } = parsed

  const photoValidationError = validatePhotos(photos)
  if (photoValidationError) {
    return NextResponse.json({ error: photoValidationError }, { status: 400 })
  }

  const supabase = createServiceClient()
  const appUrl   = getAppUrl(req)

  // ── 1. Resolve contractor by request_slug ──────────────────────────────────
  let { data: contractorProfile } = await supabase
    .from("profiles")
    .select("user_id, owner_name, company_name")
    .eq("request_slug", requestSlug)
    .eq("role", "contractor")
    .maybeSingle()

  // Old public request links used the contractor UUID in this route segment.
  if (!contractorProfile && UUID_PATTERN.test(requestSlug)) {
    const { data: contractorById } = await supabase
      .from("profiles")
      .select("user_id, owner_name, company_name")
      .eq("user_id", requestSlug)
      .eq("role", "contractor")
      .maybeSingle()

    contractorProfile = contractorById
  }

  if (!contractorProfile) {
    return NextResponse.json({ error: "Contractor not found" }, { status: 404 })
  }

  const contractorName =
    contractorProfile.company_name ||
    contractorProfile.owner_name ||
    "Your contractor"

  let photoUrls = parsed.photoUrls
  if (photos.length > 0) {
    try {
      photoUrls = await uploadPhotos(supabase, photos, requestSlug)
    } catch (uploadError) {
      console.error("[client-request] photo upload error:", uploadError)
      return NextResponse.json({ error: PHOTO_UPLOAD_ERROR }, { status: 500 })
    }
  }

  // ── 2. Find or create client auth account ───────────────────────────────────
  let clientUserId: string
  let clientAccountCreated = false

  const { data: existingId } = await supabase.rpc("get_auth_user_id_by_email", {
    lookup_email: email,
  }) as { data: string | null }

  if (existingId) {
    clientUserId = existingId

    // Only update profile if the existing user is not a contractor — never
    // overwrite a contractor's role when their email is used on a request form.
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", clientUserId)
      .maybeSingle()

    if (!existingProfile || existingProfile.role !== "contractor") {
      await supabase
        .from("profiles")
        .update({ owner_name: name, ...(phone ? { phone } : {}), role: "client" })
        .eq("user_id", clientUserId)
    }
  } else {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        role: "client",
        owner_name: name,
        ...(phone ? { phone } : {}),
      },
    })

    if (createError || !created.user) {
      console.error("[client-request] createUser error:", createError)
      return NextResponse.json(
        { error: "Could not create your account. Please try again." },
        { status: 500 }
      )
    }

    clientUserId = created.user.id
    clientAccountCreated = true

    // The DB trigger creates the profile row; update it with supplied details.
    await supabase
      .from("profiles")
      .update({ owner_name: name, ...(phone ? { phone } : {}), role: "client" })
      .eq("user_id", clientUserId)
  }

  // ── 3. Create job request ───────────────────────────────────────────────────
  const jobPayload = {
    client_id:          clientUserId,
    contractor_id:      contractorProfile.user_id,
    client_name:        name,
    client_email:       email,
    client_phone:       phone,
    title,
    description,
    photo_notes:        photoNotes,
    address_street:     addressStreet,
    photo_urls:         photoUrls,
    service_area:       location || "Not specified",
    urgency:            "flexible" as const,
    contact_preference: contactPreference,
    status:             "new" as const,
  }

  const { data: jobRequest, error: jobError } = await supabase
    .from("job_requests")
    .insert(jobPayload)
    .select()
    .single()

  if (jobError || !jobRequest) {
    console.error("[client-request] job insert error:", jobError)
    return NextResponse.json(
      { error: "Could not submit your request. Please try again." },
      { status: 500 }
    )
  }

  // ── 4. Create guest access token ────────────────────────────────────────────
  const guestToken = await createGuestAccess(supabase, jobRequest.id, email)

  // ── 5. Generate magic login link ────────────────────────────────────────────
  const redirectTo = `${appUrl}/auth/callback?next=/client/portal/${jobRequest.id}`

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  })

  if (linkError) {
    console.warn("[client-request] generateLink error:", linkError)
  }

  // Fallback to login page if magic link generation failed.
  const magicLink = linkData?.properties?.action_link ?? `${appUrl}/login`

  // ── 6. Send confirmation email ──────────────────────────────────────────────
  let emailSent = false

  if (resend && process.env.RESEND_FROM_EMAIL) {
    const emailArgs = {
      clientName: name,
      contractorName,
      projectTitle: title,
      magicLink,
    }

    const { error: sendError } = await resend.emails.send({
      from:    process.env.RESEND_FROM_EMAIL,
      to:      email,
      subject: `Track your job request with ${contractorName}`,
      html:    renderClientIntakeEmailHtml(emailArgs),
      text:    renderClientIntakeEmailText(emailArgs),
    })

    if (sendError) {
      console.warn("[client-request] email send error:", sendError)
    } else {
      emailSent = true
    }
  }

  return NextResponse.json({
    success:              true,
    jobRequestId:         jobRequest.id,
    contractorName,
    emailSent,
    clientAccountCreated,
    passwordless:         true,
    fallbackGuestToken:   guestToken ?? undefined,
  })
}
