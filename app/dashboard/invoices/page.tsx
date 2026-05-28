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
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
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
} from "@/lib/recovery-engine"
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

type InvoiceForm = {
  clientId: string | null
  clientName: string
  invoiceNumber: string
  amount: string
  issueDate: string
  dueDate: string
  status: InvoiceStatus
  notes: string
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
}

const statusTone: Record<
  InvoiceStatus,
  "default" | "success" | "warning" | "muted" | "outline"
> = {
  Draft: "muted",
  Sent: "default",
  Overdue: "warning",
  "Follow-up Sent": "default",
  "Payment Plan": "outline",
  Paid: "success",
  Escalated: "warning",
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


const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const dateFormatter = new Intl.DateTimeFormat("en-US", {
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
  const daysOverdue = getOverdueDays(invoice.due_date, invoice.status)
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
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-green-700 hover:bg-muted/60 focus-visible:outline-none"
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
    const amount = parseAmount(form.amount)
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
        amount,
        issue_date: nullableDate(form.issueDate),
        due_date: nullableDate(form.dueDate),
        status: form.status,
        notes: nullableText(form.notes),
        paid_at: paidAt,
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
        amount,
        issue_date: nullableDate(form.issueDate),
        due_date: nullableDate(form.dueDate),
        status: form.status,
        notes: nullableText(form.notes),
        paid_at: paidAt,
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

    const daysOverdue = getOverdueDays(invoice.due_date, invoice.status)
    if (daysOverdue <= 0) {
      toast.message("This invoice is not overdue yet.")
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
            : "Follow-up draft ready to review."
        )
        router.push("/dashboard/recovery")
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

      toast.success("Follow-up draft ready to review.")
      router.push("/dashboard/recovery")
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
    <>
      <PageHeader
        title="Invoices"
        description="Find unpaid invoices, create recovery drafts, and keep payment follow-up connected."
      >
        <Dialog open={dialogOpen} onOpenChange={closeInvoiceDialog}>
          <Button onClick={openAddInvoice}>
            <Plus className="size-4" />
            Add invoice
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingInvoice ? "Edit invoice" : "Add invoice"}
              </DialogTitle>
              <DialogDescription>
                {editingInvoice
                  ? "Update this invoice."
                  : "Add an invoice you need to track."}
              </DialogDescription>
            </DialogHeader>

            <form className="grid gap-4" onSubmit={handleAddOrUpdateInvoice}>
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
                  <Label htmlFor="invoice-number">Invoice number</Label>
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

              <div className="grid gap-4 sm:grid-cols-3">
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

              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  value={form.notes}
                  onChange={(event) => updateForm("notes", event.target.value)}
                  placeholder="What work was completed or what follow-up is needed?"
                  className="min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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

      <div className="grid gap-6 p-4 sm:p-6 lg:p-8">
        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle>Invoice worklist</CardTitle>
                <CardDescription>
                  Review invoices and prepare follow-up drafts for Follow-ups.
                </CardDescription>
              </div>
              {hasActiveFilters ? (
                <Badge variant="outline" className="w-fit">
                  {filteredInvoices.length} of {invoices.length} invoices
                </Badge>
              ) : null}
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_220px_220px_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
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
                className="w-full lg:w-auto"
                disabled={!hasActiveFilters}
                onClick={resetFilters}
              >
                Clear
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            {errorMessage ? (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                <div className="font-medium">Invoice sync error</div>
                <p className="mt-1 leading-6">{errorMessage}</p>
              </div>
            ) : null}

            <ContentReveal isLoading={isLoading} skeleton={<InvoiceListSkeleton rows={6} />}>
              {errorMessage && invoices.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
                <h3 className="text-base font-semibold">
                  Something didn&apos;t load
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  Your data is safe. Try refreshing, or check your connection.
                </p>
                <Button
                  className="mt-5"
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
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="hidden grid-cols-[120px_1fr_112px_112px_120px_56px] gap-4 border-b border-border bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground xl:grid">
                  <div>Invoice</div>
                  <div>Client</div>
                  <div>Due</div>
                  <div>Amount</div>
                  <div>Status</div>
                  <div />
                </div>
                <div className="divide-y divide-border">
                  {filteredInvoices.map((invoice) => {
                    const overdueDays = getOverdueDays(
                      invoice.due_date,
                      invoice.status
                    )
                    return (
                      <div key={invoice.id} className="min-w-0 px-4 py-3">
                        <div
                          className="grid min-w-0 gap-3 rounded-md xl:grid-cols-[120px_1fr_112px_112px_120px_56px] xl:items-center"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {invoice.invoice_number}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {invoice.client_name || "No client"}
                            </div>
                          </div>
                          <div className="text-sm">
                            <div className="flex items-center gap-2 xl:block">
                              <span className="text-xs font-medium uppercase text-muted-foreground xl:hidden">
                                Due
                              </span>
                              <span>{formatDate(invoice.due_date)}</span>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {overdueDays > 0
                                ? `${overdueDays} days overdue`
                                : isDueToday(invoice.due_date) &&
                                    invoice.status !== "Paid" &&
                                    invoice.status !== "Draft"
                                  ? "Due today"
                                  : "Not overdue"}
                            </div>
                          </div>
                          <div className="font-semibold">
                            {moneyFormatter.format(invoice.amount)}
                          </div>
                          <div>
                            <Badge variant={statusTone[invoice.status]}>
                              {getStatusDisplayLabel(invoice.status)}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                            <Button
                              size="sm"
                              variant={
                                isOverdueInvoice(invoice) ? "default" : "outline"
                              }
                              className="w-full sm:w-auto"
                              disabled={isSaving}
                              onClick={(event) => {
                                event.stopPropagation()
                                if (isOverdueInvoice(invoice)) {
                                  void prepareRecoveryDraft(invoice)
                                } else {
                                  openEditInvoice(invoice)
                                }
                              }}
                            >
                              {isOverdueInvoice(invoice) ? (
                                <>
                                  <Send className="size-3.5" />
                                  Follow up
                                </>
                              ) : (
                                "View"
                              )}
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Actions for ${invoice.invoice_number}`}
                                  disabled={isSaving}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
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
                                    !isOverdueInvoice(invoice) || isSaving
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
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
                <div className="mx-auto grid size-12 place-items-center rounded-lg bg-background text-muted-foreground">
                  {hasActiveFilters ? (
                    <Search className="size-5" />
                  ) : (
                    <FileText className="size-5" />
                  )}
                </div>
                <h3 className="mt-4 text-base font-semibold">
                  {hasActiveFilters
                    ? "No invoices match these filters"
                    : "No invoices yet"}
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  {hasActiveFilters
                    ? "Try a different client, invoice number, or status."
                    : "Add your first invoice to start tracking unpaid revenue. Link a client to keep balances organized."}
                </p>
                <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                  {hasActiveFilters ? (
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={resetFilters}
                    >
                      Clear filters
                    </Button>
                  ) : null}
                  <Button className="w-full sm:w-auto" onClick={openAddInvoice}>
                    <Plus className="size-4" />
                    Add invoice
                  </Button>
                  {!hasActiveFilters ? (
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto"
                      asChild
                    >
                      <a href="/dashboard/clients">Add client</a>
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
            </ContentReveal>
          </CardContent>
        </Card>
      </div>

    </>
  )
}
