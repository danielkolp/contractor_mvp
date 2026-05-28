import type { Database } from "@/lib/supabase/database.types"
import { getOverdueDays } from "@/lib/recovery-engine"

type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"]
type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"]
type ClientRow = Database["public"]["Tables"]["clients"]["Row"]
type RecoveryDraftRow = Database["public"]["Tables"]["recovery_drafts"]["Row"]
type ReminderRow = Database["public"]["Tables"]["reminders"]["Row"]

export type RecoveryState =
  | "paid"
  | "not_due"
  | "due_today"
  | "needs_followup"      // overdue, no active approval draft
  | "needs_approval"      // has draft in needs_approval / draft status
  | "waiting_on_customer" // has draft in sent / waiting_on_customer status
  | "disputed"            // invoice status is Escalated

export type RecoveryQueueItem = {
  invoiceId: string
  invoiceNumber: string
  clientName: string
  clientId: string | null
  client: ClientRow | null
  invoice: InvoiceRow
  draft: RecoveryDraftRow | null
  amount: number
  dueDate: string | null
  daysOverdue: number
  state: RecoveryState
  urgencyLabel: string
  primaryActionLabel: string
  explanation: string
}

export type EstimateFollowUpQueueItem = {
  kind: "estimate"
  id: string
  estimateId: string
  estimateNumber: string
  clientName: string
  clientId: string | null
  client: ClientRow | null
  estimate: EstimateRow
  amount: number
  sentDate: string
  followUpDate: string | null
  daysSinceSent: number
  daysPastFollowUp: number
  state: "estimate_followup"
  urgencyLabel: string
  primaryActionLabel: string
  explanation: string
  message: string
}

export type InvoiceFollowUpQueueItem = RecoveryQueueItem & {
  kind: "invoice"
  id: string
}

export type FollowUpQueueItem =
  | EstimateFollowUpQueueItem
  | InvoiceFollowUpQueueItem

const APPROVAL_STATUSES = new Set(["needs_approval", "draft"])
const WAITING_STATUSES = new Set(["sent", "waiting_on_customer"])
const FINAL_STATUSES = new Set(["resolved", "cancelled"])
const CLOSED_ESTIMATE_STATUSES = new Set(["Won", "Lost", "Archived", "Draft"])

const STATE_ORDER: Record<RecoveryState, number> = {
  needs_approval: 0,
  needs_followup: 1,
  disputed: 2,
  due_today: 3,
  waiting_on_customer: 4,
  paid: 5,
  not_due: 6,
}

function isDueToday(dueDate: string | null): boolean {
  if (!dueDate) return false
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  return dueDate === today
}

function inputDate(offsetDays = 0): string {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offsetDays)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function dateDiffFromToday(value: string | null): number {
  if (!value) return 0
  const today = new Date(`${inputDate()}T00:00:00`)
  const date = new Date(`${value}T00:00:00`)
  return Math.floor((today.getTime() - date.getTime()) / 86_400_000)
}

function isOverdueInvoice(invoice: InvoiceRow): boolean {
  if (invoice.status === "Paid" || invoice.status === "Draft") return false
  if (
    invoice.status === "Overdue" ||
    invoice.status === "Follow-up Sent" ||
    invoice.status === "Payment Plan" ||
    invoice.status === "Escalated"
  )
    return true
  return getOverdueDays(invoice.due_date, false) > 0
}

function classifyState(
  invoice: InvoiceRow,
  activeDraft: RecoveryDraftRow | null
): RecoveryState {
  if (invoice.status === "Paid") return "paid"
  if (invoice.status === "Draft") return "not_due"

  if (activeDraft) {
    const status = activeDraft.status.trim().toLowerCase()
    if (WAITING_STATUSES.has(status)) return "waiting_on_customer"
    if (APPROVAL_STATUSES.has(status)) return "needs_approval"
  }

  if (invoice.status === "Escalated") return "disputed"
  if (isOverdueInvoice(invoice)) return "needs_followup"
  if (isDueToday(invoice.due_date)) return "due_today"
  return "not_due"
}

function getUrgencyLabel(state: RecoveryState, daysOverdue: number): string {
  switch (state) {
    case "needs_followup":
      if (daysOverdue >= 30) return "Urgent"
      if (daysOverdue >= 14) return "Overdue"
      return "Follow up"
    case "needs_approval":
      return "Needs approval"
    case "waiting_on_customer":
      return "Waiting"
    case "due_today":
      return "Due today"
    case "disputed":
      return "Escalated"
    default:
      return ""
  }
}

function getPrimaryActionLabel(
  state: RecoveryState,
  hasDraft: boolean
): string {
  switch (state) {
    case "needs_followup":
      return hasDraft ? "Review message" : "Generate follow-up"
    case "needs_approval":
      return "Review message"
    case "waiting_on_customer":
      return "Check in"
    case "due_today":
      return "Send reminder"
    case "disputed":
      return "Review dispute"
    default:
      return "View invoice"
  }
}

