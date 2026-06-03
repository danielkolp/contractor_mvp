export class InputValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InputValidationError"
  }
}

export const INPUT_LIMITS = {
  email: 254,
  phone: 40,
  name: 120,
  businessName: 120,
  serviceArea: 120,
  shortText: 160,
  mediumText: 240,
  url: 2048,
  title: 120,
  notes: 1000,
  description: 4000,
  message: 5000,
  invoiceNumber: 40,
  estimateNumber: 40,
  lineItemDescription: 240,
  taxName: 40,
  token: 64,
  requestSlug: 120,
} as const

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const GUEST_TOKEN_PATTERN = /^[a-f0-9]{64}$/i
const REQUEST_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,119}$/i
const PHONE_PATTERN = /^[0-9()+.\-\s]{7,40}$/
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DISALLOWED_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/

type TextOptions = {
  required?: boolean
  maxLength?: number
  multiline?: boolean
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new InputValidationError(`${label} must be text.`)
  }
  return value
}

function normalizeText(value: string, multiline: boolean) {
  const normalized = value.normalize("NFKC").replace(/\r\n?/g, "\n")
  if (DISALLOWED_CONTROL_CHARS.test(normalized)) {
    throw new InputValidationError("Input contains unsupported control characters.")
  }

  if (multiline) {
    return normalized
      .split("\n")
      .map((line) => line.trim().replace(/[ \t]+/g, " "))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  }

  return normalized.replace(/\s+/g, " ").trim()
}

export function textField(value: unknown, label: string, options: TextOptions = {}) {
  const { required = false, maxLength = INPUT_LIMITS.mediumText, multiline = false } = options
  const text = normalizeText(assertString(value, label), multiline)

  if (required && text.length === 0) {
    throw new InputValidationError(`${label} is required.`)
  }

  if (text.length > maxLength) {
    throw new InputValidationError(`${label} must be ${maxLength} characters or fewer.`)
  }

  return text
}

export function optionalTextField(
  value: unknown,
  label: string,
  options: Omit<TextOptions, "required"> = {}
) {
  if (value === undefined || value === null) return null
  const text = textField(value, label, { ...options, required: false })
  return text.length > 0 ? text : null
}

export function emailField(value: unknown, label = "Email") {
  const email = textField(value, label, {
    required: true,
    maxLength: INPUT_LIMITS.email,
  }).toLowerCase()

  if (!EMAIL_PATTERN.test(email)) {
    throw new InputValidationError(`${label} must be a valid email address.`)
  }

  return email
}

export function optionalEmailField(value: unknown, label = "Email") {
  if (value === undefined || value === null || value === "") return null
  return emailField(value, label)
}

export function phoneField(value: unknown, label = "Phone") {
  const phone = textField(value, label, {
    required: true,
    maxLength: INPUT_LIMITS.phone,
  })

  if (!PHONE_PATTERN.test(phone)) {
    throw new InputValidationError(`${label} must be a valid phone number.`)
  }

  return phone
}

export function optionalPhoneField(value: unknown, label = "Phone") {
  if (value === undefined || value === null || value === "") return null
  const phone = textField(value, label, {
    required: false,
    maxLength: INPUT_LIMITS.phone,
  })
  if (!phone) return null
  if (!PHONE_PATTERN.test(phone)) {
    throw new InputValidationError(`${label} must be a valid phone number.`)
  }
  return phone
}

export function uuidField(value: unknown, label: string) {
  const id = textField(value, label, { required: true, maxLength: 36 })
  if (!UUID_PATTERN.test(id)) {
    throw new InputValidationError(`${label} is malformed.`)
  }
  return id
}

export function optionalUuidField(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return null
  return uuidField(value, label)
}

export function guestTokenField(value: unknown, label = "guestToken") {
  const token = textField(value, label, {
    required: true,
    maxLength: INPUT_LIMITS.token,
  })
  if (!GUEST_TOKEN_PATTERN.test(token)) {
    throw new InputValidationError(`${label} is malformed.`)
  }
  return token.toLowerCase()
}

export function requestSlugField(value: unknown, label = "Contractor link") {
  const slug = textField(value, label, {
    required: true,
    maxLength: INPUT_LIMITS.requestSlug,
  })
  if (!REQUEST_SLUG_PATTERN.test(slug) && !UUID_PATTERN.test(slug)) {
    throw new InputValidationError(`${label} is malformed.`)
  }
  return slug
}

export function enumField<T extends string>(
  value: unknown,
  label: string,
  allowed: readonly T[]
): T {
  const text = textField(value, label, { required: true, maxLength: INPUT_LIMITS.shortText })
  if (!allowed.includes(text as T)) {
    throw new InputValidationError(`${label} is invalid.`)
  }
  return text as T
}

export function optionalEnumField<T extends string>(
  value: unknown,
  label: string,
  allowed: readonly T[],
  fallback: T
): T {
  if (value === undefined || value === null || value === "") return fallback
  return enumField(value, label, allowed)
}

export function isoDateField(value: unknown, label: string) {
  const date = textField(value, label, { required: true, maxLength: 10 })
  if (!ISO_DATE_PATTERN.test(date)) {
    throw new InputValidationError(`${label} must be a date string (YYYY-MM-DD).`)
  }

  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new InputValidationError(`${label} is not a valid date.`)
  }

  return date
}

export function optionalIsoDateField(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return null
  return isoDateField(value, label)
}

export function isoDateTimeField(value: unknown, label: string) {
  const text = textField(value, label, { required: true, maxLength: 40 })
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) {
    throw new InputValidationError(`${label} must be a valid date/time.`)
  }
  return date.toISOString()
}

export function optionalIsoDateTimeField(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return null
  return isoDateTimeField(value, label)
}

export function urlField(value: unknown, label = "URL") {
  const raw = textField(value, label, { required: true, maxLength: INPUT_LIMITS.url })
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new InputValidationError(`${label} must be a valid URL.`)
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new InputValidationError(`${label} must start with http:// or https://.`)
  }

  return url.toString()
}

export function optionalUrlField(value: unknown, label = "URL") {
  if (value === undefined || value === null || value === "") return null
  return urlField(value, label)
}

export function numberField(
  value: unknown,
  label: string,
  options: { min?: number; max?: number; integer?: boolean } = {}
) {
  const { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY, integer = false } = options
  const number = typeof value === "number" ? value : Number(value)

  if (!Number.isFinite(number)) {
    throw new InputValidationError(`${label} must be a valid number.`)
  }
  if (integer && !Number.isInteger(number)) {
    throw new InputValidationError(`${label} must be a whole number.`)
  }
  if (number < min || number > max) {
    throw new InputValidationError(`${label} is out of range.`)
  }

  return number
}

export function optionalNumberField(
  value: unknown,
  label: string,
  options: { min?: number; max?: number; integer?: boolean } = {}
) {
  if (value === undefined || value === null || value === "") return null
  return numberField(value, label, options)
}

export function inputErrorMessage(error: unknown, fallback = "Invalid input.") {
  return error instanceof InputValidationError ? error.message : fallback
}
