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
import { Progress } from "@/components/ui/progress"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"

type ClientRow = Database["public"]["Tables"]["clients"]["Row"]
type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"]
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"]
type RecoveryActionRow =
  Database["public"]["Tables"]["recovery_actions"]["Row"]
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
    Sent: "Sent",
    Overdue: "Overdue",
    "Follow-up Sent": "Waiting on customer",
    "Payment Plan": "Payment plan",
    Paid: "Paid",
    Escalated: "Needs approval",
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

function nullableText(value: string) {
  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : null
}

function toReminderTimestamp(date: string) {
  return new Date(`${date}T09:00:00`).toISOString()
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [recoveryActions, setRecoveryActions] = useState<RecoveryActionRow[]>(
    []
  )
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
      setInvoices([])
      setProfile(null)
      setRecoveryActions([])
      setReminders([])
      setUserId(null)
      setIsLoading(false)
      return
    }

    setUserId(user.id)

    const [
      profileResult,
      clientsResult,
      invoicesResult,
      actionsResult,
      remindersResult,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("clients").select("*").eq("user_id", user.id),
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
        .from("reminders")
        .select("*")
        .eq("user_id", user.id)
        .order("reminder_date", { ascending: true }),
    ])

    const firstError =
      profileResult.error ||
      clientsResult.error ||
      invoicesResult.error ||
      actionsResult.error ||
      remindersResult.error

    if (firstError) {
      setErrorMessage(firstError.message)
    } else {
      setErrorMessage(null)
    }

    setProfile(profileResult.data || null)
    setClients(clientsResult.data || [])
    setInvoices(invoicesResult.data || [])
    setRecoveryActions(actionsResult.data || [])
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

  const recentOverdueInvoices = useMemo(
    () =>
      dashboardStats.overdueInvoices
        .slice()
        .sort(
          (a, b) =>
            getDaysOverdue(b.due_date, b.status) -
            getDaysOverdue(a.due_date, a.status)
        )
        .slice(0, 5),
    [dashboardStats.overdueInvoices]
  )

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

  const activeReminderCount = useMemo(
    () => reminders.filter((reminder) => !reminder.completed).length,
    [reminders]
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

  const remindersDueToday = dueReminders.length

  const nextOpenReminder = useMemo(
    () =>
      reminders
        .filter((reminder) => !reminder.completed)
        .sort(
          (a, b) =>
            new Date(`${a.reminder_date}T00:00:00`).getTime() -
            new Date(`${b.reminder_date}T00:00:00`).getTime()
        )[0],
    [reminders]
  )

  const invoiceById = useMemo(
    () => new Map(invoices.map((invoice) => [invoice.id, invoice])),
    [invoices]
  )

  const nextActionContent = useMemo(() => {
    if (recentOverdueInvoices.length > 0) {
      const inv = recentOverdueInvoices[0]
      const amount = moneyFormatter.format(inv.amount)
      const client = inv.client_name || "a client"
      const days = getDaysOverdue(inv.due_date, inv.status)
      return {
        heading: `Approve the ${amount} payment reminder for ${client}.`,
        body:
          days > 0
            ? `This invoice is ${days} day${days === 1 ? "" : "s"} overdue. A draft message is ready for your review.`
            : "This invoice is ready for a follow-up. Review the draft message before it goes out.",
        cta: "Review message",
        href: "/dashboard/recovery",
      }
    }
    if (nextOpenReminder) {
      const inv = invoiceById.get(nextOpenReminder.invoice_id ?? "")
      return {
        heading: "You have a scheduled follow-up.",
        body: inv
          ? `Reminder for ${inv.client_name || "a client"} — ${moneyFormatter.format(inv.amount)}.`
          : "A follow-up reminder is due.",
        cta: "Open reminders",
        href: "/dashboard/reminders",
      }
    }
    return null
  }, [recentOverdueInvoices, nextOpenReminder, invoiceById])

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
    invoices.length > 0 ||
    recoveryActions.length > 0 ||
    reminders.length > 0

  const hasBusinessInfo = Boolean(
    profile?.company_name?.trim() || profile?.trade?.trim()
  )
  const hasOverdueInvoices = dashboardStats.overdueInvoices.length > 0
  const hasFollowUp = useMemo(
    () =>
      reminders.length > 0 ||
      invoices.some((invoice) => invoice.status === "Follow-up Sent") ||
      recoveryActions.some((action) =>
        action.action_type.toLowerCase().includes("follow-up")
      ),
    [invoices, recoveryActions, reminders]
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
        label: "Add your first invoice",
        description: "Track due dates and unpaid revenue in one place.",
        completed: invoices.length > 0,
        actionLabel: "Add invoice",
        href: "/dashboard/invoices",
      },
      {
        id: "review",
        label: "Review overdue invoices",
        description:
          invoices.length === 0
            ? "Create an invoice so overdue items can appear."
          : hasOverdueInvoices
              ? "Open Follow-ups and log the next action."
              : "No overdue invoices yet. Keep tracking due dates.",
        completed:
          invoices.length > 0 &&
          (!hasOverdueInvoices || recoveryActions.length > 0),
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
      hasBusinessInfo,
      hasFollowUp,
      hasOverdueInvoices,
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
      label: "Total unpaid",
      value: moneyFormatter.format(dashboardStats.totalUnpaidRevenue),
      detail: `${dashboardStats.unpaidCount} unpaid invoices`,
      icon: CircleDollarSign,
      tone: "bg-green-50 text-green-700",
    },
    {
      label: "Need follow-up",
      value: String(dashboardStats.overdueInvoices.length),
      detail: "Overdue or needs attention",
      icon: FileWarning,
      tone: "bg-amber-50 text-amber-700",
    },
    {
      label: "Due today",
      value: String(remindersDueToday),
      detail: `${activeReminderCount} open reminders`,
      icon: Bell,
      tone: "bg-sky-50 text-sky-700",
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
        title="Today's focus"
        description="See who owes money, what needs a follow-up, and the next button to press."
      >
        <Button asChild>
          <a href="/dashboard/invoices">
            {invoices.length === 0 ? (
              <>
                <Plus className="size-4" />
                Add invoice
              </>
            ) : (
              <>
                Review unpaid invoices
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
                    Add your first invoice
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    Start with the balance that needs to get paid. You can add
                    client details after that.
                  </p>
                  <div className="mt-5 flex justify-center">
                    <Button asChild>
                      <a href="/dashboard/invoices">
                        <Plus className="size-4" />
                        Add invoice
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
                        <CardTitle>Follow-ups due today</CardTitle>
                        <CardDescription>
                          The calls or emails that need attention now.
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
                    {dueReminders.length > 0 ? (
                      <ReminderList
                        reminders={dueReminders.slice(0, 4)}
                        invoiceById={invoiceById}
                        emptyText="No follow-ups due today."
                        isSaving={isSaving}
                        onMarkComplete={(reminder) =>
                          void markReminderComplete(reminder)
                        }
                        onDelete={(reminder) => void deleteReminder(reminder)}
                      />
                    ) : (
                      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                        <div className="text-sm font-medium text-foreground">
                          Nothing due today
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {invoices.length === 0
                            ? "Add an invoice first so reminders can be linked to a balance."
                            : "You can schedule the next follow-up from an invoice or the follow-ups page."}
                        </p>
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                          {invoices.length === 0 ? (
                            <Button asChild>
                              <a href="/dashboard/invoices">Add invoice</a>
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
