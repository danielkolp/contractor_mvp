"use client"

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  Calendar,
  Check,
  ChevronDown,
  ClipboardList,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  HelpCircle,
  Link2,
  Loader2,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/dashboard/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ContentReveal } from "@/components/ui/content-reveal"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { money } from "@/lib/format-money"
import { computePricing } from "@/lib/pricing"
import {
  FREE_FEE_CAP_CENTS,
  effectivePlan,
  transactionFeePercent,
  type PlanTier,
} from "@/lib/plans"
import {
  INPUT_LIMITS,
  InputValidationError,
  enumField,
  inputErrorMessage,
  isoDateField,
  isoDateTimeField,
  numberField,
  optionalEmailField,
  optionalIsoDateField,
  optionalPhoneField,
  optionalTextField,
  textField,
  uuidField,
} from "@/lib/security/input"
import { createClient } from "@/lib/supabase/client"
import {
  findScheduleConflicts,
  formatWorkDayRange,
  type ScheduleConflict,
  type WorkDay,
} from "@/lib/scheduling"
import type { Database } from "@/lib/supabase/database.types"

type JobRequest     = Database["public"]["Tables"]["job_requests"]["Row"]
type JobRequestUpdate = Database["public"]["Tables"]["job_requests"]["Update"]
type ClientInsert   = Database["public"]["Tables"]["clients"]["Insert"]
type EstimateRow    = Database["public"]["Tables"]["estimates"]["Row"]
type EstimateInsert = Database["public"]["Tables"]["estimates"]["Insert"]
type EstimateStatus = Database["public"]["Enums"]["estimate_status"]

type EstimateLineItem = {
  id: string
  description: string
  quantity: string
  unit_price: string
}

type EstimateTaxLine = {
  id: string
  name: string
  rate: string
}

type EstimateDraftForm = {
  clientName: string
  estimateNumber: string
  flatAmount: string
  status: EstimateStatus
  followUpDate: string
  notes: string
  lineItems: EstimateLineItem[]
  taxLines: EstimateTaxLine[]
  billingType: "flat_rate" | "hourly"
  contractorAmount: string
  depositAmount: string
}

const emptyEstimateDraftForm: EstimateDraftForm = {
  clientName: "",
  estimateNumber: "",
  flatAmount: "",
  status: "Draft",
  followUpDate: "",
  notes: "",
  lineItems: [],
  taxLines: [],
  billingType: "flat_rate",
  contractorAmount: "",
  depositAmount: "",
}

const estimateStatuses: EstimateStatus[] = [
  "Draft",
  "Sent",
  "Follow-up Needed",
  "Follow-up Sent",
  "Interested",
  "Accepted",
  "Won",
  "Declined",
  "Lost",
  "Archived",
]

const billingTypes = ["flat_rate", "hourly"] as const

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

function formatDate(value: string | null) {
  if (!value) return "Not set"
  return dateFmt.format(new Date(`${value.slice(0, 10)}T00:00:00`))
}

function inputDate(offsetDays = 0) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offsetDays)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function labelFromSlug(value: string) {
  return value
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ")
}

function budgetLabel(request: JobRequest) {
  if (request.budget_min && request.budget_max) {
    return `${money.format(request.budget_min)} - ${money.format(request.budget_max)}`
  }
  if (request.budget_min) return `From ${money.format(request.budget_min)}`
  if (request.budget_max) return `Up to ${money.format(request.budget_max)}`
  return "Budget not provided"
}

function requestWorkAddress(request: JobRequest) {
  return request.work_address || request.address_street || null
}

function requestNotes(request: JobRequest) {
  const workAddress = requestWorkAddress(request)

  return [
    `Job request: ${request.title}`,
    "",
    request.description,
    "",
    workAddress ? `Work address: ${workAddress}` : null,
    request.client_name ? `Client: ${request.client_name}` : null,
    request.client_email ? `Email: ${request.client_email}` : null,
    request.client_phone ? `Phone: ${request.client_phone}` : null,
    `Service area: ${request.service_area}`,
    `Urgency: ${labelFromSlug(request.urgency)}`,
    `Budget: ${budgetLabel(request)}`,
    `Contact preference: ${request.contact_preference}`,
    request.photo_notes ? `Photo notes: ${request.photo_notes}` : null,
  ]
    .filter(Boolean)
    .join("\n")
}

const closedRequestStatuses = new Set(["closed", "declined", "declined_by_contractor"])

function isClosedRequest(request: JobRequest) {
  return closedRequestStatuses.has(request.status ?? "")
}

function requestSortTime(request: JobRequest) {
  return new Date(request.updated_at ?? request.created_at).getTime() || 0
}

function parseAmount(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function newLineItem(): EstimateLineItem {
  return {
    id: Math.random().toString(36).slice(2),
    description: "",
    quantity: "1",
    unit_price: "",
  }
}

function newTaxLine(name = "", rate = ""): EstimateTaxLine {
  return {
    id: Math.random().toString(36).slice(2),
    name,
    rate,
  }
}

function serializeLineItems(items: EstimateLineItem[]) {
  if (items.length > 100) {
    throw new InputValidationError("Line items must include 100 rows or fewer.")
  }

  return items
    .filter((item) => item.description.trim() || parseAmount(item.unit_price) > 0)
    .map(({ description, quantity, unit_price }, index) => ({
      description: textField(description, `Line item ${index + 1}`, {
        maxLength: INPUT_LIMITS.lineItemDescription,
      }),
      quantity: numberField(quantity || 0, `Line item ${index + 1} quantity`, {
        min: 0,
        max: 100_000,
      }),
      unit_price: numberField(unit_price || 0, `Line item ${index + 1} unit price`, {
        min: 0,
        max: 10_000_000,
      }),
    }))
}

function serializeTaxLines(lines: EstimateTaxLine[]) {
  if (lines.length > 20) {
    throw new InputValidationError("Tax lines must include 20 rows or fewer.")
  }

  return lines
    .filter((line) => line.name.trim() || parseAmount(line.rate) > 0)
    .map(({ name, rate }) => ({
      name: textField(name.trim() ? name : "Tax", "Tax name", {
        required: true,
        maxLength: INPUT_LIMITS.taxName,
      }),
      rate: numberField(rate || 0, "Tax rate", { min: 0, max: 100 }),
    }))
}

function lineItemSubtotal(items: EstimateLineItem[]) {
  return items.reduce(
    (sum, item) => sum + parseAmount(item.quantity) * parseAmount(item.unit_price),
    0
  )
}

function requestPhotoUrls(request: JobRequest) {
  return Array.isArray(request.photo_urls)
    ? request.photo_urls.filter((url) => url.trim().length > 0)
    : []
}

function RequestPhotos({ request }: { request: JobRequest }) {
  const photos = requestPhotoUrls(request)
  if (photos.length === 0) return null

  return (
    <div data-testid="job-request-photos">
      <div className="text-xs font-medium uppercase text-muted-foreground">
        Photos
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((url, index) => (
          <a
            key={`${url}-${index}`}
            href={url}
            target="_blank"
            rel="noreferrer"
            data-testid="job-request-photo-link"
            className="group overflow-hidden rounded-lg border border-border bg-muted/30"
          >
            <Image
              src={url}
              alt={`${request.title} uploaded photo ${index + 1}`}
              data-testid="job-request-photo"
              width={320}
              height={240}
              unoptimized
              className="aspect-[4/3] w-full object-cover transition group-hover:scale-105"
            />
          </a>
        ))}
      </div>
    </div>
  )
}

