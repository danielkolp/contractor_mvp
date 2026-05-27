"use client"

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ClipboardCopy,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
} from "lucide-react"

import { PageHeader } from "@/components/dashboard/page-header"
import {
  getInitialReminderForm,
  ReminderDialog,
  ReminderList,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { cn } from "@/lib/utils"

type ClientRow = Database["public"]["Tables"]["clients"]["Row"]
type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"]
type InvoiceInsert = Database["public"]["Tables"]["invoices"]["Insert"]
type InvoiceUpdate = Database["public"]["Tables"]["invoices"]["Update"]
type RecoveryActionRow =
  Database["public"]["Tables"]["recovery_actions"]["Row"]
type ReminderRow = Database["public"]["Tables"]["reminders"]["Row"]
type ReminderInsert = Database["public"]["Tables"]["reminders"]["Insert"]
type ReminderUpdate = Database["public"]["Tables"]["reminders"]["Update"]
type InvoiceStatus = Database["public"]["Enums"]["invoice_status"]
type RecoveryStage = Database["public"]["Enums"]["recovery_stage"]
type FollowUpTone = "friendly" | "firm" | "final notice"

type InvoiceForm = {
  clientName: string
  invoiceNumber: string
  amount: string
  issueDate: string
  dueDate: string
  status: InvoiceStatus
  notes: string
}

type FilterValue = "all"

const followUpTones: FollowUpTone[] = ["friendly", "firm", "final notice"]

const invoiceStatuses: InvoiceStatus[] = [
  "Draft",
  "Sent",
  "Overdue",
  "Follow-up Sent",
  "Payment Plan",
  "Paid",
  "Escalated",
]

const initialForm: InvoiceForm = {
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

const stageLabels: Record<RecoveryStage, string> = {
  newly_overdue: "Newly Overdue",
  first_follow_up: "First Follow-up",
  second_follow_up: "Second Follow-up",
  final_notice: "Final Notice",
  escalated: "Escalated",
  resolved: "Resolved",
}

const stageTone: Record<RecoveryStage, string> = {
  newly_overdue: "border-sky-200 bg-sky-50 text-sky-800",
  first_follow_up: "border-teal-200 bg-teal-50 text-teal-800",
  second_follow_up: "border-amber-200 bg-amber-50 text-amber-800",
  final_notice: "border-orange-200 bg-orange-50 text-orange-800",
  escalated: "border-red-200 bg-red-50 text-red-800",
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-800",
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

function getDefaultRecoveryStage(invoice: InvoiceRow): RecoveryStage {
  if (invoice.status === "Paid") {
    return "resolved"
  }

  if (invoice.status === "Escalated") {
    return "escalated"
  }

  return "newly_overdue"
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
    clientName: invoice.client_name || "",
    invoiceNumber: invoice.invoice_number,
    amount: String(invoice.amount ?? ""),
    issueDate: invoice.issue_date || "",
    dueDate: invoice.due_date || "",
    status: invoice.status,
    notes: invoice.notes || "",
  }
}

function generateFollowUpMessage(invoice: InvoiceRow, tone: FollowUpTone) {
  const clientName = invoice.client_name || "there"
  const amount = moneyFormatter.format(invoice.amount)
  const daysOverdue = getOverdueDays(invoice.due_date, invoice.status)
  const invoiceNumber = invoice.invoice_number

  if (tone === "firm") {
    return `Hi ${clientName}, I am following up on invoice ${invoiceNumber} for ${amount}, which is now ${daysOverdue} days overdue. Please send payment or reply today with a clear payment date so we can keep the account current.`
  }

  if (tone === "final notice") {
    return `Hi ${clientName}, this is a final notice for invoice ${invoiceNumber} in the amount of ${amount}. The invoice is ${daysOverdue} days overdue. Please make payment immediately or contact us today to resolve the balance before the account is escalated.`
  }

  return `Hi ${clientName}, I wanted to send a friendly reminder about invoice ${invoiceNumber} for ${amount}. It looks like it is ${daysOverdue} days overdue. When you have a moment, please send payment or let me know when we should expect it. Thank you.`
}

export default function InvoicesPage() {
  const supabase = useMemo(() => createClient(), [])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [recoveryActions, setRecoveryActions] = useState<RecoveryActionRow[]>(
    []
  )
  const [reminders, setReminders] = useState<ReminderRow[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | FilterValue>(
    "all"
  )
  const [clientFilter, setClientFilter] = useState<string | FilterValue>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [detailSheetOpen, setDetailSheetOpen] = useState(false)
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [editingInvoice, setEditingInvoice] = useState<InvoiceRow | null>(null)
  const [followUpInvoice, setFollowUpInvoice] = useState<InvoiceRow | null>(null)
  const [followUpTone, setFollowUpTone] = useState<FollowUpTone>("friendly")
  const [detailFollowUpTone, setDetailFollowUpTone] =
    useState<FollowUpTone>("friendly")
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  )
  const [detailCopyState, setDetailCopyState] = useState<
    "idle" | "copied" | "failed"
  >("idle")
  const [form, setForm] = useState<InvoiceForm>(initialForm)
  const [detailForm, setDetailForm] = useState<InvoiceForm>(initialForm)
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
      setRecoveryActions([])
      setReminders([])
      setUserId(null)
      setIsLoading(false)
      return
    }

    setUserId(user.id)

    const [clientResult, invoiceResult, actionResult, reminderResult] =
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
          .from("recovery_actions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("reminders")
          .select("*")
          .eq("user_id", user.id)
          .order("reminder_date", { ascending: true }),
      ])

    const firstError =
      clientResult.error ||
      invoiceResult.error ||
      actionResult.error ||
      reminderResult.error

    if (firstError) {
      setErrorMessage(firstError.message)
      setClients([])
      setInvoices([])
      setRecoveryActions([])
      setReminders([])
    } else {
      setClients(clientResult.data || [])
      setInvoices(invoiceResult.data || [])
      setRecoveryActions(actionResult.data || [])
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

  const clientOptions = useMemo(
    () =>
      Array.from(
        new Set(
          invoices
            .map((invoice) => invoice.client_name)
            .filter((client): client is string => Boolean(client))
        )
      ).sort(),
    [invoices]
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
        clientFilter === "all" || clientName === clientFilter

      return matchesSearch && matchesStatus && matchesClient
    })
  }, [clientFilter, invoices, searchQuery, statusFilter])

  const invoiceById = useMemo(
    () => new Map(invoices.map((invoice) => [invoice.id, invoice])),
    [invoices]
  )

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

  const remindersByInvoice = useMemo(() => {
    const groupedReminders = new Map<string, ReminderRow[]>()

    for (const reminder of reminders) {
      const invoiceReminders = groupedReminders.get(reminder.invoice_id) || []
      invoiceReminders.push(reminder)
      groupedReminders.set(reminder.invoice_id, invoiceReminders)
    }

    return groupedReminders
  }, [reminders])

  const recoveryActionsByInvoice = useMemo(() => {
    const groupedActions = new Map<string, RecoveryActionRow[]>()

    for (const action of recoveryActions) {
      if (!action.invoice_id) continue
      const invoiceActions = groupedActions.get(action.invoice_id) || []
      invoiceActions.push(action)
      groupedActions.set(action.invoice_id, invoiceActions)
    }

    return groupedActions
  }, [recoveryActions])

  const selectedInvoice = useMemo(
    () =>
      selectedInvoiceId
        ? invoices.find((invoice) => invoice.id === selectedInvoiceId) || null
        : null,
    [invoices, selectedInvoiceId]
  )

  const selectedClient = useMemo(() => {
    if (!selectedInvoice) {
      return null
    }

    return (
      clients.find((client) => invoiceMatchesClient(client, selectedInvoice)) ||
      null
    )
  }, [clients, selectedInvoice])

  const selectedRecoveryHistory = useMemo(() => {
    if (!selectedInvoice) {
      return []
    }

    return (recoveryActionsByInvoice.get(selectedInvoice.id) || [])
      .slice()
      .sort(
        (first, second) =>
          new Date(second.created_at).getTime() -
          new Date(first.created_at).getTime()
      )
  }, [recoveryActionsByInvoice, selectedInvoice])

  const selectedRecoveryStage =
    selectedRecoveryHistory[0]?.stage ||
    (selectedInvoice &&
    (selectedInvoice.status === "Overdue" ||
      selectedInvoice.status === "Follow-up Sent" ||
      selectedInvoice.status === "Payment Plan" ||
      selectedInvoice.status === "Escalated" ||
      selectedInvoice.status === "Paid" ||
      isOverdueInvoice(selectedInvoice))
      ? getDefaultRecoveryStage(selectedInvoice)
      : null)

  const selectedReminders = selectedInvoice
    ? remindersByInvoice.get(selectedInvoice.id) || []
    : []

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    statusFilter !== "all" ||
    clientFilter !== "all"
  const followUpMessage = followUpInvoice
    ? generateFollowUpMessage(followUpInvoice, followUpTone)
    : ""
  const detailFollowUpMessage = selectedInvoice
    ? generateFollowUpMessage(selectedInvoice, detailFollowUpTone)
    : ""

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

  function updateDetailForm<Field extends keyof InvoiceForm>(
    field: Field,
    value: InvoiceForm[Field]
  ) {
    setDetailForm((current) => ({ ...current, [field]: value }))
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

  function openInvoiceDetails(invoice: InvoiceRow) {
    setSelectedInvoiceId(invoice.id)
    setDetailForm(formFromInvoice(invoice))
    setDetailFollowUpTone("friendly")
    setDetailCopyState("idle")
    setDetailSheetOpen(true)
  }

  function openAddReminder(invoice?: InvoiceRow) {
    setReminderForm(getInitialReminderForm(invoice?.id || ""))
    setReminderDialogOpen(true)
  }

  function openFollowUp(invoice: InvoiceRow) {
    setFollowUpInvoice(invoice)
    setFollowUpTone("friendly")
    setCopyState("idle")
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

  function closeDetailSheet(open: boolean) {
    setDetailSheetOpen(open)

    if (!open) {
      setSelectedInvoiceId(null)
      setDetailForm(initialForm)
      setDetailCopyState("idle")
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

    if (editingInvoice) {
      const payload: InvoiceUpdate = {
        invoice_number: invoiceNumber,
        client_name: nullableText(form.clientName),
        trade: inferTrade(form.clientName),
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
      }
    } else {
      const payload: InvoiceInsert = {
        user_id: userId,
        invoice_number: invoiceNumber,
        client_name: nullableText(form.clientName),
        trade: inferTrade(form.clientName),
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
      }
    }

    setIsSaving(false)
  }

  async function saveInvoiceDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!userId || !selectedInvoice) {
      setErrorMessage("You must be logged in to update invoices.")
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    const invoiceNumber =
      detailForm.invoiceNumber.trim() ||
      selectedInvoice.invoice_number ||
      `INV-${Date.now().toString().slice(-6)}`
    const amount = parseAmount(detailForm.amount)
    const paidAt =
      detailForm.status === "Paid"
        ? selectedInvoice.paid_at || new Date().toISOString()
        : null
    const payload: InvoiceUpdate = {
      invoice_number: invoiceNumber,
      client_name: nullableText(detailForm.clientName),
      trade: inferTrade(detailForm.clientName),
      amount,
      issue_date: nullableDate(detailForm.issueDate),
      due_date: nullableDate(detailForm.dueDate),
      status: detailForm.status,
      notes: nullableText(detailForm.notes),
      paid_at: paidAt,
    }

    const { data, error } = await supabase
      .from("invoices")
      .update(payload)
      .eq("id", selectedInvoice.id)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) {
      setErrorMessage(error.message)
    } else {
      setInvoices((current) =>
        current.map((invoice) =>
          invoice.id === selectedInvoice.id ? data : invoice
        )
      )
      setDetailForm(formFromInvoice(data))
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

      if (selectedInvoiceId === invoiceId) {
        setDetailForm(formFromInvoice(data))
      }
    }

    setIsSaving(false)
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

      if (selectedInvoiceId === invoiceId) {
        closeDetailSheet(false)
      }
    }

    setIsSaving(false)
  }

  async function copyFollowUpMessage() {
    if (!followUpMessage) {
      return
    }

    try {
      await navigator.clipboard.writeText(followUpMessage)
      setCopyState("copied")
    } catch {
      setCopyState("failed")
    }
  }

  async function copyDetailFollowUpMessage() {
    if (!detailFollowUpMessage) {
      return
    }

    try {
      await navigator.clipboard.writeText(detailFollowUpMessage)
      setDetailCopyState("copied")
    } catch {
      setDetailCopyState("failed")
    }
  }

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Search, filter, and track invoices by client, due date, recovery status, and overdue days."
      >
        <Button
          type="button"
          variant="outline"
          disabled={invoices.length === 0}
          onClick={() => openAddReminder()}
        >
          <Bell className="size-4" />
          Add reminder
        </Button>
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
                  ? "Update this invoice in Supabase."
                  : "Create an invoice in Supabase for the logged-in user."}
              </DialogDescription>
            </DialogHeader>

            <form className="grid gap-4" onSubmit={handleAddOrUpdateInvoice}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="client-name">Client name</Label>
                  <Input
                    id="client-name"
                    value={form.clientName}
                    onChange={(event) =>
                      updateForm("clientName", event.target.value)
                    }
                    placeholder="Greenline HOA"
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

      <Sheet open={detailSheetOpen} onOpenChange={closeDetailSheet}>
        <SheetContent
          side="right"
          className="flex h-full w-full max-w-full flex-col overflow-y-auto sm:max-w-xl md:max-w-2xl lg:max-w-3xl"
        >
          {selectedInvoice ? (
            <>
              <SheetHeader className="border-b border-border px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-3 pr-8 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <SheetTitle className="text-xl">
                      {selectedInvoice.invoice_number}
                    </SheetTitle>
                    <SheetDescription className="break-words">
                      {selectedInvoice.client_name || "No client"} -{" "}
                      {moneyFormatter.format(selectedInvoice.amount)}
                    </SheetDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant={statusTone[selectedInvoice.status]}
                      className="max-w-full"
                    >
                      {selectedInvoice.status}
                    </Badge>
                    {selectedRecoveryStage ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "max-w-full",
                          stageTone[selectedRecoveryStage]
                        )}
                      >
                        {stageLabels[selectedRecoveryStage]}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                {selectedInvoice.status !== "Paid" ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      disabled={isSaving}
                      onClick={() =>
                        void updateInvoiceStatus(selectedInvoice.id, "Paid")
                      }
                    >
                      <CheckCircle2 className="size-3.5" />
                      Mark paid
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openAddReminder(selectedInvoice)}
                    >
                      <Bell className="size-3.5" />
                      Add reminder
                    </Button>
                  </div>
                ) : null}
              </SheetHeader>

              <div className="grid gap-5 p-4 sm:p-6">
                <section className="grid gap-3 rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Invoice details</h3>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <div className="text-xs text-muted-foreground">Issued</div>
                      <div className="mt-1 text-sm font-medium">
                        {formatDate(selectedInvoice.issue_date)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Due</div>
                      <div className="mt-1 text-sm font-medium">
                        {formatDate(selectedInvoice.due_date)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">
                        Days overdue
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {getOverdueDays(
                          selectedInvoice.due_date,
                          selectedInvoice.status
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Trade</div>
                      <div className="mt-1 text-sm font-medium">
                        {selectedInvoice.trade || "Not set"}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="grid gap-3 rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Client details</h3>
                  </div>
                  {selectedClient ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Company
                        </div>
                        <div className="mt-1 text-sm font-medium">
                          {selectedClient.company}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Contact
                        </div>
                        <div className="mt-1 text-sm font-medium">
                          {selectedClient.name}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Email</div>
                        <div className="mt-1 break-all text-sm font-medium">
                          {selectedClient.email || "Not set"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Phone</div>
                        <div className="mt-1 text-sm font-medium">
                          {selectedClient.phone || "Not set"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Payment reliability
                        </div>
                        <div className="mt-1">
                          <Badge variant="outline">
                            {selectedClient.payment_reliability}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Last contacted
                        </div>
                        <div className="mt-1 text-sm font-medium">
                          {formatDate(selectedClient.last_contacted_date)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                      No matching client record was found. The invoice still
                      tracks the client name shown above.
                    </div>
                  )}
                </section>

                <form
                  className="grid gap-4 rounded-lg border border-border p-4"
                  onSubmit={saveInvoiceDetails}
                >
                  <div className="flex items-center gap-2">
                    <Pencil className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Edit invoice</h3>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="detail-client-name">Client name</Label>
                      <Input
                        id="detail-client-name"
                        value={detailForm.clientName}
                        onChange={(event) =>
                          updateDetailForm("clientName", event.target.value)
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="detail-invoice-number">
                        Invoice number
                      </Label>
                      <Input
                        id="detail-invoice-number"
                        value={detailForm.invoiceNumber}
                        onChange={(event) =>
                          updateDetailForm("invoiceNumber", event.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="grid gap-2">
                      <Label htmlFor="detail-amount">Amount</Label>
                      <Input
                        id="detail-amount"
                        type="number"
                        min="0"
                        step="1"
                        value={detailForm.amount}
                        onChange={(event) =>
                          updateDetailForm("amount", event.target.value)
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="detail-issue-date">Issue date</Label>
                      <Input
                        id="detail-issue-date"
                        type="date"
                        value={detailForm.issueDate}
                        onChange={(event) =>
                          updateDetailForm("issueDate", event.target.value)
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="detail-due-date">Due date</Label>
                      <Input
                        id="detail-due-date"
                        type="date"
                        value={detailForm.dueDate}
                        onChange={(event) =>
                          updateDetailForm("dueDate", event.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="detail-status">Status</Label>
                    <SelectField
                      id="detail-status"
                      value={detailForm.status}
                      onChange={(value) =>
                        updateDetailForm("status", value as InvoiceStatus)
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
                    <Label htmlFor="detail-notes">Notes</Label>
                    <textarea
                      id="detail-notes"
                      value={detailForm.notes}
                      onChange={(event) =>
                        updateDetailForm("notes", event.target.value)
                      }
                      className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={isSaving}
                      className="w-full sm:w-auto"
                    >
                      {isSaving ? "Saving..." : "Save changes"}
                    </Button>
                  </div>
                </form>

                <section className="grid gap-3 rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2">
                    <Clock3 className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Recovery history</h3>
                  </div>
                  {selectedRecoveryHistory.length > 0 ? (
                    <div className="grid gap-3">
                      {selectedRecoveryHistory.map((action) => (
                        <div
                          key={action.id}
                          className="rounded-lg border border-border bg-muted/20 p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0 break-words font-medium">
                              {action.action_type}
                            </div>
                            <Badge
                              variant="outline"
                              className={stageTone[action.stage]}
                            >
                              {stageLabels[action.stage]}
                            </Badge>
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {new Date(action.created_at).toLocaleString()}
                          </div>
                          {action.recommended_next_action ? (
                            <p className="mt-2 text-sm leading-5 text-muted-foreground">
                              {action.recommended_next_action}
                            </p>
                          ) : null}
                          {action.notes ? (
                            <p className="mt-2 text-sm leading-5">
                              {action.notes}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                      No recovery actions have been logged for this invoice.
                    </div>
                  )}
                </section>

                <section className="grid gap-3 rounded-lg border border-border p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="size-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">Reminders</h3>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => openAddReminder(selectedInvoice)}
                    >
                      <Bell className="size-3.5" />
                      Add reminder
                    </Button>
                  </div>
                  <ReminderList
                    reminders={selectedReminders}
                    invoiceById={invoiceById}
                    emptyText="No reminders yet. Add one to keep this invoice on your radar."
                    showInvoice={false}
                    isSaving={isSaving}
                    onMarkComplete={(reminder) =>
                      void markReminderComplete(reminder)
                    }
                    onDelete={(reminder) => void deleteReminder(reminder)}
                  />
                </section>

                <section className="grid gap-4 rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2">
                    <Send className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">
                      Follow-up message
                    </h3>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="detail-follow-up-tone">Tone</Label>
                    <SelectField
                      id="detail-follow-up-tone"
                      value={detailFollowUpTone}
                      onChange={(value) => {
                        setDetailFollowUpTone(value as FollowUpTone)
                        setDetailCopyState("idle")
                      }}
                    >
                      {followUpTones.map((tone) => (
                        <option key={tone} value={tone}>
                          {tone}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  <textarea
                    readOnly
                    value={detailFollowUpMessage}
                    className="min-h-36 w-full resize-y rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm leading-6 shadow-xs outline-none"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      className="w-full sm:w-auto"
                      onClick={copyDetailFollowUpMessage}
                    >
                      <ClipboardCopy className="size-4" />
                      {detailCopyState === "copied"
                        ? "Copied"
                        : detailCopyState === "failed"
                          ? "Copy failed"
                          : "Copy message"}
                    </Button>
                  </div>
                </section>
              </div>
            </>
          ) : (
            <div className="p-6 text-sm text-muted-foreground">
              Select an invoice to view details.
            </div>
          )}
        </SheetContent>
      </Sheet>

      <div className="grid gap-6 p-4 sm:p-6 lg:p-8">
        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle>Invoice worklist</CardTitle>
                <CardDescription>
                  Invoices are loaded from Supabase and protected by row-level
                  security.
                </CardDescription>
              </div>
              <Badge variant="outline" className="w-fit">
                {filteredInvoices.length} of {invoices.length} invoices
              </Badge>
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
                {clientOptions.map((client) => (
                  <option key={client} value={client}>
                    {client}
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

            {isLoading ? (
              <div className="rounded-lg border border-border p-8 text-center">
                <div className="mx-auto grid size-12 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <RefreshCw className="size-5 animate-spin" />
                </div>
                <h3 className="mt-4 text-base font-semibold">
                  Loading invoices
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Fetching your protected invoice records from Supabase.
                </p>
              </div>
            ) : errorMessage && invoices.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
                <h3 className="text-base font-semibold">
                  Could not load invoices
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  Check your Supabase environment variables, auth session, and
                  database migration, then try again.
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
                  Retry
                </Button>
              </div>
            ) : filteredInvoices.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="hidden grid-cols-[120px_1fr_112px_112px_112px_132px_48px] gap-4 border-b border-border bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground xl:grid">
                  <div>Invoice</div>
                  <div>Client</div>
                  <div>Issued</div>
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
                    const reminderCount =
                      remindersByInvoice.get(invoice.id)?.length || 0

                    return (
                      <div key={invoice.id} className="min-w-0 px-4 py-3">
                        <div
                          role="button"
                          tabIndex={0}
                          className="grid min-w-0 cursor-pointer gap-3 rounded-md transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 xl:grid-cols-[120px_1fr_112px_112px_112px_132px_48px] xl:items-center"
                          onClick={() => openInvoiceDetails(invoice)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault()
                              openInvoiceDetails(invoice)
                            }
                          }}
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {invoice.invoice_number}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {invoice.trade || "Trade not set"}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="break-words font-medium">
                              {invoice.client_name || "No client"}
                            </div>
                            <div className="mt-1 truncate text-sm text-muted-foreground">
                              {invoice.notes || "No notes added"}
                            </div>
                          </div>
                          <div className="text-sm">
                            <div className="flex items-center gap-2 xl:block">
                              <span className="text-xs font-medium uppercase text-muted-foreground xl:hidden">
                                Issued
                              </span>
                              <span>{formatDate(invoice.issue_date)}</span>
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
                                : "Not overdue"}
                            </div>
                          </div>
                          <div className="font-semibold">
                            {moneyFormatter.format(invoice.amount)}
                          </div>
                          <div>
                            <Badge variant={statusTone[invoice.status]}>
                              {invoice.status}
                            </Badge>
                            {reminderCount > 0 ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {reminderCount} reminder
                                {reminderCount === 1 ? "" : "s"}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                            {isOverdueInvoice(invoice) ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full sm:w-auto"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  openFollowUp(invoice)
                                }}
                              >
                                <Send className="size-3.5" />
                                Generate follow-up
                              </Button>
                            ) : null}
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
                                  onSelect={() => openEditInvoice(invoice)}
                                >
                                  <Pencil className="size-4" />
                                  Edit invoice
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() => openAddReminder(invoice)}
                                >
                                  <Bell className="size-4" />
                                  Add reminder
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() =>
                                    void updateInvoiceStatus(
                                      invoice.id,
                                      "Follow-up Sent"
                                    )
                                  }
                                >
                                  <Send className="size-4" />
                                  Mark follow-up sent
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() =>
                                    void updateInvoiceStatus(invoice.id, "Paid")
                                  }
                                >
                                  <CalendarDays className="size-4" />
                                  Mark paid
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() => void deleteInvoice(invoice.id)}
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
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={followUpInvoice !== null}
        onOpenChange={(open) => {
          if (!open) {
            setFollowUpInvoice(null)
            setCopyState("idle")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generated follow-up</DialogTitle>
            <DialogDescription>
              Local template message. No AI API is used.
            </DialogDescription>
          </DialogHeader>

          {followUpInvoice ? (
            <div className="grid gap-4">
              <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-3">
                <div>
                  <div className="text-xs text-muted-foreground">Client</div>
                  <div className="mt-1 text-sm font-medium">
                    {followUpInvoice.client_name || "No client"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Invoice</div>
                  <div className="mt-1 text-sm font-medium">
                    {followUpInvoice.invoice_number}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    Days overdue
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {getOverdueDays(
                      followUpInvoice.due_date,
                      followUpInvoice.status
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="follow-up-tone">Tone</Label>
                <SelectField
                  id="follow-up-tone"
                  value={followUpTone}
                  onChange={(value) => {
                    setFollowUpTone(value as FollowUpTone)
                    setCopyState("idle")
                  }}
                >
                  {followUpTones.map((tone) => (
                    <option key={tone} value={tone}>
                      {tone}
                    </option>
                  ))}
                </SelectField>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="follow-up-message">Suggested message</Label>
                <textarea
                  id="follow-up-message"
                  readOnly
                  value={followUpMessage}
                  className="min-h-40 w-full resize-y rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm leading-6 shadow-xs outline-none"
                />
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Close
                  </Button>
                </DialogClose>
                <Button type="button" onClick={copyFollowUpMessage}>
                  <ClipboardCopy className="size-4" />
                  {copyState === "copied"
                    ? "Copied"
                    : copyState === "failed"
                      ? "Copy failed"
                      : "Copy message"}
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