function getExplanation(
  state: RecoveryState,
  invoice: InvoiceRow,
  daysOverdue: number
): string {
  const clientName = invoice.client_name || "the client"
  const num = invoice.invoice_number

  switch (state) {
    case "needs_followup":
      return daysOverdue > 0
        ? `${num} is ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue. Send a follow-up message to ${clientName}.`
        : `${num} needs a follow-up. Contact ${clientName} to request payment.`
    case "needs_approval":
      return `A follow-up draft is ready for ${clientName}. Review and approve before sending.`
    case "waiting_on_customer":
      return `A message was sent to ${clientName}. Waiting for their response.`
    case "due_today":
      return `${num} is due today. Consider sending a friendly reminder.`
    case "disputed":
      return `${clientName} has flagged a dispute on ${num}. Review and escalate if needed.`
    default:
      return ""
  }
}

function getClientName(
  invoice: InvoiceRow,
  client: ClientRow | null
): string {
  return client?.company || client?.name || invoice.client_name || "No client"
}

function getEstimateClientName(
  estimate: EstimateRow,
  client: ClientRow | null
): string {
  return client?.company || client?.name || estimate.client_name || "No client"
}

export function generateEstimateFollowUpMessage({
  clientName,
  estimateNumber,
  amount,
  daysSinceSent,
}: {
  clientName: string
  estimateNumber: string
  amount: number
  daysSinceSent: number
}): string {
  const moneyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  })
  const sentCopy =
    daysSinceSent > 0
      ? ` I sent it ${daysSinceSent} day${daysSinceSent === 1 ? "" : "s"} ago.`
      : ""

  return `Hi ${clientName || "there"}, just following up on estimate ${estimateNumber} for ${moneyFormatter.format(amount)}.${sentCopy} Would you like to move forward, or is there anything you want me to adjust? Thanks.`
}

function shouldFollowUpEstimate(estimate: EstimateRow): boolean {
  if (CLOSED_ESTIMATE_STATUSES.has(estimate.status)) return false

  const daysSinceSent = dateDiffFromToday(estimate.sent_date)
  const followUpDue =
    estimate.follow_up_date !== null && dateDiffFromToday(estimate.follow_up_date) >= 0

  if (estimate.status === "Follow-up Needed") return true
  if (estimate.status === "Interested" && followUpDue) return true
  if (estimate.status === "Sent") return followUpDue || daysSinceSent >= 3
  if (estimate.status === "Follow-up Sent") return followUpDue

  return false
}

function draftPriority(status: string): number {
  const s = status.trim().toLowerCase()
  if (s === "needs_approval") return 0
  if (s === "draft") return 1
  if (s === "approved") return 2
  if (s === "sent" || s === "waiting_on_customer") return 3
  return 4
}

export function buildRecoveryQueue({
  invoices,
  clients,
  recoveryDrafts,
}: {
  invoices: InvoiceRow[]
  clients: ClientRow[]
  recoveryDrafts: RecoveryDraftRow[]
}): RecoveryQueueItem[] {
  const clientById = new Map(clients.map((c) => [c.id, c]))

  // Best active draft per invoice (lowest priority number wins)
  const activeDraftByInvoice = new Map<string, RecoveryDraftRow>()
  for (const draft of recoveryDrafts) {
    const status = draft.status.trim().toLowerCase()
    if (FINAL_STATUSES.has(status)) continue
    const existing = activeDraftByInvoice.get(draft.invoice_id)
    if (
      !existing ||
      draftPriority(status) < draftPriority(existing.status)
    ) {
      activeDraftByInvoice.set(draft.invoice_id, draft)
    }
  }

  const items: RecoveryQueueItem[] = []

  for (const invoice of invoices) {
    if (invoice.status === "Draft") continue

    const client = invoice.client_id
      ? (clientById.get(invoice.client_id) ?? null)
      : null
    const clientName = getClientName(invoice, client)
    const activeDraft = activeDraftByInvoice.get(invoice.id) ?? null
    const daysOverdue = getOverdueDays(invoice.due_date, invoice.status === "Paid")
    const state = classifyState(invoice, activeDraft)

    if (state === "paid" || state === "not_due") continue

    items.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      clientName,
      clientId: invoice.client_id ?? null,
      client,
      invoice,
      draft: activeDraft,
      amount: invoice.amount,
      dueDate: invoice.due_date,
      daysOverdue,
      state,
      urgencyLabel: getUrgencyLabel(state, daysOverdue),
      primaryActionLabel: getPrimaryActionLabel(state, activeDraft !== null),
      explanation: getExplanation(state, invoice, daysOverdue),
    })
  }

  return items.sort((a, b) => {
    const orderDiff = STATE_ORDER[a.state] - STATE_ORDER[b.state]
    if (orderDiff !== 0) return orderDiff
    return b.daysOverdue - a.daysOverdue
  })
}

