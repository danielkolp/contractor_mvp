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
  CheckCircle2,
  Circle,
  CircleDollarSign,
  ClipboardCheck,
  FileWarning,
  Plus,
  RefreshCw,
  UsersRound,
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
import { Progress } from "@/components/ui/progress"
import { seedDemoData } from "@/lib/demo-data"
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

const paidStatus: InvoiceStatus = "Paid"
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

function isUnpaid(invoice: InvoiceRow) {
  return unpaidStatuses.includes(invoice.status)
}

function isOverdue(invoice: InvoiceRow) {
  return (
    overdueStatuses.includes(invoice.status) ||
    getDaysOverdue(invoice.due_date, invoice.status) > 0
  )
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
  const [isSeeding, setIsSeeding] = useState(false)
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
    const paidInvoices = invoices.filter((invoice) => invoice.status === paidStatus)
    const pendingActions = recoveryActions.filter(
      (action) => action.status === "Pending"
    )
    const paidAmount = paidInvoices.reduce(
      (sum, invoice) => sum + invoice.amount,
      0
    )
    const unpaidAmount = unpaidInvoices.reduce(
      (sum, invoice) => sum + invoice.amount,
      0
    )
    const overdueAmount = overdueInvoices.reduce(
      (sum, invoice) => sum + invoice.amount,
      0
    )

    return {
      unpaidInvoices,
      overdueInvoices,
      paidInvoices,
      pendingActions,
      totalUnpaidRevenue: unpaidAmount,
      overdueAmount,
      paidAmount,
      paidCount: paidInvoices.length,
      unpaidCount: unpaidInvoices.length,
      recoveryRate:
        invoices.length > 0
          ? Math.round((paidInvoices.length / invoices.length) * 100)
          : 0,
    }
  }, [invoices, recoveryActions])

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

  const upcomingReminders = useMemo(
    () =>
      reminders
        .slice()
        .sort(
          (a, b) =>
            Number(a.completed) - Number(b.completed) ||
            new Date(`${a.reminder_date}T00:00:00`).getTime() -
              new Date(`${b.reminder_date}T00:00:00`).getTime()
        )
        .slice(0, 4),
    [reminders]
  )

  const activeReminderCount = useMemo(
    () => reminders.filter((reminder) => !reminder.completed).length,
    [reminders]
  )

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

  const overdueClients = useMemo(() => {
    return clients
      .map((client) => {
        const matchingInvoices = invoices.filter((invoice) =>
          invoiceMatchesClient(client, invoice)
        )
        const overdueInvoices = matchingInvoices.filter(isOverdue)
        const balance = overdueInvoices.reduce(
          (sum, invoice) => sum + invoice.amount,
          0
        )

        return {
          client,
          balance,
          overdueCount: overdueInvoices.length,
        }
      })
      .filter((item) => item.balance > 0 || item.overdueCount > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 4)
  }, [clients, invoices])

  const statusBreakdown = useMemo(() => {
    const statuses: InvoiceStatus[] = [
      "Paid",
      "Sent",
      "Overdue",
      "Follow-up Sent",
      "Payment Plan",
      "Escalated",
    ]
    const total = Math.max(invoices.length, 1)

    return statuses
      .map((status) => {
        const statusInvoices = invoices.filter(
          (invoice) => invoice.status === status
        )

        return {
          label: status,
          count: statusInvoices.length,
          amount: statusInvoices.reduce((sum, invoice) => sum + invoice.amount, 0),
          progress: Math.round((statusInvoices.length / total) * 100),
        }
      })
      .filter((item) => item.count > 0)
  }, [invoices])

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
        description: "Create a client record to link invoices and balances.",
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
              ? "Open Recovery and log the next action."
              : "No overdue invoices yet. Keep tracking due dates.",
        completed:
          invoices.length > 0 &&
          (!hasOverdueInvoices || recoveryActions.length > 0),
        actionLabel: "Review recovery",
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
      label: "Total unpaid revenue",
      value: moneyFormatter.format(dashboardStats.totalUnpaidRevenue),
      detail: `${moneyFormatter.format(
        dashboardStats.overdueAmount
      )} is overdue or in recovery`,
      icon: CircleDollarSign,
      tone: "bg-teal-50 text-teal-700",
    },
    {
      label: "Overdue invoices",
      value: String(dashboardStats.overdueInvoices.length),
      detail: `${dashboardStats.unpaidInvoices.length} unpaid invoices total`,
      icon: FileWarning,
      tone: "bg-amber-50 text-amber-700",
    },
    {
      label: "Total clients",
      value: String(clients.length),
      detail: `${overdueClients.length} clients have overdue balances`,
      icon: UsersRound,
      tone: "bg-sky-50 text-sky-700",
    },
    {
      label: "Pending actions",
      value: String(dashboardStats.pendingActions.length),
      detail: `${activeReminderCount} open reminders`,
      icon: ClipboardCheck,
      tone: "bg-violet-50 text-violet-700",
    },
    {
      label: "Recovery rate",
      value: `${dashboardStats.recoveryRate}%`,
      detail: `${dashboardStats.paidCount} paid vs ${dashboardStats.unpaidCount} unpaid`,
      icon: CheckCircle2,
      tone: "bg-emerald-50 text-emerald-700",
    },
  ]

  function updateReminderForm<Field extends keyof ReminderFormValues>(
    field: Field,
    value: ReminderFormValues[Field]
  ) {
    setReminderForm((current) => ({ ...current, [field]: value }))
  }

  async function handleLoadDemoData() {
    if (!userId) return
    setIsSeeding(true)
    setErrorMessage(null)
    const { error } = await seedDemoData(supabase, userId)
    if (error) {
      setErrorMessage(error)
    } else {
      await loadDashboard()
    }
    setIsSeeding(false)
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
        title="Dashboard"
        description="Live overview of unpaid revenue, overdue invoices, clients, reminders, and recovery work."
      >
        <Button
          type="button"
          variant="outline"
          disabled={invoices.length === 0 || isSaving}
          onClick={openAddReminder}
        >
          <Bell className="size-4" />
          Add reminder
        </Button>
        <Button variant="outline" asChild>
          <a href="/dashboard/invoices">
            <Plus className="size-4" />
            Add invoice
          </a>
        </Button>
        <Button asChild>
          <a href="/dashboard/recovery">
            Review actions
            <ArrowUpRight className="size-4" />
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
          <Card className="border-teal-100 bg-teal-50/40">
            <CardHeader className="gap-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Onboarding checklist</CardTitle>
                  <CardDescription>
                    Complete these steps to start recovering revenue faster.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="w-fit">
                  {completedCount} / {onboardingItems.length} complete
                </Badge>
              </div>
              <Progress value={checklistProgress} />
            </CardHeader>
            <CardContent className="grid gap-3">
              {onboardingItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-lg border border-border bg-background/80 p-3"
                >
                  <div
                    className={`mt-0.5 grid size-6 place-items-center rounded-full border ${
                      item.completed
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-muted-foreground/30 text-muted-foreground"
                    }`}
                  >
                    {item.completed ? (
                      <CheckCircle2 className="size-4" />
                    ) : (
                      <Circle className="size-3" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.description}
                    </div>
                  </div>
                </div>
              ))}
              {nextStep ? (
                <Button variant="outline" asChild className="w-fit">
                  <a href={nextStep.href}>{nextStep.actionLabel}</a>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {isLoading ? (
          <Card>
            <CardContent className="p-8 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-lg bg-muted text-muted-foreground">
                <RefreshCw className="size-5 animate-spin" />
              </div>
              <h3 className="mt-4 text-base font-semibold">
                Loading dashboard
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Fetching your protected Supabase records.
              </p>
            </CardContent>
          </Card>
        ) : errorMessage && !hasAnyData ? (
          <Card>
            <CardContent className="p-8 text-center">
              <h3 className="text-base font-semibold">
                Could not load dashboard data
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
                  void loadDashboard()
                }}
              >
                <RefreshCw className="size-4" />
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : !hasAnyData ? (
          <Card>
            <CardContent className="p-8 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-lg bg-teal-50 text-teal-700">
                <CircleDollarSign className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold">
                Start tracking revenue recovery
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Add clients and invoices to see unpaid revenue, overdue counts,
                reminders, and recovery actions here. The checklist keeps setup
                lightweight.
              </p>
              <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                <Button asChild>
                  <a href="/dashboard/invoices">
                    <Plus className="size-4" />
                    Add invoice
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href="/dashboard/clients">Add client</a>
                </Button>
                <Button
                  variant="outline"
                  disabled={isSeeding || !userId}
                  onClick={() => void handleLoadDemoData()}
                >
                  {isSeeding ? (
                    <>
                      <RefreshCw className="size-4 animate-spin" />
                      Loading demo…
                    </>
                  ) : (
                    "Load demo data"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {statCards.map((stat) => {
                const Icon = stat.icon

                return (
                  <Card key={stat.label}>
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

            <section className="grid gap-6 xl:grid-cols-[1.45fr_0.55fr]">
              <Card>
                <CardHeader className="gap-2">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle>Recently overdue invoices</CardTitle>
                      <CardDescription>
                        Sorted by the largest number of days overdue.
                      </CardDescription>
                    </div>
                    <Badge variant="warning" className="w-fit">
                      {dashboardStats.overdueInvoices.length} overdue total
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {recentOverdueInvoices.length > 0 ? (
                    <div className="overflow-hidden rounded-lg border border-border">
                      <div className="hidden grid-cols-[108px_1fr_120px_110px_110px_140px] gap-4 border-b border-border bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground lg:grid">
                        <div>Invoice</div>
                        <div>Client / job</div>
                        <div>Trade</div>
                        <div>Due</div>
                        <div>Amount</div>
                        <div>Status</div>
                      </div>
                      <div className="divide-y divide-border">
                        {recentOverdueInvoices.map((invoice) => {
                          const daysOverdue = getDaysOverdue(
                            invoice.due_date,
                            invoice.status
                          )

                          return (
                            <div
                              key={invoice.id}
                              className="grid gap-3 px-4 py-4 lg:grid-cols-[108px_1fr_120px_110px_110px_140px] lg:items-center"
                            >
                              <div>
                                <div className="font-medium">
                                  {invoice.invoice_number}
                                </div>
                                <div className="text-xs text-muted-foreground lg:hidden">
                                  {invoice.trade || "Trade not set"}
                                </div>
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium">
                                  {invoice.client_name || "No client"}
                                </div>
                                <div className="mt-1 text-sm text-muted-foreground">
                                  {invoice.project_name ||
                                    invoice.notes ||
                                    "No project note"}
                                </div>
                              </div>
                              <div className="hidden text-sm text-muted-foreground lg:block">
                                {invoice.trade || "Not set"}
                              </div>
                              <div className="text-sm">
                                {formatDate(invoice.due_date)}
                                <div className="text-xs text-muted-foreground">
                                  {daysOverdue} days late
                                </div>
                              </div>
                              <div className="font-semibold">
                                {moneyFormatter.format(invoice.amount)}
                              </div>
                              <div>
                                <Badge variant={statusTone[invoice.status]}>
                                  {invoice.status}
                                </Badge>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
                      No overdue invoices right now.
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-6">
                <Card>
                  <CardHeader className="gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle>Reminders</CardTitle>
                        <CardDescription>
                          Invoice follow-ups saved in Supabase.
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
                    {upcomingReminders.length > 0 ? (
                      <ReminderList
                        reminders={upcomingReminders}
                        invoiceById={invoiceById}
                        emptyText="No reminders scheduled yet."
                        isSaving={isSaving}
                        onMarkComplete={(reminder) =>
                          void markReminderComplete(reminder)
                        }
                        onDelete={(reminder) => void deleteReminder(reminder)}
                      />
                    ) : (
                      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                        <div className="text-sm font-medium text-foreground">
                          No reminders scheduled yet
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {invoices.length === 0
                            ? "Add an invoice first so reminders can be linked to a balance."
                            : "Schedule follow-ups to keep overdue balances from slipping."}
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
                            <a href="/dashboard/recovery">Review recovery</a>
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Paid vs unpaid</CardTitle>
                    <CardDescription>
                      Paid invoices are excluded from unpaid revenue.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <Badge variant="success">Paid</Badge>
                      <span className="text-sm font-semibold">
                        {dashboardStats.paidCount} invoices ·{" "}
                        {moneyFormatter.format(dashboardStats.paidAmount)}
                      </span>
                    </div>
                    <Progress value={dashboardStats.recoveryRate} />
                    <div className="flex items-center justify-between gap-3">
                      <Badge variant="warning">Unpaid</Badge>
                      <span className="text-sm font-semibold">
                        {dashboardStats.unpaidCount} invoices ·{" "}
                        {moneyFormatter.format(
                          dashboardStats.totalUnpaidRevenue
                        )}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Clients with overdue balances</CardTitle>
                  <CardDescription>
                    Highest balances that need attention this week.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {overdueClients.length > 0 ? (
                    overdueClients.map(({ client, balance, overdueCount }) => (
                      <div
                        key={client.id}
                        className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_auto] sm:items-center"
                      >
                        <div>
                          <div className="font-medium">{client.company}</div>
                          <div className="text-sm text-muted-foreground">
                            {client.trade || "Trade not set"} · {overdueCount}{" "}
                            invoices
                          </div>
                        </div>
                        <div className="text-left sm:text-right">
                          <div className="font-semibold">
                            {moneyFormatter.format(balance)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            overdue balance
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                      No clients have overdue balances.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Simple status breakdown</CardTitle>
                  <CardDescription>
                    A quick read on where invoice recovery stands.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {statusBreakdown.length > 0 ? (
                    statusBreakdown.map((status) => (
                      <div key={status.label} className="grid gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Badge variant={statusTone[status.label]}>
                              {status.label}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {status.count} invoices
                            </span>
                          </div>
                          <span className="text-sm font-semibold">
                            {moneyFormatter.format(status.amount)}
                          </span>
                        </div>
                        <Progress value={status.progress} />
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                      Add invoices to see a status breakdown.
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>

            <section className="grid gap-4 rounded-lg border border-teal-100 bg-teal-50 p-4 text-teal-950 sm:grid-cols-[auto_1fr_auto] sm:items-center">
              <div className="grid size-10 place-items-center rounded-lg bg-white text-teal-700">
                <CalendarClock className="size-5" />
              </div>
              <div>
                <div className="font-medium">Next best action</div>
                <p className="mt-1 text-sm leading-6 text-teal-800">
                  {recentOverdueInvoices[0]
                    ? `Review ${recentOverdueInvoices[0].invoice_number} for ${recentOverdueInvoices[0].client_name || "this client"}. It is ${getDaysOverdue(recentOverdueInvoices[0].due_date, recentOverdueInvoices[0].status)} days overdue.`
                    : nextOpenReminder
                      ? "Review the next scheduled reminder and confirm the message is ready."
                      : "Add invoices and reminders to start tracking recovery actions."}
                </p>
              </div>
              <Button className="bg-teal-700 hover:bg-teal-800" asChild>
                <a href="/dashboard/recovery">
                  Review recovery
                  <ArrowUpRight className="size-4" />
                </a>
              </Button>
            </section>
          </>
        )}
      </div>
    </>
  )
}
