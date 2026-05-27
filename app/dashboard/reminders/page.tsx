"use client"

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  Circle,
  Plus,
  RefreshCw,
} from "lucide-react"
import { toast } from "sonner"

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

type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"]
type ReminderRow = Database["public"]["Tables"]["reminders"]["Row"]
type ReminderInsert = Database["public"]["Tables"]["reminders"]["Insert"]
type ReminderUpdate = Database["public"]["Tables"]["reminders"]["Update"]

type FilterTab = "upcoming" | "completed" | "all"

function toReminderTimestamp(date: string) {
  return new Date(`${date}T09:00:00`).toISOString()
}

function nullableText(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function getReminderStatus(reminder: ReminderRow): "overdue" | "today" | "upcoming" | "completed" {
  if (reminder.completed) return "completed"
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const reminderDate = new Date(`${reminder.reminder_date}T00:00:00`)
  const startOfReminder = new Date(
    reminderDate.getFullYear(),
    reminderDate.getMonth(),
    reminderDate.getDate()
  )
  const diff = startOfReminder.getTime() - startOfToday.getTime()
  if (diff < 0) return "overdue"
  if (diff === 0) return "today"
  return "upcoming"
}

export default function RemindersPage() {
  const supabase = useMemo(() => createClient(), [])
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [reminders, setReminders] = useState<ReminderRow[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<FilterTab>("upcoming")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<ReminderFormValues>(getInitialReminderForm())
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setErrorMessage(userError?.message || "You must be logged in.")
      setIsLoading(false)
      return
    }

    setUserId(user.id)

    const [invoicesResult, remindersResult] = await Promise.all([
      supabase
        .from("invoices")
        .select("*")
        .eq("user_id", user.id)
        .order("due_date", { ascending: true, nullsFirst: false }),
      supabase
        .from("reminders")
        .select("*")
        .eq("user_id", user.id)
        .order("reminder_date", { ascending: true }),
    ])

    if (invoicesResult.error) {
      setErrorMessage(invoicesResult.error.message)
    } else if (remindersResult.error) {
      setErrorMessage(remindersResult.error.message)
    }

    setInvoices(invoicesResult.data || [])
    setReminders(remindersResult.data || [])
    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    const id = window.setTimeout(() => void loadData(), 0)
    return () => window.clearTimeout(id)
  }, [loadData])

  const invoiceById = useMemo(
    () => new Map(invoices.map((inv) => [inv.id, inv])),
    [invoices]
  )

  const invoiceOptions = useMemo(
    () =>
      invoices.map((inv) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        client_name: inv.client_name,
        amount: inv.amount,
      })),
    [invoices]
  )

  const stats = useMemo(() => {
    const active = reminders.filter((r) => !r.completed)
    const completed = reminders.filter((r) => r.completed)
    const overdue = reminders.filter((r) => getReminderStatus(r) === "overdue")
    const today = reminders.filter((r) => getReminderStatus(r) === "today")
    return { total: reminders.length, active: active.length, completed: completed.length, overdue: overdue.length, today: today.length }
  }, [reminders])

  const filteredReminders = useMemo(() => {
    if (activeTab === "upcoming") return reminders.filter((r) => !r.completed)
    if (activeTab === "completed") return reminders.filter((r) => r.completed)
    return reminders
  }, [reminders, activeTab])

  function updateForm<Field extends keyof ReminderFormValues>(
    field: Field,
    value: ReminderFormValues[Field]
  ) {
    setForm((curr) => ({ ...curr, [field]: value }))
  }

  function openDialog() {
    setForm(getInitialReminderForm(invoices[0]?.id || ""))
    setDialogOpen(true)
  }

  function handleOpenChange(open: boolean) {
    setDialogOpen(open)
    if (!open) setForm(getInitialReminderForm())
  }

  async function createReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!userId) return

    setIsSaving(true)
    setErrorMessage(null)

    const payload: ReminderInsert = {
      user_id: userId,
      invoice_id: form.invoiceId,
      reminder_date: form.reminderDate,
      scheduled_for: toReminderTimestamp(form.reminderDate),
      reminder_type: form.reminderType.trim() || "Payment follow-up",
      contact_method: "Email",
      status: form.completed ? "Sent" : "Scheduled",
      sent_at: form.completed ? new Date().toISOString() : null,
      completed: form.completed,
      notes: nullableText(form.notes),
    }

    const { data, error } = await supabase
      .from("reminders")
      .insert(payload)
      .select()
      .single()

    if (error) {
      setErrorMessage(error.message)
      toast.error("Failed to create reminder")
    } else {
      setReminders((curr) => [...curr, data])
      handleOpenChange(false)
      toast.success("Reminder created")
    }

    setIsSaving(false)
  }

  async function markComplete(reminder: ReminderRow) {
    if (!userId) return
    setIsSaving(true)

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
      toast.error("Failed to update reminder")
    } else {
      setReminders((curr) =>
        curr.map((r) => (r.id === reminder.id ? data : r))
      )
      toast.success("Reminder marked complete")
    }

    setIsSaving(false)
  }

  async function deleteReminder(reminder: ReminderRow) {
    if (!userId) return
    setIsSaving(true)

    const { error } = await supabase
      .from("reminders")
      .delete()
      .eq("id", reminder.id)
      .eq("user_id", userId)

    if (error) {
      toast.error("Failed to delete reminder")
    } else {
      setReminders((curr) => curr.filter((r) => r.id !== reminder.id))
      toast.success("Reminder deleted")
    }

    setIsSaving(false)
  }

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: "upcoming", label: "Upcoming", count: stats.active },
    { id: "completed", label: "Completed", count: stats.completed },
    { id: "all", label: "All", count: stats.total },
  ]

  return (
    <>
      <PageHeader
        title="Reminders"
        description="Schedule follow-ups for overdue invoices and track them until resolved."
      >
        <Button
          onClick={openDialog}
          disabled={invoices.length === 0 || isSaving}
        >
          <Plus className="size-4" />
          Add reminder
        </Button>
      </PageHeader>

      <ReminderDialog
        open={dialogOpen}
        onOpenChange={handleOpenChange}
        title="Create reminder"
        description="Schedule a follow-up connected to an invoice."
        form={form}
        onFormChange={updateForm}
        onSubmit={createReminder}
        invoiceOptions={invoiceOptions}
        isSaving={isSaving}
      />

      <div className="grid gap-6 p-4 sm:p-6 lg:p-8">
        {errorMessage ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="font-medium">Error loading reminders</div>
            <p className="mt-1 leading-6">{errorMessage}</p>
          </div>
        ) : null}

        {/* Stats row */}
        {!isLoading && stats.total > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
                <CardDescription>Active reminders</CardDescription>
                <div className="rounded-lg bg-teal-50 p-2 text-teal-700">
                  <Bell className="size-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{stats.active}</div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {stats.total} total scheduled
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
                <CardDescription>Due today</CardDescription>
                <div className="rounded-lg bg-amber-50 p-2 text-amber-700">
                  <CalendarClock className="size-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{stats.today}</div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {stats.overdue} overdue
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
                <CardDescription>Completed</CardDescription>
                <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                  <CheckCircle2 className="size-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{stats.completed}</div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {stats.total > 0
                    ? `${Math.round((stats.completed / stats.total) * 100)}% completion rate`
                    : "No reminders yet"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
                <CardDescription>Invoices tracked</CardDescription>
                <div className="rounded-lg bg-sky-50 p-2 text-sky-700">
                  <Circle className="size-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {new Set(reminders.map((r) => r.invoice_id)).size}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  invoices with reminders
                </p>
              </CardContent>
            </Card>
          </div>
        ) : null}

        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Scheduled reminders</CardTitle>
                <CardDescription>
                  Follow-ups linked to invoices. Mark complete once you have
                  contacted the client.
                </CardDescription>
              </div>
              {stats.overdue > 0 ? (
                <Badge variant="warning">{stats.overdue} overdue</Badge>
              ) : null}
            </div>

            {/* Filter tabs */}
            {stats.total > 0 ? (
              <div className="grid w-full grid-cols-3 gap-1 rounded-lg border border-border bg-muted/40 p-1 sm:w-fit">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors sm:px-3 ${
                      activeTab === tab.id
                        ? "bg-background shadow-xs text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="truncate">{tab.label}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-xs ${
                        activeTab === tab.id
                          ? "bg-muted text-muted-foreground"
                          : "text-muted-foreground/60"
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-3 py-8 text-muted-foreground">
                <RefreshCw className="size-4 animate-spin" />
                <span className="text-sm">Loading reminders…</span>
              </div>
            ) : reminders.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
                <div className="mx-auto grid size-12 place-items-center rounded-lg bg-teal-50 text-teal-700">
                  <Bell className="size-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">
                  No reminders yet
                </h3>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                  {invoices.length === 0
                    ? "Add an invoice first so reminders can be linked to a specific balance."
                    : "Schedule follow-up reminders to keep overdue invoices from slipping through."}
                </p>
                {invoices.length > 0 ? (
                  <Button
                    className="mt-5"
                    onClick={openDialog}
                    disabled={isSaving}
                  >
                    <Plus className="size-4" />
                    Add first reminder
                  </Button>
                ) : (
                  <Button className="mt-5" asChild>
                    <a href="/dashboard/invoices">Add invoice first</a>
                  </Button>
                )}
              </div>
            ) : filteredReminders.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                {activeTab === "completed"
                  ? "No completed reminders yet. Mark follow-ups complete after contacting clients."
                  : "All reminders are complete. Add new ones to keep tracking."}
              </div>
            ) : (
              <ReminderList
                reminders={filteredReminders}
                invoiceById={invoiceById}
                emptyText="No reminders to show."
                isSaving={isSaving}
                onMarkComplete={(r) => void markComplete(r)}
                onDelete={(r) => void deleteReminder(r)}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
