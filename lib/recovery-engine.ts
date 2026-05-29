import { money as moneyFormatter } from "@/lib/format-money"
import type { Database } from "@/lib/supabase/database.types"

type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"]
type RecoveryStage = Database["public"]["Enums"]["recovery_stage"]

// Application-level overdue stage, calculated from days overdue.
// Distinct from the DB recovery_stage enum (which tracks action history).
export type OverdueStage =
  | "not_due"
  | "friendly_reminder" // due today or 1–2 days overdue
  | "first_reminder" // 3–6 days overdue
  | "second_reminder" // 7–13 days overdue
  | "final_notice" // 14+ days overdue

export type RecoveryStatus =
  | "no_action"
  | "needs_approval"
  | "waiting_on_customer"
  | "resolved"

export type RecoveryRecommendation = {
  daysOverdue: number
  daysUntilDue: number
  isOverdue: boolean
  overdueStage: OverdueStage
  recoveryStage: RecoveryStage
  recommendedAction: string
  recommendedMessage: string
  nextReminderDate: string // YYYY-MM-DD
  recoveryStatus: RecoveryStatus
}

// ─── Date helpers ────────────────────────────────────────────────────────────

export function getOverdueDays(
  dueDate: string | null,
  isPaid: boolean
): number {
  if (!dueDate || isPaid) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${dueDate}T00:00:00`)
  const diff = today.getTime() - due.getTime()
  return Math.max(0, Math.floor(diff / 86_400_000))
}

export function getDaysUntilDue(dueDate: string | null): number {
  if (!dueDate) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${dueDate}T00:00:00`)
  return Math.floor((due.getTime() - today.getTime()) / 86_400_000)
}

