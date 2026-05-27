"use client"

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  ArrowRight,
  Bell,
  ClipboardCheck,
  Clock3,
  Mail,
  Pencil,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react"

import { PageHeader } from "@/components/dashboard/page-header"
import { RecoveryQueuePageSkeleton } from "@/components/dashboard/skeleton-loaders"
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
import { Textarea } from "@/components/ui/textarea"
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
  first_follow_up: "border-amber-200 bg-amber-50 text-amber-800",
  second_follow_up: "border-amber-200 bg-amber-50 text-amber-800",
  final_notice: "border-orange-200 bg-orange-50 text-orange-800",
  escalated: "border-red-200 bg-red-50 text-red-800",
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-800",
}

const recommendedActionByStage: Record<RecoveryStage, string> = {
  newly_overdue: "Send a friendly payment reminder.",
  first_follow_up: "Send a firmer follow-up.",
  second_follow_up: "Ask for a firm payment date.",
  final_notice: "Send the final notice.",
  escalated: "Send a firm payment reminder.",
  resolved: "No action needed.",
}

const followUpActionByStage: Record<RecoveryStage, string> = {
  newly_overdue: "First follow-up sent. Wait for client response.",
  first_follow_up: "Second follow-up sent. Ask for a firm payment date.",
  second_follow_up: "Follow-up logged. Prepare final notice if unpaid.",
  final_notice: "Final notice sent. Review before escalation.",
  escalated: "Escalation contact logged. Keep owner review active.",
  resolved: "No follow-up needed. Invoice is resolved.",
}

function formatTimestamp(value: string | null) {
  if (!value) return "No date"
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
  if (!dueDate || status === "Paid" || status === "Draft") return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${dueDate}T00:00:00`)
  const diff = today.getTime() - due.getTime()
  return Math.max(0, Math.floor(diff / 86_400_000))
}

function isRecoverableInvoice(invoice: InvoiceRow) {
  if (invoice.status === "Paid" || invoice.status === "Draft") return false
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
  if (index < 0 || index >= stages.length - 1) return stage
  return stages[index + 1]
}

function getInvoiceStatusForStage(stage: RecoveryStage): InvoiceStatus {
  if (stage === "resolved") return "Paid"
  if (stage === "escalated") return "Escalated"
  if (stage === "newly_overdue") return "Overdue"
  return "Follow-up Sent"
}

function getDefaultStage(invoice: InvoiceRow): RecoveryStage {
  if (invoice.status === "Escalated") return "escalated"
  if (invoice.status === "Paid") return "resolved"
  return "newly_overdue"
}

function getMoveStatus(stage: RecoveryStage) {
  if (stage === "resolved") return "Paid and closed"
  const labels: Record<RecoveryStage, string> = {
    newly_overdue: "Newly Overdue",
    first_follow_up: "First Follow-up",
    second_follow_up: "Second Follow-up",
    final_notice: "Final Notice",
    escalated: "Escalated",
    resolved: "Resolved",
  }
  return `Moved to ${labels[getNextStage(stage)]}`
}

function sortActions(actions: RecoveryActionRow[]) {
  return [...actions].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )
}

function getReadableStatus(stage: RecoveryStage): string {
  const map: Record<RecoveryStage, string> = {
    newly_overdue: "Needs approval",
    first_follow_up: "Waiting on customer",
    second_follow_up: "Waiting on customer",
    final_notice: "Needs approval",
    escalated: "Needs approval",
    resolved: "Recovered",
  }
  return map[stage]
}

function getRecommendedSubtext(stage: RecoveryStage): string {
  if (stage === "newly_overdue") {
    return "This invoice is ready for a follow-up. Review the message below before it goes out."
  }
  if (stage === "first_follow_up") {
    return "Your first message was sent. We drafted another follow-up for your approval."
  }
  if (stage === "second_follow_up") {
    return "This invoice is still unpaid. We drafted a firmer follow-up for your approval."
  }
  if (stage === "final_notice") {
    return "Time for a firmer message. Review and approve the final notice below."
  }
  if (stage === "escalated") {
    return "This invoice is still unpaid. We drafted a firm follow-up for your approval."
  }
  return "Review the draft message below before it goes out."
}

function generateDraftMessage(item: RecoveryItem): string {
  const amount = moneyFormatter.format(item.amount)
  const inv = item.invoiceNumber
  const name = item.clientName
  const isFirmer =
    item.stage === "second_follow_up" ||
    item.stage === "final_notice" ||
    item.stage === "escalated"

  if (isFirmer) {
    return `Hi ${name}, following up again on invoice ${inv} for ${amount}. This still appears unpaid on our end. Please let me know when we can expect payment or if there's anything holding this up.`
  }

  if (item.daysOverdue > 0) {
    return `Hi ${name}, following up on invoice ${inv} for ${amount}. It looks like this invoice is now overdue. Could you let me know when payment will be sent? Thanks.`
  }

  return `Hi ${name}, just following up on invoice ${inv} for ${amount}. Could you let me know when payment will be sent? Thanks.`
}