function RequestContext({ request }: { request: JobRequest }) {
  const workAddress = requestWorkAddress(request)

  return (
    <div
      className="grid gap-4 rounded-lg border border-border bg-muted/30 p-4 text-sm"
      data-testid="job-request-context"
    >
      <div>
        <div className="text-xs font-medium uppercase text-muted-foreground">
          Request
        </div>
        <div className="mt-1 font-medium" data-testid="job-request-title-value">
          {request.title}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Client name
          </div>
          <div className="mt-1" data-testid="job-request-client-name-value">
            {request.client_name || "Not provided"}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Service area
          </div>
          <div className="mt-1" data-testid="job-request-service-area-value">
            {request.service_area}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Urgency
          </div>
          <div className="mt-1">{labelFromSlug(request.urgency)}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Budget
          </div>
          <div className="mt-1">{budgetLabel(request)}</div>
        </div>
        <div className="sm:col-span-2">
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Work address
          </div>
          <div className="mt-1 break-words" data-testid="job-request-work-address-value">
            {workAddress || "Not provided"}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Contact preference
          </div>
          <div className="mt-1" data-testid="job-request-contact-preference-value">
            {request.contact_preference}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Client email
          </div>
          <div className="mt-1 break-words" data-testid="job-request-client-email-value">
            {request.client_email || "Not provided"}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Client phone
          </div>
          <div className="mt-1" data-testid="job-request-client-phone-value">
            {request.client_phone || "Not provided"}
          </div>
        </div>
      </div>
      <div>
        <div className="text-xs font-medium uppercase text-muted-foreground">
          Description
        </div>
        <p
          className="mt-2 whitespace-pre-wrap leading-6"
          data-testid="job-request-description-value"
        >
          {request.description}
        </p>
      </div>
      {request.photo_notes ? (
        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Photo notes
          </div>
          <p
            className="mt-2 whitespace-pre-wrap leading-6"
            data-testid="job-request-photo-notes-value"
          >
            {request.photo_notes}
          </p>
        </div>
      ) : null}
      <RequestPhotos request={request} />
      {request.visit_client_proposed_at && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="text-xs font-medium uppercase text-blue-700">Client suggested a new time</div>
          <p className="mt-1 text-sm font-semibold text-blue-900">
            {new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(request.visit_client_proposed_at))}
          </p>
          {request.visit_client_notes && (
            <p className="mt-1 text-xs text-blue-700">{request.visit_client_notes}</p>
          )}
        </div>
      )}
      {(request.more_details_message || request.more_details_response) && (
        <div className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          {request.more_details_message && (
            <div>
              <div className="text-xs font-medium uppercase text-amber-700">
                Your info request
              </div>
              <p className="mt-1 whitespace-pre-wrap leading-6 text-amber-900">
                {request.more_details_message}
              </p>
            </div>
          )}
          {request.more_details_response ? (
            <div>
              <div className="text-xs font-medium uppercase text-amber-700">
                Client response
              </div>
              <p className="mt-1 whitespace-pre-wrap leading-6 text-amber-900">
                {request.more_details_response}
              </p>
            </div>
          ) : (
            <p className="text-xs italic text-amber-600">Awaiting client response…</p>
          )}
        </div>
      )}
    </div>
  )
}