export function buildFollowUpQueue({
  estimates,
  invoices,
  clients,
  recoveryDrafts,
  reminders,
}: {
  estimates: EstimateRow[]
  invoices: InvoiceRow[]
  clients: ClientRow[]
  recoveryDrafts: RecoveryDraftRow[]
  reminders: ReminderRow[]
}): FollowUpQueueItem[] {
  const clientById = new Map(clients.map((client) => [client.id, client]))
  const dueReminderInvoiceIds = new Set(
    reminders
      .filter(
        (reminder) =>
          !reminder.completed && dateDiffFromToday(reminder.reminder_date) >= 0
      )
      .map((reminder) => reminder.invoice_id)
  )

  const estimateItems: EstimateFollowUpQueueItem[] = estimates
    .filter(shouldFollowUpEstimate)
    .map((estimate) => {
      const client = estimate.client_id
        ? clientById.get(estimate.client_id) ?? null
        : null
      const clientName = getEstimateClientName(estimate, client)
      const daysSinceSent = Math.max(0, dateDiffFromToday(estimate.sent_date))
      const daysPastFollowUp = Math.max(
        0,
        dateDiffFromToday(estimate.follow_up_date)
      )

      return {
        kind: "estimate",
        id: `estimate:${estimate.id}`,
        estimateId: estimate.id,
        estimateNumber: estimate.estimate_number,
        clientName,
        clientId: estimate.client_id,
        client,
        estimate,
        amount: estimate.amount,
        sentDate: estimate.sent_date,
        followUpDate: estimate.follow_up_date,
        daysSinceSent,
        daysPastFollowUp,
        state: "estimate_followup",
        urgencyLabel:
          daysPastFollowUp > 0
            ? "Overdue"
            : estimate.follow_up_date
              ? "Due today"
              : "Follow up",
        primaryActionLabel: "Follow up",
        explanation: `${estimate.estimate_number} was sent ${daysSinceSent} day${daysSinceSent === 1 ? "" : "s"} ago for ${new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(estimate.amount)}. Ask if they want to move forward.`,
        message: generateEstimateFollowUpMessage({
          clientName,
          estimateNumber: estimate.estimate_number,
          amount: estimate.amount,
          daysSinceSent,
        }),
      }
    })

  const invoiceItems: InvoiceFollowUpQueueItem[] = buildRecoveryQueue({
    invoices,
    clients,
    recoveryDrafts,
  }).map((item) => ({ ...item, kind: "invoice", id: `invoice:${item.invoiceId}` }))

  const reminderOnlyInvoiceItems: InvoiceFollowUpQueueItem[] = invoices
    .filter((invoice) => {
      if (!dueReminderInvoiceIds.has(invoice.id)) return false
      if (invoice.status === "Paid" || invoice.status === "Draft") return false
      return !invoiceItems.some((item) => item.invoiceId === invoice.id)
    })
    .map((invoice) => {
      const client = invoice.client_id
        ? clientById.get(invoice.client_id) ?? null
        : null
      const clientName = getClientName(invoice, client)
      const daysOverdue = getOverdueDays(invoice.due_date, invoice.status === "Paid")
      return {
        kind: "invoice",
        id: `invoice:${invoice.id}`,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        clientName,
        clientId: invoice.client_id,
        client,
        invoice,
        draft: null,
        amount: invoice.amount,
        dueDate: invoice.due_date,
        daysOverdue,
        state: "needs_followup",
        urgencyLabel: daysOverdue > 0 ? "Overdue" : "Due today",
        primaryActionLabel: "Check payment",
        explanation:
          daysOverdue > 0
            ? `${invoice.invoice_number} is ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue. Check whether ${clientName} has paid.`
            : `${invoice.invoice_number} has a follow-up reminder due today. Check whether ${clientName} has paid.`,
      }
    })

  return [...estimateItems, ...invoiceItems, ...reminderOnlyInvoiceItems].sort(
    (first, second) => {
      const priority = (item: FollowUpQueueItem) => {
        if (item.kind === "estimate") {
          if (item.daysPastFollowUp > 0) return 0
          return 1
        }
        if (item.state === "needs_approval") return 0
        if (item.state === "needs_followup") return 1
        if (item.state === "due_today") return 2
        if (item.state === "waiting_on_customer") return 3
        return 4
      }

      const priorityDiff = priority(first) - priority(second)
      if (priorityDiff !== 0) return priorityDiff

      const firstAge =
        first.kind === "estimate" ? first.daysSinceSent : first.daysOverdue
      const secondAge =
        second.kind === "estimate" ? second.daysSinceSent : second.daysOverdue
      return secondAge - firstAge
    }
  )
}