function addDaysToToday(days: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ─── Stage mapping ───────────────────────────────────────────────────────────

export function getOverdueStage(daysOverdue: number): OverdueStage {
  if (daysOverdue <= 0) return "not_due"
  if (daysOverdue <= 2) return "friendly_reminder"
  if (daysOverdue <= 6) return "first_reminder"
  if (daysOverdue <= 13) return "second_reminder"
  return "final_notice"
}

export function overdueStageToRecoveryStage(
  stage: OverdueStage
): RecoveryStage {
  const map: Record<OverdueStage, RecoveryStage> = {
    not_due: "newly_overdue",
    friendly_reminder: "newly_overdue",
    first_reminder: "first_follow_up",
    second_reminder: "second_follow_up",
    final_notice: "final_notice",
  }
  return map[stage]
}

export function getNextReminderDate(daysOverdue: number): string {
  if (daysOverdue <= 2) return addDaysToToday(3)
  if (daysOverdue <= 6) return addDaysToToday(4)
  return addDaysToToday(7)
}

// ─── Copy generation ─────────────────────────────────────────────────────────

export function getRecommendedAction(overdueStage: OverdueStage): string {
  switch (overdueStage) {
    case "not_due":
      return "No follow-up needed yet."
    case "friendly_reminder":
      return "Send a friendly payment reminder."
    case "first_reminder":
      return "Send the first payment reminder."
    case "second_reminder":
      return "Send a firmer follow-up message."
    case "final_notice":
      return "Send a final notice — or escalate to owner review."
  }
}

export function generateFollowUpMessage(params: {
  clientName: string
  invoiceNumber: string
  amount: number
  daysOverdue: number
  overdueStage: OverdueStage
}): string {
  const { clientName, invoiceNumber, amount, daysOverdue, overdueStage } =
    params
  const fmt = moneyFormatter.format(amount)
  const name = clientName || "there"

  switch (overdueStage) {
    case "friendly_reminder":
      return `Hi ${name}, just a friendly reminder that invoice ${invoiceNumber} for ${fmt} is now due. Please let me know when payment will be sent. Thank you!`

    case "first_reminder":
      return `Hi ${name}, following up on invoice ${invoiceNumber} for ${fmt}. This invoice is now ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue. Could you let me know when we can expect payment? Thanks.`

    case "second_reminder":
      return `Hi ${name}, I'm following up again on invoice ${invoiceNumber} for ${fmt}, which is now ${daysOverdue} days overdue. Please send payment or let me know if there's anything holding this up — I'd appreciate a firm date.`

    case "final_notice":
      return `Hi ${name}, this is a final notice for invoice ${invoiceNumber} for ${fmt}, which is now ${daysOverdue} days past due. Please make payment immediately or contact us to discuss. Continued non-payment may require us to take further action.`

    default:
      return `Hi ${name}, just following up on invoice ${invoiceNumber} for ${fmt}. Please let me know when payment will be sent. Thank you!`
  }
}

export function getFollowUpSubtext(overdueStage: OverdueStage): string {
  switch (overdueStage) {
    case "friendly_reminder":
      return "This invoice just became due. Review the message below before it goes out."
    case "first_reminder":
      return "First payment reminder ready. Review and approve before sending."
    case "second_reminder":
      return "This invoice is still unpaid. We drafted a firmer follow-up for your approval."
    case "final_notice":
      return "Time for a firm message. Review the final notice below before approving."
    default:
      return "Review the draft message below before it goes out."
  }
}

export function getFollowUpActionText(recoveryStage: RecoveryStage): string {
  const map: Record<RecoveryStage, string> = {
    newly_overdue: "Friendly reminder sent. Follow up again in 3–5 days if no response.",
    first_follow_up: "First follow-up sent. Wait for client response.",
    second_follow_up: "Second follow-up sent. Prepare final notice if still unpaid.",
    final_notice: "Final notice sent. Review before escalation.",
    escalated: "Escalation logged. Keep owner review active.",
    resolved: "Invoice resolved. No follow-up needed.",
  }
  return map[recoveryStage] ?? "Follow-up logged."
}

// ─── Recovery item message generation ───────────────────────────────────────

type RecoveryItemReason =
  | "estimate_no_reply"
  | "invoice_overdue"
  | "maybe_later"
  | "work_not_paid"
  | "other"

export function generateRecoveryItemMessage(params: {
  clientName: string
  reason: RecoveryItemReason
  amount: number
  followUpCount?: number
}): string {
  const { clientName, reason, amount, followUpCount = 0 } = params
  const fmt = moneyFormatter.format(amount)
  const name = clientName || "there"
  const isFollowUp = followUpCount > 0

  if (isFollowUp) {
    switch (reason) {
      case "estimate_no_reply":
        return `Hi ${name}, I'm reaching out again about the estimate for ${fmt}. I'd love to get this scheduled for you — could you let me know where you're at? Even a quick reply helps. Thanks.`
      case "invoice_overdue":
        return `Hi ${name}, I'm following up again on the outstanding balance of ${fmt}. I'd really appreciate hearing from you — please let me know when we can sort this out. Thanks.`
      case "maybe_later":
        return `Hi ${name}, checking in again on the ${fmt} project. I want to make sure I have availability when you're ready. Just a quick yes or no would help me plan. Thanks!`
      case "work_not_paid":
        return `Hi ${name}, I need to follow up again on the ${fmt} that's still outstanding for work already completed. Please let me know when this will be settled. Thanks.`
      default:
        return `Hi ${name}, following up again. The ${fmt} is still pending — could you give me an update? Thanks.`
    }
  }

  switch (reason) {
    case "estimate_no_reply":
      return `Hi ${name}, just following up on the estimate I sent you for ${fmt}. Are you ready to move forward, or do you have any questions? I'm happy to adjust scope if needed. Thanks!`
    case "invoice_overdue":
      return `Hi ${name}, following up on the invoice for ${fmt} that's now overdue. Could you let me know when payment will be sent? If there's anything holding it up, I'm happy to talk through options. Thanks.`
    case "maybe_later":
      return `Hi ${name}, you mentioned wanting to revisit this project later. Just checking back in — are you ready to move forward on the ${fmt} project? I have availability coming up. Thanks!`
    case "work_not_paid":
      return `Hi ${name}, reaching out about the work completed — ${fmt} is still outstanding. Could you let me know when I can expect payment? Thanks.`
    default:
      return `Hi ${name}, just following up on our conversation regarding ${fmt}. Please let me know the best next step. Thanks.`
  }
}

export function reasonLabel(
  reason: RecoveryItemReason
): string {
  switch (reason) {
    case "estimate_no_reply":
      return "Estimate · No reply"
    case "invoice_overdue":
      return "Invoice · Overdue"
    case "maybe_later":
      return "Said maybe later"
    case "work_not_paid":
      return "Work done · Unpaid"
    default:
      return "Follow-up needed"
  }
}

// ─── Invoice filtering ───────────────────────────────────────────────────────

export function isRecoverableInvoice(invoice: InvoiceRow): boolean {
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

// ─── Main recommendation function ────────────────────────────────────────────

export function getRecoveryRecommendation(
  invoice: InvoiceRow,
  waitingOnCustomer = false
): RecoveryRecommendation {
  const isPaid = invoice.status === "Paid"

  if (isPaid) {
    return {
      daysOverdue: 0,
      daysUntilDue: 0,
      isOverdue: false,
      overdueStage: "not_due",
      recoveryStage: "resolved",
      recommendedAction: "Invoice is paid.",
      recommendedMessage: "",
      nextReminderDate: "",
      recoveryStatus: "resolved",
    }
  }

  const daysOverdue = getOverdueDays(invoice.due_date, false)
  const daysUntilDue = getDaysUntilDue(invoice.due_date)
  const isOverdue = daysOverdue > 0

  // Escalated invoices always show as needs_approval
  if (invoice.status === "Escalated") {
    const message = generateFollowUpMessage({
      clientName: invoice.client_name ?? "there",
      invoiceNumber: invoice.invoice_number,
      amount: invoice.amount,
      daysOverdue: Math.max(daysOverdue, 1),
      overdueStage: "final_notice",
    })
    return {
      daysOverdue,
      daysUntilDue: isOverdue ? -daysOverdue : daysUntilDue,
      isOverdue,
      overdueStage: "final_notice",
      recoveryStage: "escalated",
      recommendedAction: "Send a firm payment reminder or escalate to owner review.",
      recommendedMessage: message,
      nextReminderDate: getNextReminderDate(daysOverdue),
      recoveryStatus: "needs_approval",
    }
  }

  if (waitingOnCustomer) {
    const overdueStage = getOverdueStage(daysOverdue)
    return {
      daysOverdue,
      daysUntilDue: isOverdue ? -daysOverdue : daysUntilDue,
      isOverdue,
      overdueStage,
      recoveryStage: overdueStageToRecoveryStage(overdueStage),
      recommendedAction: "Follow-up sent. Waiting for customer response.",
      recommendedMessage: "",
      nextReminderDate: getNextReminderDate(daysOverdue),
      recoveryStatus: "waiting_on_customer",
    }
  }

  if (!isOverdue) {
    return {
      daysOverdue: 0,
      daysUntilDue,
      isOverdue: false,
      overdueStage: "not_due",
      recoveryStage: "newly_overdue",
      recommendedAction: "Invoice sent. No follow-up needed yet.",
      recommendedMessage: "",
      nextReminderDate: invoice.due_date ?? "",
      recoveryStatus: "no_action",
    }
  }

  const overdueStage = getOverdueStage(daysOverdue)
  const recoveryStage = overdueStageToRecoveryStage(overdueStage)
  const message = generateFollowUpMessage({
    clientName: invoice.client_name ?? "there",
    invoiceNumber: invoice.invoice_number,
    amount: invoice.amount,
    daysOverdue,
    overdueStage,
  })

  return {
    daysOverdue,
    daysUntilDue: -daysOverdue,
    isOverdue: true,
    overdueStage,
    recoveryStage,
    recommendedAction: getRecommendedAction(overdueStage),
    recommendedMessage: message,
    nextReminderDate: getNextReminderDate(daysOverdue),
    recoveryStatus: "needs_approval",
  }
}
