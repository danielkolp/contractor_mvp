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
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  HelpCircle,
  Mail,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react"
import { toast } from "sonner"

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  generateFollowUpMessage,
  getFollowUpActionText,
  getFollowUpSubtext,
  getNextReminderDate,
  getOverdueDays,
  getOverdueStage,
  getRecoveryRecommendation,
  overdueStageToRecoveryStage,
  type RecoveryRecommendation,
} from "@/lib/recovery-engine"
import {
  buildFollowUpQueue,
  buildRecoveryQueue,
  type EstimateFollowUpQueueItem,
  type RecoveryQueueItem,
} from "@/lib/recovery-queue"
import { mockSendEmail, mockSendSms } from "@/lib/mock-sender"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { cn } from "@/lib/utils"

type ClientRow = Database["public"]["Tables"]["clients"]["Row"]
type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"]
type EstimateUpdate = Database["public"]["Tables"]["estimates"]["Update"]
type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"]
type InvoiceUpdate = Database["public"]["Tables"]["invoices"]["Update"]
type RecoveryActionRow =
  Database["public"]["Tables"]["recovery_actions"]["Row"]
type RecoveryActionInsert =
  Database["public"]["Tables"]["recovery_actions"]["Insert"]
type RecoveryDraftRow =
  Database["public"]["Tables"]["recovery_drafts"]["Row"]
type RecoveryDraftUpdate =
  Database["public"]["Tables"]["recovery_drafts"]["Update"]
type ReminderInsert = Database["public"]["Tables"]["reminders"]["Insert"]
type EstimateStatus = Database["public"]["Enums"]["estimate_status"]
type InvoiceStatus = Database["public"]["Enums"]["invoice_status"]
type RecoveryStage = Database["public"]["Enums"]["recovery_stage"]
type ContactMethod = Database["public"]["Enums"]["contact_method"]

type RecoveryItem = {
  id: string
  draft: RecoveryDraftRow
  invoice: InvoiceRow
  client: ClientRow | null
  clientName: string
  invoiceNumber: string
  amount: number
  recommendation: RecoveryRecommendation
  recommendedAction: string
  daysOverdue: number
  canApprove: boolean
  waitingOnCustomer: boolean
  draftBody: string
  history: RecoveryActionRow[]
}

const approvalStatuses = ["needs_approval", "draft", "approved"]
const waitingStatuses = ["sent", "waiting_on_customer"]
const finalStatuses = ["resolved", "cancelled"]

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

function normalizeStatus(status: string) {
  return status.trim().toLowerCase()
}

function isApprovalStatus(status: string) {
  return approvalStatuses.includes(normalizeStatus(status))
}

function isWaitingStatus(status: string) {
  return waitingStatuses.includes(normalizeStatus(status))
}

function isFinalStatus(status: string) {
  return finalStatuses.includes(normalizeStatus(status))
}

function getDraftPriority(status: string) {
  const normalized = normalizeStatus(status)
  if (normalized === "needs_approval") return 0
  if (normalized === "draft") return 1
  if (normalized === "approved") return 2
  if (normalized === "sent" || normalized === "waiting_on_customer") return 3
  return 4
}

function formatTimestamp(value: string | null) {
  if (!value) return "No date"
  return dateTimeFormatter.format(new Date(value))
}

function formatInputDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function getTomorrowInputDate() {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return formatInputDate(tomorrow)
}

function getFutureInputDate(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return formatInputDate(date)
}

function toReminderTimestamp(date: string) {
  return new Date(`${date}T09:00:00`).toISOString()
}

function getClientName(invoice: InvoiceRow, client: ClientRow | null) {
  return client?.company || client?.name || invoice.client_name || "No client"
}

function getFallbackMessage(item: Pick<RecoveryItem, "clientName" | "invoiceNumber" | "amount" | "daysOverdue">) {
  const amount = moneyFormatter.format(item.amount)

  if (item.daysOverdue <= 0) {
    return `Hi ${item.clientName}, just following up on invoice ${item.invoiceNumber} for ${amount}. Could you let me know when payment will be sent? Thanks.`
  }

  if (item.daysOverdue < 7) {
    return `Hi ${item.clientName}, following up on invoice ${item.invoiceNumber} for ${amount}. It looks like this invoice is now overdue. Could you let me know when payment will be sent? Thanks.`
  }

  return `Hi ${item.clientName}, following up again on invoice ${item.invoiceNumber} for ${amount}. This still appears unpaid on our end. Please let me know when we can expect payment or if there's anything holding this up.`
}

function getStageStyle(item: RecoveryItem): string {
  if (item.waitingOnCustomer) {
    return "border-amber-200 bg-amber-50 text-amber-800"
  }

  const { overdueStage } = item.recommendation
  if (overdueStage === "final_notice") {
    return "border-red-200 bg-red-50 text-red-700"
  }
  if (overdueStage === "second_reminder") {
    return "border-orange-200 bg-orange-50 text-orange-700"
  }
  if (overdueStage === "first_reminder") {
    return "border-amber-200 bg-amber-50 text-amber-800"
  }

  return "border-sky-200 bg-sky-50 text-sky-800"
}

function getStatusLabel(item: RecoveryItem): string {
  const status = normalizeStatus(item.draft.status)

  if (status === "sent" || status === "waiting_on_customer") {
    return "Waiting on customer"
  }
  if (status === "approved") {
    return "Approved"
  }
  if (item.invoice.status === "Escalated") {
    return "Needs approval"
  }

  return "Needs approval"
}

function uniqueInvoiceCount(items: RecoveryItem[]) {
  return new Set(items.map((item) => item.invoice.id)).size
}

