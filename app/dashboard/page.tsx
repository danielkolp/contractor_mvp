"use client"

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  ArrowUpRight,
  Bell,
  CalendarClock,
  CircleDollarSign,
  FileWarning,
  Plus,
  RefreshCw,
} from "lucide-react"


import { PageHeader } from "@/components/dashboard/page-header"
import {
  DashboardMainSkeleton,
} from "@/components/dashboard/skeleton-loaders"
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
import { Progress } from "@/components/ui/progress"
import {
  buildFollowUpQueue,
  type FollowUpQueueItem,
} from "@/lib/recovery-queue"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"

type ClientRow = Database["public"]["Tables"]["clients"]["Row"]
type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"]
type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"]
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"]
type RecoveryActionRow =
  Database["public"]["Tables"]["recovery_actions"]["Row"]
type RecoveryDraftRow =
  Database["public"]["Tables"]["recovery_drafts"]["Row"]
type ReminderRow = Database["public"]["Tables"]["reminders"]["Row"]
type ReminderInsert = Database["public"]["Tables"]["reminders"]["Insert"]
type ReminderUpdate = Database["public"]["Tables"]["reminders"]["Update"]
type InvoiceStatus = Database["public"]["Enums"]["invoice_status"]
type BadgeTone = "default" | "success" | "warning" | "muted" | "outline"

const unpaidStatuses: InvoiceStatus[] = [
  "Sent",
  "Overdue",
  "Follow-up Sent",
  "Payment Plan",
  "Escalated",
]
const overdueStatuses: InvoiceStatus[] = [
  "Overdue",
  "Follow-up Sent",
  "Payment Plan",
  "Escalated",
]
const openEstimateStatuses = new Set([
  "Sent",
  "Follow-up Needed",
  "Follow-up Sent",
  "Interested",
])
const draftApprovalStatuses = ["needs_approval", "draft"]
const draftWaitingStatuses = ["sent", "waiting_on_customer"]
const draftFinalStatuses = ["resolved", "cancelled"]

