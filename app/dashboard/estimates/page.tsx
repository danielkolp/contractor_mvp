"use client"

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  MoreHorizontal,
  Pencil,
  Printer,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Send,
  Trash2,
  X,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/dashboard/page-header"
import { InvoiceListSkeleton } from "@/components/dashboard/skeleton-loaders"
import { ContentReveal } from "@/components/ui/content-reveal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
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
import { money as moneyFormatter } from "@/lib/format-money"
import { computePricing } from "@/lib/pricing"
import {
  effectivePlan,
  hasPlanFeature,
  planFeeOptions,
  transactionFeeCapCents,
  transactionFeePercent,
  type PlanTier,
} from "@/lib/plans"
import {
  INPUT_LIMITS,
  InputValidationError,
  enumField,
  inputErrorMessage,
  isoDateField,
  numberField,
  optionalIsoDateField,
  optionalTextField,
  optionalUuidField,
  textField,
} from "@/lib/security/input"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { cn } from "@/lib/utils"

type ClientRow = Database["public"]["Tables"]["clients"]["Row"]
type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"]
type EstimateInsert = Database["public"]["Tables"]["estimates"]["Insert"]
type EstimateUpdate = Database["public"]["Tables"]["estimates"]["Update"]
type EstimateStatus = Database["public"]["Enums"]["estimate_status"]
type InvoiceInsert = Database["public"]["Tables"]["invoices"]["Insert"]

// ─── Tax line helpers ─────────────────────────────────────────────────────────

type TaxLine = {
  id: string
  name: string
  rate: string
}

const TAX_PRESETS: { name: string; rate: string }[] = [
  { name: "GST", rate: "5" },
  { name: "HST", rate: "15" },
  { name: "PST", rate: "7" },
  { name: "QST", rate: "9.975" },
]

function newTaxLine(name = "", rate = ""): TaxLine {
  return { id: Math.random().toString(36).slice(2), name, rate }
}

function serializeTaxLines(lines: TaxLine[]) {
  if (lines.length > 20) {
    throw new InputValidationError("Tax lines must include 20 rows or fewer.")
  }

  return lines
    .filter((t) => t.name.trim() || parseFloat(t.rate) > 0)
    .map(({ name, rate }) => ({
      name: textField(name.trim() ? name : "Tax", "Tax name", {
        required: true,
        maxLength: INPUT_LIMITS.taxName,
      }),
      rate: numberField(rate || 0, "Tax rate", { min: 0, max: 100 }),
    }))
}

function deserializeTaxLines(raw: unknown): TaxLine[] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  return (raw as { name: string; rate: number }[]).map((t) => ({
    id: Math.random().toString(36).slice(2),
    name: String(t.name ?? ""),
    rate: String(t.rate ?? "0"),
  }))
}

// ─── Line item helpers ────────────────────────────────────────────────────────

type LineItem = {
  id: string
  description: string
  quantity: string
  unit_price: string
}

function newLineItem(): LineItem {
  return {
    id: Math.random().toString(36).slice(2),
    description: "",
    quantity: "1",
    unit_price: "",
  }
}

function lineItemSubtotal(items: LineItem[]): number {
  return items.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0
    const price = parseFloat(item.unit_price) || 0
    return sum + qty * price
  }, 0)
}

