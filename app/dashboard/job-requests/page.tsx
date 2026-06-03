"use client"

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  Calendar,
  Check,
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
import { createClient } from "@/lib/supabase/client"
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
}

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

function nullableText(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function nullableDate(value: string) {
  return value || null
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
  return items
    .filter((item) => item.description.trim() || parseAmount(item.unit_price) > 0)
    .map(({ description, quantity, unit_price }) => ({
      description: description.trim(),
      quantity: parseAmount(quantity),
      unit_price: parseAmount(unit_price),
    }))
}

function serializeTaxLines(lines: EstimateTaxLine[]) {
  return lines
    .filter((line) => line.name.trim() || parseAmount(line.rate) > 0)
    .map(({ name, rate }) => ({
      name: name.trim() || "Tax",
      rate: parseAmount(rate),
    }))
}

function lineItemSubtotal(items: EstimateLineItem[]) {
  return serializeLineItems(items).reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
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
}: {
  request: JobRequest
  estimate: EstimateRow | undefined
  isSaving: boolean
  onCreateEstimate: (r: JobRequest) => void
  onShareEstimate: (estimate: EstimateRow, request: JobRequest) => void
  onRequestDetails: (r: JobRequest) => void
  onScheduleInspection: (r: JobRequest) => void
}) {
  const hasEstimate =
    request.status === "estimate_created" ||
    request.status === "accepted" ||
    request.status === "declined"

  if (estimate) {
    return (
      <>
        <Button variant="outline" asChild>
          <Link
            href={`/dashboard/estimates?highlight=${estimate.id}`}
            data-testid="job-request-view-estimate"
          >
            <FileText className="size-4" />
            View estimate
          </Link>
        </Button>
        {estimate.status === "Draft" ? (
          <Button
            data-testid="job-request-share-estimate"
            className="bg-ef-ocean text-white hover:bg-ef-ocean"
            disabled={isSaving}
            onClick={() => onShareEstimate(estimate, request)}
          >
            <Send className="size-4" />
            Share with client
          </Button>
        ) : null}
      </>
    )
  }
  if (hasEstimate) {
    return (
      <Button variant="outline" disabled>
        <FileText className="size-4" />
        Estimate created
      </Button>
    )
  }

  const canAct =
    request.status === "new" ||
    request.status === "reviewed" ||
    request.status === "needs_info" ||
    request.status === "inspection_scheduled" ||
    request.status === "inspection_confirmed"

  if (!canAct) return null

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={isSaving}
        onClick={() => onRequestDetails(request)}
        data-testid="job-request-request-details"
      >
        <HelpCircle className="size-4" />
        Request details
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={isSaving}
        onClick={() => onScheduleInspection(request)}
        data-testid="job-request-schedule-inspection"
      >
        <Calendar className="size-4" />
        Schedule inspection
      </Button>
      <Button
        data-testid="job-request-create-estimate"
        className="bg-ef-ocean text-white hover:bg-ef-ocean"
        disabled={isSaving}
        onClick={() => onCreateEstimate(request)}
      >
        <Plus className="size-4" />
        Create estimate
      </Button>
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
  const [requests, setRequests] = useState<JobRequest[]>([])
  const [userId, setUserId] = useState<string | null>(null)
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

    // Fetch profile to get the request slug for the shareable link.
    const { data: profile } = await supabase
      .from("profiles")
      .select("request_slug")
      .eq("user_id", user.id)
      .maybeSingle()
    if (profile?.request_slug) setRequestSlug(profile.request_slug)

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

  async function updateRequestStatus(
    request: JobRequest,
    patch: JobRequestUpdate
  ) {
    const { data, error } = await supabase
      .from("job_requests")
      .update(patch)
      .eq("id", request.id)
      .select()
      .single()

    if (error) {
      toast.error(error.message)
      return null
    }

    setRequests((current) =>
      current.map((item) => (item.id === request.id ? data : item))
    )
    if (selectedRequest?.id === request.id) setSelectedRequest(data)
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

    const clientName =
      nullableText(clientNameOverride ?? "") ||
      request.client_name ||
      request.client_email ||
      "Client from job request"
    const payload: ClientInsert = {
      user_id: userId,
      name: clientName,
      company: clientName,
      email: request.client_email,
      phone: request.client_phone,
      notes: `Created from job request: ${request.title}`,
      payment_reliability: "New client",
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

  async function submitDetailsRequest() {
    if (!detailsRequest || !detailsMessage.trim() || isSubmittingDetails) return
    setIsSubmittingDetails(true)
    const updated = await updateRequestStatus(detailsRequest, {
      status: "needs_info",
      more_details_message: detailsMessage.trim(),
    })
    setIsSubmittingDetails(false)
    if (!updated) return
    setDetailsRequest(null)
    setDetailsMessage("")
    toast.success("More details requested from client")
  }

  async function submitInspectionSchedule() {
    if (!inspectionRequest || !inspectionDate || isSubmittingInspection) return
    setIsSubmittingInspection(true)
    const timeStr = inspectionStartTime || "09:00"
    const startsAt = new Date(`${inspectionDate}T${timeStr}`).toISOString()
    const updated = await updateRequestStatus(inspectionRequest, {
      status: "inspection_scheduled",
      scheduled_visit_type: "inspection",
      scheduled_visit_starts_at: startsAt,
      scheduled_visit_notes: inspectionNotes.trim() || null,
    })
    setIsSubmittingInspection(false)
    if (!updated) return
    setInspectionRequest(null)
    setInspectionDate("")
    setInspectionStartTime("")
    setInspectionNotes("")
    toast.success("Inspection scheduled — client will be asked to confirm")
  }

  async function saveEstimateFromRequest(sendToClient: boolean) {
    if (!userId || !estimateRequest || isSaving) return
    setIsSaving(true)

    const serializedItems = serializeLineItems(estimateForm.lineItems)
    const serializedTaxLines =
      estimateForm.lineItems.length > 0 ? serializeTaxLines(estimateForm.taxLines) : []
    const finalAmount =
      estimateForm.lineItems.length > 0
        ? estimateTotal
        : parseAmount(estimateForm.flatAmount)

    if (sendToClient && finalAmount <= 0) {
      toast.error("Add an amount before sending this estimate.")
      setIsSaving(false)
      return
    }

    const client = await ensureClientForRequest(
      estimateRequest,
      estimateForm.clientName
    )

    const payload: EstimateInsert = {
      user_id: userId,
      client_id: client?.id ?? null,
      job_request_id: estimateRequest.id,
      client_name:
        client?.company ||
        client?.name ||
        nullableText(estimateForm.clientName) ||
        estimateRequest.client_name ||
        estimateRequest.client_email ||
        null,
      estimate_number:
        estimateForm.estimateNumber.trim() ||
        `EST-${Date.now().toString().slice(-5)}`,
      amount: finalAmount,
      status: sendToClient ? "Sent" : "Draft",
      sent_date: inputDate(),
      follow_up_date: nullableDate(estimateForm.followUpDate),
      notes: nullableText(estimateForm.notes),
      billing_type: estimateForm.billingType,
      line_items: serializedItems,
      tax_rate: 0,
      tax_lines: serializedTaxLines,
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
      toast.success("Estimate shared with client")
    }

    setIsSaving(false)
  }

  const newCount = requests.filter((r) => r.status === "new").length

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
                  />
                </div>
              </div>
            </>
          ) : null}
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
                Send this link to clients so they can submit a project request — no account needed.
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
              <Badge variant="outline" className="w-fit">
                {newCount} new
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {errorMessage ? (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {errorMessage}
              </div>
            ) : null}

            <ContentReveal isLoading={isLoading} skeleton={<RequestsSkeleton />}>
              {requests.length > 0 ? (
                <div className="grid gap-3">
                  {requests.map((request) => (
                    <div
                      key={request.id}
                      data-testid="job-request-card"
                      data-request-id={request.id}
                      className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
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
                    No incoming requests
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    Share your client request link so clients can submit job requests directly to you.
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