function EstimateActionButton({
  request,
  estimate,
  isSaving,
  onCreateEstimate,
  onShareEstimate,
  onRequestDetails,
  onScheduleInspection,
  onScheduleWork,
  onDeclineRequest,
  onMarkVisitCompleted,
  onAcceptClientProposal,
  onCloseJob,
}: {
  request:               JobRequest
  estimate:              EstimateRow | undefined
  isSaving:              boolean
  onCreateEstimate:      (r: JobRequest) => void
  onShareEstimate:       (estimate: EstimateRow, request: JobRequest) => void
  onRequestDetails:      (r: JobRequest) => void
  onScheduleInspection:  (r: JobRequest) => void
  onScheduleWork:        (estimate: EstimateRow) => void
  onDeclineRequest:      (r: JobRequest) => void
  onMarkVisitCompleted:  (r: JobRequest) => void
  onAcceptClientProposal:(r: JobRequest) => void
  onCloseJob:            (r: JobRequest) => void
}) {
  const status = request.status

  // ── Estimate exists ───────────────────────────────────────────────────────
  if (estimate) {
    // After client declined: revise / propose visit / close
    if (estimate.status === "Declined" || estimate.status === "Lost") {
      return (
        <>
          <Button variant="outline" size="sm" disabled={isSaving} onClick={() => onCreateEstimate(request)}>
            <Plus className="size-4" />
            Revise estimate
          </Button>
          <Button variant="outline" size="sm" disabled={isSaving} onClick={() => onScheduleInspection(request)}>
            <Calendar className="size-4" />
            Propose site visit
          </Button>
          <Button variant="outline" size="sm" disabled={isSaving} className="text-red-600 hover:text-red-700" onClick={() => onCloseJob(request)}>
            Close job
          </Button>
        </>
      )
    }

    return (
      <>
        <Button variant="outline" size="sm" disabled={isSaving} onClick={() => onScheduleInspection(request)}>
          <Calendar className="size-4" />
          {status === "inspection_scheduled" || status === "inspection_confirmed" ? "Reschedule" : "Site visit"}
        </Button>
        <Button variant="outline" size="sm" disabled={isSaving} onClick={() => onScheduleWork(estimate)}>
          <Clock className="size-4" />
          Schedule work
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/estimates?highlight=${estimate.id}`} data-testid="job-request-view-estimate">
            <FileText className="size-4" />
            View estimate
          </Link>
        </Button>
        {estimate.status === "Draft" && (
          <Button
            data-testid="job-request-share-estimate"
            className="bg-ef-ocean text-white hover:bg-ef-ocean"
            disabled={isSaving}
            onClick={() => onShareEstimate(estimate, request)}
          >
            <Send className="size-4" />
            Send to client
          </Button>
        )}
      </>
    )
  }

  // ── Terminal / no-action states ───────────────────────────────────────────
  if (
    status === "estimate_created" ||
    status === "accepted" ||
    status === "declined" ||
    status === "declined_by_contractor" ||
    status === "closed"
  ) {
    return (
      <Button variant="outline" disabled>
        <FileText className="size-4" />
        {status === "estimate_created" ? "Estimate sent" : labelFromSlug(status)}
      </Button>
    )
  }

  // ── Visit negotiation state ───────────────────────────────────────────────
  if (status === "inspection_scheduled") {
    return (
      <>
        {request.visit_client_proposed_at && (
          <Button
            size="sm"
            className="bg-ef-ocean text-white hover:bg-ef-ocean"
            disabled={isSaving}
            onClick={() => onAcceptClientProposal(request)}
            data-testid="accept-client-proposal"
          >
            <Check className="size-4" />
            Accept their time
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={isSaving} onClick={() => onScheduleInspection(request)}>
          <Calendar className="size-4" />
          Suggest a different time
        </Button>
        <Button
          className="bg-ef-ocean text-white hover:bg-ef-ocean"
          disabled={isSaving}
          onClick={() => onCreateEstimate(request)}
          data-testid="job-request-create-estimate"
        >
          <Plus className="size-4" />
          Create estimate
        </Button>
      </>
    )
  }

  if (status === "inspection_confirmed") {
    return (
      <>
        <Button variant="outline" size="sm" disabled={isSaving} onClick={() => onMarkVisitCompleted(request)} data-testid="mark-visit-completed">
          <Check className="size-4" />
          Mark visit completed
        </Button>
        <Button
          className="bg-ef-ocean text-white hover:bg-ef-ocean"
          disabled={isSaving}
          onClick={() => onCreateEstimate(request)}
          data-testid="job-request-create-estimate"
        >
          <Plus className="size-4" />
          Create estimate
        </Button>
      </>
    )
  }

  // ── Pre-estimate actions (new / reviewed / needs_info / visit_completed) ──
  const canAct =
    status === "new" ||
    status === "reviewed" ||
    status === "needs_info" ||
    status === "visit_completed"

  if (!canAct) return null

  return (
    <>
      <Button
        data-testid="job-request-create-estimate"
        className="bg-ef-ocean text-white hover:bg-ef-ocean"
        disabled={isSaving}
        onClick={() => onCreateEstimate(request)}
      >
        <Plus className="size-4" />
        Create estimate
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={isSaving}
            data-testid="job-request-more-actions"
          >
            More
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => onRequestDetails(request)}
            data-testid="job-request-request-details"
          >
            <HelpCircle className="size-4" />
            Ask the client a question
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => onScheduleInspection(request)}
            data-testid="job-request-schedule-inspection"
          >
            <Calendar className="size-4" />
            Propose a site visit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => onDeclineRequest(request)}
            data-testid="job-request-decline"
          >
            <X className="size-4" />
            Decline request
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

function RequestsSkeleton() {
  return (
    <div className="grid gap-3">
      {[1, 2, 3].map((item) => (
        <Skeleton key={item} className="h-32 rounded-xl" />
      ))}
    </div>
  )
}

export default function ContractorJobRequestsPage() {
  const supabase = useMemo(() => createClient(), [])
  const searchParams = useSearchParams()
  const focusRequestId = searchParams.get("request")
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [requests, setRequests] = useState<JobRequest[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [plan, setPlan] = useState<PlanTier>("free")
  const [requestSlug, setRequestSlug] = useState<string | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<JobRequest | null>(null)
  const [estimateRequest, setEstimateRequest] = useState<JobRequest | null>(null)
  const [estimateForm, setEstimateForm] = useState<EstimateDraftForm>(
    emptyEstimateDraftForm
  )
  const [linkCopied, setLinkCopied] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [estimateByRequestId, setEstimateByRequestId] = useState<Record<string, EstimateRow>>({})
  const [showClosedRequests, setShowClosedRequests] = useState(false)

  // Decline request dialog
  const [declineRequestTarget, setDeclineRequestTarget]   = useState<JobRequest | null>(null)
  const [declineRequestReason, setDeclineRequestReason]   = useState("")
  const [isSubmittingDecline,  setIsSubmittingDecline]    = useState(false)

  // Request more details dialog
  const [detailsRequest, setDetailsRequest] = useState<JobRequest | null>(null)
  const [detailsMessage, setDetailsMessage] = useState("")
  const [isSubmittingDetails, setIsSubmittingDetails] = useState(false)

  // Schedule inspection dialog
  const [inspectionRequest, setInspectionRequest] = useState<JobRequest | null>(null)
  const [inspectionDate, setInspectionDate] = useState("")
  const [inspectionStartTime, setInspectionStartTime] = useState("")
  const [inspectionNotes, setInspectionNotes] = useState("")
  const [isSubmittingInspection, setIsSubmittingInspection] = useState(false)

  // Schedule work dialog (manage multiple work days for an estimate)
  const [workEstimate, setWorkEstimate] = useState<EstimateRow | null>(null)
  const [workDays, setWorkDays] = useState<WorkDay[]>([])
  const [isLoadingWorkDays, setIsLoadingWorkDays] = useState(false)
  const [workDate, setWorkDate] = useState("")
  const [workStartTime, setWorkStartTime] = useState("")
  const [workEndTime, setWorkEndTime] = useState("")
  const [workNotes, setWorkNotes] = useState("")
  const [workConflicts, setWorkConflicts] = useState<ScheduleConflict[]>([])
  const [isSubmittingWork, setIsSubmittingWork] = useState(false)

  // Warn (never block) when the proposed work day collides with another work
  // day or inspection. Recomputes as the contractor picks a date/time.
  useEffect(() => {
    if (!workEstimate || !workDate || !userId) {
      setWorkConflicts([])
      return
    }
    const time = workStartTime || "08:00"
    if (!/^\d{2}:\d{2}$/.test(time)) return
    const startsAt = `${workDate}T${time}:00`
    const endsAt =
      workEndTime && /^\d{2}:\d{2}$/.test(workEndTime)
        ? `${workDate}T${workEndTime}:00`
        : null
    if (Number.isNaN(new Date(startsAt).getTime())) return

    let cancelled = false
    void findScheduleConflicts({ supabase, userId, startsAt, endsAt }).then(
      (found) => {
        if (!cancelled) setWorkConflicts(found)
      }
    )
    return () => {
      cancelled = true
    }
  }, [workEstimate, workDate, workStartTime, workEndTime, userId, supabase])

  const estimateSubtotal = useMemo(
    () => lineItemSubtotal(estimateForm.lineItems),
    [estimateForm.lineItems]
  )
  const estimateTaxTotal = useMemo(
    () =>
      estimateForm.taxLines.reduce(
        (sum, line) => sum + estimateSubtotal * (parseAmount(line.rate) / 100),
        0
      ),
    [estimateForm.taxLines, estimateSubtotal]
  )
  const hasEstimateLineItems = estimateForm.lineItems.length > 0
  const estimateTotal = hasEstimateLineItems
    ? estimateSubtotal + estimateTaxTotal
    : parseAmount(estimateForm.flatAmount)

  // ── Stripe payout derivations via shared pricing helper ──────────────────────
  // Plan-based fee: Free 5% (capped) / Pro 2% / Team 1%, charged to the client on top.
  const feeOptions = useMemo(
    () => ({
      feePercent: transactionFeePercent(plan),
      feeCapCents: plan === "free" ? FREE_FEE_CAP_CENTS : null,
    }),
    [plan]
  )
  const rawContractorCents = Math.round((parseFloat(estimateForm.contractorAmount) || 0) * 100)
  const rawDepositCents    = Math.round((parseFloat(estimateForm.depositAmount) || 0) * 100)
  const pricing = rawContractorCents > 0
    ? computePricing(rawContractorCents, {
        depositInputCents: rawDepositCents > 0 ? rawDepositCents : null,
        ...feeOptions,
      })
    : null
  const contractorCents  = pricing?.contractorSubtotalCents ?? 0
  const platformFeeCents = pricing?.platformFeeCents ?? 0
  const gstCents         = pricing?.gstCents ?? 0
  const clientTotalCents = pricing?.clientTotalCents ?? 0
  const depositCents     = pricing?.depositCents ?? 0
  const remainingCents   = pricing?.remainingBalanceCents ?? 0
  const hasStripePayment = contractorCents > 0

  const shareableLink = requestSlug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/request/${requestSlug}`
    : null

  function copyLink() {
    if (!shareableLink) return
    navigator.clipboard.writeText(shareableLink).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    })
  }

  const load = useCallback(async () => {
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

    // Fetch profile to get the request slug for the shareable link + plan (fee tier).
    const { data: profile } = await supabase
      .from("profiles")
      .select("request_slug, plan, plan_status")
      .eq("user_id", user.id)
      .maybeSingle()
    if (profile?.request_slug) setRequestSlug(profile.request_slug)
    setPlan(effectivePlan(profile?.plan ?? "free", profile?.plan_status ?? "active"))

    const { data, error } = await supabase
      .from("job_requests")
      .select("*")
      .eq("contractor_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      setRequests([])
    } else {
      const rows = data ?? []
      setRequests(rows)

      const requestIds = rows.map((r) => r.id)

      if (requestIds.length > 0) {
        const { data: estimateRows } = await supabase
          .from("estimates")
          .select("*")
          .in("job_request_id", requestIds)
          .order("created_at", { ascending: false })

        if (estimateRows) {
          const map: Record<string, EstimateRow> = {}
          for (const row of estimateRows) {
            if (row.job_request_id && !map[row.job_request_id]) {
              map[row.job_request_id] = row
            }
          }
          setEstimateByRequestId(map)
        }
      } else {
        setEstimateByRequestId({})
      }
    }

    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(id)
  }, [load])

  // Scroll to and highlight a specific request when arriving from the Today page
  // (e.g. /dashboard/job-requests?request=<id>).
  useEffect(() => {
    if (!focusRequestId || isLoading) return
    const el = document.querySelector(
      `[data-request-id="${focusRequestId}"]`
    )
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    setHighlightedId(focusRequestId)
    const timer = window.setTimeout(() => setHighlightedId(null), 2500)
    return () => window.clearTimeout(timer)
  }, [focusRequestId, isLoading])

  async function updateRequestStatus(
    request: JobRequest,
    patch: JobRequestUpdate
  ) {
    let requestId: string
    try {
      requestId = uuidField(request.id, "Job request")
    } catch (error) {
      toast.error(inputErrorMessage(error))
      return null
    }

    const { data, error } = await supabase
      .from("job_requests")
      .update(patch)
      .eq("id", requestId)
      .select()
      .single()

    if (error) {
      toast.error(error.message)
      return null
    }

    setRequests((current) =>
      current.map((item) => (item.id === requestId ? data : item))
    )
    if (selectedRequest?.id === requestId) setSelectedRequest(data)
    return data
  }

  async function ensureClientForRequest(
    request: JobRequest,
    clientNameOverride?: string
  ) {
    if (!userId) return null

    if (request.client_email) {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", userId)
        .eq("email", request.client_email)
        .maybeSingle()

      if (data) return data
    }

    let payload: ClientInsert
    try {
      const clientName = textField(
        clientNameOverride?.trim() ||
          request.client_name ||
          request.client_email ||
          "Client from job request",
        "Client name",
        { required: true, maxLength: INPUT_LIMITS.name }
      )
      payload = {
        user_id: userId,
        name: clientName,
        company: clientName,
        email: optionalEmailField(request.client_email, "Client email"),
        phone: optionalPhoneField(request.client_phone, "Client phone"),
        notes: optionalTextField(`Created from job request: ${request.title}`, "Client notes", {
          maxLength: INPUT_LIMITS.notes,
          multiline: true,
        }),
        payment_reliability: "New client",
      }
    } catch (error) {
      toast.error(inputErrorMessage(error))
      return null
    }

    const { data, error } = await supabase
      .from("clients")
      .insert(payload)
      .select()
      .single()

    if (error) {
      toast.error(error.message)
      return null
    }

    return data
  }

  function openCreateEstimate(request: JobRequest) {
    setSelectedRequest(null)
    setEstimateRequest(request)
    setEstimateForm({
      clientName: request.client_name || request.client_email || "",
      estimateNumber: `EST-${Date.now().toString().slice(-5)}`,
      flatAmount: "",
      status: "Draft",
      followUpDate: inputDate(3),
      notes: requestNotes(request),
      lineItems: [{ id: Math.random().toString(36).slice(2), description: "The work to be done", quantity: "1", unit_price: "" }],
      taxLines: [],
      billingType: "flat_rate",
      contractorAmount: "",
      depositAmount: "",
    })
  }

  function closeEstimateDialog(open: boolean) {
    if (!open) {
      setEstimateRequest(null)
      setEstimateForm(emptyEstimateDraftForm)
    }
  }

  function updateEstimateForm<Field extends keyof EstimateDraftForm>(
    field: Field,
    value: EstimateDraftForm[Field]
  ) {
    setEstimateForm((current) => ({ ...current, [field]: value }))
  }

  function addEstimateLineItem() {
    setEstimateForm((current) => ({
      ...current,
      lineItems: [...current.lineItems, newLineItem()],
    }))
  }

  function updateEstimateLineItem(
    id: string,
    field: "description" | "quantity" | "unit_price",
    value: string
  ) {
    setEstimateForm((current) => ({
      ...current,
      lineItems: current.lineItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    }))
  }

  function removeEstimateLineItem(id: string) {
    setEstimateForm((current) => ({
      ...current,
      lineItems: current.lineItems.filter((item) => item.id !== id),
    }))
  }

  function addEstimateTaxLine(name = "", rate = "") {
    setEstimateForm((current) => ({
      ...current,
      taxLines: [...current.taxLines, newTaxLine(name, rate)],
    }))
  }

  function updateEstimateTaxLine(
    id: string,
    field: "name" | "rate",
    value: string
  ) {
    setEstimateForm((current) => ({
      ...current,
      taxLines: current.taxLines.map((line) =>
        line.id === id ? { ...line, [field]: value } : line
      ),
    }))
  }

  function removeEstimateTaxLine(id: string) {
    setEstimateForm((current) => ({
      ...current,
      taxLines: current.taxLines.filter((line) => line.id !== id),
    }))
  }

  async function submitDeclineRequest() {
    if (!declineRequestTarget || isSubmittingDecline) return
    let declineReason: string | null
    try {
      declineReason = optionalTextField(declineRequestReason, "Decline reason", {
        maxLength: INPUT_LIMITS.notes,
        multiline: true,
      })
    } catch (error) {
      toast.error(inputErrorMessage(error))
      return
    }

    setIsSubmittingDecline(true)
    const updated = await updateRequestStatus(declineRequestTarget, {
      status: "declined_by_contractor",
      contractor_decline_reason: declineReason,
    })
    setIsSubmittingDecline(false)
    if (!updated) return
    setDeclineRequestTarget(null)
    setDeclineRequestReason("")
    toast.success("Request declined")
  }

  async function markVisitCompleted(request: JobRequest) {
    await updateRequestStatus(request, { status: "visit_completed" })
    toast.success("Site visit marked as completed")
  }

  async function acceptClientVisitProposal(request: JobRequest) {
    if (!request.visit_client_proposed_at) return
    await updateRequestStatus(request, {
      status:                      "inspection_confirmed",
      scheduled_visit_starts_at:   request.visit_client_proposed_at,
      scheduled_visit_notes:       request.visit_client_notes ?? request.scheduled_visit_notes,
      visit_client_proposed_at:    null,
      visit_client_notes:          null,
    })
    toast.success("Client's suggested time accepted. Visit confirmed.")
  }

  async function closeJob(request: JobRequest) {
    await updateRequestStatus(request, { status: "closed" })
    toast.success("Job closed")
  }

  async function submitDetailsRequest() {
    if (!detailsRequest || !detailsMessage.trim() || isSubmittingDetails) return
    let message: string
    try {
      message = textField(detailsMessage, "Details request", {
        required: true,
        maxLength: INPUT_LIMITS.description,
        multiline: true,
      })
    } catch (error) {
      toast.error(inputErrorMessage(error))
      return
    }

    setIsSubmittingDetails(true)
    const updated = await updateRequestStatus(detailsRequest, {
      status: "needs_info",
      more_details_message: message,
    })
    setIsSubmittingDetails(false)
    if (!updated) return
    setDetailsRequest(null)
    setDetailsMessage("")
    toast.success("More details requested from client")
  }

  async function submitInspectionSchedule() {
    if (!inspectionRequest || !inspectionDate || isSubmittingInspection) return
    let startsAt: string
    let notes: string | null
    try {
      const date = isoDateField(inspectionDate, "Inspection date")
      const timeStr = textField(inspectionStartTime || "09:00", "Inspection time", {
        required: true,
        maxLength: 5,
      })
      if (!/^\d{2}:\d{2}$/.test(timeStr)) {
        throw new InputValidationError("Inspection time is malformed.")
      }
      startsAt = isoDateTimeField(`${date}T${timeStr}`, "Inspection date/time")
      notes = optionalTextField(inspectionNotes, "Inspection notes", {
        maxLength: INPUT_LIMITS.notes,
        multiline: true,
      })
    } catch (error) {
      toast.error(inputErrorMessage(error))
      return
    }

    setIsSubmittingInspection(true)
    const updated = await updateRequestStatus(inspectionRequest, {
      status: "inspection_scheduled",
      scheduled_visit_type: "inspection",
      scheduled_visit_starts_at: startsAt,
      scheduled_visit_notes: notes,
    })
    setIsSubmittingInspection(false)
    if (!updated) return
    setInspectionRequest(null)
    setInspectionDate("")
    setInspectionStartTime("")
    setInspectionNotes("")
    toast.success("Inspection scheduled. The client will be asked to confirm.")
  }

  // Open the work-day manager for an estimate and load its existing days.
  async function openWorkScheduler(estimate: EstimateRow) {
    setWorkEstimate(estimate)
    setWorkDays([])
    setWorkDate("")
    setWorkStartTime("")
    setWorkEndTime("")
    setWorkNotes("")
    setWorkConflicts([])
    await loadWorkDays(estimate.id)
  }

  async function loadWorkDays(estimateId: string) {
    setIsLoadingWorkDays(true)
    const { data } = await supabase
      .from("scheduled_work_days")
      .select("*")
      .eq("estimate_id", estimateId)
      .order("starts_at", { ascending: true })
    setWorkDays(data ?? [])
    setIsLoadingWorkDays(false)
  }

  // Validate the add-a-day sub-form into a {startsAt, endsAt, notes} payload.
  function parseWorkDayForm(): { startsAt: string; endsAt: string | null; notes: string | null } | null {
    try {
      const date = isoDateField(workDate, "Work date")
      const startTime = textField(workStartTime || "08:00", "Start time", {
        required: true,
        maxLength: 5,
      })
      if (!/^\d{2}:\d{2}$/.test(startTime)) {
        throw new InputValidationError("Start time is malformed.")
      }
      const startsAt = isoDateTimeField(`${date}T${startTime}`, "Work start")
      let endsAt: string | null = null
      if (workEndTime) {
        const endTime = textField(workEndTime, "End time", { required: true, maxLength: 5 })
        if (!/^\d{2}:\d{2}$/.test(endTime)) {
          throw new InputValidationError("End time is malformed.")
        }
        endsAt = isoDateTimeField(`${date}T${endTime}`, "Work end")
      }
      const notes = optionalTextField(workNotes, "Work notes", {
        maxLength: INPUT_LIMITS.notes,
        multiline: true,
      })
      return { startsAt, endsAt, notes }
    } catch (error) {
      toast.error(inputErrorMessage(error))
      return null
    }
  }

  async function addWorkDay() {
    if (!workEstimate || !workDate || isSubmittingWork || !userId) return
    const parsed = parseWorkDayForm()
    if (!parsed) return

    setIsSubmittingWork(true)
    const { error } = await supabase.from("scheduled_work_days").insert({
      user_id:     userId,
      estimate_id: workEstimate.id,
      starts_at:   parsed.startsAt,
      ends_at:     parsed.endsAt,
      notes:       parsed.notes,
    })

    if (error) { setIsSubmittingWork(false); toast.error(error.message); return }

    // Keep the legacy estimate column populated (used by print/older views) with
    // the earliest scheduled day so existing reads still resolve.
    await syncEstimateLegacyVisit(workEstimate)

    await loadWorkDays(workEstimate.id)
    setIsSubmittingWork(false)
    setWorkDate("")
    setWorkStartTime("")
    setWorkEndTime("")
    setWorkNotes("")
    setWorkConflicts([])
    toast.success("Work day added. The client will see it in their portal.")
  }

  async function removeWorkDay(id: string) {
    if (!workEstimate) return
    const { error } = await supabase.from("scheduled_work_days").delete().eq("id", id)
    if (error) { toast.error(error.message); return }
    await syncEstimateLegacyVisit(workEstimate)
    await loadWorkDays(workEstimate.id)
    toast.success("Work day removed")
  }

  // Mirror the earliest remaining work day onto the estimate's legacy
  // scheduled_visit_* columns (kept for print/back-compat). Clears them when no
  // work days remain.
  async function syncEstimateLegacyVisit(estimate: EstimateRow) {
    const { data } = await supabase
      .from("scheduled_work_days")
      .select("starts_at, ends_at, notes")
      .eq("estimate_id", estimate.id)
      .order("starts_at", { ascending: true })
      .limit(1)
    const first = data?.[0]
    const patch = first
      ? {
          scheduled_visit_type:      "job_start" as const,
          scheduled_visit_starts_at: first.starts_at,
          scheduled_visit_ends_at:   first.ends_at,
          scheduled_visit_notes:     first.notes,
        }
      : {
          scheduled_visit_type:      null,
          scheduled_visit_starts_at: null,
          scheduled_visit_ends_at:   null,
          scheduled_visit_notes:     null,
        }
    await supabase.from("estimates").update(patch).eq("id", estimate.id)
    if (estimate.job_request_id) {
      setEstimateByRequestId((prev) => ({
        ...prev,
        [estimate.job_request_id!]: { ...prev[estimate.job_request_id!], ...patch },
      }))
    }
  }

  async function saveEstimateFromRequest(sendToClient: boolean) {
    if (!userId || !estimateRequest || isSaving) return

    let requestId: string
    let serializedItems: ReturnType<typeof serializeLineItems>
    let serializedTaxLines: ReturnType<typeof serializeTaxLines>
    let sendAmount: number
    let pricingForSave: ReturnType<typeof computePricing> | null
    let billingType: (typeof billingTypes)[number]
    let followUpDate: string | null
    let notes: string | null
    let estimateNumber: string
    try {
      requestId = uuidField(estimateRequest.id, "Job request")
      serializedItems = serializeLineItems(estimateForm.lineItems)
      serializedTaxLines =
        estimateForm.lineItems.length > 0 ? serializeTaxLines(estimateForm.taxLines) : []
      const sanitizedSubtotal = serializedItems.reduce(
        (sum, item) => sum + item.quantity * item.unit_price,
        0
      )
      const sanitizedTaxTotal = serializedTaxLines.reduce(
        (sum, taxLine) => sum + sanitizedSubtotal * (taxLine.rate / 100),
        0
      )
      const finalAmount =
        estimateForm.lineItems.length > 0
          ? numberField(sanitizedSubtotal + sanitizedTaxTotal, "Estimate amount", {
              min: 0,
              max: 10_000_000,
            })
          : numberField(estimateForm.flatAmount || 0, "Estimate amount", {
              min: 0,
              max: 10_000_000,
            })
      const contractorAmount = numberField(estimateForm.contractorAmount || 0, "Payout amount", {
        min: 0,
        max: 10_000_000,
      })
      const depositAmount = numberField(estimateForm.depositAmount || 0, "Deposit amount", {
        min: 0,
        max: contractorAmount || 10_000_000,
      })
      const contractorAmountCents = Math.round(contractorAmount * 100)
      const depositAmountCents = Math.round(depositAmount * 100)
      pricingForSave =
        contractorAmountCents > 0
          ? computePricing(contractorAmountCents, {
              depositInputCents: depositAmountCents > 0 ? depositAmountCents : null,
              ...feeOptions,
            })
          : null
      sendAmount = pricingForSave ? pricingForSave.clientTotalCents / 100 : finalAmount
      billingType = enumField(estimateForm.billingType, "Billing type", billingTypes)
      followUpDate = optionalIsoDateField(estimateForm.followUpDate, "Follow-up date")
      notes = optionalTextField(estimateForm.notes, "Estimate notes", {
        maxLength: INPUT_LIMITS.description,
        multiline: true,
      })
      estimateNumber = textField(
        estimateForm.estimateNumber.trim() || `EST-${Date.now().toString().slice(-5)}`,
        "Estimate number",
        { required: true, maxLength: INPUT_LIMITS.estimateNumber }
      )
    } catch (error) {
      toast.error(inputErrorMessage(error))
      return
    }

    if (sendToClient && pricingForSave && pricingForSave.contractorSubtotalCents < 50) {
      toast.error("Minimum payout for online payment is $0.50.")
      return
    }

    if (sendToClient && sendAmount <= 0) {
      toast.error("Add an amount before sending this estimate.")
      return
    }

    setIsSaving(true)

    const client = await ensureClientForRequest(
      estimateRequest,
      estimateForm.clientName
    )

    let payload: EstimateInsert
    try {
      payload = {
        user_id: userId,
        client_id: client ? uuidField(client.id, "Client") : null,
        job_request_id: requestId,
        client_name: optionalTextField(
          client?.company ||
            client?.name ||
            estimateForm.clientName ||
            estimateRequest.client_name ||
            estimateRequest.client_email,
          "Client name",
          { maxLength: INPUT_LIMITS.name }
        ),
        estimate_number: estimateNumber,
        amount: sendAmount,
        status: sendToClient ? "Sent" : "Draft",
        sent_date: isoDateField(inputDate(), "Sent date"),
        follow_up_date: followUpDate,
        notes,
        billing_type: billingType,
        line_items: serializedItems,
        tax_rate: 0,
        tax_lines: serializedTaxLines,
        contractor_amount_cents: pricingForSave ? pricingForSave.contractorSubtotalCents : null,
        platform_fee_cents: pricingForSave ? pricingForSave.platformFeeCents : null,
        gst_cents: pricingForSave ? pricingForSave.gstCents : null,
        client_total_cents: pricingForSave ? pricingForSave.clientTotalCents : null,
        deposit_amount_cents:
          pricingForSave && pricingForSave.depositCents > 0 ? pricingForSave.depositCents : null,
      }
    } catch (error) {
      toast.error(inputErrorMessage(error))
      setIsSaving(false)
      return
    }

    const { data, error } = await supabase
      .from("estimates")
      .insert(payload)
      .select()
      .single()

    if (error) {
      toast.error(error.message)
      setIsSaving(false)
      return
    }

    setEstimateByRequestId((prev) => ({
      ...prev,
      [estimateRequest.id]: data,
    }))

    if (sendToClient) {
      await updateRequestStatus(estimateRequest, {
        status: "estimate_created",
      })
    }

    window.dispatchEvent(new Event("estg:badge-refresh"))
    toast.success(
      sendToClient
        ? `Estimate ${data.estimate_number} sent to client`
        : `Estimate ${data.estimate_number} saved as draft`
    )
    closeEstimateDialog(false)
    setIsSaving(false)
  }

  function saveEstimateDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void saveEstimateFromRequest(false)
  }

  async function shareEstimateWithClient(
    estimate: EstimateRow,
    request: JobRequest
  ) {
    if (estimate.amount <= 0) {
      toast.error("Add an amount before sharing this estimate.")
      return
    }
    if (!userId || isSaving) return
    setIsSaving(true)

    const { data, error } = await supabase
      .from("estimates")
      .update({ status: "Sent", sent_date: inputDate() })
      .eq("id", estimate.id)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) {
      toast.error("Could not share estimate")
      setIsSaving(false)
      return
    }

    setEstimateByRequestId((prev) => ({
      ...prev,
      [request.id]: data,
    }))

    const updatedRequest = await updateRequestStatus(request, {
      status: "estimate_created",
    })

    if (updatedRequest) {
      window.dispatchEvent(new Event("estg:badge-refresh"))
      toast.success("Estimate sent to client")
    }

    setIsSaving(false)
  }

  const newCount = requests.filter((r) => r.status === "new").length
  const closedCount = requests.filter(isClosedRequest).length
  const visibleRequests = useMemo(() => {
    const list = showClosedRequests
      ? [...requests]
      : requests.filter((request) => !isClosedRequest(request))

    return list.sort((a, b) => {
      const aClosed = isClosedRequest(a)
      const bClosed = isClosedRequest(b)
      if (aClosed !== bClosed) return aClosed ? 1 : -1

      const aNew = a.status === "new"
      const bNew = b.status === "new"
      if (aNew !== bNew) return aNew ? -1 : 1

      return requestSortTime(b) - requestSortTime(a)
    })
  }, [requests, showClosedRequests])

  return (
    <>
      <PageHeader
        title="Job Requests"
        description="Review incoming client requests and turn them into estimates."
      >
        <Button
          variant="outline"
          onClick={() => void load()}
          data-testid="job-requests-refresh"
        >
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </PageHeader>


      <Dialog
        open={estimateRequest !== null}
        onOpenChange={closeEstimateDialog}
      >
        <DialogContent className="max-w-4xl" data-testid="create-estimate-dialog">
          {estimateRequest ? (
            <>
              <DialogHeader>
                <DialogTitle>Create estimate</DialogTitle>
                <DialogDescription>
                  {estimateRequest.client_name ||
                    estimateRequest.client_email ||
                    "Client"}
                </DialogDescription>
              </DialogHeader>

              <form
                className="grid gap-5"
                onSubmit={saveEstimateDraft}
                data-testid="create-estimate-form"
              >
                <RequestContext request={estimateRequest} />

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="estimate-client-name">Client name</Label>
                    <Input
                      id="estimate-client-name"
                      data-testid="estimate-client-name-input"
                      value={estimateForm.clientName}
                      onChange={(event) =>
                        updateEstimateForm("clientName", event.target.value)
                      }
                      placeholder="Homeowner or company"
                      disabled={isSaving}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="estimate-number">Estimate number</Label>
                    <Input
                      id="estimate-number"
                      data-testid="estimate-number-input"
                      value={estimateForm.estimateNumber}
                      onChange={(event) =>
                        updateEstimateForm("estimateNumber", event.target.value)
                      }
                      placeholder="EST-1001"
                      disabled={isSaving}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="grid gap-2">
                    <Label htmlFor="estimate-status">Status</Label>
                    <Input
                      id="estimate-status"
                      data-testid="estimate-status-input"
                      value={estimateForm.status}
                      disabled
                      readOnly
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="estimate-follow-up-date">Follow-up date</Label>
                    <Input
                      id="estimate-follow-up-date"
                      data-testid="estimate-follow-up-date-input"
                      type="date"
                      value={estimateForm.followUpDate}
                      onChange={(event) =>
                        updateEstimateForm("followUpDate", event.target.value)
                      }
                      disabled={isSaving}
                    />
                  </div>
                  {estimateForm.lineItems.length === 0 ? (
                    <div className="grid gap-2">
                      <Label htmlFor="estimate-flat-amount">Flat amount</Label>
                      <Input
                        id="estimate-flat-amount"
                        data-testid="estimate-flat-amount-input"
                        value={estimateForm.flatAmount}
                        onChange={(event) =>
                          updateEstimateForm("flatAmount", event.target.value)
                        }
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        disabled={isSaving}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3">
                  {/* Billing type toggle */}
                  <div className="flex items-center gap-3">
                    <Label>Billing type</Label>
                    <div className="flex overflow-hidden rounded-lg border border-border text-sm">
                      {(["flat_rate", "hourly"] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => updateEstimateForm("billingType", type)}
                          className={`px-3 py-1.5 font-medium transition ${
                            estimateForm.billingType === type
                              ? "bg-ef-ocean text-white"
                              : "bg-white text-gray-600 hover:bg-gray-50"
                          } ${type === "hourly" ? "border-l border-border" : ""}`}
                        >
                          {type === "flat_rate" ? "Flat rate" : "Hourly"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <Label>Line items</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addEstimateLineItem}
                      disabled={isSaving}
                      data-testid="estimate-add-line-item"
                    >
                      <Plus className="size-3.5" />
                      Add item
                    </Button>
                  </div>

                  {estimateForm.lineItems.length > 0 ? (
                    <div className="overflow-hidden rounded-lg border border-border">
                      <div className="hidden grid-cols-[1fr_72px_112px_36px] gap-2 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid">
                        <span>Description</span>
                        <span className="text-right">Qty</span>
                        <span className="text-right">{estimateForm.billingType === "hourly" ? "Rate/hr" : "Unit price"}</span>
                        <span />
                      </div>
                      {estimateForm.lineItems.map((item) => (
                        <div
                          key={item.id}
                          data-testid="estimate-line-item-row"
                          className="grid gap-2 border-t border-border px-3 py-3 sm:grid-cols-[1fr_72px_112px_36px]"
                        >
                          <Input
                            data-testid="estimate-line-item-description"
                            value={item.description}
                            onChange={(event) =>
                              updateEstimateLineItem(
                                item.id,
                                "description",
                                event.target.value
                              )
                            }
                            placeholder="Description"
                            disabled={isSaving}
                          />
                          <Input
                            data-testid="estimate-line-item-quantity"
                            value={item.quantity}
                            onChange={(event) =>
                              updateEstimateLineItem(
                                item.id,
                                "quantity",
                                event.target.value
                              )
                            }
                            type="number"
                            min="0"
                            step="any"
                            className="sm:text-right"
                            disabled={isSaving}
                          />
                          <Input
                            data-testid="estimate-line-item-unit-price"
                            value={item.unit_price}
                            onChange={(event) =>
                              updateEstimateLineItem(
                                item.id,
                                "unit_price",
                                event.target.value
                              )
                            }
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            className="sm:text-right"
                            disabled={isSaving}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeEstimateLineItem(item.id)}
                            disabled={isSaving}
                            aria-label="Remove line item"
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      ))}

                      <div className="grid gap-2 border-t border-border bg-muted/30 px-3 py-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span className="tabular-nums">
                            {money.format(estimateSubtotal)}
                          </span>
                        </div>
                        {estimateForm.taxLines.map((line) => (
                          <div
                            key={line.id}
                            className="grid gap-2 sm:grid-cols-[1fr_96px_100px_36px] sm:items-center"
                          >
                            <Input
                              data-testid="estimate-tax-name"
                              value={line.name}
                              onChange={(event) =>
                                updateEstimateTaxLine(
                                  line.id,
                                  "name",
                                  event.target.value
                                )
                              }
                              placeholder="Tax name"
                              disabled={isSaving}
                            />
                            <Input
                              data-testid="estimate-tax-rate"
                              value={line.rate}
                              onChange={(event) =>
                                updateEstimateTaxLine(
                                  line.id,
                                  "rate",
                                  event.target.value
                                )
                              }
                              type="number"
                              min="0"
                              max="100"
                              step="0.001"
                              className="sm:text-right"
                              disabled={isSaving}
                            />
                            <div className="text-right tabular-nums">
                              {money.format(
                                estimateSubtotal * (parseAmount(line.rate) / 100)
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeEstimateTaxLine(line.id)}
                              disabled={isSaving}
                              aria-label="Remove tax line"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        ))}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            Add tax:
                          </span>
                          {[
                            ["GST", "5"],
                            ["HST", "15"],
                            ["PST", "7"],
                          ].map(([name, rate]) => (
                            <Button
                              key={name}
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => addEstimateTaxLine(name, rate)}
                              disabled={isSaving}
                              data-testid={`estimate-add-tax-${name.toLowerCase()}`}
                            >
                              {name} {rate}%
                            </Button>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => addEstimateTaxLine()}
                            disabled={isSaving}
                          >
                            Custom
                          </Button>
                        </div>
                        {estimateForm.taxLines.length > 0 ? (
                          <div className="flex justify-between text-muted-foreground">
                            <span>Total tax</span>
                            <span className="tabular-nums">
                              {money.format(estimateTaxTotal)}
                            </span>
                          </div>
                        ) : null}
                        <div className="flex justify-between border-t border-border pt-2 font-semibold">
                          <span>Total</span>
                          <span className="tabular-nums text-ef-ocean">
                            {money.format(estimateTotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="estimate-notes">Notes</Label>
                  <Textarea
                    id="estimate-notes"
                    data-testid="estimate-notes-input"
                    value={estimateForm.notes}
                    onChange={(event) =>
                      updateEstimateForm("notes", event.target.value)
                    }
                    className="min-h-32"
                    disabled={isSaving}
                  />
                </div>

                {estimateForm.lineItems.length === 0 ? (
                  <div className="flex justify-between rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm font-semibold">
                    <span>Total</span>
                    <span className="tabular-nums text-ef-ocean">
                      {money.format(estimateTotal)}
                    </span>
                  </div>
                ) : null}

                {/* Online card payment */}
                <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4">
                  <div>
                    <p className="text-sm font-semibold">Collect deposit online</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Enter what you want to receive. Euroflo adds the service fee and GST on top
                      so the customer sees the full card price. Leave blank if you will collect by
                      cash, cheque, or e-transfer.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="estimate-contractor-payout">I want to receive (CAD)</Label>
                      <Input
                        id="estimate-contractor-payout"
                        data-testid="estimate-contractor-amount-input"
                        value={estimateForm.contractorAmount}
                        onChange={(e) => updateEstimateForm("contractorAmount", e.target.value)}
                        placeholder="0.00"
                        type="number"
                        min="0.50"
                        step="0.01"
                        disabled={isSaving}
                      />
                    </div>
                    {hasStripePayment && (
                      <div className="grid gap-2">
                        <Label htmlFor="estimate-deposit-amount">Deposit to collect now (CAD)</Label>
                        <Input
                          id="estimate-deposit-amount"
                          data-testid="estimate-deposit-amount-input"
                          value={estimateForm.depositAmount}
                          onChange={(e) => updateEstimateForm("depositAmount", e.target.value)}
                          placeholder={money.format(depositCents / 100).replace("$", "")}
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={isSaving}
                        />
                      </div>
                    )}
                  </div>
                  {hasStripePayment && (
                    <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3">
                      {[
                        { label: "You receive",   value: money.format(contractorCents / 100) },
                        { label: "Euroflo fee",   value: money.format(platformFeeCents / 100) },
                        { label: "GST on fee",    value: money.format(gstCents / 100) },
                        { label: "Customer pays", value: money.format(clientTotalCents / 100) },
                        { label: "Deposit today", value: money.format(depositCents / 100) },
                        { label: "Balance later", value: money.format(remainingCents / 100) },
                      ].map(({ label, value }) => (
                        <div key={label} className="rounded border border-border bg-background px-3 py-2 text-center">
                          <p className="text-[0.6rem] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
                          <p className="mt-0.5 text-sm font-bold tabular-nums">{value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => closeEstimateDialog(false)}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={isSaving}
                    data-testid="estimate-save-draft"
                  >
                    {isSaving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <FileText className="size-4" />
                    )}
                    Save draft
                  </Button>
                  <Button
                    type="button"
                    className="bg-ef-ocean text-white hover:bg-ef-ocean"
                    disabled={isSaving}
                    data-testid="estimate-send-to-client"
                    onClick={() => void saveEstimateFromRequest(true)}
                  >
                    {isSaving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    Send to client
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedRequest !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedRequest(null)
        }}
      >
        <DialogContent className="max-w-2xl" data-testid="job-request-detail-dialog">
          {selectedRequest ? (
            <>
              <DialogHeader>
                <DialogTitle>{selectedRequest.title}</DialogTitle>
                <DialogDescription>
                  Submitted {formatDate(selectedRequest.created_at)} by{" "}
                  {selectedRequest.client_name ||
                    selectedRequest.client_email ||
                    "Client"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <RequestContext request={selectedRequest} />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    disabled={isSaving}
                    onClick={() =>
                      void updateRequestStatus(selectedRequest, {
                        status: "reviewed",
                      })
                    }
                  >
                    Mark reviewed
                  </Button>
                  <EstimateActionButton
                    request={selectedRequest}
                    estimate={estimateByRequestId[selectedRequest.id]}
                    isSaving={isSaving}
                    onCreateEstimate={openCreateEstimate}
                    onShareEstimate={(estimate, request) =>
                      void shareEstimateWithClient(estimate, request)
                    }
                    onRequestDetails={(r) => { setSelectedRequest(null); setDetailsRequest(r); setDetailsMessage("") }}
                    onScheduleInspection={(r) => { setSelectedRequest(null); setInspectionRequest(r); setInspectionDate(""); setInspectionStartTime(""); setInspectionNotes("") }}
                    onScheduleWork={(e) => { setSelectedRequest(null); void openWorkScheduler(e) }}
                    onDeclineRequest={(r) => { setSelectedRequest(null); setDeclineRequestTarget(r); setDeclineRequestReason("") }}
                    onMarkVisitCompleted={(r) => { setSelectedRequest(null); void markVisitCompleted(r) }}
                    onAcceptClientProposal={(r) => { setSelectedRequest(null); void acceptClientVisitProposal(r) }}
                    onCloseJob={(r) => { setSelectedRequest(null); void closeJob(r) }}
                  />
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Decline request dialog */}
      <Dialog open={declineRequestTarget !== null} onOpenChange={(open) => { if (!open) { setDeclineRequestTarget(null); setDeclineRequestReason("") } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Decline this request</DialogTitle>
            <DialogDescription>
              The client will be notified that you cannot take this job.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="decline-reason">Reason (optional)</Label>
            <Textarea
              id="decline-reason"
              value={declineRequestReason}
              onChange={(e) => setDeclineRequestReason(e.target.value)}
              placeholder="e.g. Outside our service area, fully booked, etc."
              className="min-h-20"
              disabled={isSubmittingDecline}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineRequestTarget(null)} disabled={isSubmittingDecline}>Cancel</Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={isSubmittingDecline}
              onClick={() => void submitDeclineRequest()}
            >
              {isSubmittingDecline ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
              Decline request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request more details dialog */}
      <Dialog open={detailsRequest !== null} onOpenChange={(open) => { if (!open) { setDetailsRequest(null); setDetailsMessage("") } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Request more details</DialogTitle>
            <DialogDescription>
              Ask the client to provide additional information before you create an estimate.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Label htmlFor="details-message">Message to client</Label>
            <Textarea
              id="details-message"
              value={detailsMessage}
              onChange={(e) => setDetailsMessage(e.target.value)}
              placeholder="e.g. Could you share photos of the area? What is the approximate square footage?"
              className="min-h-28"
              disabled={isSubmittingDetails}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDetailsRequest(null); setDetailsMessage("") }} disabled={isSubmittingDetails}>Cancel</Button>
            <Button
              className="bg-ef-ocean text-white hover:bg-ef-ocean"
              disabled={!detailsMessage.trim() || isSubmittingDetails}
              onClick={() => void submitDetailsRequest()}
            >
              {isSubmittingDetails ? <Loader2 className="size-4 animate-spin" /> : <HelpCircle className="size-4" />}
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule inspection dialog */}
      <Dialog open={inspectionRequest !== null} onOpenChange={(open) => { if (!open) { setInspectionRequest(null); setInspectionDate(""); setInspectionStartTime(""); setInspectionNotes("") } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Schedule inspection</DialogTitle>
            <DialogDescription>
              Set a date and time for the on-site inspection. The client will be asked to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="inspection-date">
                  <Calendar className="mr-1 inline-block size-3.5" />
                  Date
                </Label>
                <Input id="inspection-date" type="date" value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} disabled={isSubmittingInspection} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="inspection-time">
                  <Clock className="mr-1 inline-block size-3.5" />
                  Time (optional)
                </Label>
                <Input id="inspection-time" type="time" value={inspectionStartTime} onChange={(e) => setInspectionStartTime(e.target.value)} disabled={isSubmittingInspection} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inspection-notes">Notes (optional)</Label>
              <Textarea
                id="inspection-notes"
                value={inspectionNotes}
                onChange={(e) => setInspectionNotes(e.target.value)}
                placeholder="e.g. Please have access to the basement. I'll call ahead."
                className="min-h-20"
                disabled={isSubmittingInspection}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setInspectionRequest(null) }} disabled={isSubmittingInspection}>Cancel</Button>
            <Button
              className="bg-ef-ocean text-white hover:bg-ef-ocean"
              disabled={!inspectionDate || isSubmittingInspection}
              onClick={() => void submitInspectionSchedule()}
            >
              {isSubmittingInspection ? <Loader2 className="size-4 animate-spin" /> : <Calendar className="size-4" />}
              Schedule inspection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule work days dialog (multi-day) */}
      <Dialog open={workEstimate !== null} onOpenChange={(open) => { if (!open) setWorkEstimate(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Work schedule</DialogTitle>
            <DialogDescription>
              Add every day this job will take. The client sees the full schedule in their portal.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {/* Existing scheduled days */}
            <div className="grid gap-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Scheduled days
              </Label>
              {isLoadingWorkDays ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : workDays.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                  No work days yet. Add the first one below.
                </p>
              ) : (
                <ul className="grid gap-2" data-testid="work-day-list">
                  {workDays.map((day) => (
                    <li
                      key={day.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {formatWorkDayRange(day)}
                          {day.status === "completed" && (
                            <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-green-600">
                              <Check className="size-3" />
                              Completed
                            </span>
                          )}
                        </p>
                        {day.notes && (
                          <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                            {day.notes}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 text-muted-foreground hover:text-red-600"
                        onClick={() => void removeWorkDay(day.id)}
                        aria-label="Remove work day"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Conflict warning (warn, never block) */}
            {workConflicts.length > 0 && (
              <div
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
                data-testid="work-day-conflict-warning"
              >
                <p className="font-medium">Heads up: possible scheduling conflict</p>
                <ul className="mt-1 list-disc pl-4 text-xs text-amber-800/90 dark:text-amber-300/90">
                  {workConflicts.map((c, i) => (
                    <li key={i}>
                      You already have {c.label} then. You can&apos;t be in two places at once unless a crew covers it.
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Add a work day */}
            <div className="grid gap-3 rounded-lg border border-border p-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Add a work day
              </Label>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="work-date">
                    <Calendar className="mr-1 inline-block size-3.5" />
                    Date
                  </Label>
                  <Input id="work-date" type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} disabled={isSubmittingWork} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="work-start-time">
                    <Clock className="mr-1 inline-block size-3.5" />
                    Start time
                  </Label>
                  <Input id="work-start-time" type="time" value={workStartTime} onChange={(e) => setWorkStartTime(e.target.value)} disabled={isSubmittingWork} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="work-end-time">End time</Label>
                  <Input id="work-end-time" type="time" value={workEndTime} onChange={(e) => setWorkEndTime(e.target.value)} disabled={isSubmittingWork} placeholder="optional" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="work-notes">Notes (optional)</Label>
                <Textarea
                  id="work-notes"
                  value={workNotes}
                  onChange={(e) => setWorkNotes(e.target.value)}
                  placeholder="e.g. Please ensure access to the back yard. Materials will be delivered the day before."
                  className="min-h-20"
                  disabled={isSubmittingWork}
                />
              </div>
              <Button
                className="w-fit bg-ef-ocean text-white hover:bg-ef-ocean"
                disabled={!workDate || isSubmittingWork}
                onClick={() => void addWorkDay()}
                data-testid="add-work-day"
              >
                {isSubmittingWork ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Add work day
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWorkEstimate(null)} disabled={isSubmittingWork}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
        {/* Shareable link card */}
        {shareableLink && (
          <div className="flex flex-col gap-3 rounded-xl border border-ef-200 bg-ef-mist p-4 dark:border-ef-navy/60 dark:bg-ef-ink/20 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-ef-navy dark:text-ef-mist">
                <Link2 className="size-4 shrink-0" />
                Your client request link
              </div>
              <p
                className="mt-0.5 truncate text-xs text-ef-ocean dark:text-ef-300"
                data-testid="contractor-request-link"
              >
                {shareableLink}
              </p>
              <p className="mt-1 text-xs text-ef-ocean/70 dark:text-ef-cyan">
                Send this link to clients so they can submit a project request. No account needed.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-ef-300 bg-white text-ef-ocean hover:bg-ef-mist dark:border-ef-ocean dark:bg-transparent dark:text-ef-200"
                onClick={copyLink}
              >
                {linkCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {linkCopied ? "Copied!" : "Copy link"}
              </Button>
              <Button size="sm" variant="outline" asChild
                className="border-ef-300 bg-white text-ef-ocean hover:bg-ef-mist dark:border-ef-ocean dark:bg-transparent dark:text-ef-200"
              >
                <a
                  href={shareableLink}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="public-request-preview-link"
                >
                  <ExternalLink className="size-3.5" />
                  Preview
                </a>
              </Button>
            </div>
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Incoming Requests</CardTitle>
                <CardDescription>
                  Client job requests submitted to your workspace.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="w-fit">
                  {newCount} new
                </Badge>
                {closedCount > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowClosedRequests((value) => !value)}
                    className="h-7 px-2 text-xs text-muted-foreground"
                  >
                    {showClosedRequests ? "Hide closed" : `Show closed (${closedCount})`}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {errorMessage ? (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {errorMessage}
              </div>
            ) : null}

            <ContentReveal isLoading={isLoading} skeleton={<RequestsSkeleton />}>
              {visibleRequests.length > 0 ? (
                <div className="grid gap-3">
                  {visibleRequests.map((request) => (
                    <div
                      key={request.id}
                      data-testid="job-request-card"
                      data-request-id={request.id}
                      className={`rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md ${
                        highlightedId === request.id
                          ? "border-ef-ocean ring-2 ring-ef-ocean/40"
                          : "border-border"
                      }`}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-semibold">
                              {request.title}
                            </h3>
                            {request.trade && (
                              <Badge
                                variant="outline"
                                className="border-ef-200 bg-ef-mist text-ef-ocean dark:border-ef-navy/60 dark:bg-ef-ink/40 dark:text-ef-200"
                              >
                                {request.trade}
                              </Badge>
                            )}
                            <Badge variant="outline">
                              {labelFromSlug(request.status)}
                            </Badge>
                            {request.more_details_response && (
                              <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                                Info received
                              </Badge>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3.5" />
                              {request.service_area}
                            </span>
                            <span>{labelFromSlug(request.urgency)}</span>
                            <span>{budgetLabel(request)}</span>
                          </div>
                          <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
                            {request.description}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setSelectedRequest(request)}
                            data-testid="job-request-view-details"
                          >
                            <FileText className="size-4" />
                            View details
                          </Button>
                          <EstimateActionButton
                            request={request}
                            estimate={estimateByRequestId[request.id]}
                            isSaving={isSaving}
                            onCreateEstimate={openCreateEstimate}
                            onShareEstimate={(estimate, request) =>
                              void shareEstimateWithClient(estimate, request)
                            }
                            onRequestDetails={(r) => { setDetailsRequest(r); setDetailsMessage("") }}
                            onScheduleInspection={(r) => { setInspectionRequest(r); setInspectionDate(""); setInspectionStartTime(""); setInspectionNotes("") }}
                            onScheduleWork={(e) => { void openWorkScheduler(e) }}
                            onDeclineRequest={(r) => { setDeclineRequestTarget(r); setDeclineRequestReason("") }}
                            onMarkVisitCompleted={(r) => void markVisitCompleted(r)}
                            onAcceptClientProposal={(r) => void acceptClientVisitProposal(r)}
                            onCloseJob={(r) => void closeJob(r)}
                          />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="size-4" />
                                <span className="sr-only">More actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>{request.title}</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() =>
                                  void updateRequestStatus(request, {
                                    status: "reviewed",
                                  })
                                }
                              >
                                Mark reviewed
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() =>
                                  void updateRequestStatus(request, {
                                    status: "closed",
                                  })
                                }
                              >
                                Close request
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
                  <div className="mx-auto grid size-12 place-items-center rounded-lg bg-background text-muted-foreground">
                    <ClipboardList className="size-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">
                    {requests.length > 0 ? "No active requests" : "No incoming requests"}
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    {requests.length > 0
                      ? "Closed requests are hidden so current work stays easy to scan."
                      : "Share your client request link so clients can submit job requests directly to you."}
                  </p>
                </div>
              )}
            </ContentReveal>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