function FeaturedCard({
  item,
  isSaving,
  onAddReminder,
  onFollowUpSent,
  onResolved,
}: {
  item: RecoveryItem
  isSaving: boolean
  onAddReminder: (item: RecoveryItem) => void
  onFollowUpSent: (item: RecoveryItem) => void
  onResolved: (item: RecoveryItem) => void
}) {
  const [isEditingMessage, setIsEditingMessage] = useState(false)
  const [customMessage, setCustomMessage] = useState(() =>
    generateDraftMessage(item)
  )
  const isResolved = item.stage === "resolved"
  const amount = moneyFormatter.format(item.amount)

  return (
    <Card className="border-2 border-green-100 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Badge
              variant="outline"
              className={cn("mb-3", stageStyle[item.stage])}
            >
              {getReadableStatus(item.stage)}
            </Badge>
            <CardTitle className="text-xl leading-tight">
              {item.clientName}
            </CardTitle>
            <CardDescription className="mt-1">
              Invoice {item.invoiceNumber}
              {item.invoice.due_date &&
                ` · Due ${new Date(
                  item.invoice.due_date + "T00:00:00"
                ).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}`}
            </CardDescription>
          </div>
          <div className="shrink-0 sm:text-right">
            <div className="text-3xl font-bold tabular-nums">{amount}</div>
            {item.daysOverdue > 0 && (
              <Badge
                variant="outline"
                className={cn(
                  "mt-1.5",
                  item.daysOverdue > 60
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-orange-200 bg-orange-50 text-orange-700"
                )}
              >
                {item.daysOverdue} days overdue
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Recommended next step */}
        <div className="rounded-xl border border-green-100 bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-800">
            {item.recommendedNextAction}
          </p>
          <p className="mt-1 text-xs leading-5 text-green-700">
            {getRecommendedSubtext(item.stage)}
          </p>
        </div>

        {/* Message draft */}
        <div>
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                Message draft
              </span>
              <span className="inline-flex items-center rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground">
                AI suggested
              </span>
            </div>
          </div>

          {isEditingMessage ? (
            <div className="space-y-2">
              <Textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                className="min-h-28 text-sm leading-6"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-muted-foreground"
                onClick={() => setIsEditingMessage(false)}
              >
                <X className="size-3" />
                Done editing
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3.5 text-sm leading-6 text-foreground">
              <span className="select-none text-muted-foreground">
                &ldquo;
              </span>
              {customMessage}
              <span className="select-none text-muted-foreground">
                &rdquo;
              </span>
            </div>
          )}
        </div>

        {/* Last action */}
        {item.history.length > 0 && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Clock3 className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Last: {item.history[0].action_type} ·{" "}
              {formatTimestamp(item.history[0].created_at)}
            </span>
          </div>
        )}

        {/* Action area */}
        <div className="space-y-4 border-t border-border pt-5">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0 text-green-600" />
            Nothing sends automatically. You approve every message first.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              className="gap-2 bg-green-700 text-white hover:bg-green-800"
              disabled={isResolved || isSaving}
              onClick={() => onFollowUpSent(item)}
            >
              <Mail className="size-4" />
              Approve &amp; send
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              disabled={isResolved}
              onClick={() => setIsEditingMessage((v) => !v)}
            >
              <Pencil className="size-4" />
              Edit message
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              disabled={isSaving}
              onClick={() => onAddReminder(item)}
            >
              <Bell className="size-4" />
              Remind me later
            </Button>
            {!isResolved && (
              <Button
                type="button"
                variant="ghost"
                className="gap-2 text-muted-foreground hover:text-foreground"
                disabled={isSaving}
                onClick={() => onResolved(item)}
              >
                Mark as resolved
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function RecoveryPage() {
  const supabase = useMemo(() => createClient(), [])
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [actions, setActions] = useState<RecoveryActionRow[]>([])
  const [, setReminders] = useState<ReminderRow[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false)
  const [reminderForm, setReminderForm] = useState<ReminderFormValues>(
    getInitialReminderForm()
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const featuredRef = useRef<HTMLElement>(null)

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
          "Could not load follow-ups."
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
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
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

  const activeItems = useMemo(
    () =>
      recoveryItems
        .filter((item) => item.stage !== "resolved")
        .sort((a, b) => b.daysOverdue - a.daysOverdue),
    [recoveryItems]
  )

  const featuredItem = useMemo(
    () =>
      (selectedItemId
        ? activeItems.find((i) => i.id === selectedItemId)
        : undefined) ?? activeItems[0],
    [activeItems, selectedItemId]
  )

  const queueItems = useMemo(
    () => activeItems.filter((i) => i.id !== featuredItem?.id),
    [activeItems, featuredItem]
  )

  const statusCounts = useMemo(() => {
    const needsApproval = activeItems.filter((i) =>
      (
        ["newly_overdue", "final_notice", "escalated"] as RecoveryStage[]
      ).includes(i.stage)
    ).length

    const waitingOnCustomer = activeItems.filter((i) =>
      (
        ["first_follow_up", "second_follow_up"] as RecoveryStage[]
      ).includes(i.stage)
    ).length

    const now = new Date()
    const recoveredAmount = recoveryItems
      .filter((i) => {
        if (i.stage !== "resolved" || !i.invoice.paid_at) return false
        const paidDate = new Date(i.invoice.paid_at)
        return (
          paidDate.getMonth() === now.getMonth() &&
          paidDate.getFullYear() === now.getFullYear()
        )
      })
      .reduce((sum, i) => sum + i.amount, 0)

    return { needsApproval, waitingOnCustomer, recoveredAmount }
  }, [activeItems, recoveryItems])

  const totals = useMemo(
    () => ({
      activeCount: activeItems.length,
      activeAmount: activeItems.reduce((sum, item) => sum + item.amount, 0),
    }),
    [activeItems]
  )

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
    if (!open) setReminderForm(getInitialReminderForm())
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
      reminder_type: reminderForm.reminderType.trim() || "Payment follow-up",
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
      setErrorMessage("You must be logged in to save follow-up actions.")
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
      await updateInvoice(item.invoice.id, { status, paid_at: null })
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
      notes: "Marked paid from the recovery queue.",
    })

    if (action) {
      await updateInvoice(item.invoice.id, {
        status: "Paid",
        paid_at: new Date().toISOString(),
      })
    }

    setIsSaving(false)
  }

  // Available for programmatic stage advancement
  void moveToNextStage

  const hasActiveItems = activeItems.length > 0

  return (
    <>
      <PageHeader
        title="Money to Recover"
        description="Review missed invoices, old estimates, and quiet customers before a follow-up goes out."
      >
        <Button
          type="button"
          variant="outline"
          disabled={invoices.length === 0 || isSaving}
          onClick={() => openAddReminder()}
        >
          <Bell className="size-4" />
          Set reminder
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
        description="Add a reminder connected to an invoice."
        form={reminderForm}
        onFormChange={updateReminderForm}
        onSubmit={createReminder}
        invoiceOptions={invoiceOptions}
        isSaving={isSaving}
      />

      <div className="grid gap-6 p-4 sm:p-6 lg:p-8">
        {errorMessage ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5">
            <div className="font-medium text-destructive">
              Couldn&rsquo;t load your recovery queue
            </div>
            <p className="mt-1 text-sm leading-6 text-destructive/80">
              Refresh the page or try again in a moment. Your data is safe.
            </p>
          </div>
        ) : null}

        <ContentReveal isLoading={isLoading} skeleton={<RecoveryQueuePageSkeleton />}>
          <div className="grid gap-6">
          {!hasActiveItems ? (
          <Card>
            <CardContent className="p-10 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-xl bg-green-50 text-green-700">
                <ClipboardCheck className="size-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">
                No follow-ups waiting
              </h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                You&rsquo;re caught up. New overdue invoices, stale estimates,
                and quiet customers will appear here automatically.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
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
          <>
            {/* Hero summary card */}
            <Card
              className="animate-[fade-slide-up_0.45s_ease_both] border-2 border-green-100 bg-gradient-to-br from-white to-green-50/40 motion-reduce:animate-none"
              style={{ animationDelay: "0ms" }}
            >
              <CardContent className="p-5 sm:p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-4">
                    {/* Context chips */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-green-700">
                        Waiting to recover
                      </span>
                      <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-800">
                        Overdue invoice
                      </span>
                      <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-800">
                        Draft ready
                      </span>
                      <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-800">
                        Approval required
                      </span>
                    </div>

                    {/* Amount */}
                    <div>
                      <div className="text-4xl font-bold tabular-nums text-foreground sm:text-5xl">
                        {moneyFormatter.format(totals.activeAmount)}
                      </div>
                      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                        {totals.activeCount === 1
                          ? "1 unpaid invoice needs your approval before we follow up."
                          : `${totals.activeCount} unpaid invoices need your approval before we follow up.`}
                      </p>
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end sm:pt-1">
                    <Button
                      size="lg"
                      className="gap-2 bg-green-700 text-white hover:bg-green-800"
                      onClick={() =>
                        featuredRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        })
                      }
                    >
                      Review message
                      <ArrowRight className="size-4" />
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Nothing is sent without your approval.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Status summary mini-cards */}
            <div
              className="animate-[fade-slide-up_0.45s_ease_both] grid grid-cols-3 gap-3 motion-reduce:animate-none"
              style={{ animationDelay: "80ms" }}
            >
              <Card className="transition-shadow hover:shadow-sm">
                <CardContent className="p-4">
                  <p className="truncate text-xs text-muted-foreground">
                    Needs approval
                  </p>
                  <p className="mt-1 text-2xl font-bold text-sky-700">
                    {statusCounts.needsApproval}
                  </p>
                </CardContent>
              </Card>
              <Card className="transition-shadow hover:shadow-sm">
                <CardContent className="p-4">
                  <p className="truncate text-xs text-muted-foreground">
                    Waiting on customer
                  </p>
                  <p className="mt-1 text-2xl font-bold text-amber-700">
                    {statusCounts.waitingOnCustomer}
                  </p>
                </CardContent>
              </Card>
              <Card className="transition-shadow hover:shadow-sm">
                <CardContent className="p-4">
                  <p className="truncate text-xs text-muted-foreground">
                    Recovered this month
                  </p>
                  <p className="mt-1 text-2xl font-bold text-green-700">
                    {moneyFormatter.format(statusCounts.recoveredAmount)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Main featured follow-up */}
            {featuredItem && (
              <section
                ref={featuredRef}
                className="animate-[fade-slide-up_0.45s_ease_both] scroll-mt-4 motion-reduce:animate-none"
                style={{ animationDelay: "160ms" }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-foreground">
                    Next message to approve
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Start with the oldest unpaid invoice.
                  </p>
                </div>
                <FeaturedCard
                  key={featuredItem.id}
                  item={featuredItem}
                  isSaving={isSaving}
                  onAddReminder={openAddReminder}
                  onFollowUpSent={(item) => void markFollowUpSent(item)}
                  onResolved={(item) => void markResolved(item)}
                />
              </section>
            )}

            {/* Queue list */}
            {queueItems.length > 0 ? (
              <section
                className="animate-[fade-slide-up_0.45s_ease_both] motion-reduce:animate-none"
                style={{ animationDelay: "240ms" }}
              >
                <h2 className="mb-3 text-base font-semibold">
                  Other follow-ups
                </h2>
                <div className="space-y-3">
                  {queueItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 transition-shadow hover:shadow-sm sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {item.clientName}
                        </div>
                        <div className="mt-0.5 text-sm text-muted-foreground">
                          {item.invoiceNumber}
                          {item.daysOverdue > 0 &&
                            ` · ${item.daysOverdue} days overdue`}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-4 sm:contents">
                        <div className="shrink-0 sm:text-right">
                          <div className="font-semibold">
                            {moneyFormatter.format(item.amount)}
                          </div>
                          <Badge
                            variant="outline"
                            className={cn("mt-1", stageStyle[item.stage])}
                          >
                            {getReadableStatus(item.stage)}
                          </Badge>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={() => {
                            setSelectedItemId(item.id)
                            setTimeout(() => {
                              featuredRef.current?.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              })
                            }, 50)
                          }}
                        >
                          Review
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <div
                className="animate-[fade-slide-up_0.45s_ease_both] rounded-xl border border-dashed border-green-200 bg-green-50/50 p-6 text-center motion-reduce:animate-none"
                style={{ animationDelay: "240ms" }}
              >
                <p className="text-sm font-semibold text-green-800">
                  Handle this follow-up and you&rsquo;re caught up.
                </p>
                <p className="mt-1.5 text-xs leading-5 text-green-700">
                  New overdue invoices, stale estimates, and quiet customers
                  will appear here automatically.
                </p>
              </div>
            )}
          </>
        )}
          </div>
        </ContentReveal>
      </div>
    </>
  )
}