function serializeLineItems(items: LineItem[]) {
  if (items.length > 100) {
    throw new InputValidationError("Line items must include 100 rows or fewer.")
  }

  return items.map(({ description, quantity, unit_price }, index) => ({
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

function deserializeLineItems(raw: unknown): LineItem[] {
  if (!raw || !Array.isArray(raw)) return []
  return (raw as Record<string, unknown>[]).map((item) => ({
    id: Math.random().toString(36).slice(2),
    description: String(item.description ?? ""),
    quantity: String(item.quantity ?? "1"),
    unit_price: String(item.unit_price ?? ""),
  }))
}

// ─── Estimate form type ───────────────────────────────────────────────────────

type EstimateForm = {
  clientId: string
  clientName: string
  estimateNumber: string
  amount: string
  status: EstimateStatus
  sentDate: string
  followUpDate: string
  notes: string
  lineItems: LineItem[]
  taxLines: TaxLine[]
  contractorAmountCents: string
  depositAmountCents: string
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

const statusTone: Record<
  EstimateStatus,
  "default" | "success" | "warning" | "muted" | "outline"
> = {
  Draft: "muted",
  Sent: "default",
  "Follow-up Needed": "warning",
  "Follow-up Sent": "outline",
  Interested: "default",
  Accepted: "success",
  Won: "success",
  Declined: "muted",
  Lost: "muted",
  Archived: "muted",
}


const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

function inputDate(offsetDays = 0) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offsetDays)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function formatDate(value: string | null) {
  if (!value) return "Not set"
  return dateFormatter.format(new Date(`${value}T00:00:00`))
}

function getClientLabel(client: ClientRow): string {
  if (client.company) {
    return client.name && client.name !== client.company
      ? `${client.company} - ${client.name}`
      : client.company
  }
  return client.name || "Unnamed client"
}

function SelectField({
  id,
  value,
  onChange,
  children,
  className,
  ...props
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
  className?: string
} & Omit<React.ComponentProps<"select">, "onChange" | "value" | "children">) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "flex h-9 min-w-0 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
}

const initialForm: EstimateForm = {
  clientId: "",
  clientName: "",
  estimateNumber: "",
  amount: "",
  status: "Sent",
  sentDate: inputDate(),
  followUpDate: inputDate(3),
  notes: "",
  lineItems: [],
  taxLines: [],
  contractorAmountCents: "",
  depositAmountCents: "",
}

function formFromEstimate(estimate: EstimateRow): EstimateForm {
  // Prefer new tax_lines; fall back to legacy tax_rate for old records.
  const taxLines =
    deserializeTaxLines(estimate.tax_lines).length > 0
      ? deserializeTaxLines(estimate.tax_lines)
      : estimate.tax_rate > 0
        ? [newTaxLine("Tax", String(estimate.tax_rate))]
        : []

  return {
    clientId: estimate.client_id ?? "",
    clientName: estimate.client_name ?? "",
    estimateNumber: estimate.estimate_number,
    amount: String(estimate.amount ?? ""),
    status: estimate.status,
    sentDate: estimate.sent_date,
    followUpDate: estimate.follow_up_date ?? "",
    notes: estimate.notes ?? "",
    lineItems: deserializeLineItems(estimate.line_items),
    taxLines,
    contractorAmountCents: estimate.contractor_amount_cents
      ? String(estimate.contractor_amount_cents / 100)
      : "",
    depositAmountCents: (estimate as EstimateRow & { deposit_amount_cents?: number | null }).deposit_amount_cents
      ? String(((estimate as EstimateRow & { deposit_amount_cents?: number | null }).deposit_amount_cents ?? 0) / 100)
      : "",
  }
}

export default function EstimatesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const highlightId = searchParams.get("highlight")
  const supabase = useMemo(() => createClient(), [])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [estimates, setEstimates] = useState<EstimateRow[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [plan, setPlan] = useState<PlanTier>("free")
  const [searchQuery, setSearchQuery] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEstimate, setEditingEstimate] = useState<EstimateRow | null>(
    null
  )
  const [form, setForm] = useState<EstimateForm>(initialForm)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)

  // ─── Derived line item totals ────────────────────────────────────────────────
  const subtotal = useMemo(() => lineItemSubtotal(form.lineItems), [form.lineItems])
  const totalTaxAmount = useMemo(
    () =>
      form.taxLines.reduce(
        (sum, t) => sum + subtotal * ((parseFloat(t.rate) || 0) / 100),
        0
      ),
    [subtotal, form.taxLines]
  )
  const computedTotal = useMemo(() => subtotal + totalTaxAmount, [subtotal, totalTaxAmount])
  const hasLineItems = form.lineItems.length > 0

  // ─── Stripe payout breakdown via shared pricing helper ───────────────────────
  // Plan-based fee, charged to the client on top: Free 5% capped at $50 /
  // Pro 2% capped at $25 per transaction (see lib/plans.ts).
  const feeOptions = useMemo(() => planFeeOptions(plan), [plan])
  // Custom deposit amounts are a Pro feature; Free uses the default 30% deposit.
  const canCustomDeposit = hasPlanFeature(plan, "customDeposits")
  const contractorDollars = parseFloat(form.contractorAmountCents) || 0
  const rawContractorCents = Math.round(contractorDollars * 100)
  const rawDepositCents    = Math.round((parseFloat(form.depositAmountCents) || 0) * 100)
  const pricing = rawContractorCents > 0
    ? computePricing(rawContractorCents, {
        depositInputCents: canCustomDeposit && rawDepositCents > 0 ? rawDepositCents : null,
        ...feeOptions,
      })
    : null
  const contractorCents   = pricing?.contractorSubtotalCents ?? 0
  const clientTotalCents  = pricing?.clientTotalCents ?? 0
  const depositCents      = pricing?.depositCents ?? 0
  const remainingCents    = pricing?.remainingBalanceCents ?? 0
  const hasStripePayment  = contractorCents > 0

  // ─── Data loading ────────────────────────────────────────────────────────────
  const loadEstimates = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setErrorMessage(userError?.message || "You must be logged in.")
      setClients([])
      setEstimates([])
      setUserId(null)
      setIsLoading(false)
      return
    }

    setUserId(user.id)

    const [clientsResult, estimatesResult, profileResult] = await Promise.all([
      supabase
        .from("clients")
        .select("*")
        .eq("user_id", user.id)
        .order("company", { ascending: true }),
      supabase
        .from("estimates")
        .select("*")
        .eq("user_id", user.id)
        .order("sent_date", { ascending: false }),
      supabase
        .from("profiles")
        .select("plan, plan_status")
        .eq("user_id", user.id)
        .maybeSingle(),
    ])

    setPlan(
      effectivePlan(
        profileResult.data?.plan ?? "free",
        profileResult.data?.plan_status ?? "active"
      )
    )

    const firstError = clientsResult.error || estimatesResult.error

    if (firstError) {
      setErrorMessage(firstError.message)
      setClients([])
      setEstimates([])
    } else {
      setClients(clientsResult.data ?? [])
      setEstimates(estimatesResult.data ?? [])
    }

    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadEstimates()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadEstimates])

  // When navigated here with ?highlight=<estimateId>, scroll to the row and
  // briefly flash a green ring so the contractor knows which estimate was just
  // created from their job request.
  useEffect(() => {
    if (!highlightId || isLoading) return
    const el = document.getElementById(`estimate-row-${highlightId}`)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    setHighlightedId(highlightId)
    const timer = window.setTimeout(() => setHighlightedId(null), 2500)
    return () => window.clearTimeout(timer)
  }, [highlightId, isLoading])

  // ─── Filtering ───────────────────────────────────────────────────────────────
  const filteredEstimates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return estimates
    return estimates.filter(
      (estimate) =>
        estimate.estimate_number.toLowerCase().includes(query) ||
        (estimate.client_name ?? "").toLowerCase().includes(query) ||
        estimate.status.toLowerCase().includes(query)
    )
  }, [estimates, searchQuery])

  const openEstimates = useMemo(
    () =>
      estimates.filter(
        (estimate) =>
          estimate.status !== "Won" &&
          estimate.status !== "Accepted" &&
          estimate.status !== "Lost" &&
          estimate.status !== "Declined" &&
          estimate.status !== "Archived"
      ),
    [estimates]
  )

  // ─── Form helpers ─────────────────────────────────────────────────────────────
  function updateForm<Field extends keyof EstimateForm>(
    field: Field,
    value: EstimateForm[Field]
  ) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function addLineItem() {
    setForm((current) => ({
      ...current,
      lineItems: [...current.lineItems, newLineItem()],
    }))
  }

  function removeLineItem(id: string) {
    setForm((current) => ({
      ...current,
      lineItems: current.lineItems.filter((item) => item.id !== id),
    }))
  }

  function updateLineItem(
    id: string,
    field: keyof Omit<LineItem, "id">,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      lineItems: current.lineItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    }))
  }

  function addTaxLine(name = "", rate = "") {
    setForm((current) => ({
      ...current,
      taxLines: [...current.taxLines, newTaxLine(name, rate)],
    }))
  }

  function removeTaxLine(id: string) {
    setForm((current) => ({
      ...current,
      taxLines: current.taxLines.filter((t) => t.id !== id),
    }))
  }

  function updateTaxLine(id: string, field: "name" | "rate", value: string) {
    setForm((current) => ({
      ...current,
      taxLines: current.taxLines.map((t) =>
        t.id === id ? { ...t, [field]: value } : t
      ),
    }))
  }

  // ─── Dialog open/close ───────────────────────────────────────────────────────
  function openAddEstimate() {
    setEditingEstimate(null)
    setForm({
      ...initialForm,
      estimateNumber: `EST-${Date.now().toString().slice(-5)}`,
    })
    setDialogOpen(true)
  }

  function openEditEstimate(estimate: EstimateRow) {
    setEditingEstimate(estimate)
    setForm(formFromEstimate(estimate))
    setDialogOpen(true)
  }

  function closeEstimateDialog(open: boolean) {
    setDialogOpen(open)
    if (!open) {
      setEditingEstimate(null)
      setForm(initialForm)
    }
  }

  // ─── Save estimate ────────────────────────────────────────────────────────────
  async function handleAddOrUpdateEstimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!userId) {
      setErrorMessage("You must be logged in to save estimates.")
      return
    }

    setErrorMessage(null)

    const selectedClient = form.clientId
      ? clients.find((client) => client.id === form.clientId) ?? null
      : null

    let payload: EstimateInsert
    try {
      const safeClientId = optionalUuidField(form.clientId, "Client")
      const serializedItems = hasLineItems ? serializeLineItems(form.lineItems) : []
      const serializedTaxLines = hasLineItems ? serializeTaxLines(form.taxLines) : []
      const sanitizedSubtotal = serializedItems.reduce(
        (sum, item) => sum + item.quantity * item.unit_price,
        0
      )
      const sanitizedTaxTotal = serializedTaxLines.reduce(
        (sum, taxLine) => sum + sanitizedSubtotal * (taxLine.rate / 100),
        0
      )
      const lineAmount = hasLineItems
        ? numberField(sanitizedSubtotal + sanitizedTaxTotal, "Estimate amount", {
            min: 0,
            max: 10_000_000,
          })
        : numberField(form.amount || 0, "Estimate amount", {
            min: 0,
            max: 10_000_000,
          })
      const contractorAmount = numberField(form.contractorAmountCents || 0, "Payout amount", {
        min: 0,
        max: 10_000_000,
      })
      const depositAmount = numberField(form.depositAmountCents || 0, "Deposit amount", {
        min: 0,
        max: contractorAmount || 10_000_000,
      })
      const safeContractorCents = Math.round(contractorAmount * 100)
      const safeDepositCents = Math.round(depositAmount * 100)
      const safePricing =
        safeContractorCents > 0
          ? computePricing(safeContractorCents, {
              // Custom deposits are Pro-only; Free always gets the 30% default.
              depositInputCents:
                canCustomDeposit && safeDepositCents > 0 ? safeDepositCents : null,
              ...feeOptions,
            })
          : null
      const resolvedClientName = selectedClient
        ? optionalTextField(getClientLabel(selectedClient), "Client name", {
            maxLength: INPUT_LIMITS.name,
          })
        : optionalTextField(form.clientName, "Client name", {
            maxLength: INPUT_LIMITS.name,
          })

      payload = {
        user_id: userId,
        client_id: safeClientId,
        client_name: resolvedClientName,
        estimate_number: textField(
          form.estimateNumber.trim() || `EST-${Date.now().toString().slice(-5)}`,
          "Estimate number",
          { required: true, maxLength: INPUT_LIMITS.estimateNumber }
        ),
        amount: safePricing ? safePricing.clientTotalCents / 100 : lineAmount,
        status: enumField(form.status, "Estimate status", estimateStatuses),
        sent_date: isoDateField(form.sentDate || inputDate(), "Sent date"),
        follow_up_date: optionalIsoDateField(form.followUpDate, "Follow-up date"),
        notes: optionalTextField(form.notes, "Notes", {
          maxLength: INPUT_LIMITS.notes,
          multiline: true,
        }),
        line_items: serializedItems,
        tax_rate: 0,
        tax_lines: serializedTaxLines,
        contractor_amount_cents: safePricing ? safePricing.contractorSubtotalCents : null,
        platform_fee_cents: safePricing ? safePricing.platformFeeCents : null,
        gst_cents: safePricing ? safePricing.gstCents : null,
        client_total_cents: safePricing ? safePricing.clientTotalCents : null,
        deposit_amount_cents:
          safePricing && safePricing.depositCents > 0 ? safePricing.depositCents : null,
      }
    } catch (error) {
      const message = inputErrorMessage(error)
      setErrorMessage(message)
      toast.error(message)
      return
    }

    setIsSaving(true)

    if (editingEstimate) {
      const updatePayload: EstimateUpdate = {
        client_id: payload.client_id,
        client_name: payload.client_name,
        estimate_number: payload.estimate_number,
        amount: payload.amount,
        status: payload.status,
        sent_date: payload.sent_date,
        follow_up_date: payload.follow_up_date,
        notes: payload.notes,
        line_items: payload.line_items,
        tax_rate: 0,
        tax_lines: payload.tax_lines,
        contractor_amount_cents: payload.contractor_amount_cents,
        platform_fee_cents:      payload.platform_fee_cents,
        gst_cents:               payload.gst_cents,
        client_total_cents:      payload.client_total_cents,
        deposit_amount_cents:    payload.deposit_amount_cents,
      }
      const { data, error } = await supabase
        .from("estimates")
        .update(updatePayload)
        .eq("id", editingEstimate.id)
        .eq("user_id", userId)
        .select()
        .single()

      if (error) {
        setErrorMessage(error.message)
        toast.error("Could not save estimate")
      } else {
        setEstimates((current) =>
          current.map((estimate) =>
            estimate.id === editingEstimate.id ? data : estimate
          )
        )
        closeEstimateDialog(false)
        toast.success("Estimate saved")
      }
    } else {
      const { data, error } = await supabase
        .from("estimates")
        .insert(payload)
        .select()
        .single()

      if (error) {
        setErrorMessage(error.message)
        toast.error("Could not add estimate")
      } else {
        setEstimates((current) => [data, ...current])
        closeEstimateDialog(false)
        toast.success("Estimate added")
      }
    }

    setIsSaving(false)
  }

  // ─── Status update ────────────────────────────────────────────────────────────
  async function updateEstimateStatus(
    estimate: EstimateRow,
    status: EstimateStatus
  ) {
    if (!userId) return

    let safeStatus: EstimateStatus
    try {
      safeStatus = enumField(status, "Estimate status", estimateStatuses)
    } catch (error) {
      toast.error(inputErrorMessage(error))
      return
    }

    setIsSaving(true)

    const payload: EstimateUpdate = {
      status: safeStatus,
      follow_up_date:
        safeStatus === "Won" || safeStatus === "Lost" || safeStatus === "Archived"
          ? null
          : estimate.follow_up_date,
    }

    const { data, error } = await supabase
      .from("estimates")
      .update(payload)
      .eq("id", estimate.id)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) {
      toast.error("Could not update estimate")
    } else {
      setEstimates((current) =>
        current.map((item) => (item.id === estimate.id ? data : item))
      )
      toast.success(`Estimate marked ${safeStatus.toLowerCase()}`)
    }

    setIsSaving(false)
  }

  // ─── Share estimate with client ───────────────────────────────────────────────
  async function shareEstimate(estimate: EstimateRow) {
    if (estimate.amount <= 0) {
      toast.error("Add an amount before sharing this estimate.")
      return
    }
    if (!userId) return
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
    } else {
      if (estimate.job_request_id) {
        const { error: requestError } = await supabase
          .from("job_requests")
          .update({ status: "estimate_created" })
          .eq("id", estimate.job_request_id)

        if (requestError) {
          toast.error("Estimate was sent, but the request status could not be updated.")
          setIsSaving(false)
          return
        }
      }

      setEstimates((current) =>
        current.map((e) => (e.id === estimate.id ? data : e))
      )
      window.dispatchEvent(new Event("estg:badge-refresh"))
      toast.success("Estimate sent to client")
    }

    setIsSaving(false)
  }

  // ─── Delete estimate ──────────────────────────────────────────────────────────
  async function deleteEstimate(estimate: EstimateRow) {
    if (!userId) return
    const { error } = await supabase
      .from("estimates")
      .delete()
      .eq("id", estimate.id)
      .eq("user_id", userId)

    if (error) {
      toast.error("Could not delete estimate")
      return
    }

    setEstimates((current) => current.filter((e) => e.id !== estimate.id))

    // Reset the linked job request so the contractor can create a new estimate.
    if (estimate.job_request_id) {
      await supabase
        .from("job_requests")
        .update({ status: "reviewed" })
        .eq("id", estimate.job_request_id)
    }

    toast.success("Estimate deleted")
  }

  // ─── Convert estimate → invoice ───────────────────────────────────────────────
  async function convertToInvoice(estimate: EstimateRow) {
    if (!userId) return
    setIsSaving(true)

    const today = inputDate()
    const dueDate = inputDate(30)

    const payload: InvoiceInsert = {
      user_id: userId,
      client_id: estimate.client_id,
      job_request_id: estimate.job_request_id,
      client_name: estimate.client_name,
      invoice_number: `INV-${Date.now().toString().slice(-5)}`,
      amount: estimate.amount,
      issue_date: today,
      due_date: dueDate,
      status: "Draft",
      notes: estimate.notes,
      line_items: Array.isArray(estimate.line_items) ? estimate.line_items : [],
      tax_rate: 0,
      tax_lines: Array.isArray(estimate.tax_lines) ? estimate.tax_lines : [],
    }

    const { data, error } = await supabase
      .from("invoices")
      .insert(payload)
      .select()
      .single()

    if (error) {
      toast.error("Could not create invoice")
      setIsSaving(false)
      return
    }

    // Mark estimate Won
    await supabase
      .from("estimates")
      .update({ status: "Won" })
      .eq("id", estimate.id)
      .eq("user_id", userId)

    setEstimates((current) =>
      current.map((e) =>
        e.id === estimate.id ? { ...e, status: "Won" as EstimateStatus } : e
      )
    )

    toast.success(`Invoice ${data.invoice_number} created`, {
      description: "Estimate marked as won.",
      action: {
        label: "View Invoices",
        onClick: () => router.push("/dashboard/invoices"),
      },
    })

    setIsSaving(false)
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <PageHeader
        title="Estimates"
        description="Track quotes you've sent and know exactly when to follow up."
      >
        <Button onClick={openAddEstimate}>
          <Plus className="size-4" />
          New estimate
        </Button>
      </PageHeader>

      {/* ── Add / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={closeEstimateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingEstimate ? "Edit estimate" : "New estimate"}
            </DialogTitle>
            <DialogDescription>
              Add line items for a professional PDF, or enter a flat amount.
            </DialogDescription>
          </DialogHeader>

          <form className="grid gap-5" onSubmit={handleAddOrUpdateEstimate}>
            {/* Client + number */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="estimate-client">Client</Label>
                <SelectField
                  id="estimate-client"
                  value={form.clientId}
                  onChange={(value) => {
                    const client = clients.find((item) => item.id === value)
                    updateForm("clientId", value)
                    if (client) updateForm("clientName", getClientLabel(client))
                  }}
                  disabled={isSaving}
                >
                  <option value="">No linked client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {getClientLabel(client)}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="estimate-client-name">Client name</Label>
                <Input
                  id="estimate-client-name"
                  value={form.clientName}
                  onChange={(event) =>
                    updateForm("clientName", event.target.value)
                  }
                  placeholder="Homeowner or company"
                  disabled={isSaving}
                />
              </div>
            </div>

            {/* Number + status */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="estimate-number">Estimate #</Label>
                <Input
                  id="estimate-number"
                  value={form.estimateNumber}
                  onChange={(event) =>
                    updateForm("estimateNumber", event.target.value)
                  }
                  placeholder="EST-1001"
                  disabled={isSaving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="estimate-status">Status</Label>
                <SelectField
                  id="estimate-status"
                  value={form.status}
                  onChange={(value) =>
                    updateForm("status", value as EstimateStatus)
                  }
                  disabled={isSaving}
                >
                  {estimateStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </SelectField>
              </div>
            </div>

            {/* Dates */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="estimate-sent-date">Sent date</Label>
                <Input
                  id="estimate-sent-date"
                  type="date"
                  value={form.sentDate}
                  onChange={(event) => updateForm("sentDate", event.target.value)}
                  disabled={isSaving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="estimate-follow-up-date">Follow-up date</Label>
                <Input
                  id="estimate-follow-up-date"
                  type="date"
                  value={form.followUpDate}
                  onChange={(event) =>
                    updateForm("followUpDate", event.target.value)
                  }
                  disabled={isSaving}
                />
              </div>
            </div>

            {/* ── Line items ── */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Line Items</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addLineItem}
                  disabled={isSaving}
                >
                  <Plus className="size-3.5" />
                  Add item
                </Button>
              </div>

              {form.lineItems.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  {/* Column headers */}
                  <div className="grid grid-cols-[1fr_56px_96px_28px] gap-2 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                    <span>Description</span>
                    <span className="text-right">Qty</span>
                    <span className="text-right">Unit Price</span>
                    <span />
                  </div>

                  {/* Item rows */}
                  {form.lineItems.map((item) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-[1fr_56px_96px_28px] gap-2 border-t border-border px-3 py-2"
                    >
                      <Input
                        value={item.description}
                        onChange={(e) =>
                          updateLineItem(item.id, "description", e.target.value)
                        }
                        placeholder="What's included"
                        className="h-8 text-sm"
                        disabled={isSaving}
                      />
                      <Input
                        value={item.quantity}
                        onChange={(e) =>
                          updateLineItem(item.id, "quantity", e.target.value)
                        }
                        type="number"
                        min="0"
                        step="any"
                        className="h-8 text-sm text-right"
                        disabled={isSaving}
                      />
                      <Input
                        value={item.unit_price}
                        onChange={(e) =>
                          updateLineItem(item.id, "unit_price", e.target.value)
                        }
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="h-8 text-sm text-right"
                        disabled={isSaving}
                      />
                      <button
                        type="button"
                        onClick={() => removeLineItem(item.id)}
                        className="flex size-7 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        disabled={isSaving}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}

                  {/* Totals */}
                  <div className="border-t border-border bg-muted/30 px-3 py-3 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="tabular-nums">
                        {moneyFormatter.format(subtotal)}
                      </span>
                    </div>

                    {/* Tax lines */}
                    {form.taxLines.map((taxLine) => (
                      <div key={taxLine.id} className="flex items-center justify-between gap-2 text-sm">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Input
                            value={taxLine.name}
                            onChange={(e) => updateTaxLine(taxLine.id, "name", e.target.value)}
                            placeholder="Tax name"
                            className="h-7 w-20 text-sm"
                            disabled={isSaving}
                          />
                          <Input
                            value={taxLine.rate}
                            onChange={(e) => updateTaxLine(taxLine.id, "rate", e.target.value)}
                            type="number"
                            min="0"
                            max="100"
                            step="0.001"
                            className="h-7 w-16 text-sm text-right"
                            disabled={isSaving}
                          />
                          <span className="shrink-0">%</span>
                          <button
                            type="button"
                            onClick={() => removeTaxLine(taxLine.id)}
                            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            disabled={isSaving}
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                        <span className="tabular-nums shrink-0">
                          {moneyFormatter.format(subtotal * ((parseFloat(taxLine.rate) || 0) / 100))}
                        </span>
                      </div>
                    ))}

                    {/* Quick-add tax presets */}
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      <span className="text-xs text-muted-foreground shrink-0">Add tax:</span>
                      {TAX_PRESETS.map((preset) => (
                        <button
                          key={`${preset.name}-${preset.rate}`}
                          type="button"
                          onClick={() => addTaxLine(preset.name, preset.rate)}
                          disabled={isSaving}
                          className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                        >
                          {preset.name} {preset.rate}%
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => addTaxLine("", "")}
                        disabled={isSaving}
                        className="rounded border border-dashed border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                      >
                        + Custom
                      </button>
                    </div>

                    {form.taxLines.length > 0 && (
                      <div className="flex justify-between text-sm text-muted-foreground pt-0.5">
                        <span>Total tax</span>
                        <span className="tabular-nums">{moneyFormatter.format(totalTaxAmount)}</span>
                      </div>
                    )}

                    <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                      <span>Total</span>
                      <span className="tabular-nums text-ef-ocean">
                        {moneyFormatter.format(computedTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {!hasLineItems && (
                <p className="text-xs text-muted-foreground">
                  Add line items for a detailed PDF, or use the Amount field below
                  for a quick flat total.
                </p>
              )}
            </div>

            {/* Flat amount — only relevant when no line items */}
            {!hasLineItems && (
              <div className="grid gap-2">
                <Label htmlFor="estimate-amount">Amount</Label>
                <Input
                  id="estimate-amount"
                  value={form.amount}
                  onChange={(event) => updateForm("amount", event.target.value)}
                  placeholder="4500"
                  type="number"
                  min="0"
                  step="1"
                  disabled={isSaving}
                />
              </div>
            )}

            {/* Notes */}
            <div className="grid gap-2">
              <Label htmlFor="estimate-notes">Notes</Label>
              <textarea
                id="estimate-notes"
                value={form.notes}
                onChange={(event) => updateForm("notes", event.target.value)}
                placeholder="Scope, materials, terms, or anything to mention on the PDF."
                className="min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                disabled={isSaving}
              />
            </div>

            {/* ── Online Payment (Euroflo) ── */}
            <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4">
              <div>
                <p className="text-sm font-semibold">Collect deposit online</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Enter what you want to receive. Euroflo adds the service fee, GST, and card
                  processing on top, so the customer sees the full card price and you keep your full amount.
                </p>
                <p className="mt-1 text-xs font-medium text-ef-ocean">
                  Your plan&apos;s card fee: {transactionFeePercent(plan)}%, capped at{" "}
                  {moneyFormatter.format((transactionFeeCapCents(plan) ?? 0) / 100)} per transaction.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="contractor-payout">I want to receive (CAD)</Label>
                  <Input
                    id="contractor-payout"
                    value={form.contractorAmountCents}
                    onChange={(e) => updateForm("contractorAmountCents", e.target.value)}
                    placeholder="10000.00"
                    type="number"
                    min="0.50"
                    step="0.01"
                    disabled={isSaving}
                  />
                </div>
                {hasStripePayment && canCustomDeposit && (
                  <div className="grid gap-2">
                    <Label htmlFor="deposit-amount">Deposit to collect now (CAD)</Label>
                    <Input
                      id="deposit-amount"
                      data-testid="estimate-deposit-amount-input"
                      value={form.depositAmountCents}
                      onChange={(e) => updateForm("depositAmountCents", e.target.value)}
                      placeholder={moneyFormatter.format(depositCents / 100).replace("$", "")}
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={isSaving}
                    />
                  </div>
                )}
                {hasStripePayment && !canCustomDeposit && (
                  <div className="grid gap-2">
                    <Label>Deposit to collect now</Label>
                    <div className="flex h-9 items-center rounded-lg border border-input bg-muted/40 px-3 text-sm tabular-nums">
                      {moneyFormatter.format(depositCents / 100)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Free plan uses a 30% deposit. Upgrade to Pro to set your own
                      deposit amount.
                    </p>
                  </div>
                )}
              </div>
              {hasStripePayment && (
                <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
                  {[
                    { label: "You receive",   value: moneyFormatter.format(contractorCents / 100) },
                    { label: "Customer pays", value: moneyFormatter.format(clientTotalCents / 100) },
                    { label: "Deposit today", value: moneyFormatter.format(depositCents / 100) },
                    { label: "Balance later", value: moneyFormatter.format(remainingCents / 100) },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded border border-border bg-background px-3 py-2 text-center">
                      <p className="text-[0.6rem] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
                      <p className="mt-0.5 text-sm font-bold tabular-nums" data-testid={label === "Customer pays" ? "estimate-client-total" : undefined}>{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isSaving}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isSaving}>
                {isSaving
                  ? "Saving..."
                  : editingEstimate
                    ? "Save changes"
                    : "Add estimate"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── List ── */}
      <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle>Estimate worklist</CardTitle>
                <CardDescription>
                  Follow up on open quotes before they go quiet.
                </CardDescription>
              </div>
              <Badge variant="outline" className="w-fit">
                {openEstimates.length} open
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search client, number, or status"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!searchQuery}
                onClick={() => setSearchQuery("")}
              >
                Clear
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            {errorMessage ? (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                <div className="font-medium">Error</div>
                <p className="mt-1 leading-6">{errorMessage}</p>
              </div>
            ) : null}

            <ContentReveal
              isLoading={isLoading}
              skeleton={<InvoiceListSkeleton rows={6} />}
            >
              {filteredEstimates.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-border">
                  <div className="hidden grid-cols-[120px_1fr_120px_120px_130px_80px] gap-4 border-b border-border bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground xl:grid">
                    <div>Estimate</div>
                    <div>Client</div>
                    <div>Follow-up</div>
                    <div>Amount</div>
                    <div>Status</div>
                    <div />
                  </div>
                  <div className="divide-y divide-border">
                    {filteredEstimates.map((estimate) => (
                      <div
                        key={estimate.id}
                        id={`estimate-row-${estimate.id}`}
                        className={cn(
                          "min-w-0 px-4 py-3 transition-colors duration-700",
                          highlightedId === estimate.id &&
                            "bg-ef-mist ring-1 ring-inset ring-ef-300 dark:bg-ef-ink/20 dark:ring-ef-ocean/50"
                        )}
                      >
                        <div className="grid min-w-0 grid-cols-2 items-start gap-x-3 gap-y-2 rounded-md xl:grid-cols-[120px_1fr_120px_120px_130px_80px] xl:items-center xl:gap-3">
                          <div className="order-1 min-w-0 xl:order-none">
                            <div className="truncate font-medium">
                              {estimate.estimate_number}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground xl:hidden">
                              Sent {formatDate(estimate.sent_date)}
                            </div>
                          </div>
                          <div className="order-3 min-w-0 xl:order-none">
                            <div className="truncate font-medium">
                              {estimate.client_name || "No client"}
                            </div>
                          </div>
                          <div className="order-5 min-w-0 text-sm xl:order-none">
                            <div className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground xl:hidden">
                              Follow-up
                            </div>
                            <span>{formatDate(estimate.follow_up_date)}</span>
                          </div>
                          <div className="order-4 text-right font-semibold tabular-nums xl:order-none xl:text-left">
                            {moneyFormatter.format(estimate.amount)}
                            {estimate.contractor_amount_cents && estimate.payment_status !== "paid" && (
                              <div className="text-[0.65rem] font-normal text-muted-foreground">
                                Receive {moneyFormatter.format(estimate.contractor_amount_cents / 100)}
                              </div>
                            )}
                          </div>
                          <div className="order-2 flex flex-wrap justify-end gap-1 xl:order-none xl:justify-start">
                            <Badge variant={statusTone[estimate.status]}>
                              {estimate.status}
                            </Badge>
                            {estimate.payment_status === "paid" && (
                              <Badge variant="success" data-testid="payment-badge-paid">Paid</Badge>
                            )}
                            {estimate.payment_status === "deposit_paid" && (
                              <Badge variant="warning" data-testid="payment-badge-deposit-paid">Deposit paid</Badge>
                            )}
                            {estimate.payment_status === "balance_checkout_created" && (
                              <Badge variant="outline" data-testid="payment-badge-balance-pending">Balance pending</Badge>
                            )}
                            {estimate.payment_status === "checkout_created" && (
                              <Badge variant="outline">Checkout pending</Badge>
                            )}
                          </div>
                          <div className="order-6 flex justify-end gap-2 xl:order-none">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Actions for ${estimate.estimate_number}`}
                                  disabled={isSaving}
                                >
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>
                                  {estimate.estimate_number}
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />

                                <DropdownMenuItem
                                  onSelect={() => openEditEstimate(estimate)}
                                >
                                  <Pencil className="size-4" />
                                  Edit estimate
                                </DropdownMenuItem>

                                {estimate.status === "Draft" ? (
                                  <DropdownMenuItem
                                    onSelect={() => void shareEstimate(estimate)}
                                  >
                                    <Send className="size-4" />
                                    Send to client
                                  </DropdownMenuItem>
                                ) : null}

                                <DropdownMenuItem asChild>
                                  <a
                                    href={`/print/estimate/${estimate.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <Printer className="size-4" />
                                    View / print PDF
                                    <ExternalLink className="ml-auto size-3 opacity-50" />
                                  </a>
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />

                                <DropdownMenuItem
                                  onSelect={() =>
                                    void convertToInvoice(estimate)
                                  }
                                >
                                  <Receipt className="size-4" />
                                  Convert to invoice
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />

                                <DropdownMenuItem
                                  onSelect={() =>
                                    void updateEstimateStatus(estimate, "Won")
                                  }
                                >
                                  <CheckCircle2 className="size-4" />
                                  Mark won
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() =>
                                    void updateEstimateStatus(estimate, "Lost")
                                  }
                                >
                                  <XCircle className="size-4" />
                                  Mark lost
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />

                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() => void deleteEstimate(estimate)}
                                >
                                  <Trash2 className="size-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
                  <div className="mx-auto grid size-12 place-items-center rounded-lg bg-background text-muted-foreground">
                    <FileText className="size-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">
                    {searchQuery ? "No estimates match" : "No estimates yet"}
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    {searchQuery
                      ? "Try a different search."
                      : "Add an estimate after you send a quote, and the app will tell you when to follow up."}
                  </p>
                  {!searchQuery && (
                    <Button className="mt-5" onClick={openAddEstimate}>
                      <Plus className="size-4" />
                      Add estimate
                    </Button>
                  )}
                  {searchQuery && (
                    <Button
                      className="mt-5"
                      variant="outline"
                      onClick={() => setSearchQuery("")}
                    >
                      <RefreshCw className="size-4" />
                      Clear search
                    </Button>
                  )}
                </div>
              )}
            </ContentReveal>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
