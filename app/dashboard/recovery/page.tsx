"use client"

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Mail,
  MessageSquareText,
  Phone,
  RefreshCw,
  ShieldAlert,
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
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { cn } from "@/lib/utils"

type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"]
type InvoiceUpdate = Database["public"]["Tables"]["invoices"]["Update"]
type RecoveryActionRow =
  Database["public"]["Tables"]["recovery_actions"]["Row"]
type RecoveryActionInsert =
  Database["public"]["Tables"]["recovery_actions"]["Insert"]
type ReminderRow = Database["public"]["Tables"]["reminders"]["Row"]
type ReminderInsert = Database["public"]["Tables"]["reminders"]["Insert"]
type ReminderUpdate = Database["public"]["Tables"]["reminders"]["Update"]
type InvoiceStatus = Database["public"]["Enums"]["invoice_status"]
type RecoveryStage = Database["public"]["Enums"]["recovery_stage"]
type RecoveryActionStatus =
  Database["public"]["Enums"]["recovery_action_status"]
type ContactMethod = Database["public"]["Enums"]["contact_method"]

type RecoveryItem = {
  id: string
  invoice: InvoiceRow
  clientName: string
  invoiceNumber: string
  amount: number
  daysOverdue: number
  recommendedNextAction: string
  contactMethod: ContactMethod
  status: string
  stage: RecoveryStage
  history: RecoveryActionRow[]
}

const stages: RecoveryStage[] = [
  "newly_overdue",
  "first_follow_up",
  "second_follow_up",
  "final_notice",
  "escalated",
  "resolved",
]

const stageLabels: Record<RecoveryStage, string> = {
  newly_overdue: "Newly Overdue",
  first_follow_up: "First Follow-up",
  second_follow_up: "Second Follow-up",
  final_notice: "Final Notice",
  escalated: "Escalated",
  resolved: "Resolved",
}

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

const stageStyle: Record<RecoveryStage, string> = {
  newly_overdue: "border-sky-200 bg-sky-50 text-sky-800",
  first_follow_up: "border-teal-200 bg-teal-50 text-teal-800",
  second_follow_up: "border-amber-200 bg-amber-50 text-amber-800",
  final_notice: "border-orange-200 bg-orange-50 text-orange-800",
  escalated: "border-red-200 bg-red-50 text-red-800",
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-800",
}

const stageSummary: Record<RecoveryStage, string> = {
  newly_overdue: "Just crossed due date",
  first_follow_up: "Friendly reminder sent",
  second_follow_up: "Needs firmer ask",
  final_notice: "Owner review before final message",
  escalated: "Sensitive balances",
  resolved: "Paid or closed",
}

const recommendedActionByStage: Record<RecoveryStage, string> = {
  newly_overdue: "Send a friendly reminder with the payment details.",
  first_follow_up: "Follow up by phone and confirm payment timing.",
  second_follow_up: "Send a firmer reminder and ask for a payment date.",
  final_notice: "Send final notice before escalation.",
  escalated: "Review documents and decide on the escalation path.",
  resolved: "No action needed. Payment or closure has been recorded.",
}

const followUpActionByStage: Record<RecoveryStage, string> = {
  newly_overdue: "First follow-up sent. Wait for client response.",
  first_follow_up: "Second follow-up sent. Ask for a firm payment date.",
  second_follow_up: "Follow-up logged. Prepare final notice if unpaid.",
  final_notice: "Final notice sent. Review before escalation.",
  escalated: "Escalation contact logged. Keep owner review active.",
  resolved: "No follow-up needed. Invoice is resolved.",
}

const actionStatusTone: Record<
  RecoveryActionStatus,
  "default" | "success" | "warning" | "muted" | "outline"
> = {
  Pending: "warning",
  Completed: "success",
  Skipped: "muted",
  Cancelled: "outline",
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "No date"
  }

  return dateTimeFormatter.format(new Date(value))
}

function nullableText(value: string) {
  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : null
}

function toReminderTimestamp(date: string) {
  return new Date(`${date}T09:00:00`).toISOString()
}

