"use client"

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { useRouter } from "next/navigation"
import {
  Bell,
  CalendarDays,
  ExternalLink,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react"

import { PageHeader } from "@/components/dashboard/page-header"
import { InvoiceListSkeleton } from "@/components/dashboard/skeleton-loaders"
import { ContentReveal } from "@/components/ui/content-reveal"
import {
  getInitialReminderForm,
  ReminderDialog,
  type ReminderFormValues,
} from "@/components/dashboard/reminder-tools"
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
import { toast } from "sonner"

import {
  generateFollowUpMessage as generateRecoveryMessage,
  getOverdueStage,
  getRecommendedAction,
  isRecoverableInvoice,
} from "@/lib/recovery-engine"
import { money as moneyFormatter } from "@/lib/format-money"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { cn } from "@/lib/utils"

type ClientRow = Database["public"]["Tables"]["clients"]["Row"]
type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"]
type InvoiceInsert = Database["public"]["Tables"]["invoices"]["Insert"]
type InvoiceUpdate = Database["public"]["Tables"]["invoices"]["Update"]
type ReminderRow = Database["public"]["Tables"]["reminders"]["Row"]
type ReminderInsert = Database["public"]["Tables"]["reminders"]["Insert"]
type ReminderUpdate = Database["public"]["Tables"]["reminders"]["Update"]
type RecoveryDraftRow =
  Database["public"]["Tables"]["recovery_drafts"]["Row"]
type RecoveryDraftInsert =
  Database["public"]["Tables"]["recovery_drafts"]["Insert"]
type InvoiceStatus = Database["public"]["Enums"]["invoice_status"]

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
    return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)
  }, 0)
}

