"use client"

import type { ComponentProps, FormEvent, ReactNode } from "react"
import { CalendarClock, CheckCircle2, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Database } from "@/lib/supabase/database.types"
import { cn } from "@/lib/utils"

type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"]
type ReminderRow = Database["public"]["Tables"]["reminders"]["Row"]

export type ReminderFormValues = {
  invoiceId: string
  reminderDate: string
  reminderType: string
  notes: string
  completed: boolean
}

type InvoiceOption = Pick<
  InvoiceRow,
  "id" | "invoice_number" | "client_name" | "amount"
>

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

export function getTodayInputDate() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

export function getInitialReminderForm(
  invoiceId = ""
): ReminderFormValues {
  return {
    invoiceId,
    reminderDate: getTodayInputDate(),
    reminderType: "Payment follow-up",
    notes: "",
    completed: false,
  }
}

export function formatReminderDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  const today = new Date()
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  )
  const startOfReminder = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  )
  const dayDiff = Math.round(
    (startOfReminder.getTime() - startOfToday.getTime()) / 86_400_000
  )

  if (dayDiff === 0) {
    return "Today"
  }

  if (dayDiff === 1) {
    return "Tomorrow"
  }

  if (dayDiff < 0) {
    return `${Math.abs(dayDiff)} days late`
  }

  return dateFormatter.format(date)
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
} & Omit<ComponentProps<"select">, "onChange" | "value" | "children">) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export function ReminderDialog({
  open,
  onOpenChange,
  title,
  description,
  form,
  onFormChange,
  onSubmit,
  invoiceOptions,
  isSaving,
  submitLabel = "Create reminder",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  form: ReminderFormValues
  onFormChange: <Field extends keyof ReminderFormValues>(
    field: Field,
    value: ReminderFormValues[Field]
  ) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  invoiceOptions: InvoiceOption[]
  isSaving: boolean
  submitLabel?: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="reminder-invoice">Invoice</Label>
            <SelectField
              id="reminder-invoice"
              value={form.invoiceId}
              onChange={(value) => onFormChange("invoiceId", value)}
              required
            >
              <option value="" disabled>
                Select invoice
              </option>
              {invoiceOptions.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.invoice_number} - {invoice.client_name || "No client"}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="reminder-date">Reminder date</Label>
              <Input
                id="reminder-date"
                type="date"
                value={form.reminderDate}
                onChange={(event) =>
                  onFormChange("reminderDate", event.target.value)
                }
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reminder-type">Reminder type</Label>
              <Input
                id="reminder-type"
                value={form.reminderType}
                onChange={(event) =>
                  onFormChange("reminderType", event.target.value)
                }
                placeholder="Payment follow-up"
                required
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="reminder-notes">Notes</Label>
            <textarea
              id="reminder-notes"
              value={form.notes}
              onChange={(event) => onFormChange("notes", event.target.value)}
              placeholder="What should you remember before contacting this client?"
              className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <label className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <input
              type="checkbox"
              checked={form.completed}
              onChange={(event) =>
                onFormChange("completed", event.target.checked)
              }
              className="size-4"
            />
            Mark this reminder complete
          </label>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSaving}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSaving || !form.invoiceId}>
              {isSaving ? "Saving..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ReminderList({
  reminders,
  invoiceById,
  emptyText,
  isSaving = false,
  showInvoice = true,
  limit,
  onMarkComplete,
  onDelete,
}: {
  reminders: ReminderRow[]
  invoiceById: Map<string, InvoiceRow>
  emptyText: string
  isSaving?: boolean
  showInvoice?: boolean
  limit?: number
  onMarkComplete?: (reminder: ReminderRow) => void
  onDelete?: (reminder: ReminderRow) => void
}) {
  const sortedReminders = reminders
    .slice()
    .sort(
      (first, second) =>
        Number(first.completed) - Number(second.completed) ||
        new Date(`${first.reminder_date}T00:00:00`).getTime() -
          new Date(`${second.reminder_date}T00:00:00`).getTime()
    )
    .slice(0, limit)

  if (sortedReminders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        {emptyText}
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {sortedReminders.map((reminder) => {
        const invoice = invoiceById.get(reminder.invoice_id)

        return (
          <div
            key={reminder.id}
            className={cn(
              "rounded-lg border border-border p-3",
              reminder.completed && "bg-muted/40 opacity-75"
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={reminder.completed ? "success" : "muted"}>
                    {reminder.completed
                      ? "Complete"
                      : formatReminderDate(reminder.reminder_date)}
                  </Badge>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      reminder.completed && "line-through"
                    )}
                  >
                    {reminder.reminder_type}
                  </span>
                </div>
                {showInvoice ? (
                  <div className="mt-2 text-sm text-muted-foreground">
                    {invoice
                      ? `${invoice.invoice_number} - ${
                          invoice.client_name || "No client"
                        }`
                      : "Invoice unavailable"}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {!reminder.completed && onMarkComplete ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isSaving}
                    onClick={() => onMarkComplete(reminder)}
                  >
                    <CheckCircle2 className="size-3.5" />
                    Complete
                  </Button>
                ) : null}
                {onDelete ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={isSaving}
                    aria-label={`Delete reminder ${reminder.reminder_type}`}
                    onClick={() => onDelete(reminder)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </div>
            </div>
            {reminder.notes ? (
              <p
                className={cn(
                  "mt-2 text-sm leading-5 text-muted-foreground",
                  reminder.completed && "line-through"
                )}
              >
                {reminder.notes}
              </p>
            ) : null}
            {!reminder.completed ? (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarClock className="size-3.5" />
                Due {formatReminderDate(reminder.reminder_date)}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