function getOverdueDays(dueDate: string | null, status: InvoiceStatus) {
  if (!dueDate || status === "Paid" || status === "Draft") {
    return 0
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${dueDate}T00:00:00`)
  const diff = today.getTime() - due.getTime()

  return Math.max(0, Math.floor(diff / 86_400_000))
}

function isRecoverableInvoice(invoice: InvoiceRow) {
  if (invoice.status === "Paid" || invoice.status === "Draft") {
    return false
  }

  return (
    invoice.status === "Overdue" ||
    invoice.status === "Follow-up Sent" ||
    invoice.status === "Payment Plan" ||
    invoice.status === "Escalated" ||
    getOverdueDays(invoice.due_date, invoice.status) > 0
  )
}

function getNextStage(stage: RecoveryStage): RecoveryStage {
  const index = stages.indexOf(stage)

  if (index < 0 || index >= stages.length - 1) {
    return stage
  }

  return stages[index + 1]
}

function getInvoiceStatusForStage(stage: RecoveryStage): InvoiceStatus {
  if (stage === "resolved") {
    return "Paid"
  }

  if (stage === "escalated") {
    return "Escalated"
  }

  if (stage === "newly_overdue") {
    return "Overdue"
  }

  return "Follow-up Sent"
}

function getDefaultStage(invoice: InvoiceRow): RecoveryStage {
  if (invoice.status === "Escalated") {
    return "escalated"
  }

  if (invoice.status === "Paid") {
    return "resolved"
  }

  return "newly_overdue"
}

function getMoveStatus(stage: RecoveryStage) {
  if (stage === "resolved") {
    return "Paid and closed"
  }

  return `Moved to ${stageLabels[getNextStage(stage)]}`
}

function sortActions(actions: RecoveryActionRow[]) {
  return [...actions].sort(
    (first, second) =>
      new Date(first.created_at).getTime() -
      new Date(second.created_at).getTime()
  )
}

function ContactMethodIcon({ method }: { method: ContactMethod }) {
  if (method === "Phone") {
    return <Phone className="size-3.5" />
  }

  if (method === "Text") {
    return <MessageSquareText className="size-3.5" />
  }

  return <Mail className="size-3.5" />
}

function RecoveryCard({
  item,
  invoiceById,
  reminders,
  isSaving,
  onAddReminder,
  onMarkReminderComplete,
  onDeleteReminder,
  onFollowUpSent,
  onMoveNext,
  onResolved,
}: {
  item: RecoveryItem
  invoiceById: Map<string, InvoiceRow>
  reminders: ReminderRow[]
  isSaving: boolean
  onAddReminder: (item: RecoveryItem) => void
  onMarkReminderComplete: (reminder: ReminderRow) => void
  onDeleteReminder: (reminder: ReminderRow) => void
  onFollowUpSent: (item: RecoveryItem) => void
  onMoveNext: (item: RecoveryItem) => void
  onResolved: (item: RecoveryItem) => void
}) {
  const isResolved = item.stage === "resolved"
  const latestHistory = item.history.slice(0, 3)

  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{item.clientName}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {item.invoiceNumber}
          </div>
        </div>
        <Badge variant={isResolved ? "success" : "warning"}>
          {item.daysOverdue} days
        </Badge>
      </div>

      <div className="mt-4 grid gap-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Amount</span>
          <span className="font-semibold">{moneyFormatter.format(item.amount)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Contact</span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <ContactMethodIcon method={item.contactMethod} />
            {item.contactMethod}
          </span>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-muted/50 p-3">
        <div className="text-xs font-medium uppercase text-muted-foreground">
          Recommended next action
        </div>
        <p className="mt-1 text-sm leading-5">{item.recommendedNextAction}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="outline" className={cn("max-w-full", stageStyle[item.stage])}>
          {item.status}
        </Badge>
        <Badge variant="outline">{item.invoice.status}</Badge>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Reminders
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isSaving}
            onClick={() => onAddReminder(item)}
          >
            <Bell className="size-3.5" />
            Add
          </Button>
        </div>
        <div className="mt-3">
          <ReminderList
            reminders={reminders}
            invoiceById={invoiceById}
            emptyText="No reminders yet. Add one to schedule the next follow-up."
            showInvoice={false}
            isSaving={isSaving}
            onMarkComplete={onMarkReminderComplete}
            onDelete={onDeleteReminder}
          />
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
          <Clock3 className="size-3.5" />
          Recovery history
        </div>
        {latestHistory.length > 0 ? (
          <div className="mt-3 grid gap-2">
            {latestHistory.map((action) => (
              <div key={action.id} className="grid gap-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{action.action_type}</span>
                  <Badge variant={actionStatusTone[action.status]}>
                    {action.status}
                  </Badge>
                </div>
                <div className="text-muted-foreground">
                  {stageLabels[action.stage]} - {formatTimestamp(action.created_at)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            No recovery actions logged yet.
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={isResolved || isSaving}
          onClick={() => onFollowUpSent(item)}
        >
          <Mail className="size-3.5" />
          Mark follow-up sent
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={isResolved || isSaving}
          onClick={() => onMoveNext(item)}
        >
          <ArrowRight className="size-3.5" />
          Move to next stage
        </Button>
        <Button
          size="sm"
          variant={isResolved ? "outline" : "default"}
          disabled={isResolved || isSaving}
          onClick={() => onResolved(item)}
        >
          <CheckCircle2 className="size-3.5" />
          Mark resolved
        </Button>
      </div>
    </div>
  )
}

export default function RecoveryPage() {
  const supabase = useMemo(() => createClient(), [])
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [actions, setActions] = useState<RecoveryActionRow[]>([])
  const [reminders, setReminders] = useState<ReminderRow[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false)
  const [reminderForm, setReminderForm] = useState<ReminderFormValues>(
    getInitialReminderForm()
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadRecovery = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setErrorMessage(userError?.message || "You must be logged in.")
      setInvoices([])
      setActions([])
      setReminders([])
      setUserId(null)
      setIsLoading(false)
      return
    }

    setUserId(user.id)

    const [invoiceResult, actionResult, reminderResult] = await Promise.all([
      supabase
        .from("invoices")
        .select("*")
        .eq("user_id", user.id)
        .order("due_date", { ascending: true, nullsFirst: false }),
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

    if (invoiceResult.error || actionResult.error || reminderResult.error) {
      setErrorMessage(
        invoiceResult.error?.message ||
          actionResult.error?.message ||
          reminderResult.error?.message ||
          "Could not load recovery data."
      )
      setInvoices([])
      setActions([])
      setReminders([])
    } else {
      setInvoices(invoiceResult.data || [])
      setActions(actionResult.data || [])
      setReminders(reminderResult.data || [])
    }

    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadRecovery()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [loadRecovery])

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

  const recoveryItems = useMemo<RecoveryItem[]>(() => {
    const actionsByInvoice = new Map<string, RecoveryActionRow[]>()

    for (const action of sortActions(actions)) {
      if (!action.invoice_id) continue
      const invoiceActions = actionsByInvoice.get(action.invoice_id) || []
      invoiceActions.push(action)
      actionsByInvoice.set(action.invoice_id, invoiceActions)
    }

    return invoices
      .map((invoice) => {
        const invoiceActions = actionsByInvoice.get(invoice.id) || []

        if (!isRecoverableInvoice(invoice) && invoiceActions.length === 0) {
          return null
        }

        const latestAction = invoiceActions[invoiceActions.length - 1]
        const stage = latestAction?.stage || getDefaultStage(invoice)
        const history = [...invoiceActions].sort(
          (first, second) =>
            new Date(second.created_at).getTime() -
            new Date(first.created_at).getTime()
        )

        return {
          id: invoice.id,
          invoice,
          clientName: invoice.client_name || "No client",
          invoiceNumber: invoice.invoice_number,
          amount: invoice.amount,
          daysOverdue: getOverdueDays(invoice.due_date, invoice.status),
          recommendedNextAction:
            latestAction?.recommended_next_action ||
            recommendedActionByStage[stage],
          contactMethod: latestAction?.contact_method || "Email",
          status: latestAction?.status
            ? `${latestAction.action_type} - ${latestAction.status}`
            : invoice.status === "Escalated"
              ? "Escalated for review"
              : "Needs first review",
          stage,
          history,
        }
      })
      .filter((item): item is RecoveryItem => item !== null)
  }, [actions, invoices])

  const totals = useMemo(() => {
    const activeItems = recoveryItems.filter((item) => item.stage !== "resolved")

    return {
      activeCount: activeItems.length,
      activeAmount: activeItems.reduce((sum, item) => sum + item.amount, 0),
      escalatedCount: recoveryItems.filter((item) => item.stage === "escalated")
        .length,
      resolvedCount: recoveryItems.filter((item) => item.stage === "resolved")
        .length,
    }
  }, [recoveryItems])

  function updateReminderForm<Field extends keyof ReminderFormValues>(
    field: Field,
    value: ReminderFormValues[Field]
  ) {
    setReminderForm((current) => ({ ...current, [field]: value }))
  }

  function openAddReminder(item?: RecoveryItem) {
    setReminderForm(getInitialReminderForm(item?.invoice.id || ""))
    setReminderDialogOpen(true)
  }

  function closeReminderDialog(open: boolean) {
    setReminderDialogOpen(open)

    if (!open) {
      setReminderForm(getInitialReminderForm())
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

  async function updateInvoice(invoiceId: string, payload: InvoiceUpdate) {
    if (!userId) {
      setErrorMessage("You must be logged in to update invoices.")
      return false
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
      return false
    }

    setInvoices((current) =>
      current.map((invoice) => (invoice.id === invoiceId ? data : invoice))
    )
    return true
  }

  async function createRecoveryAction(
    item: RecoveryItem,
    values: {
      stage: RecoveryStage
      actionType: string
      status: RecoveryActionStatus
      recommendedNextAction: string
      contactMethod?: ContactMethod
      completedAt?: string | null
      notes?: string | null
    }
  ) {
    if (!userId) {
      setErrorMessage("You must be logged in to save recovery actions.")
      return null
    }

    const payload: RecoveryActionInsert = {
      user_id: userId,
      invoice_id: item.invoice.id,
      stage: values.stage,
      action_type: values.actionType,
      status: values.status,
      contact_method: values.contactMethod || item.contactMethod,
      recommended_next_action: values.recommendedNextAction,
      completed_at: values.completedAt || null,
      notes: values.notes || null,
    }

    const { data, error } = await supabase
      .from("recovery_actions")
      .insert(payload)
      .select()
      .single()

    if (error) {
      setErrorMessage(error.message)
      return null
    }

    setActions((current) => [...current, data])
    return data
  }

  async function markFollowUpSent(item: RecoveryItem) {
    setIsSaving(true)
    setErrorMessage(null)

    const action = await createRecoveryAction(item, {
      stage: item.stage,
      actionType: "Follow-up sent",
      status: "Completed",
      recommendedNextAction: followUpActionByStage[item.stage],
      completedAt: new Date().toISOString(),
    })

    if (action && item.stage !== "resolved") {
      const status =
        item.stage === "escalated" ? "Escalated" : "Follow-up Sent"

      await updateInvoice(item.invoice.id, {
        status,
        paid_at: null,
      })
    }

    setIsSaving(false)
  }

  async function moveToNextStage(item: RecoveryItem) {
    const nextStage = getNextStage(item.stage)

    setIsSaving(true)
    setErrorMessage(null)

    const action = await createRecoveryAction(item, {
      stage: nextStage,
      actionType: "Stage moved",
      status: nextStage === "resolved" ? "Completed" : "Pending",
      recommendedNextAction: recommendedActionByStage[nextStage],
      completedAt: nextStage === "resolved" ? new Date().toISOString() : null,
      notes: getMoveStatus(item.stage),
    })

    if (action) {
      await updateInvoice(item.invoice.id, {
        status: getInvoiceStatusForStage(nextStage),
        paid_at: nextStage === "resolved" ? new Date().toISOString() : null,
      })
    }

    setIsSaving(false)
  }

  async function markResolved(item: RecoveryItem) {
    setIsSaving(true)
    setErrorMessage(null)

    const action = await createRecoveryAction(item, {
      stage: "resolved",
      actionType: "Resolved",
      status: "Completed",
      recommendedNextAction: recommendedActionByStage.resolved,
      completedAt: new Date().toISOString(),
      notes: "Marked resolved from the recovery pipeline.",
    })

    if (action) {
      await updateInvoice(item.invoice.id, {
        status: "Paid",
        paid_at: new Date().toISOString(),
      })
    }

    setIsSaving(false)
  }

  const hasRecoveryItems = recoveryItems.length > 0

  return (
    <>
      <PageHeader
        title="Recovery"
        description="See which overdue invoices need a reminder, a firmer follow-up, or owner review."
      >
        <Button
          type="button"
          variant="outline"
          disabled={invoices.length === 0 || isSaving}
          onClick={() => openAddReminder()}
        >
          <Bell className="size-4" />
          Add reminder
        </Button>
        <Button
          variant="outline"
          disabled={isLoading || isSaving}
          onClick={() => void loadRecovery()}
        >
          <RefreshCw
            className={cn("size-4", isLoading ? "animate-spin" : undefined)}
          />
          Refresh
        </Button>
      </PageHeader>

      <ReminderDialog
        open={reminderDialogOpen}
        onOpenChange={closeReminderDialog}
        title="Create reminder"
        description="Add a reminder connected to an invoice in recovery."
        form={reminderForm}
        onFormChange={updateReminderForm}
        onSubmit={createReminder}
        invoiceOptions={invoiceOptions}
        isSaving={isSaving}
      />

      <div className="grid gap-6 p-4 sm:p-6 lg:p-8">
        {errorMessage ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="font-medium">Recovery sync error</div>
            <p className="mt-1 leading-6">{errorMessage}</p>
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader>
              <CardDescription>Active recovery</CardDescription>
              <CardTitle className="text-2xl">{totals.activeCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Open recovery amount</CardDescription>
              <CardTitle className="text-2xl">
                {moneyFormatter.format(totals.activeAmount)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Escalated invoices</CardDescription>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <ShieldAlert className="size-5 text-red-700" />
                {totals.escalatedCount}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Resolved</CardDescription>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <CheckCircle2 className="size-5 text-emerald-700" />
                {totals.resolvedCount}
              </CardTitle>
            </CardHeader>
          </Card>
        </section>

        {isLoading ? (
          <Card>
            <CardContent className="p-8 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-lg bg-muted text-muted-foreground">
                <RefreshCw className="size-5 animate-spin" />
              </div>
              <h3 className="mt-4 text-base font-semibold">
                Loading recovery pipeline
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Fetching invoices and recovery history from Supabase.
              </p>
            </CardContent>
          </Card>
        ) : !hasRecoveryItems ? (
          <Card>
            <CardContent className="p-8 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-lg bg-muted text-muted-foreground">
                <ClipboardCheck className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold">
                No overdue invoices in recovery
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Overdue invoices from Supabase will appear here automatically.
                Once you move a card or mark a follow-up sent, the action is
                saved in recovery history.
              </p>
              <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                <Button asChild>
                  <a href="/dashboard/invoices">Add invoice</a>
                </Button>
                <Button variant="outline" asChild>
                  <a href="/dashboard/clients">Add client</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <section className="overflow-x-auto pb-2">
            <div className="grid min-w-[1680px] grid-cols-6 gap-4">
              {stages.map((stage) => {
                const stageItems = recoveryItems.filter(
                  (item) => item.stage === stage
                )

                return (
                  <Card key={stage} className="min-h-[480px] bg-muted/20">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-base">
                            {stageLabels[stage]}
                          </CardTitle>
                          <CardDescription>{stageSummary[stage]}</CardDescription>
                        </div>
                        <Badge variant="outline" className={stageStyle[stage]}>
                          {stageItems.length}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-3">
                      {stageItems.length > 0 ? (
                        stageItems.map((item) => (
                          <RecoveryCard
                            key={item.id}
                            item={item}
                            invoiceById={invoiceById}
                            reminders={
                              remindersByInvoice.get(item.invoice.id) || []
                            }
                            isSaving={isSaving}
                            onAddReminder={openAddReminder}
                            onMarkReminderComplete={(reminder) =>
                              void markReminderComplete(reminder)
                            }
                            onDeleteReminder={(reminder) =>
                              void deleteReminder(reminder)
                            }
                            onFollowUpSent={(selectedItem) =>
                              void markFollowUpSent(selectedItem)
                            }
                            onMoveNext={(selectedItem) =>
                              void moveToNextStage(selectedItem)
                            }
                            onResolved={(selectedItem) =>
                              void markResolved(selectedItem)
                            }
                          />
                        ))
                      ) : (
                        <div className="rounded-lg border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                          No invoices in this stage.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </section>
        )}

        <section className="grid gap-4 rounded-lg border border-teal-100 bg-teal-50 p-4 text-teal-950 md:grid-cols-[auto_1fr_auto] md:items-center">
          <div className="grid size-10 place-items-center rounded-lg bg-white text-teal-700">
            <ClipboardCheck className="size-5" />
          </div>
          <div>
            <div className="font-medium">Recommended next action</div>
            <p className="mt-1 text-sm leading-6 text-teal-800">
              Work left to right. Each follow-up, stage move, and resolved
              invoice creates a Supabase history record for the invoice.
            </p>
          </div>
          <Button
            className="bg-teal-700 hover:bg-teal-800"
            disabled={!hasRecoveryItems || isSaving}
            onClick={() => {
              const firstItem = recoveryItems.find(
                (item) => item.stage !== "resolved"
              )

              if (firstItem) {
                void markFollowUpSent(firstItem)
              }
            }}
          >
            Start with next invoice
            <ArrowRight className="size-4" />
          </Button>
        </section>
      </div>
    </>
  )
}