const statusTone: Record<InvoiceStatus, BadgeTone> = {
  Draft: "muted",
  Sent: "default",
  Overdue: "warning",
  "Follow-up Sent": "default",
  "Payment Plan": "outline",
  Paid: "success",
  Escalated: "warning",
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

function getDaysOverdue(dueDate: string | null, status: InvoiceStatus) {
  if (!dueDate || status === "Paid" || status === "Draft") {
    return 0
  }

  const today = new Date()
  const due = new Date(`${dueDate}T00:00:00`)
  const diff = today.getTime() - due.getTime()

  return Math.max(0, Math.floor(diff / 86_400_000))
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

function isUnpaid(invoice: InvoiceRow) {
  return unpaidStatuses.includes(invoice.status)
}

function isOverdue(invoice: InvoiceRow) {
  return (
    overdueStatuses.includes(invoice.status) ||
    getDaysOverdue(invoice.due_date, invoice.status) > 0
  )
}

function normalizeDraftStatus(status: string) {
  return status.trim().toLowerCase()
}

function isDraftNeedingApproval(draft: RecoveryDraftRow) {
  return draftApprovalStatuses.includes(normalizeDraftStatus(draft.status))
}

function isDraftWaitingOnCustomer(draft: RecoveryDraftRow) {
  return draftWaitingStatuses.includes(normalizeDraftStatus(draft.status))
}

function isDraftFinal(draft: RecoveryDraftRow) {
  return draftFinalStatuses.includes(normalizeDraftStatus(draft.status))
}

function getDraftPriority(draft: RecoveryDraftRow) {
  const status = normalizeDraftStatus(draft.status)
  if (status === "needs_approval") return 0
  if (status === "draft") return 1
  if (status === "approved") return 2
  if (status === "sent" || status === "waiting_on_customer") return 3
  return 4
}

function nullableText(value: string) {
  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : null
}

function toReminderTimestamp(date: string) {
  return new Date(`${date}T09:00:00`).toISOString()
}

function getQueueNextAction(item: FollowUpQueueItem) {
  if (item.kind === "estimate") {
    return {
      heading: `Follow up with ${item.clientName} about their estimate.`,
      body: `${item.estimateNumber} was sent ${item.daysSinceSent} day${
        item.daysSinceSent === 1 ? "" : "s"
      } ago for ${moneyFormatter.format(
        item.amount
      )}. Ask if they want to move forward.`,
      cta: "Open follow-ups",
      href: "/dashboard/recovery",
    }
  }

  const days = Math.max(0, item.daysOverdue)
  const heading =
    item.state === "needs_approval"
      ? `Review the payment reminder for ${item.clientName}.`
      : `Check payment for ${item.invoiceNumber}.`
  const body =
    days > 0
      ? `${item.invoiceNumber} is ${days} day${
          days === 1 ? "" : "s"
        } overdue for ${moneyFormatter.format(item.amount)}.`
      : `${item.invoiceNumber} is due for ${moneyFormatter.format(
          item.amount
        )}.`

  return {
    heading,
    body,
    cta: item.draft ? "Review message" : "Open follow-ups",
    href: "/dashboard/recovery",
  }
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [estimates, setEstimates] = useState<EstimateRow[]>([])
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [recoveryActions, setRecoveryActions] = useState<RecoveryActionRow[]>(
    []
  )
  const [recoveryDrafts, setRecoveryDrafts] = useState<RecoveryDraftRow[]>([])
  const [reminders, setReminders] = useState<ReminderRow[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false)
  const [reminderForm, setReminderForm] = useState<ReminderFormValues>(
    getInitialReminderForm()
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadDashboard = useCallback(async () => {
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
      setProfile(null)
      setRecoveryActions([])
      setRecoveryDrafts([])
      setReminders([])
      setUserId(null)
      setIsLoading(false)
      return
    }

    setUserId(user.id)

    const [
      profileResult,
      clientsResult,
      estimatesResult,
      invoicesResult,
      actionsResult,
      draftsResult,
      remindersResult,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("clients").select("*").eq("user_id", user.id),
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
        .order("scheduled_for", { ascending: true, nullsFirst: false }),
      supabase
        .from("recovery_drafts")
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
      profileResult.error ||
      clientsResult.error ||
      estimatesResult.error ||
      invoicesResult.error ||
      actionsResult.error ||
      draftsResult.error ||
      remindersResult.error

    if (firstError) {
      setErrorMessage(
        firstError.message.includes("estimates")
          ? "The estimates table is not available yet. Apply supabase/apply_estimates.sql in Supabase, then refresh."
          : firstError.message
      )
    } else {
      setErrorMessage(null)
    }

    setProfile(profileResult.data || null)
    setClients(clientsResult.data || [])
    setEstimates(estimatesResult.data || [])
    setInvoices(invoicesResult.data || [])
    setRecoveryActions(actionsResult.data || [])
    setRecoveryDrafts(draftsResult.data || [])
    setReminders(remindersResult.data || [])
    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadDashboard()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [loadDashboard])

  const dashboardStats = useMemo(() => {
    const unpaidInvoices = invoices.filter(isUnpaid)
    const overdueInvoices = invoices.filter(isOverdue)
    const unpaidAmount = unpaidInvoices.reduce(
      (sum, invoice) => sum + invoice.amount,
      0
    )

    return {
      unpaidInvoices,
      overdueInvoices,
      totalUnpaidRevenue: unpaidAmount,
      unpaidCount: unpaidInvoices.length,
    }
  }, [invoices])

  const priorityUnpaidInvoices = useMemo(
    () =>
      dashboardStats.unpaidInvoices
        .slice()
        .sort((a, b) => {
          const overdueDelta =
            Number(isOverdue(b)) - Number(isOverdue(a)) ||
            getDaysOverdue(b.due_date, b.status) -
              getDaysOverdue(a.due_date, a.status)

          if (overdueDelta !== 0) {
            return overdueDelta
          }

          const aDue = a.due_date
            ? new Date(`${a.due_date}T00:00:00`).getTime()
            : Number.MAX_SAFE_INTEGER
          const bDue = b.due_date
            ? new Date(`${b.due_date}T00:00:00`).getTime()
            : Number.MAX_SAFE_INTEGER

          return aDue - bDue
        })
        .slice(0, 5),
    [dashboardStats.unpaidInvoices]
  )

  const dueReminders = useMemo(() => {
    const today = new Date()
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    )

    return reminders
      .filter((reminder) => {
        if (reminder.completed) {
          return false
        }

        const reminderDate = new Date(`${reminder.reminder_date}T00:00:00`)
        const startOfReminder = new Date(
          reminderDate.getFullYear(),
          reminderDate.getMonth(),
          reminderDate.getDate()
        )

        return startOfReminder.getTime() <= startOfToday.getTime()
      })
      .sort(
        (a, b) =>
          new Date(`${a.reminder_date}T00:00:00`).getTime() -
          new Date(`${b.reminder_date}T00:00:00`).getTime()
      )
  }, [reminders])

  const followUpQueue = useMemo(
    () =>
      buildFollowUpQueue({
        estimates,
        invoices,
        clients,
        recoveryDrafts,
        reminders,
      }),
    [clients, estimates, invoices, recoveryDrafts, reminders]
  )

  const openEstimates = useMemo(
    () =>
      estimates.filter((estimate) => openEstimateStatuses.has(estimate.status)),
    [estimates]
  )

  const invoiceById = useMemo(
    () => new Map(invoices.map((invoice) => [invoice.id, invoice])),
    [invoices]
  )

  const activeRecoveryDrafts = useMemo(
    () =>
      recoveryDrafts.filter((draft) => {
        if (isDraftFinal(draft)) {
          return false
        }

        const invoice = invoiceById.get(draft.invoice_id)
        return invoice ? invoice.status !== "Paid" : false
      }),
    [invoiceById, recoveryDrafts]
  )

  const recoveryDraftStats = useMemo(() => {
    const needsApproval = activeRecoveryDrafts.filter(isDraftNeedingApproval)
    const waitingOnCustomer = activeRecoveryDrafts.filter(isDraftWaitingOnCustomer)

    return {
      needsApproval,
      waitingOnCustomer,
    }
  }, [activeRecoveryDrafts])

  const nextRecoveryDraft = useMemo(
    () =>
      recoveryDraftStats.needsApproval
        .slice()
        .sort((first, second) => {
          const priority = getDraftPriority(first) - getDraftPriority(second)
          if (priority !== 0) return priority
          return second.days_overdue - first.days_overdue
        })[0],
    [recoveryDraftStats.needsApproval]
  )

  const nextActionContent = useMemo(() => {
    const queueItem = followUpQueue[0]
    if (queueItem) {
      return getQueueNextAction(queueItem)
    }

    // 1. A recovery draft needs the user's approval.
    if (nextRecoveryDraft) {
      const invoice = invoiceById.get(nextRecoveryDraft.invoice_id)

      if (invoice) {
        const amount = moneyFormatter.format(invoice.amount)
        const client = invoice.client_name || "a client"
        const days = Math.max(
          nextRecoveryDraft.days_overdue,
          getDaysOverdue(invoice.due_date, invoice.status)
        )

        return {
          heading: `Approve the ${amount} payment reminder for ${client}.`,
          body:
            days > 0
              ? `This invoice is ${days} day${days === 1 ? "" : "s"} overdue. A draft message is ready for your review.`
              : "A draft payment reminder is ready for your review.",
          cta: "Review recovery messages",
          href: "/dashboard/recovery",
        }
      }
    }

    // 2. An overdue invoice needs a follow-up (even if no draft exists yet).
    const mostUrgentOverdue = dashboardStats.overdueInvoices
      .slice()
      .sort(
        (a, b) =>
          getDaysOverdue(b.due_date, b.status) -
          getDaysOverdue(a.due_date, a.status)
      )[0]

    if (mostUrgentOverdue) {
      const days = getDaysOverdue(
        mostUrgentOverdue.due_date,
        mostUrgentOverdue.status
      )
      const client = mostUrgentOverdue.client_name || "a client"
      const amount = moneyFormatter.format(mostUrgentOverdue.amount)
      const hasDraft = recoveryDrafts.some(
        (d) =>
          d.invoice_id === mostUrgentOverdue.id &&
          !["resolved", "cancelled"].includes(d.status.trim().toLowerCase())
      )
      return {
        heading: `Follow up with ${client} today.`,
        body: `${mostUrgentOverdue.invoice_number} is ${days} day${days === 1 ? "" : "s"} overdue for ${amount}.`,
        cta: hasDraft ? "Review message" : "Generate follow-up",
        href: "/dashboard/recovery",
      }
    }

    // 3. A reminder is overdue or due today.
    const dueReminder = dueReminders[0]
    if (dueReminder) {
      const inv = invoiceById.get(dueReminder.invoice_id)
      return {
        heading: "You have a scheduled follow-up.",
        body: inv
          ? `Reminder for ${inv.client_name || "a client"} — ${moneyFormatter.format(inv.amount)}.`
          : "A follow-up reminder is due.",
        cta: "Review follow-ups",
        href: "/dashboard/reminders",
      }
    }

    // 4. Unpaid invoices tracked but nothing requires action right now.
    const unpaid = dashboardStats.unpaidCount
    if (unpaid > 0 || openEstimates.length > 0) {
      return {
        heading: "Open work is being tracked.",
        body:
          openEstimates.length > 0
            ? `${openEstimates.length} open estimate${
                openEstimates.length === 1 ? "" : "s"
              } and ${unpaid} unpaid invoice${
                unpaid === 1 ? "" : "s"
              } are being tracked. No follow-up is due right now.`
            : `${unpaid} unpaid invoice${unpaid === 1 ? "" : "s"} ${
                unpaid === 1 ? "is" : "are"
              } being tracked. No follow-up is due right now.`,
        cta: openEstimates.length > 0 ? "View estimates" : "View unpaid invoices",
        href: openEstimates.length > 0 ? "/dashboard/estimates" : "/dashboard/invoices",
      }
    }

    // 4. Genuinely caught up — no unpaid invoices, no drafts, no reminders.
    return {
      heading: "You’re all caught up.",
    body: "No unpaid invoices, open reminders, or pending messages.",
      cta: "Add estimate",
      href: "/dashboard/estimates",
    }
  }, [
    dashboardStats.overdueInvoices,
    dashboardStats.unpaidCount,
    dueReminders,
    followUpQueue,
    invoiceById,
    nextRecoveryDraft,
    openEstimates.length,
    recoveryDrafts,
  ])

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

  const hasAnyData =
    clients.length > 0 ||
    estimates.length > 0 ||
    invoices.length > 0 ||
    recoveryActions.length > 0 ||
    recoveryDrafts.length > 0 ||
    reminders.length > 0

  const hasBusinessInfo = Boolean(
    profile?.company_name?.trim() || profile?.trade?.trim()
  )
  const hasFollowUp = useMemo(
    () =>
      reminders.length > 0 ||
      followUpQueue.length > 0 ||
      recoveryDrafts.length > 0 ||
      invoices.some((invoice) => invoice.status === "Follow-up Sent") ||
      recoveryActions.some((action) =>
        action.action_type.toLowerCase().includes("follow-up")
      ),
    [followUpQueue.length, invoices, recoveryActions, recoveryDrafts.length, reminders]
  )

  const onboardingItems = useMemo(
    () => [
      {
        id: "business",
        label: "Add your business info",
        description: "Add your company name and trade to personalize outreach.",
        completed: hasBusinessInfo,
        actionLabel: "Update settings",
        href: "/dashboard/settings",
      },
      {
        id: "client",
        label: "Add your first client",
        description: "Keep names, phone numbers, and balances in one place.",
        completed: clients.length > 0,
        actionLabel: "Add client",
        href: "/dashboard/clients",
      },
      {
        id: "invoice",
        label: "Add your first estimate or invoice",
        description: "Track quotes and unpaid balances in one place.",
        completed: estimates.length > 0 || invoices.length > 0,
        actionLabel: "Add estimate",
        href: "/dashboard/estimates",
      },
      {
        id: "review",
        label: "Review follow-ups",
        description:
          estimates.length === 0 && invoices.length === 0
            ? "Create an estimate or invoice so follow-ups can appear."
          : followUpQueue.length > 0
              ? "Open Follow-ups and log the next action."
              : "No follow-ups due yet. Keep tracking sent dates and due dates.",
        completed:
          estimates.length + invoices.length > 0 &&
          (followUpQueue.length === 0 || recoveryActions.length > 0),
        actionLabel: "Review follow-ups",
        href: "/dashboard/recovery",
      },
      {
        id: "followup",
        label: "Generate your first follow-up",
        description:
          invoices.length === 0
            ? "Add an invoice first, then schedule a reminder."
            : "Create a reminder or mark a follow-up sent.",
        completed: hasFollowUp,
        actionLabel: "Create follow-up",
        href: "/dashboard/invoices",
      },
    ],
    [
      clients.length,
      estimates.length,
      followUpQueue.length,
      hasBusinessInfo,
      hasFollowUp,
      invoices.length,
      recoveryActions.length,
    ]
  )

  const completedCount = onboardingItems.filter((item) => item.completed).length
  const checklistProgress = Math.round(
    (completedCount / onboardingItems.length) * 100
  )
  const nextStep = onboardingItems.find((item) => !item.completed)
  const showChecklist =
    !isLoading && userId !== null && onboardingItems.some((item) => !item.completed)

  const statCards = [
    {
      label: "Today's follow-ups",
      value: String(followUpQueue.length),
      detail:
        followUpQueue.length === 0
          ? "No follow-ups due"
          : `${followUpQueue.filter((item) => item.kind === "estimate").length} estimate and ${followUpQueue.filter((item) => item.kind === "invoice").length} invoice follow-ups`,
      icon: CalendarClock,
      tone: "bg-amber-50 text-amber-700",
    },
    {
      label: "Open estimates",
      value: String(openEstimates.length),
      detail: `${openEstimates.length} quote${
        openEstimates.length === 1 ? "" : "s"
      } still in play`,
      icon: FileWarning,
      tone: "bg-sky-50 text-sky-700",
    },
    {
      label: "Unpaid invoices",
      value: moneyFormatter.format(dashboardStats.totalUnpaidRevenue),
      detail: `${dashboardStats.unpaidCount} unpaid invoice${
        dashboardStats.unpaidCount === 1 ? "" : "s"
      }`,
      icon: CircleDollarSign,
      tone: "bg-green-50 text-green-700",
    },
  ]

  function updateReminderForm<Field extends keyof ReminderFormValues>(
    field: Field,
    value: ReminderFormValues[Field]
  ) {
    setReminderForm((current) => ({ ...current, [field]: value }))
  }

  function openAddReminder() {
    setReminderForm(getInitialReminderForm(invoices[0]?.id || ""))
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

  return (
    <>
      <PageHeader
        title="Today's follow-ups"
        description="See who needs a quote follow-up, who owes payment, and what to say next."
      >
        <Button asChild>
          <a href={followUpQueue.length > 0 ? "/dashboard/recovery" : "/dashboard/estimates"}>
            {estimates.length === 0 && invoices.length === 0 ? (
              <>
                <Plus className="size-4" />
                Add estimate
              </>
            ) : (
              <>
                Open follow-ups
                <ArrowUpRight className="size-4" />
              </>
            )}
          </a>
        </Button>
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
        {errorMessage ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="font-medium">Dashboard sync error</div>
            <p className="mt-1 leading-6">{errorMessage}</p>
          </div>
        ) : null}

        {showChecklist ? (
          <Card className="border-green-100 bg-green-50/40">
            <CardContent className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">Setup</CardTitle>
                  <Badge variant="outline" className="w-fit">
                    {completedCount} of {onboardingItems.length} done
                  </Badge>
                </div>
                <Progress value={checklistProgress} className="mt-3" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {nextStep
                    ? `Next: ${nextStep.label.toLowerCase()}.`
                    : "Your workspace is ready."}
                </p>
              </div>
              {nextStep ? (
                <Button variant="outline" asChild className="w-full sm:w-auto">
                  <a href={nextStep.href}>{nextStep.actionLabel}</a>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <ContentReveal isLoading={isLoading} skeleton={<DashboardMainSkeleton />}>
          <div className="grid gap-6">
            {errorMessage && !hasAnyData ? (
              <Card className="border-zinc-200">
                <CardContent className="p-10 text-center">
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
                      void loadDashboard()
                    }}
                  >
                    <RefreshCw className="size-4" />
                    Try again
                  </Button>
                </CardContent>
              </Card>
            ) : !hasAnyData ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <div className="mx-auto grid size-12 place-items-center rounded-lg bg-green-50 text-green-700">
                    <CircleDollarSign className="size-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">
                    Add your first estimate
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    Start with a quote you sent or an unpaid invoice. The app
                    will turn it into a follow-up worklist.
                  </p>
                  <div className="mt-5 flex justify-center">
                    <Button asChild>
                      <a href="/dashboard/estimates">
                        <Plus className="size-4" />
                        Add estimate
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {statCards.map((stat, i) => {
                    const Icon = stat.icon

                    return (
                      <Card
                        key={stat.label}
                        className="animate-[fade-slide-up_0.35s_ease-out_both] motion-reduce:animate-none"
                        style={{ animationDelay: `${i * 60}ms` }}
                      >
                        <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
                          <CardDescription>{stat.label}</CardDescription>
                          <div className={`rounded-lg p-2 ${stat.tone}`}>
                            <Icon className="size-4" />
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-semibold tracking-tight">
                            {stat.value}
                          </div>
                          <p className="mt-2 text-sm leading-5 text-muted-foreground">
                            {stat.detail}
                          </p>
                        </CardContent>
                      </Card>
                    )
                  })}
                </section>

                {nextActionContent ? (
                  <Card className="border-2 border-green-200 bg-gradient-to-br from-green-50/60 to-white shadow-sm">
                <CardContent className="p-5 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-green-700 text-white shadow-sm">
                        <CalendarClock className="size-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-wide text-green-700">
                          Next best action
                        </div>
                        <p className="mt-1 text-base font-semibold leading-snug text-foreground">
                          {nextActionContent.heading}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {nextActionContent.body}
                        </p>
                      </div>
                    </div>
                    <Button
                      className="shrink-0 gap-2 bg-green-700 text-white hover:bg-green-800 sm:ml-4"
                      asChild
                    >
                      <a href={nextActionContent.href}>
                        {nextActionContent.cta}
                        <ArrowUpRight className="size-4" />
                      </a>
                    </Button>
                  </div>
                </CardContent>
                  </Card>
                ) : null}

                <section className="grid gap-6 xl:grid-cols-[1.45fr_0.55fr]">
              <Card>
                <CardHeader className="gap-2">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle>Who owes me money?</CardTitle>
                      <CardDescription>
                        The most important unpaid invoices to review.
                      </CardDescription>
                    </div>
                    <Badge variant="warning" className="w-fit">
                      {dashboardStats.unpaidCount} unpaid total
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {priorityUnpaidInvoices.length > 0 ? (
                    <div className="overflow-hidden rounded-lg border border-border">
                      <div className="hidden grid-cols-[108px_1fr_110px_110px_120px] gap-4 border-b border-border bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground lg:grid">
                        <div>Invoice</div>
                        <div>Client</div>
                        <div>Due</div>
                        <div>Amount</div>
                        <div>Status</div>
                      </div>
                      <div className="divide-y divide-border">
                        {priorityUnpaidInvoices.map((invoice) => {
                          const daysOverdue = getDaysOverdue(
                            invoice.due_date,
                            invoice.status
                          )

                          return (
                            <div
                              key={invoice.id}
                              className="grid gap-3 px-4 py-3 lg:grid-cols-[108px_1fr_110px_110px_120px] lg:items-center"
                            >
                              <div>
                                <div className="font-medium">
                                  {invoice.invoice_number}
                                </div>
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium">
                                  {invoice.client_name || "No client"}
                                </div>
                              </div>
                              <div className="text-sm">
                                {formatDate(invoice.due_date)}
                                {daysOverdue > 0 && (
                                  <div className="text-xs text-muted-foreground">
                                    {daysOverdue} day{daysOverdue === 1 ? "" : "s"} late
                                  </div>
                                )}
                              </div>
                              <div className="font-semibold">
                                {moneyFormatter.format(invoice.amount)}
                              </div>
                              <div>
                                <Badge variant={statusTone[invoice.status]}>
                                  {getStatusDisplayLabel(invoice.status)}
                                </Badge>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
                      No unpaid invoices right now.
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-6">
                <Card>
                  <CardHeader className="gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle>Today's follow-up inbox</CardTitle>
                        <CardDescription>
                          Estimates and invoices that need attention now.
                        </CardDescription>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={invoices.length === 0 || isSaving}
                        onClick={openAddReminder}
                      >
                        <Bell className="size-3.5" />
                        Add
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {followUpQueue.length > 0 ? (
                      <div className="grid gap-3">
                        {followUpQueue.slice(0, 5).map((item) => (
                          <div
                            key={item.id}
                            className="rounded-lg border border-border p-3"
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <Badge
                                  variant={
                                    item.kind === "estimate"
                                      ? "warning"
                                      : "outline"
                                  }
                                >
                                  {item.kind === "estimate"
                                    ? "Estimate"
                                    : "Invoice"}
                                </Badge>
                                <div className="mt-2 break-words text-sm font-medium">
                                  {item.kind === "estimate"
                                    ? `Follow up with ${item.clientName}`
                                    : `Check payment for ${item.clientName}`}
                                </div>
                                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                                  {item.explanation}
                                </p>
                              </div>
                              <div className="shrink-0 text-sm font-semibold sm:text-right">
                                {moneyFormatter.format(item.amount)}
                              </div>
                            </div>
                          </div>
                        ))}
                        <Button variant="outline" asChild>
                          <a href="/dashboard/recovery">Open follow-ups</a>
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                        <div className="text-sm font-medium text-foreground">
                          No follow-ups due today
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {estimates.length === 0 && invoices.length === 0
                            ? "Add an estimate or invoice first so the worklist has something to track."
                            : "Open estimates and unpaid invoices are being tracked. Nothing needs action right now."}
                        </p>
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                          {estimates.length === 0 && invoices.length === 0 ? (
                            <Button asChild>
                              <a href="/dashboard/estimates">Add estimate</a>
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              disabled={isSaving}
                              onClick={openAddReminder}
                            >
                              <Bell className="size-3.5" />
                              Add reminder
                            </Button>
                          )}
                          <Button variant="outline" asChild>
                            <a href="/dashboard/recovery">Open follow-ups</a>
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
                </section>
              </>
            )}
          </div>
        </ContentReveal>
      </div>
    </>
  )
}