function getRecoveryStage(item: RecoveryItem): RecoveryStage {
  if (item.invoice.status === "Escalated") {
    return "escalated"
  }

  return overdueStageToRecoveryStage(item.recommendation.overdueStage)
}

function FeaturedCard({
  item,
  isSaving,
  onSaveMessage,
  onApproveAndSend,
  onRemindLater,
  onAlreadyFollowedUp,
  onHasPaid,
}: {
  item: RecoveryItem
  isSaving: boolean
  onSaveMessage: (item: RecoveryItem, body: string) => Promise<boolean>
  onApproveAndSend: (item: RecoveryItem, body: string) => Promise<void>
  onRemindLater: (item: RecoveryItem) => Promise<void>
  onAlreadyFollowedUp: (item: RecoveryItem) => void
  onHasPaid: (item: RecoveryItem) => void
}) {
  const [isEditingMessage, setIsEditingMessage] = useState(false)
  const [editBody, setEditBody] = useState(item.draftBody)
  const [isSavingMessage, setIsSavingMessage] = useState(false)

  const amount = moneyFormatter.format(item.amount)
  const currentBody = isEditingMessage ? editBody : item.draftBody

  async function handleSaveEdit() {
    const nextBody = editBody.trim()

    if (nextBody.length === 0) {
      toast.error("Message cannot be empty")
      return
    }

    if (nextBody === item.draftBody.trim()) {
      setIsEditingMessage(false)
      return
    }

    setIsSavingMessage(true)
    const saved = await onSaveMessage(item, nextBody)
    setIsSavingMessage(false)

    if (saved) {
      setIsEditingMessage(false)
    }
  }

  function handleCancelEdit() {
    setEditBody(item.draftBody)
    setIsEditingMessage(false)
  }

  return (
    <Card className="border-2 border-green-100 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Badge
              variant="outline"
              className={cn("mb-3", getStageStyle(item))}
            >
              {getStatusLabel(item)}
            </Badge>
            <CardTitle className="text-xl leading-tight">
              {item.clientName}
            </CardTitle>
            <CardDescription className="mt-1">
              Invoice {item.invoiceNumber}
              {item.invoice.due_date
                ? ` - Due ${new Date(
                    item.invoice.due_date + "T00:00:00"
                  ).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}`
                : null}
            </CardDescription>
          </div>
          <div className="shrink-0 sm:text-right">
            <div className="text-3xl font-bold tabular-nums">{amount}</div>
            {item.daysOverdue > 0 ? (
              <Badge
                variant="outline"
                className={cn(
                  "mt-1.5",
                  item.daysOverdue > 60
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-orange-200 bg-orange-50 text-orange-700"
                )}
              >
                {item.daysOverdue} day{item.daysOverdue === 1 ? "" : "s"} overdue
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="rounded-xl border border-green-100 bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-800">
            {item.recommendedAction}
          </p>
          <p className="mt-1 text-xs leading-5 text-green-700">
            {item.waitingOnCustomer
              ? "A follow-up was sent. The invoice is waiting on a customer response."
              : getFollowUpSubtext(item.recommendation.overdueStage)}
          </p>
        </div>

        <div>
          <div className="mb-2.5 flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {item.waitingOnCustomer ? "Last message sent" : "Message draft"}
            </span>
            <span className="inline-flex items-center rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground">
              {item.waitingOnCustomer ? "Sent" : "Saved"}
            </span>
          </div>

          {isEditingMessage ? (
            <div className="space-y-2">
              <Textarea
                value={editBody}
                onChange={(event) => setEditBody(event.target.value)}
                className="min-h-28 text-sm leading-6"
                disabled={isSavingMessage}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  disabled={isSavingMessage}
                  onClick={() => void handleSaveEdit()}
                >
                  {isSavingMessage ? "Saving..." : "Save changes"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-muted-foreground"
                  disabled={isSavingMessage}
                  onClick={handleCancelEdit}
                >
                  <X className="size-3" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3.5 text-sm leading-6 text-foreground">
              <span className="select-none text-muted-foreground">
                &ldquo;
              </span>
              {currentBody}
              <span className="select-none text-muted-foreground">
                &rdquo;
              </span>
            </div>
          )}

          {item.draft.sent_at ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Sent {formatTimestamp(item.draft.sent_at)}
            </p>
          ) : null}
        </div>

        {item.history.length > 0 ? (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Clock3 className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Last: {item.history[0].action_type} -{" "}
              {formatTimestamp(item.history[0].created_at)}
            </span>
          </div>
        ) : null}

        <div className="space-y-4 border-t border-border pt-5">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0 text-green-600" />
            Nothing sends automatically. You approve every message first.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {item.canApprove ? (
              <>
                <Button
                  className="gap-2 bg-green-700 text-white hover:bg-green-800"
                  disabled={isSaving}
                  onClick={() => void onApproveAndSend(item, currentBody)}
                >
                  <Mail className="size-4" />
                  Approve &amp; send
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={isSaving}
                  onClick={() => {
                    if (isEditingMessage) {
                      handleCancelEdit()
                    } else {
                      setEditBody(item.draftBody)
                      setIsEditingMessage(true)
                    }
                  }}
                >
                  <Pencil className="size-4" />
                  {isEditingMessage ? "Cancel edit" : "Edit message"}
                </Button>
              </>
            ) : null}
            <Button
              variant="outline"
              className="gap-2"
              disabled={isSaving}
              onClick={() => void onRemindLater(item)}
            >
              <Bell className="size-4" />
              Remind me later
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="gap-2 text-muted-foreground hover:text-foreground"
              disabled={isSaving}
              onClick={() => onAlreadyFollowedUp(item)}
            >
              <HelpCircle className="size-4" />
              Already followed up
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="gap-2 text-muted-foreground hover:text-foreground"
              disabled={isSaving}
              onClick={() => onHasPaid(item)}
            >
              <CheckCircle2 className="size-4" />
              Has {item.clientName} paid?
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function RecoveryPage() {
  const supabase = useMemo(() => createClient(), [])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [estimates, setEstimates] = useState<EstimateRow[]>([])
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [actions, setActions] = useState<RecoveryActionRow[]>([])
  const [drafts, setDrafts] = useState<RecoveryDraftRow[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false)
  const [reminderForm, setReminderForm] = useState<ReminderFormValues>(
    getInitialReminderForm()
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [generatingFor, setGeneratingFor] = useState<string | null>(null)
  const [followedUpDialog, setFollowedUpDialog] = useState<RecoveryItem | null>(null)
  const [hasPaidDialog, setHasPaidDialog] = useState<RecoveryItem | null>(null)
  const [estimateDialog, setEstimateDialog] =
    useState<EstimateFollowUpQueueItem | null>(null)
  const [estimateDrafts, setEstimateDrafts] = useState<Record<string, string>>({})
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
      setClients([])
      setEstimates([])
      setInvoices([])
      setActions([])
      setDrafts([])
      setUserId(null)
      setIsLoading(false)
      return
    }

    setUserId(user.id)

    const [clientResult, estimateResult, invoiceResult, actionResult, draftResult] =
      await Promise.all([
        supabase
          .from("clients")
          .select("*")
          .eq("user_id", user.id)
          .order("company", { ascending: true }),
        supabase
          .from("estimates")
          .select("*")
          .eq("user_id", user.id)
          .order("follow_up_date", { ascending: true, nullsFirst: false }),
        supabase
          .from("invoices")
          .select("*")
          .eq("user_id", user.id)
          .order("due_date", { ascending: true, nullsFirst: false }),
        supabase
          .from("recovery_actions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("recovery_drafts")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ])

    const firstError =
      clientResult.error ||
      estimateResult.error ||
      invoiceResult.error ||
      actionResult.error ||
      draftResult.error

    if (firstError) {
      setErrorMessage(
        firstError.message.includes("estimates")
          ? "The estimates table is not available yet. Apply supabase/apply_estimates.sql in Supabase, then refresh."
          : firstError.message
      )
      setClients([])
      setEstimates([])
      setInvoices([])
      setActions([])
      setDrafts([])
    } else {
      setClients(clientResult.data ?? [])
      setEstimates(estimateResult.data ?? [])
      setInvoices(invoiceResult.data ?? [])
      setActions(actionResult.data ?? [])
      setDrafts(draftResult.data ?? [])
    }

    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadRecovery()
    }, 0)

    return () => window.clearTimeout(id)
  }, [loadRecovery])

  const invoiceById = useMemo(
    () => new Map(invoices.map((invoice) => [invoice.id, invoice])),
    [invoices]
  )

  const clientById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients]
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

  const actionsByInvoice = useMemo(() => {
    const grouped = new Map<string, RecoveryActionRow[]>()

    for (const action of actions) {
      if (!action.invoice_id) continue
      const list = grouped.get(action.invoice_id) ?? []
      list.push(action)
      grouped.set(action.invoice_id, list)
    }

    return grouped
  }, [actions])

  const recoveryItems = useMemo<RecoveryItem[]>(() => {
    const items: RecoveryItem[] = []

    for (const draft of drafts) {
      if (isFinalStatus(draft.status)) continue

      const invoice = invoiceById.get(draft.invoice_id)
      if (!invoice || invoice.status === "Paid") continue

      const client =
        (draft.client_id ? clientById.get(draft.client_id) : undefined) ??
        (invoice.client_id ? clientById.get(invoice.client_id) : undefined) ??
        null
      const clientName = getClientName(invoice, client)
      const waitingOnCustomer =
        isWaitingStatus(draft.status) || invoice.status === "Follow-up Sent"
      const recommendation = getRecoveryRecommendation(
        invoice,
        waitingOnCustomer
      )
      const calculatedDaysOverdue = getOverdueDays(
        invoice.due_date,
        false
      )
      const daysOverdue = Math.max(draft.days_overdue, calculatedDaysOverdue)
      const draftBody =
        draft.message_body.trim() ||
        recommendation.recommendedMessage ||
        getFallbackMessage({
          clientName,
          invoiceNumber: invoice.invoice_number,
          amount: invoice.amount,
          daysOverdue,
        })
      const history = (actionsByInvoice.get(invoice.id) ?? []).slice().sort(
        (first, second) =>
          new Date(second.created_at).getTime() -
          new Date(first.created_at).getTime()
      )

      items.push({
        id: draft.id,
        draft,
        invoice,
        client,
        clientName,
        invoiceNumber: invoice.invoice_number,
        amount: invoice.amount,
        recommendation,
        recommendedAction:
          draft.recommended_action || recommendation.recommendedAction,
        daysOverdue,
        canApprove: isApprovalStatus(draft.status),
        waitingOnCustomer,
        draftBody,
        history,
      })
    }

    return items.sort((first, second) => {
      const priority =
        getDraftPriority(first.draft.status) -
        getDraftPriority(second.draft.status)

      if (priority !== 0) return priority
      return second.daysOverdue - first.daysOverdue
    })
  }, [actionsByInvoice, clientById, drafts, invoiceById])

  const approvalItems = useMemo(
    () => recoveryItems.filter((item) => item.canApprove),
    [recoveryItems]
  )

  const waitingItems = useMemo(
    () => recoveryItems.filter((item) => item.waitingOnCustomer),
    [recoveryItems]
  )

  const featuredItem = useMemo(
    () =>
      (selectedItemId
        ? approvalItems.find((item) => item.id === selectedItemId)
        : undefined) ?? approvalItems[0],
    [approvalItems, selectedItemId]
  )

  const queueNeedsApproval = useMemo(
    () => approvalItems.filter((item) => item.id !== featuredItem?.id),
    [approvalItems, featuredItem]
  )

  const statusCounts = useMemo(() => {
    const now = new Date()
    const resolvedInvoiceIds = new Set<string>()

    for (const draft of drafts) {
      if (normalizeStatus(draft.status) !== "resolved") continue
      const invoice = invoiceById.get(draft.invoice_id)
      if (!invoice) continue

      const resolvedAt = draft.resolved_at || invoice.paid_at
      if (!resolvedAt) continue

      const resolvedDate = new Date(resolvedAt)
      if (
        resolvedDate.getMonth() === now.getMonth() &&
        resolvedDate.getFullYear() === now.getFullYear()
      ) {
        resolvedInvoiceIds.add(invoice.id)
      }
    }

    let recoveredAmount = 0
    for (const invoiceId of resolvedInvoiceIds) {
      recoveredAmount += invoiceById.get(invoiceId)?.amount ?? 0
    }

    return {
      needsApproval: approvalItems.length,
      waitingOnCustomer: waitingItems.length,
      recoveredAmount,
    }
  }, [approvalItems.length, drafts, invoiceById, waitingItems.length])

  // Overdue invoices with no active draft — need a follow-up generated
  const overdueNoDraftItems = useMemo<RecoveryQueueItem[]>(() => {
    const queue = buildRecoveryQueue({
      invoices,
      clients,
      recoveryDrafts: drafts,
    })
    return queue.filter(
      (item) => item.state === "needs_followup" && item.draft === null
    )
  }, [invoices, clients, drafts])

  const followUpQueue = useMemo(
    () =>
      buildFollowUpQueue({
        estimates,
        invoices,
        clients,
        recoveryDrafts: drafts,
        reminders: [],
      }),
    [clients, drafts, estimates, invoices]
  )

  const estimateFollowUpItems = useMemo(
    () =>
      followUpQueue.filter(
        (item): item is EstimateFollowUpQueueItem =>
          item.kind === "estimate"
      ),
    [followUpQueue]
  )

  function updateReminderForm<Field extends keyof ReminderFormValues>(
    field: Field,
    value: ReminderFormValues[Field]
  ) {
    setReminderForm((current) => ({ ...current, [field]: value }))
  }

  function openReminderDialog(invoiceId = invoices[0]?.id ?? "") {
    setReminderForm(getInitialReminderForm(invoiceId))
    setReminderDialogOpen(true)
  }

  function closeReminderDialog(open: boolean) {
    setReminderDialogOpen(open)
    if (!open) setReminderForm(getInitialReminderForm())
  }

  async function submitReminderDialog(event: FormEvent<HTMLFormElement>) {
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
      notes: reminderForm.notes.trim() || null,
    }

    const { error } = await supabase.from("reminders").insert(payload)
    if (error) {
      setErrorMessage(error.message)
      toast.error("Failed to create reminder")
    } else {
      closeReminderDialog(false)
      toast.success("Reminder created")
    }

    setIsSaving(false)
  }

  async function createReminderForItem(item: RecoveryItem, reminderDate: string) {
    if (!userId) return false

    const payload: ReminderInsert = {
      user_id: userId,
      invoice_id: item.invoice.id,
      reminder_date: reminderDate,
      scheduled_for: toReminderTimestamp(reminderDate),
      reminder_type: "Payment follow-up",
      contact_method: item.draft.channel === "email" ? "Email" : "Text",
      status: "Scheduled",
      completed: false,
      notes: `Follow up on ${item.invoiceNumber} for ${item.clientName}.`,
    }

    const { error } = await supabase.from("reminders").insert(payload)
    if (error) {
      setErrorMessage(error.message)
      toast.error("Failed to create reminder")
      return false
    }

    return true
  }

  async function saveDraftMessage(item: RecoveryItem, body: string) {
    if (!userId) {
      setErrorMessage("You must be logged in.")
      toast.error("You must be logged in")
      return false
    }

    const trimmed = body.trim()
    if (!trimmed) {
      toast.error("Message cannot be empty")
      return false
    }

    const { data, error } = await supabase
      .from("recovery_drafts")
      .update({ message_body: trimmed } satisfies RecoveryDraftUpdate)
      .eq("id", item.draft.id)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) {
      setErrorMessage(error.message)
      toast.error("Failed to save message")
      return false
    }

    setDrafts((current) =>
      current.map((draft) => (draft.id === data.id ? data : draft))
    )
    toast.success("Message saved")
    return true
  }

  async function approveAndSend(item: RecoveryItem, body: string) {
    if (!userId) {
      setErrorMessage("You must be logged in.")
      toast.error("You must be logged in")
      return
    }

    const trimmed = body.trim()
    if (!trimmed) {
      toast.error("Message cannot be empty")
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    try {
      const now = new Date().toISOString()
      const approvedUpdate: RecoveryDraftUpdate = {
        message_body: trimmed,
        status: "approved",
        approved_at: now,
      }

      const { error: approvalError } = await supabase
        .from("recovery_drafts")
        .update(approvedUpdate)
        .eq("id", item.draft.id)
        .eq("user_id", userId)

      if (approvalError) throw approvalError

      const channel = item.draft.channel.toLowerCase()
      const sendResult =
        channel === "email"
          ? mockSendEmail(item.client?.email ?? null, trimmed)
          : mockSendSms(item.client?.phone ?? null, trimmed)

      const sentUpdate: RecoveryDraftUpdate = {
        message_body: trimmed,
        status: "sent",
        approved_at: now,
        sent_at: sendResult.timestamp,
        provider_message_id: sendResult.providerId,
      }
      const { error: sentError } = await supabase
        .from("recovery_drafts")
        .update(sentUpdate)
        .eq("id", item.draft.id)
        .eq("user_id", userId)

      if (sentError) throw sentError

      const recoveryStage = getRecoveryStage(item)
      const contactMethod: ContactMethod =
        sendResult.channel === "email" ? "Email" : "Text"
      const actionPayload: RecoveryActionInsert = {
        user_id: userId,
        invoice_id: item.invoice.id,
        stage: recoveryStage,
        action_type: "Follow-up sent",
        status: "Completed",
        contact_method: contactMethod,
        recommended_next_action: getFollowUpActionText(recoveryStage),
        completed_at: sendResult.timestamp,
        notes: `Sent via mock ${sendResult.channel}. Provider ID: ${sendResult.providerId}.`,
      }
      const { error: actionError } = await supabase
        .from("recovery_actions")
        .insert(actionPayload)

      if (actionError) throw actionError

      const invoiceUpdate: InvoiceUpdate = {
        status:
          item.invoice.status === "Escalated"
            ? ("Escalated" as InvoiceStatus)
            : ("Follow-up Sent" as InvoiceStatus),
        paid_at: null,
      }
      const { error: invoiceError } = await supabase
        .from("invoices")
        .update(invoiceUpdate)
        .eq("id", item.invoice.id)
        .eq("user_id", userId)

      if (invoiceError) throw invoiceError

      await createReminderForItem(item, getNextReminderDate(item.daysOverdue))
      await loadRecovery()
      toast.success("Message sent")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not send message"
      setErrorMessage(message)
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  async function remindLater(item: RecoveryItem) {
    if (!userId) {
      setErrorMessage("You must be logged in.")
      toast.error("You must be logged in")
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    const reminderDate = getTomorrowInputDate()
    const saved = await createReminderForItem(item, reminderDate)

    if (saved) {
      setFollowedUpDialog(null)
      toast.success("Reminder scheduled for tomorrow")
    }

    setIsSaving(false)
  }

  async function markResolved(item: RecoveryItem) {
    if (!userId) {
      setErrorMessage("You must be logged in.")
      toast.error("You must be logged in")
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    try {
      const now = new Date().toISOString()
      const draftUpdate: RecoveryDraftUpdate = {
        status: "resolved",
        resolved_at: now,
      }
      const { error: draftError } = await supabase
        .from("recovery_drafts")
        .update(draftUpdate)
        .eq("id", item.draft.id)
        .eq("user_id", userId)

      if (draftError) throw draftError

      const invoiceUpdate: InvoiceUpdate = {
        status: "Paid",
        paid_at: now,
      }
      const { error: invoiceError } = await supabase
        .from("invoices")
        .update(invoiceUpdate)
        .eq("id", item.invoice.id)
        .eq("user_id", userId)

      if (invoiceError) throw invoiceError

      const actionPayload: RecoveryActionInsert = {
        user_id: userId,
        invoice_id: item.invoice.id,
        stage: "resolved" as RecoveryStage,
        action_type: "Resolved",
        status: "Completed",
        contact_method: "Email" as ContactMethod,
        recommended_next_action: "Invoice is paid. No further action needed.",
        completed_at: now,
        notes: "Marked paid from the follow-up queue.",
      }
      const { error: actionError } = await supabase
        .from("recovery_actions")
        .insert(actionPayload)

      if (actionError) throw actionError

      await loadRecovery()
      setHasPaidDialog(null)
      toast.success("Invoice marked resolved")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not resolve invoice"
      setErrorMessage(message)
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  async function generateDraftForInvoice(queueItem: RecoveryQueueItem) {
    if (!userId) {
      toast.error("You must be logged in")
      return
    }

    setGeneratingFor(queueItem.invoiceId)

    try {
      const daysOverdue = queueItem.daysOverdue
      const overdueStage = getOverdueStage(daysOverdue)
      const messageBody = generateFollowUpMessage({
        clientName: queueItem.clientName,
        invoiceNumber: queueItem.invoiceNumber,
        amount: queueItem.amount,
        daysOverdue,
        overdueStage,
      })

      const { error } = await supabase.from("recovery_drafts").insert({
        user_id: userId,
        client_id: queueItem.clientId,
        invoice_id: queueItem.invoiceId,
        channel: "email",
        message_body: messageBody,
        status: "needs_approval",
        recommended_action: `${overdueStage === "final_notice" ? "Send final notice." : "Send a payment reminder."}`,
        days_overdue: daysOverdue,
      })

      if (error) throw error

      await loadRecovery()
      toast.success("Follow-up draft created — ready to review")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not create draft"
      toast.error(msg)
    } finally {
      setGeneratingFor(null)
    }
  }

  async function markInvoiceStatus(
    item: RecoveryItem,
    status: InvoiceStatus,
    resolveDraft = false
  ) {
    if (!userId) return

    setIsSaving(true)
    try {
      const now = new Date().toISOString()

      if (resolveDraft) {
        await supabase
          .from("recovery_drafts")
          .update({ status: "resolved", resolved_at: now } satisfies RecoveryDraftUpdate)
          .eq("id", item.draft.id)
          .eq("user_id", userId)
      }

      const invoiceUpdate: InvoiceUpdate = {
        status,
        paid_at: status === "Paid" ? now : null,
      }
      const { error } = await supabase
        .from("invoices")
        .update(invoiceUpdate)
        .eq("id", item.invoice.id)
        .eq("user_id", userId)

      if (error) throw error

      await loadRecovery()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not update invoice"
      toast.error(msg)
    } finally {
      setIsSaving(false)
    }
  }

  async function markDraftWaiting(item: RecoveryItem) {
    if (!userId) return

    setIsSaving(true)
    try {
      await supabase
        .from("recovery_drafts")
        .update({ status: "waiting_on_customer" } satisfies RecoveryDraftUpdate)
        .eq("id", item.draft.id)
        .eq("user_id", userId)

      await supabase
        .from("invoices")
        .update({ status: "Payment Plan" } satisfies InvoiceUpdate)
        .eq("id", item.invoice.id)
        .eq("user_id", userId)

      await loadRecovery()
      setFollowedUpDialog(null)
      setHasPaidDialog(null)
      toast.success("Marked as payment promised")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not update"
      toast.error(msg)
    } finally {
      setIsSaving(false)
    }
  }

  async function markDisputed(item: RecoveryItem) {
    if (!userId) return

    setIsSaving(true)
    try {
      await supabase
        .from("invoices")
        .update({ status: "Escalated" } satisfies InvoiceUpdate)
        .eq("id", item.invoice.id)
        .eq("user_id", userId)

      await loadRecovery()
      setHasPaidDialog(null)
      toast.success("Invoice marked as disputed")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not update"
      toast.error(msg)
    } finally {
      setIsSaving(false)
    }
  }

  async function updateEstimateOutcome(
    item: EstimateFollowUpQueueItem,
    status: EstimateStatus,
    followUpDate: string | null,
    successMessage: string
  ) {
    if (!userId) {
      toast.error("You must be logged in")
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    try {
      const currentMessage = estimateDrafts[item.estimateId] ?? item.message
      const payload: EstimateUpdate = {
        status,
        follow_up_date: followUpDate,
        notes: [
          item.estimate.notes,
          `Follow-up note: ${currentMessage}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      }

      const { data, error } = await supabase
        .from("estimates")
        .update(payload)
        .eq("id", item.estimateId)
        .eq("user_id", userId)
        .select()
        .single()

      if (error) throw error

      setEstimates((current) =>
        current.map((estimate) =>
          estimate.id === data.id ? data : estimate
        )
      )
      setEstimateDialog(null)
      toast.success(successMessage)
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not update estimate"
      setErrorMessage(msg)
      toast.error(msg)
    } finally {
      setIsSaving(false)
    }
  }

  const hasActiveItems =
    estimateFollowUpItems.length > 0 ||
    recoveryItems.length > 0 ||
    overdueNoDraftItems.length > 0
  const activeFollowUpCount =
    estimateFollowUpItems.length +
    uniqueInvoiceCount(recoveryItems) +
    overdueNoDraftItems.length
  const invoiceFollowUpCount =
    uniqueInvoiceCount(recoveryItems) + overdueNoDraftItems.length

  return (
    <>
      <PageHeader
        title="Follow-ups"
        description="Review estimate follow-ups and invoice payment reminders in one worklist."
      >
        <Button
          type="button"
          variant="outline"
          disabled={invoices.length === 0 || isSaving}
          onClick={() => openReminderDialog()}
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
        description="Add a payment reminder connected to an invoice."
        form={reminderForm}
        onFormChange={updateReminderForm}
        onSubmit={submitReminderDialog}
        invoiceOptions={invoiceOptions}
        isSaving={isSaving}
      />

      <div className="grid gap-6 p-4 sm:p-6 lg:p-8">
        {errorMessage ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5">
            <div className="font-medium text-destructive">
              Couldn't load your follow-up queue
            </div>
            <p className="mt-1 text-sm leading-6 text-destructive/80">
              {errorMessage}
            </p>
          </div>
        ) : null}

        <ContentReveal
          isLoading={isLoading}
          skeleton={<RecoveryQueuePageSkeleton />}
        >
          <div className="grid gap-6">
            {!hasActiveItems ? (
              <Card>
                <CardContent className="p-10 text-center">
                  <div className="mx-auto grid size-14 place-items-center rounded-xl bg-green-50 text-green-700">
                    <ClipboardCheck className="size-6" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">
                    No messages to approve
                  </h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                    You&apos;re caught up. New overdue invoices, stale estimates,
                    and quiet customers will appear here automatically.
                  </p>
                  <div className="mt-6 flex justify-center">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button asChild>
                        <a href="/dashboard/estimates">Review estimates</a>
                      </Button>
                      <Button variant="outline" asChild>
                        <a href="/dashboard/invoices">Review invoices</a>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card
                  className="animate-[fade-slide-up_0.45s_ease_both] border-2 border-green-100 bg-gradient-to-br from-white to-green-50/40 motion-reduce:animate-none"
                  style={{ animationDelay: "0ms" }}
                >
                  <CardContent className="p-5 sm:p-6">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-green-700">
                          Follow-ups due
                        </p>
                        <div>
                          <div className="text-4xl font-bold tabular-nums sm:text-5xl">
                            {activeFollowUpCount}
                          </div>
                          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                            {estimateFollowUpItems.length} estimate follow-up
                            {estimateFollowUpItems.length === 1 ? "" : "s"} and{" "}
                            {invoiceFollowUpCount} invoice follow-up
                            {invoiceFollowUpCount === 1 ? "" : "s"} need
                            attention.
                          </p>
                        </div>
                      </div>
                      {featuredItem ? (
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
                      ) : null}
                    </div>
                  </CardContent>
                </Card>

                <div
                  className="animate-[fade-slide-up_0.45s_ease_both] grid grid-cols-3 gap-3 motion-reduce:animate-none"
                  style={{ animationDelay: "80ms" }}
                >
                  <Card>
                    <CardContent className="p-4">
                      <p className="truncate text-xs text-muted-foreground">
                        Needs approval
                      </p>
                      <p className="mt-1 text-2xl font-bold text-sky-700">
                        {statusCounts.needsApproval}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="truncate text-xs text-muted-foreground">
                        Waiting on customer
                      </p>
                      <p className="mt-1 text-2xl font-bold text-amber-700">
                        {statusCounts.waitingOnCustomer}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
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

                {estimateFollowUpItems.length > 0 ? (
                  <section
                    className="animate-[fade-slide-up_0.45s_ease_both] motion-reduce:animate-none"
                    style={{ animationDelay: "140ms" }}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-base font-semibold">
                        Estimate follow-ups
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Ask if they want to move forward.
                      </p>
                    </div>
                    <div className="grid gap-3">
                      {estimateFollowUpItems.map((item) => {
                        const currentMessage =
                          estimateDrafts[item.estimateId] ?? item.message

                        return (
                          <Card key={item.id}>
                            <CardContent className="grid gap-4 p-4">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <Badge
                                    variant="outline"
                                    className="mb-2 border-green-200 bg-green-50 text-green-800"
                                  >
                                    Estimate
                                  </Badge>
                                  <div className="text-base font-semibold">
                                    {item.clientName}
                                  </div>
                                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                    {item.explanation}
                                  </p>
                                </div>
                                <div className="shrink-0 sm:text-right">
                                  <div className="font-semibold">
                                    {moneyFormatter.format(item.amount)}
                                  </div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {item.followUpDate
                                      ? `Follow up ${new Date(
                                          item.followUpDate + "T00:00:00"
                                        ).toLocaleDateString("en-US", {
                                          month: "short",
                                          day: "numeric",
                                        })}`
                                      : `Sent ${item.daysSinceSent} day${
                                          item.daysSinceSent === 1 ? "" : "s"
                                        } ago`}
                                  </div>
                                </div>
                              </div>

                              <div className="grid gap-2">
                                <div className="text-sm font-medium">
                                  Message draft
                                </div>
                                <Textarea
                                  value={currentMessage}
                                  onChange={(event) =>
                                    setEstimateDrafts((current) => ({
                                      ...current,
                                      [item.estimateId]: event.target.value,
                                    }))
                                  }
                                  className="min-h-24 text-sm leading-6"
                                  disabled={isSaving}
                                />
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <Button
                                  className="gap-2 bg-green-700 text-white hover:bg-green-800"
                                  disabled={isSaving}
                                  onClick={() => setEstimateDialog(item)}
                                >
                                  <CheckCircle2 className="size-4" />
                                  Have you followed up?
                                </Button>
                                <Button
                                  variant="outline"
                                  disabled={isSaving}
                                  onClick={() =>
                                    void updateEstimateOutcome(
                                      item,
                                      "Won",
                                      null,
                                      "Estimate marked won"
                                    )
                                  }
                                >
                                  Mark won
                                </Button>
                                <Button
                                  variant="ghost"
                                  className="text-muted-foreground"
                                  disabled={isSaving}
                                  onClick={() =>
                                    void updateEstimateOutcome(
                                      item,
                                      "Lost",
                                      null,
                                      "Estimate marked lost"
                                    )
                                  }
                                >
                                  Mark lost
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  </section>
                ) : null}

                {featuredItem ? (
                  <section
                    ref={featuredRef}
                    className="animate-[fade-slide-up_0.45s_ease_both] scroll-mt-4 motion-reduce:animate-none"
                    style={{ animationDelay: "160ms" }}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-base font-semibold">
                        Next message to approve
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Highest-priority draft shown first.
                      </p>
                    </div>
                    <FeaturedCard
                      key={featuredItem.id}
                      item={featuredItem}
                      isSaving={isSaving}
                      onSaveMessage={saveDraftMessage}
                      onApproveAndSend={approveAndSend}
                      onRemindLater={remindLater}
                      onAlreadyFollowedUp={setFollowedUpDialog}
                      onHasPaid={setHasPaidDialog}
                    />
                  </section>
                ) : estimateFollowUpItems.length === 0 ? (
                  <div
                    className="animate-[fade-slide-up_0.45s_ease_both] rounded-xl border border-dashed border-green-200 bg-green-50/50 p-6 text-center motion-reduce:animate-none"
                    style={{ animationDelay: "160ms" }}
                  >
                    <p className="text-sm font-semibold text-green-800">
                      All follow-ups are sent.
                    </p>
                    <p className="mt-1.5 text-xs leading-5 text-green-700">
                      Your active recovery drafts are waiting on customer
                      responses.
                    </p>
                  </div>
                ) : null}

                {queueNeedsApproval.length > 0 ? (
                  <section
                    className="animate-[fade-slide-up_0.45s_ease_both] motion-reduce:animate-none"
                    style={{ animationDelay: "240ms" }}
                  >
                    <h2 className="mb-3 text-base font-semibold">
                      Other follow-ups to approve
                    </h2>
                    <div className="space-y-3">
                      {queueNeedsApproval.map((item) => (
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
                              {item.daysOverdue > 0
                                ? ` - ${item.daysOverdue} day${
                                    item.daysOverdue === 1 ? "" : "s"
                                  } overdue`
                                : null}
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-4 sm:contents">
                            <div className="shrink-0 sm:text-right">
                              <div className="font-semibold">
                                {moneyFormatter.format(item.amount)}
                              </div>
                              <Badge
                                variant="outline"
                                className={cn("mt-1", getStageStyle(item))}
                              >
                                {getStatusLabel(item)}
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
                ) : null}

                {overdueNoDraftItems.length > 0 ? (
                  <section
                    className="animate-[fade-slide-up_0.45s_ease_both] motion-reduce:animate-none"
                    style={{ animationDelay: "280ms" }}
                  >
                    <h2 className="mb-3 text-base font-semibold">
                      Invoices needing follow-up
                    </h2>
                    <div className="space-y-3">
                      {overdueNoDraftItems.map((item) => (
                        <div
                          key={item.invoiceId}
                          className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">
                              {item.clientName}
                            </div>
                            <div className="mt-0.5 text-sm text-muted-foreground">
                              {item.invoiceNumber}
                              {item.daysOverdue > 0
                                ? ` - ${item.daysOverdue} day${
                                    item.daysOverdue === 1 ? "" : "s"
                                  } overdue`
                                : " - due today"}
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-4 sm:contents">
                            <div className="shrink-0 sm:text-right">
                              <div className="font-semibold">
                                {moneyFormatter.format(item.amount)}
                              </div>
                              <Badge variant="warning" className="mt-1">
                                Payment follow-up
                              </Badge>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0"
                              disabled={generatingFor === item.invoiceId}
                              onClick={() => void generateDraftForInvoice(item)}
                            >
                              {generatingFor === item.invoiceId
                                ? "Generating..."
                                : "Generate message"}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {waitingItems.length > 0 ? (
                  <section
                    className="animate-[fade-slide-up_0.45s_ease_both] motion-reduce:animate-none"
                    style={{ animationDelay: "320ms" }}
                  >
                    <h2 className="mb-3 text-base font-semibold">
                      Waiting on customer
                    </h2>
                    <div className="space-y-3">
                      {waitingItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">
                              {item.clientName}
                            </div>
                            <div className="mt-0.5 text-sm text-muted-foreground">
                              {item.invoiceNumber}
                              {item.daysOverdue > 0
                                ? ` - ${item.daysOverdue} day${
                                    item.daysOverdue === 1 ? "" : "s"
                                  } overdue`
                                : null}
                            </div>
                            {item.draft.sent_at ? (
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                Sent {formatTimestamp(item.draft.sent_at)}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex items-center justify-between gap-4 sm:contents">
                            <div className="shrink-0 sm:text-right">
                              <div className="font-semibold">
                                {moneyFormatter.format(item.amount)}
                              </div>
                              <Badge
                                variant="outline"
                                className="mt-1 border-amber-200 bg-amber-50 text-amber-800"
                              >
                                Waiting on customer
                              </Badge>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0"
                              onClick={() => void markResolved(item)}
                              disabled={isSaving}
                            >
                              Mark paid
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
            )}
          </div>
        </ContentReveal>
      </div>

      <Dialog
        open={estimateDialog !== null}
        onOpenChange={(open) => {
          if (!open) setEstimateDialog(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Have you followed up with{" "}
              {estimateDialog?.clientName ?? "this client"}?
            </DialogTitle>
            <DialogDescription>
              Log what happened so the next follow-up date stays accurate.
            </DialogDescription>
          </DialogHeader>
          {estimateDialog ? (
            <div className="grid gap-2">
              <Button
                disabled={isSaving}
                onClick={() =>
                  void updateEstimateOutcome(
                    estimateDialog,
                    "Won",
                    null,
                    "Estimate marked won"
                  )
                }
              >
                They want to move forward
              </Button>
              <Button
                variant="outline"
                disabled={isSaving}
                onClick={() =>
                  void updateEstimateOutcome(
                    estimateDialog,
                    "Interested",
                    getFutureInputDate(7),
                    "Follow-up scheduled for next week"
                  )
                }
              >
                They need more time
              </Button>
              <Button
                variant="outline"
                disabled={isSaving}
                onClick={() =>
                  void updateEstimateOutcome(
                    estimateDialog,
                    "Follow-up Needed",
                    getFutureInputDate(2),
                    "Another estimate follow-up scheduled"
                  )
                }
              >
                No response
              </Button>
              <Button
                variant="ghost"
                className="text-muted-foreground"
                disabled={isSaving}
                onClick={() =>
                  void updateEstimateOutcome(
                    estimateDialog,
                    "Lost",
                    null,
                    "Estimate marked lost"
                  )
                }
              >
                They said no
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={hasPaidDialog !== null}
        onOpenChange={(open) => {
          if (!open) setHasPaidDialog(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Has {hasPaidDialog?.clientName ?? "this client"} paid?
            </DialogTitle>
            <DialogDescription>
              Update the invoice status based on what happened.
            </DialogDescription>
          </DialogHeader>
          {hasPaidDialog ? (
            <div className="grid gap-2">
              <Button
                disabled={isSaving}
                onClick={() => void markResolved(hasPaidDialog)}
              >
                Yes, mark paid
              </Button>
              <Button
                variant="outline"
                disabled={isSaving}
                onClick={() => setHasPaidDialog(null)}
              >
                Not yet
              </Button>
              <Button
                variant="outline"
                disabled={isSaving}
                onClick={() => void markDraftWaiting(hasPaidDialog)}
              >
                They promised payment
              </Button>
              <Button
                variant="ghost"
                className="text-muted-foreground"
                disabled={isSaving}
                onClick={() => void markDisputed(hasPaidDialog)}
              >
                There is a dispute
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={followedUpDialog !== null}
        onOpenChange={(open) => {
          if (!open) setFollowedUpDialog(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Already followed up with{" "}
              {followedUpDialog?.clientName ?? "this client"}?
            </DialogTitle>
            <DialogDescription>
              Log the result without sending another message.
            </DialogDescription>
          </DialogHeader>
          {followedUpDialog ? (
            <div className="grid gap-2">
              <Button
                disabled={isSaving}
                onClick={() => void markDraftWaiting(followedUpDialog)}
              >
                They promised payment
              </Button>
              <Button
                variant="outline"
                disabled={isSaving}
                onClick={() => void remindLater(followedUpDialog)}
              >
                Remind me tomorrow
              </Button>
              <Button
                variant="ghost"
                className="text-muted-foreground"
                disabled={isSaving}
                onClick={() => setFollowedUpDialog(null)}
              >
                No update
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