function serializeLineItems(items: LineItem[]) {
  return items.map(({ description, quantity, unit_price }) => ({
    description,
    quantity: parseFloat(quantity) || 0,
    unit_price: parseFloat(unit_price) || 0,
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

// ─── Invoice form type ────────────────────────────────────────────────────────

type InvoiceForm = {
  clientId: string | null
  clientName: string
  invoiceNumber: string
  amount: string
  issueDate: string
  dueDate: string
  status: InvoiceStatus
  notes: string
  lineItems: LineItem[]
  taxRate: string
}

type FilterValue = "all"

const invoiceStatuses: InvoiceStatus[] = [
  "Draft",
  "Sent",
  "Overdue",
  "Follow-up Sent",
  "Payment Plan",
  "Paid",
  "Escalated",
]

const finalRecoveryDraftStatuses = new Set(["resolved", "cancelled"])
const waitingRecoveryDraftStatuses = new Set(["sent", "waiting_on_customer"])

const initialForm: InvoiceForm = {
  clientId: null,
  clientName: "",
  invoiceNumber: "",
  amount: "",
  issueDate: "",
  dueDate: "",
  status: "Draft",
  notes: "",
  lineItems: [],
  taxRate: "0",
}

const recoveryReadyStatuses = new Set<InvoiceStatus>([
  "Overdue",
  "Follow-up Sent",
  "Payment Plan",
  "Escalated",
])

const statusPillClassName: Record<InvoiceStatus, string> = {
  Draft:
    "border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-border dark:bg-muted dark:text-muted-foreground",
  Sent:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/50 dark:bg-sky-500/10 dark:text-sky-300",
  Overdue:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/50 dark:bg-amber-500/10 dark:text-amber-300",
  "Follow-up Sent":
    "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800/50 dark:bg-cyan-500/10 dark:text-cyan-300",
  "Payment Plan":
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800/50 dark:bg-violet-500/10 dark:text-violet-300",
  Paid:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-500/10 dark:text-emerald-300",
  Escalated:
    "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800/50 dark:bg-orange-500/10 dark:text-orange-300",
}

function getStatusDisplayLabel(status: InvoiceStatus): string {
  const labels: Record<InvoiceStatus, string> = {
    Draft: "Draft",
    Sent: "Unpaid",
    Overdue: "Overdue",
    "Follow-up Sent": "Reminder sent",
    "Payment Plan": "Payment plan",
    Paid: "Paid",
    Escalated: "Escalated",
  }
  return labels[status] ?? status
}



const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

function formatDate(value: string | null) {
  if (!value) {
    return "Not set"
  }

  return dateFormatter.format(new Date(`${value}T00:00:00`))
}

function getOverdueDays(dueDate: string | null, status: InvoiceStatus) {
  if (!dueDate || status === "Paid" || status === "Draft") {
    return 0
  }

  const today = new Date()
  const due = new Date(`${dueDate}T00:00:00`)
  const diff = today.getTime() - due.getTime()

  return Math.max(0, Math.floor(diff / 86_400_000))
}

function isOverdueInvoice(invoice: InvoiceRow) {
  return getOverdueDays(invoice.due_date, invoice.status) > 0
}

function getEffectiveRecoveryDays(invoice: InvoiceRow) {
  const overdueDays = getOverdueDays(invoice.due_date, invoice.status)

  if (overdueDays > 0) {
    return overdueDays
  }

  return recoveryReadyStatuses.has(invoice.status) ? 1 : 0
}

function canFollowUpInvoice(invoice: InvoiceRow) {
  return isRecoverableInvoice(invoice)
}

function normalize(value: string | null | undefined) {
  return (value || "").trim().toLowerCase()
}

function getClientLabel(client: ClientRow): string {
  if (client.company) {
    return client.name && client.name !== client.company
      ? `${client.company} - ${client.name}`
      : client.company
  }
  return client.name || "Unnamed client"
}

function isDueToday(dueDate: string | null): boolean {
  if (!dueDate) return false
  const now = new Date()
  const todayStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-")
  return dueDate === todayStr
}

function invoiceMatchesClient(client: ClientRow, invoice: InvoiceRow) {
  if (invoice.client_id === client.id) {
    return true
  }

  if (invoice.client_id) {
    return false
  }

  const invoiceClient = normalize(invoice.client_name)

  return (
    invoiceClient.length > 0 &&
    (invoiceClient === normalize(client.company) ||
      invoiceClient === normalize(client.name))
  )
}


function inferTrade(clientName: string) {
  const normalized = clientName.toLowerCase()

  if (normalized.includes("roof") || normalized.includes("duplex")) {
    return "Roofing"
  }

  if (normalized.includes("plumb") || normalized.includes("cafe")) {
    return "Plumbing"
  }

  if (normalized.includes("electric") || normalized.includes("retail")) {
    return "Electrical"
  }

  if (normalized.includes("green") || normalized.includes("land")) {
    return "Landscaping"
  }

  return "Renovation"
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

function toReminderTimestamp(date: string) {
  return new Date(`${date}T09:00:00`).toISOString()
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

function formFromInvoice(invoice: InvoiceRow): InvoiceForm {
  return {
    clientId: invoice.client_id || null,
    clientName: invoice.client_name || "",
    invoiceNumber: invoice.invoice_number,
    amount: String(invoice.amount ?? ""),
    issueDate: invoice.issue_date || "",
    dueDate: invoice.due_date || "",
    status: invoice.status,
    notes: invoice.notes || "",
    lineItems: deserializeLineItems(invoice.line_items),
    taxRate: String(invoice.tax_rate ?? "0"),
  }
}

function normalizeDraftStatus(status: string) {
  return status.trim().toLowerCase()
}

function isFinalRecoveryDraft(draft: RecoveryDraftRow) {
  return finalRecoveryDraftStatuses.has(normalizeDraftStatus(draft.status))
}

function isWaitingRecoveryDraft(draft: RecoveryDraftRow) {
  return waitingRecoveryDraftStatuses.has(normalizeDraftStatus(draft.status))
}

function buildRecoveryDraftPayload(
  invoice: InvoiceRow,
  userId: string
): RecoveryDraftInsert {
  const daysOverdue = getEffectiveRecoveryDays(invoice)
  const overdueStage = getOverdueStage(daysOverdue)

  return {
    user_id: userId,
    client_id: invoice.client_id ?? null,
    invoice_id: invoice.id,
    channel: "email",
    message_body: generateRecoveryMessage({
      clientName: invoice.client_name || "there",
      invoiceNumber: invoice.invoice_number,
      amount: invoice.amount,
      daysOverdue,
      overdueStage,
    }),
    status: "needs_approval",
    recommended_action: getRecommendedAction(overdueStage),
    days_overdue: daysOverdue,
  }
}

function getRecoveryDraftErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    if (
      error.message.includes("recovery_drafts") &&
      error.message.includes("schema cache")
    ) {
      return "Recovery drafts are not available yet. Apply supabase/apply_recovery_drafts.sql in Supabase, then refresh."
    }

    return error.message
  }

  return "Could not prepare the follow-up draft."
}

function ClientCombobox({
  clients,
  value,
  onChange,
  onCreateClient,
  disabled = false,
}: {
  clients: ClientRow[]
  value: string | null
  onChange: (clientId: string | null, clientName: string) => void
  onCreateClient: (
    company: string,
    name: string,
    email: string
  ) => Promise<ClientRow | null>
  disabled?: boolean
}) {
  const [query, setQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newCompany, setNewCompany] = useState("")
  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === value) ?? null,
    [clients, value]
  )

  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clients
    return clients.filter(
      (c) =>
        c.company.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q)
    )
  }, [clients, query])

  function handleBlur() {
    window.setTimeout(() => setIsOpen(false), 150)
  }

  function selectClient(client: ClientRow) {
    onChange(client.id, getClientLabel(client))
    setQuery("")
    setIsOpen(false)
  }

  function clearSelection() {
    onChange(null, "")
    setQuery("")
  }

  async function handleCreate() {
    const company = newCompany.trim()
    if (!company || isCreating) return
    setIsCreating(true)
    const created = await onCreateClient(company, newName.trim(), newEmail.trim())
    if (created) {
      selectClient(created)
      setShowNewForm(false)
      setNewCompany("")
      setNewName("")
      setNewEmail("")
    }
    setIsCreating(false)
  }

  return (
    <div className="relative">
      {value && selectedClient ? (
        <div className="flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm">
          <span className="min-w-0 flex-1 truncate">
            {getClientLabel(selectedClient)}
          </span>
          <button
            type="button"
            disabled={disabled}
            className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
            onClick={clearSelection}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={handleBlur}
          placeholder="Search clients…"
          disabled={disabled}
          autoComplete="off"
        />
      )}

      {isOpen && !showNewForm && !selectedClient ? (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-background shadow-md">
          {filteredClients.length > 0 ? (
            filteredClients.map((client) => (
              <button
                key={client.id}
                type="button"
                className="flex w-full px-3 py-2 text-left text-sm hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectClient(client)
                }}
              >
                <span className="truncate">{getClientLabel(client)}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {query ? `No clients match "${query}"` : "No clients yet"}
            </div>
          )}
          <div className="border-t border-border">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-primary hover:bg-muted/60 focus-visible:outline-none"
              onMouseDown={(e) => {
                e.preventDefault()
                setNewCompany(query)
                setShowNewForm(true)
                setIsOpen(false)
              }}
            >
              <Plus className="size-3.5 shrink-0" />
              Add new client
            </button>
          </div>
        </div>
      ) : null}

      {showNewForm ? (
        <div className="mt-2 grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs font-semibold text-muted-foreground">
            New client
          </p>
          <Input
            placeholder="Company name *"
            value={newCompany}
            onChange={(e) => setNewCompany(e.target.value)}
            disabled={isCreating}
          />
          <Input
            placeholder="Contact name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={isCreating}
          />
          <Input
            type="email"
            placeholder="Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            disabled={isCreating}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="flex-1"
              disabled={!newCompany.trim() || isCreating}
              onClick={() => void handleCreate()}
            >
              {isCreating ? "Creating…" : "Create & select"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isCreating}
              onClick={() => {
                setShowNewForm(false)
                setNewCompany("")
                setNewName("")
                setNewEmail("")
              }}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function InvoicesPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [clients, setClients] = useState<ClientRow[]>([])
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])

  const [reminders, setReminders] = useState<ReminderRow[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | FilterValue>(
    "all"
  )
  const [clientFilter, setClientFilter] = useState<string | FilterValue>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<InvoiceRow | null>(null)
  const [form, setForm] = useState<InvoiceForm>(initialForm)
  const [reminderForm, setReminderForm] = useState<ReminderFormValues>(
    getInitialReminderForm()
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // ─── Derived line item totals ──────────────────────────────────────────────
  const liSubtotal = useMemo(() => lineItemSubtotal(form.lineItems), [form.lineItems])
  const liTaxRate = useMemo(() => parseFloat(form.taxRate) || 0, [form.taxRate])
  const liTaxAmount = useMemo(() => liSubtotal * (liTaxRate / 100), [liSubtotal, liTaxRate])
  const liTotal = useMemo(() => liSubtotal + liTaxAmount, [liSubtotal, liTaxAmount])
  const hasLineItems = form.lineItems.length > 0

  const loadInvoices = useCallback(async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setErrorMessage(userError?.message || "You must be logged in.")
      setClients([])
      setInvoices([])
      setReminders([])
      setUserId(null)
      setIsLoading(false)
      return
    }

    setUserId(user.id)

    const [clientResult, invoiceResult, reminderResult] =
      await Promise.all([
        supabase
          .from("clients")
          .select("*")
          .eq("user_id", user.id)
          .order("company", { ascending: true }),
        supabase
          .from("invoices")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("reminders")
          .select("*")
          .eq("user_id", user.id)
          .order("reminder_date", { ascending: true }),
      ])

    const firstError =
      clientResult.error ||
      invoiceResult.error ||
      reminderResult.error

    if (firstError) {
      setErrorMessage(firstError.message)
      setClients([])
      setInvoices([])
      setReminders([])
    } else {
      setClients(clientResult.data || [])
      setInvoices(invoiceResult.data || [])
      setReminders(reminderResult.data || [])
    }

    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadInvoices()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [loadInvoices])

  const clientsWithInvoices = useMemo(
    () =>
      clients.filter((client) =>
        invoices.some((invoice) => invoiceMatchesClient(client, invoice))
      ),
    [clients, invoices]
  )

  const filteredInvoices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return invoices.filter((invoice) => {
      const clientName = invoice.client_name || ""
      const matchesSearch =
        !query ||
        clientName.toLowerCase().includes(query) ||
        invoice.invoice_number.toLowerCase().includes(query)
      const matchesStatus =
        statusFilter === "all" || invoice.status === statusFilter
      const matchesClient =
        clientFilter === "all" ||
        invoice.client_id === clientFilter ||
        (!invoice.client_id &&
          (() => {
            const fc = clients.find((c) => c.id === clientFilter)
            if (!fc) return false
            const n = normalize(invoice.client_name)
            return (
              n.length > 0 &&
              (n === normalize(fc.company) || n === normalize(fc.name))
            )
          })())

      return matchesSearch && matchesStatus && matchesClient
    })
  }, [clientFilter, clients, invoices, searchQuery, statusFilter])

  const invoiceOptions = useMemo(
    () =>
      invoices.map((invoice) => ({
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        client_name: invoice.client_name,
        amount: invoice.amount,
      })),
    [invoices]
  )

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    statusFilter !== "all" ||
    clientFilter !== "all"

  function resetFilters() {
    setSearchQuery("")
    setStatusFilter("all")
    setClientFilter("all")
  }

  function updateForm<Field extends keyof InvoiceForm>(
    field: Field,
    value: InvoiceForm[Field]
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

  function updateReminderForm<Field extends keyof ReminderFormValues>(
    field: Field,
    value: ReminderFormValues[Field]
  ) {
    setReminderForm((current) => ({ ...current, [field]: value }))
  }

  function openAddInvoice() {
    setEditingInvoice(null)
    setForm(initialForm)
    setDialogOpen(true)
  }

  function openEditInvoice(invoice: InvoiceRow) {
    setEditingInvoice(invoice)
    setForm(formFromInvoice(invoice))
    setDialogOpen(true)
  }

  function openAddReminder(invoice?: InvoiceRow) {
    setReminderForm(getInitialReminderForm(invoice?.id || ""))
    setReminderDialogOpen(true)
  }

  function closeInvoiceDialog(open: boolean) {
    setDialogOpen(open)

    if (!open) {
      setEditingInvoice(null)
      setForm(initialForm)
    }
  }

  function closeReminderDialog(open: boolean) {
    setReminderDialogOpen(open)

    if (!open) {
      setReminderForm(getInitialReminderForm())
    }
  }

  async function handleAddOrUpdateInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!userId) {
      setErrorMessage("You must be logged in to save invoices.")
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    const invoiceNumber =
      form.invoiceNumber.trim() || `INV-${Date.now().toString().slice(-6)}`
    const serializedItems = hasLineItems ? serializeLineItems(form.lineItems) : []
    const finalAmount = hasLineItems ? liTotal : parseAmount(form.amount)
    const paidAt =
      form.status === "Paid"
        ? editingInvoice?.paid_at || new Date().toISOString()
        : null
    const linkedClient = form.clientId
      ? clients.find((c) => c.id === form.clientId) ?? null
      : null
    const resolvedClientName = linkedClient
      ? getClientLabel(linkedClient)
      : nullableText(form.clientName)
    const resolvedTrade =
      linkedClient?.trade || inferTrade(form.clientName)

    if (editingInvoice) {
      const payload: InvoiceUpdate = {
        invoice_number: invoiceNumber,
        client_id: form.clientId ?? null,
        client_name: resolvedClientName,
        trade: resolvedTrade,
        amount: finalAmount,
        issue_date: nullableDate(form.issueDate),
        due_date: nullableDate(form.dueDate),
        status: form.status,
        notes: nullableText(form.notes),
        paid_at: paidAt,
        line_items: serializedItems,
        tax_rate: hasLineItems ? liTaxRate : 0,
      }

      const { data, error } = await supabase
        .from("invoices")
        .update(payload)
        .eq("id", editingInvoice.id)
        .eq("user_id", userId)
        .select()
        .single()

      if (error) {
        setErrorMessage(error.message)
      } else {
        setInvoices((current) =>
          current.map((invoice) =>
            invoice.id === editingInvoice.id ? data : invoice
          )
        )
        closeInvoiceDialog(false)
        toast.success("Invoice saved")
      }
    } else {
      const payload: InvoiceInsert = {
        user_id: userId,
        invoice_number: invoiceNumber,
        client_id: form.clientId ?? null,
        client_name: resolvedClientName,
        trade: resolvedTrade,
        amount: finalAmount,
        issue_date: nullableDate(form.issueDate),
        due_date: nullableDate(form.dueDate),
        status: form.status,
        notes: nullableText(form.notes),
        paid_at: paidAt,
        line_items: serializedItems,
        tax_rate: hasLineItems ? liTaxRate : 0,
      }

      const { data, error } = await supabase
        .from("invoices")
        .insert(payload)
        .select()
        .single()

      if (error) {
        setErrorMessage(error.message)
      } else {
        setInvoices((current) => [data, ...current])
        closeInvoiceDialog(false)
        toast.success("Invoice added")
      }
    }

    setIsSaving(false)
  }

  async function updateInvoiceStatus(
    invoiceId: string,
    status: InvoiceStatus
  ) {
    if (!userId) {
      setErrorMessage("You must be logged in to update invoices.")
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    const payload: InvoiceUpdate = {
      status,
      paid_at: status === "Paid" ? new Date().toISOString() : null,
    }

    const { data, error } = await supabase
      .from("invoices")
      .update(payload)
      .eq("id", invoiceId)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) {
      setErrorMessage(error.message)
    } else {
      setInvoices((current) =>
        current.map((invoice) => (invoice.id === invoiceId ? data : invoice))
      )
      toast.success(`Invoice marked ${getStatusDisplayLabel(status).toLowerCase()}`)
    }

    setIsSaving(false)
  }

  async function prepareRecoveryDraft(invoice: InvoiceRow) {
    if (isSaving) {
      return
    }

    if (!userId) {
      const message = "You must be logged in to create follow-up drafts."
      setErrorMessage(message)
      toast.error(message)
      return
    }

    if (!canFollowUpInvoice(invoice)) {
      toast.message("This invoice is not ready for a follow-up yet.")
      openEditInvoice(invoice)
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    try {
      const { data: existingDrafts, error: existingError } = await supabase
        .from("recovery_drafts")
        .select("*")
        .eq("user_id", userId)
        .eq("invoice_id", invoice.id)
        .order("created_at", { ascending: false })

      if (existingError) {
        throw existingError
      }

      const activeDraft = (existingDrafts ?? []).find(
        (draft) => !isFinalRecoveryDraft(draft)
      )

      if (activeDraft) {
        toast.success(
          isWaitingRecoveryDraft(activeDraft)
            ? "Follow-up already sent. Opening Follow-ups."
            : "Draft ready — opening Follow-ups to review and send."
        )
        router.push("/dashboard/recoveries")
        return
      }

      const payload = buildRecoveryDraftPayload(invoice, userId)
      const { error: insertError } = await supabase
        .from("recovery_drafts")
        .insert(payload)

      if (insertError) {
        throw insertError
      }

      if (invoice.status === "Sent") {
        const overdueUpdate: InvoiceUpdate = {
          status: "Overdue",
          paid_at: null,
        }
        const { data: updatedInvoice, error: invoiceError } = await supabase
          .from("invoices")
          .update(overdueUpdate)
          .eq("id", invoice.id)
          .eq("user_id", userId)
          .select()
          .single()

        if (!invoiceError && updatedInvoice) {
          setInvoices((current) =>
            current.map((item) =>
              item.id === updatedInvoice.id ? updatedInvoice : item
            )
          )
        }
      }

      toast.success("Draft ready — opening Follow-ups to review and send.")
      router.push("/dashboard/recoveries")
    } catch (error) {
      const message = getRecoveryDraftErrorMessage(error)
      setErrorMessage(message)
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  async function createReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!userId) {
      setErrorMessage("You must be logged in to save reminders.")
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    const completedAt = reminderForm.completed ? new Date().toISOString() : null
    const payload: ReminderInsert = {
      user_id: userId,
      invoice_id: reminderForm.invoiceId,
      reminder_date: reminderForm.reminderDate,
      scheduled_for: toReminderTimestamp(reminderForm.reminderDate),
      reminder_type:
        reminderForm.reminderType.trim() || "Payment follow-up",
      contact_method: "Email",
      status: reminderForm.completed ? "Sent" : "Scheduled",
      sent_at: completedAt,
      completed: reminderForm.completed,
      notes: nullableText(reminderForm.notes),
    }

    const { data, error } = await supabase
      .from("reminders")
      .insert(payload)
      .select()
      .single()

    if (error) {
      setErrorMessage(error.message)
    } else {
      setReminders((current) => [...current, data])
      closeReminderDialog(false)
    }

    setIsSaving(false)
  }

  async function markReminderComplete(reminder: ReminderRow) {
    if (!userId) {
      setErrorMessage("You must be logged in to update reminders.")
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    const payload: ReminderUpdate = {
      completed: true,
      status: "Sent",
      sent_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from("reminders")
      .update(payload)
      .eq("id", reminder.id)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) {
      setErrorMessage(error.message)
    } else {
      setReminders((current) =>
        current.map((item) => (item.id === reminder.id ? data : item))
      )
    }

    setIsSaving(false)
  }

  async function deleteReminder(reminder: ReminderRow) {
    if (!userId) {
      setErrorMessage("You must be logged in to delete reminders.")
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    const { error } = await supabase
      .from("reminders")
      .delete()
      .eq("id", reminder.id)
      .eq("user_id", userId)

    if (error) {
      setErrorMessage(error.message)
    } else {
      setReminders((current) =>
        current.filter((item) => item.id !== reminder.id)
      )
    }

    setIsSaving(false)
  }

  async function deleteInvoice(invoiceId: string) {
    if (!userId) {
      setErrorMessage("You must be logged in to delete invoices.")
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    const { error } = await supabase
      .from("invoices")
      .delete()
      .eq("id", invoiceId)
      .eq("user_id", userId)

    if (error) {
      setErrorMessage(error.message)
    } else {
      setInvoices((current) =>
        current.filter((invoice) => invoice.id !== invoiceId)
      )
      setReminders((current) =>
        current.filter((reminder) => reminder.invoice_id !== invoiceId)
      )

    }

    setIsSaving(false)
  }

  async function createClientFromCombobox(
    company: string,
    name: string,
    email: string
  ): Promise<ClientRow | null> {
    if (!userId) return null

    const { data, error } = await supabase
      .from("clients")
      .insert({
        user_id: userId,
        name: name || company,
        company,
        email: email || null,
        payment_reliability: "New client" as const,
      })
      .select()
      .single()

    if (error || !data) return null

    setClients((current) =>
      [...current, data].sort((a, b) => a.company.localeCompare(b.company))
    )
    return data
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background text-foreground dark:bg-background dark:text-foreground">
      <PageHeader
        title="Invoices"
        description="Your record of what's owed and paid. To collect online, send the estimate — clients pay from there. Use an invoice for cash, cheque, or e-transfer, then mark it paid."
        className="dark:border-border dark:bg-background dark:[&_h1]:text-foreground dark:[&_p]:text-muted-foreground"
      >
        <Dialog open={dialogOpen} onOpenChange={closeInvoiceDialog}>
          <Button
            className="bg-[#024D8B] text-white shadow-sm hover:bg-[#024D8B] hover:shadow-md focus-visible:ring-ring/40"
            onClick={openAddInvoice}
          >
            <Plus className="size-4" />
            Add invoice
          </Button>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto dark:border-border dark:bg-card dark:text-foreground dark:shadow-2xl dark:[&_[data-slot=dialog-description]]:text-muted-foreground">
            <DialogHeader>
              <DialogTitle>
                {editingInvoice ? "Edit invoice" : "New invoice"}
              </DialogTitle>
              <DialogDescription>
                Add line items for a detailed PDF, or enter a flat amount.
              </DialogDescription>
            </DialogHeader>

            <form className="grid gap-5" onSubmit={handleAddOrUpdateInvoice}>
              {/* Client + number */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Client</Label>
                  <ClientCombobox
                    clients={clients}
                    value={form.clientId}
                    onChange={(clientId, clientName) => {
                      setForm((f) => ({ ...f, clientId, clientName }))
                    }}
                    onCreateClient={createClientFromCombobox}
                    disabled={isSaving}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="invoice-number">Invoice #</Label>
                  <Input
                    id="invoice-number"
                    value={form.invoiceNumber}
                    onChange={(event) =>
                      updateForm("invoiceNumber", event.target.value)
                    }
                    placeholder="INV-2201"
                  />
                </div>
              </div>

              {/* Dates + status */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="issue-date">Issue date</Label>
                  <Input
                    id="issue-date"
                    value={form.issueDate}
                    onChange={(event) =>
                      updateForm("issueDate", event.target.value)
                    }
                    type="date"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="due-date">Due date</Label>
                  <Input
                    id="due-date"
                    value={form.dueDate}
                    onChange={(event) => updateForm("dueDate", event.target.value)}
                    type="date"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="status">Status</Label>
                  <SelectField
                    id="status"
                    value={form.status}
                    onChange={(value) =>
                      updateForm("status", value as InvoiceStatus)
                    }
                  >
                    {invoiceStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </SelectField>
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

                {hasLineItems && (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="grid grid-cols-[1fr_56px_96px_28px] gap-2 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                      <span>Description</span>
                      <span className="text-right">Qty</span>
                      <span className="text-right">Unit Price</span>
                      <span />
                    </div>

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
                          {moneyFormatter.format(liSubtotal)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span>Tax</span>
                          <Input
                            value={form.taxRate}
                            onChange={(e) => updateForm("taxRate", e.target.value)}
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            className="h-7 w-16 text-sm text-right"
                            disabled={isSaving}
                          />
                          <span>%</span>
                        </div>
                        <span className="tabular-nums">
                          {moneyFormatter.format(liTaxAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                        <span>Total Due</span>
                        <span className="tabular-nums text-primary">
                          {moneyFormatter.format(liTotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {!hasLineItems && (
                  <p className="text-xs text-muted-foreground">
                    Add line items for a detailed PDF, or use the Amount field below for a quick flat total.
                  </p>
                )}
              </div>

              {/* Flat amount — only shown when no line items */}
              {!hasLineItems && (
                <div className="grid gap-2">
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    value={form.amount}
                    onChange={(event) => updateForm("amount", event.target.value)}
                    placeholder="8400"
                    type="number"
                    min="0"
                    step="1"
                  />
                </div>
              )}

              {/* Notes */}
              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  value={form.notes}
                  onChange={(event) => updateForm("notes", event.target.value)}
                  placeholder="What work was completed or what follow-up is needed?"
                  className="min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
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
                    : editingInvoice
                      ? "Save changes"
                      : "Add invoice"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <ReminderDialog
        open={reminderDialogOpen}
        onOpenChange={closeReminderDialog}
        title="Create reminder"
        description="Add a follow-up reminder connected to an invoice."
        form={reminderForm}
        onFormChange={updateReminderForm}
        onSubmit={createReminder}
        invoiceOptions={invoiceOptions}
        isSaving={isSaving}
      />

      <div className="bg-background p-4 sm:p-6 lg:p-8 dark:bg-background">
        <div className="mx-auto grid w-full max-w-7xl gap-6">
        <Card className="rounded-lg dark:border-border dark:bg-card dark:shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
          <CardHeader className="gap-5 p-5 sm:p-6">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="text-lg text-foreground dark:text-foreground">
                  Invoice worklist
                </CardTitle>
                <CardDescription className="mt-1 text-muted-foreground dark:text-muted-foreground">
                  Review invoices and prepare follow-up drafts for follow-ups.
                </CardDescription>
              </div>
              {hasActiveFilters ? (
                <Badge className="w-fit border-border bg-background text-muted-foreground dark:border-border dark:bg-background dark:text-muted-foreground">
                  {filteredInvoices.length} of {invoices.length} invoices
                </Badge>
              ) : null}
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_220px_220px_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground dark:text-muted-foreground" />
                <Input
                  className="pl-9 dark:border-border dark:bg-background dark:text-foreground dark:placeholder:text-muted-foreground dark:focus-visible:border-ring dark:focus-visible:ring-ring/25"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search client or invoice number"
                />
              </div>
              <SelectField
                value={statusFilter}
                onChange={(value) =>
                  setStatusFilter(value as InvoiceStatus | FilterValue)
                }
                aria-label="Filter by status"
                className="dark:border-border dark:bg-background dark:text-foreground dark:focus-visible:border-ring dark:focus-visible:ring-ring/25"
              >
                <option value="all">All statuses</option>
                {invoiceStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </SelectField>
              <SelectField
                value={clientFilter}
                onChange={(value) => setClientFilter(value)}
                aria-label="Filter by client"
                className="dark:border-border dark:bg-background dark:text-foreground dark:focus-visible:border-ring dark:focus-visible:ring-ring/25"
              >
                <option value="all">All clients</option>
                {clientsWithInvoices.map((client) => (
                  <option key={client.id} value={client.id}>
                    {getClientLabel(client)}
                  </option>
                ))}
              </SelectField>
              <Button
                type="button"
                variant="outline"
                className="w-full lg:w-auto dark:border-border dark:bg-transparent dark:text-foreground dark:hover:bg-muted dark:hover:text-foreground"
                disabled={!hasActiveFilters}
                onClick={resetFilters}
              >
                Clear
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
            {errorMessage ? (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                <div className="font-medium">Invoice sync error</div>
                <p className="mt-1 leading-6">{errorMessage}</p>
              </div>
            ) : null}

            <ContentReveal
              isLoading={isLoading}
              skeleton={<InvoiceListSkeleton rows={6} />}
            >
              {errorMessage && invoices.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center dark:border-border dark:bg-background">
                <h3 className="text-base font-semibold text-foreground dark:text-foreground">
                  Something didn&apos;t load
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground dark:text-muted-foreground">
                  Your data is safe. Try refreshing, or check your connection.
                </p>
                <Button
                  className="mt-5 dark:border-border dark:bg-transparent dark:text-foreground dark:hover:bg-muted"
                  variant="outline"
                  onClick={() => {
                    setIsLoading(true)
                    setErrorMessage(null)
                    void loadInvoices()
                  }}
                >
                  <RefreshCw className="size-4" />
                  Try again
                </Button>
              </div>
            ) : filteredInvoices.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border bg-background dark:border-border dark:bg-background">
                <div className="hidden grid-cols-[116px_minmax(220px,1fr)_112px_112px_128px_112px_112px_40px] gap-3 border-b border-border bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground dark:border-border dark:bg-muted dark:text-muted-foreground xl:grid">
                  <div>Invoice</div>
                  <div>Client</div>
                  <div>Due</div>
                  <div>Amount</div>
                  <div>Status</div>
                  <div>View</div>
                  <div>Follow up</div>
                  <div />
                </div>
                <div className="divide-y divide-border dark:divide-border">
                  {filteredInvoices.map((invoice) => {
                    const overdueDays = getOverdueDays(
                      invoice.due_date,
                      invoice.status
                    )
                    const followUpEnabled = canFollowUpInvoice(invoice)

                    return (
                      <div
                        key={invoice.id}
                        className="min-w-0 bg-background px-4 py-4 transition-colors hover:bg-muted/40 dark:bg-background dark:hover:bg-muted/60"
                      >
                        <div
                          className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 xl:grid-cols-[116px_minmax(220px,1fr)_112px_112px_128px_112px_112px_40px] xl:items-center xl:gap-3"
                        >
                          <div className="col-span-2 min-w-0 xl:col-span-1">
                            <div className="mb-1 text-[0.68rem] font-medium uppercase text-muted-foreground dark:text-muted-foreground xl:hidden">
                              Invoice
                            </div>
                            <div className="truncate text-sm font-semibold text-foreground dark:text-foreground">
                              {invoice.invoice_number}
                            </div>
                          </div>
                          <div className="col-span-2 min-w-0 xl:col-span-1">
                            <div className="mb-1 text-[0.68rem] font-medium uppercase text-muted-foreground dark:text-muted-foreground xl:hidden">
                              Client
                            </div>
                            <div className="truncate text-sm font-medium text-foreground dark:text-foreground">
                              {invoice.client_name || "No client"}
                            </div>
                          </div>
                          <div className="text-sm">
                            <div className="mb-1 text-[0.68rem] font-medium uppercase text-muted-foreground dark:text-muted-foreground xl:hidden">
                              Due
                            </div>
                            <div className="text-foreground dark:text-foreground">
                              {formatDate(invoice.due_date)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground dark:text-muted-foreground">
                              {overdueDays > 0
                                ? `${overdueDays} days overdue`
                                : isDueToday(invoice.due_date) &&
                                    invoice.status !== "Paid" &&
                                    invoice.status !== "Draft"
                                  ? "Due today"
                                  : "Not overdue"}
                            </div>
                          </div>
                          <div>
                            <div className="mb-1 text-[0.68rem] font-medium uppercase text-muted-foreground dark:text-muted-foreground xl:hidden">
                              Amount
                            </div>
                            <div className="text-sm font-bold text-foreground dark:text-foreground">
                            {moneyFormatter.format(invoice.amount)}
                            </div>
                          </div>
                          <div className="col-span-2 xl:col-span-1">
                            <div className="mb-1 text-[0.68rem] font-medium uppercase text-muted-foreground dark:text-muted-foreground xl:hidden">
                              Status
                            </div>
                            <Badge
                              className={cn(
                                "whitespace-nowrap",
                                statusPillClassName[invoice.status]
                              )}
                            >
                              {getStatusDisplayLabel(invoice.status)}
                            </Badge>
                          </div>
                          <div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 w-full px-4 dark:border-border dark:bg-transparent dark:text-foreground dark:hover:bg-muted dark:hover:text-white"
                              disabled={isSaving}
                              onClick={(event) => {
                                event.stopPropagation()
                                openEditInvoice(invoice)
                              }}
                            >
                              View
                            </Button>
                          </div>
                          <div>
                            <Button
                              size="sm"
                              className="h-9 w-full bg-[#024D8B] px-4 text-white shadow-sm hover:bg-[#024D8B] disabled:border disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400 dark:disabled:border-border dark:disabled:bg-muted dark:disabled:text-muted-foreground"
                              disabled={isSaving || !followUpEnabled}
                              onClick={(event) => {
                                event.stopPropagation()
                                void prepareRecoveryDraft(invoice)
                              }}
                            >
                              <Send className="size-3.5" />
                              Follow up
                            </Button>
                          </div>
                          <div className="col-span-2 flex justify-end xl:col-span-1">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-muted-foreground hover:bg-muted hover:text-foreground dark:text-foreground dark:hover:bg-muted dark:hover:text-foreground"
                                  aria-label={`Actions for ${invoice.invoice_number}`}
                                  disabled={isSaving}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="dark:border-border dark:bg-card dark:text-foreground">
                                <DropdownMenuLabel>
                                  {invoice.invoice_number}
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={(event) => {
                                    event.stopPropagation()
                                    openEditInvoice(invoice)
                                  }}
                                >
                                  <Pencil className="size-4" />
                                  Edit invoice
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <a
                                    href={`/print/invoice/${invoice.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <Printer className="size-4" />
                                    View / Print PDF
                                    <ExternalLink className="ml-auto size-3 opacity-50" />
                                  </a>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={(event) => {
                                    event.stopPropagation()
                                    openAddReminder(invoice)
                                  }}
                                >
                                  <Bell className="size-4" />
                                  Add reminder
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={
                                    !followUpEnabled || isSaving
                                  }
                                  onSelect={(event) => {
                                    event.stopPropagation()
                                    void prepareRecoveryDraft(invoice)
                                  }}
                                >
                                  <Send className="size-4" />
                                  Generate follow-up
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={(event) => {
                                    event.stopPropagation()
                                    void updateInvoiceStatus(invoice.id, "Paid")
                                  }}
                                >
                                  <CalendarDays className="size-4" />
                                  Mark paid
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={(event) => {
                                    event.stopPropagation()
                                    void deleteInvoice(invoice.id)
                                  }}
                                >
                                  <Trash2 className="size-4" />
                                  Delete invoice
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center dark:border-border dark:bg-background">
                <div className="mx-auto grid size-12 place-items-center rounded-lg border border-border bg-background text-muted-foreground dark:border-border dark:bg-card dark:text-muted-foreground">
                  {hasActiveFilters ? (
                    <Search className="size-5" />
                  ) : (
                    <FileText className="size-5" />
                  )}
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground dark:text-foreground">
                  {hasActiveFilters
                    ? "No invoices match these filters"
                    : "No invoices found"}
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground dark:text-muted-foreground">
                  {hasActiveFilters
                    ? "Try a different client, invoice number, or status."
                    : "Create your first invoice to get started."}
                </p>
                <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                  {hasActiveFilters ? (
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto dark:border-border dark:bg-transparent dark:text-foreground dark:hover:bg-muted"
                      onClick={resetFilters}
                    >
                      Clear filters
                    </Button>
                  ) : null}
                  <Button
                    className="w-full bg-[#024D8B] text-white hover:bg-[#024D8B] sm:w-auto"
                    onClick={openAddInvoice}
                  >
                    <Plus className="size-4" />
                    Add invoice
                  </Button>
                </div>
              </div>
            )}
            </ContentReveal>
          </CardContent>
        </Card>
        </div>
      </div>

    </div>
  )
}
