"use client"

import { useState } from "react"
import {
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  ThumbsDown,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { reasonLabel } from "@/lib/recovery-engine"
import { money } from "@/lib/format-money"
import type { Database } from "@/lib/supabase/database.types"
import { cn } from "@/lib/utils"

type RecoveryItem = Database["public"]["Tables"]["recovery_items"]["Row"]
type RecoveryItemReason = RecoveryItem["reason"]

function relativeDate(iso: string | null): string {
  if (!iso) return ""
  const diff = Math.floor(
    (Date.now() - new Date(`${iso}T00:00:00`).getTime()) / 86_400_000
  )
  if (diff === 0) return "today"
  if (diff === 1) return "yesterday"
  if (diff < 7) return `${diff} days ago`
  if (diff < 30) return `${Math.floor(diff / 7)} week${Math.floor(diff / 7) === 1 ? "" : "s"} ago`
  return `${Math.floor(diff / 30)} month${Math.floor(diff / 30) === 1 ? "" : "s"} ago`
}

function sourceTypeLabel(reason: RecoveryItemReason | null): string {
  switch (reason) {
    case "invoice_overdue": return "Invoice"
    case "estimate_no_reply": return "Estimate"
    case "work_not_paid": return "Unpaid job"
    case "maybe_later": return "Prospect"
    default: return "Other"
  }
}

function suggestedNextStep(status: RecoveryItem["status"], followUpCount: number): string {
  if (status === "needs_follow_up") {
    if (followUpCount === 0) return "Review the message below and send it when ready."
    return "A new follow-up message is ready. Review and send."
  }
  if (status === "message_ready") {
    return "Copy the message and send it, then log it as sent."
  }
  return "Follow up with this customer."
}

function StatusPill({ status, isCheckIn }: { status: RecoveryItem["status"]; isCheckIn: boolean }) {
  if (isCheckIn) {
    return (
      <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200">
        Check-in due
      </Badge>
    )
  }
  switch (status) {
    case "needs_follow_up":
      return (
        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          Needs follow-up
        </Badge>
      )
    case "message_ready":
      return (
        <Badge variant="outline" className="border-green-200 bg-green-50 text-green-800 dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-200">
          Message ready
        </Badge>
      )
    case "sent":
    case "waiting":
      return (
        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200">
          Waiting for reply
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground">
          {status.replace(/_/g, " ")}
        </Badge>
      )
  }
}

// ─── Standard card (needs_follow_up / message_ready) ─────────────────────────

function StandardCard({
  item,
  isSaving,
  onMarkSent,
  onRemindLater,
  onResolve,
  onLost,
}: {
  item: RecoveryItem
  isSaving: boolean
  onMarkSent: (item: RecoveryItem) => void
  onRemindLater: (item: RecoveryItem) => void
  onResolve: (item: RecoveryItem) => void
  onLost: (item: RecoveryItem) => void
}) {
  const isMessageReady = item.status === "message_ready"
  const [msgOpen, setMsgOpen] = useState(isMessageReady)
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (!item.message_body) return
    await navigator.clipboard.writeText(item.message_body)
    setCopied(true)
    toast.success("Message copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleCopyAndMarkSent() {
    await handleCopy()
    onMarkSent(item)
  }

  const accentColor = isMessageReady
    ? "before:bg-green-500"
    : "before:bg-amber-400"

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md",
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
        accentColor
      )}
    >
      <div className="flex flex-col gap-4 py-4 pl-5 pr-4">
        {/* Header: status pill + amount */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={item.status} isCheckIn={false} />
            <span className="text-xs text-muted-foreground">
              {sourceTypeLabel(item.reason as RecoveryItemReason)}
              {item.contacted_date ? ` · ${relativeDate(item.contacted_date)}` : ""}
            </span>
          </div>
          <div className="shrink-0 text-right">
            <span className="text-xl font-bold tabular-nums text-foreground">
              {money.format(item.amount)}
            </span>
          </div>
        </div>

        {/* Customer info */}
        <div className="-mt-2">
          <p className="text-base font-semibold leading-snug text-foreground">
            {item.client_name}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {reasonLabel(item.reason as RecoveryItemReason)}
            {item.client_email || item.client_phone
              ? ` · ${item.client_email ?? item.client_phone}`
              : ""}
          </p>
        </div>

        {/* Suggested next step */}
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">Suggested: </span>
          {suggestedNextStep(item.status, item.follow_up_count)}
        </p>

        {/* Message preview */}
        {item.message_body ? (
          <div className="rounded-lg border border-border bg-muted/20">
            <button
              type="button"
              onClick={() => setMsgOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <span>Follow-up message</span>
              {msgOpen ? (
                <ChevronUp className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </button>
            {msgOpen && (
              <div className="border-t border-border px-3 pb-3 pt-2 text-sm leading-6 text-foreground">
                {item.message_body}
              </div>
            )}
          </div>
        ) : null}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Primary action */}
          {isMessageReady ? (
            <Button
              size="sm"
              className="gap-1.5 bg-green-700 text-white hover:bg-green-800"
              onClick={() => void handleCopyAndMarkSent()}
              disabled={isSaving}
            >
              {copied ? (
                <Check className="size-3.5" />
              ) : (
                <ClipboardCopy className="size-3.5" />
              )}
              {copied ? "Copied — mark sent?" : "Copy & mark sent"}
            </Button>
          ) : (
            <Button
              size="sm"
              className="gap-1.5 bg-green-700 text-white hover:bg-green-800"
              onClick={() => setMsgOpen(true)}
              disabled={isSaving}
            >
              Review message
            </Button>
          )}

          {/* Copy alone when message_ready */}
          {isMessageReady && item.message_body && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleCopy()}
              disabled={isSaving}
              className="gap-1.5"
            >
              {copied ? (
                <Check className="size-3.5 text-green-600" />
              ) : (
                <ClipboardCopy className="size-3.5" />
              )}
              {copied ? "Copied" : "Copy only"}
            </Button>
          )}

          {/* Mark sent standalone */}
          {!isMessageReady && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onMarkSent(item)}
              disabled={isSaving}
              className="gap-1.5"
            >
              Mark sent
            </Button>
          )}

          {/* Overflow secondary actions */}
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="size-8 p-0 text-muted-foreground"
                  disabled={isSaving}
                  aria-label="More actions"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => onMarkSent(item)}>
                  <Pencil className="mr-2 size-3.5" />
                  Mark sent
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onRemindLater(item)}>
                  <Bell className="mr-2 size-3.5" />
                  Remind later
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onResolve(item)}>
                  <CheckCircle2 className="mr-2 size-3.5" />
                  Mark resolved
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onLost(item)}
                  className="text-muted-foreground"
                >
                  <ThumbsDown className="mr-2 size-3.5" />
                  Mark lost
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Check-in card (sent with check_back_date passed) ────────────────────────

function CheckInCard({
  item,
  isSaving,
  onPaid,
  onFollowUpAgain,
  onNoResponse,
  onNotInterested,
  onRemindLater,
}: {
  item: RecoveryItem
  isSaving: boolean
  onPaid: (item: RecoveryItem) => void
  onFollowUpAgain: (item: RecoveryItem) => void
  onNoResponse: (item: RecoveryItem) => void
  onNotInterested: (item: RecoveryItem) => void
  onRemindLater: (item: RecoveryItem) => void
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border-2 border-sky-200 bg-sky-50/30 shadow-sm transition-shadow hover:shadow-md dark:border-sky-900/50 dark:bg-sky-950/10 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-sky-400">
      <div className="flex flex-col gap-4 py-4 pl-5 pr-4">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={item.status} isCheckIn />
            <span className="text-xs text-muted-foreground">
              {sourceTypeLabel(item.reason as RecoveryItemReason)}
              {item.contacted_date ? ` · sent ${relativeDate(item.contacted_date)}` : ""}
            </span>
          </div>
          <span className="shrink-0 text-xl font-bold tabular-nums text-foreground">
            {money.format(item.amount)}
          </span>
        </div>

        {/* Question */}
        <div className="-mt-2">
          <p className="text-base font-semibold leading-snug">
            Did {item.client_name} respond?
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {reasonLabel(item.reason as RecoveryItemReason)}
            {item.client_email || item.client_phone
              ? ` · ${item.client_email ?? item.client_phone}`
              : ""}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Primary */}
          <Button
            size="sm"
            className="gap-1.5 bg-green-700 text-white hover:bg-green-800"
            onClick={() => onPaid(item)}
            disabled={isSaving}
          >
            <CheckCircle2 className="size-3.5" />
            Paid / Booked
          </Button>

          {/* Secondary */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => onFollowUpAgain(item)}
            disabled={isSaving}
            className="gap-1.5"
          >
            <RefreshCw className="size-3.5" />
            Follow up again
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => onNoResponse(item)}
            disabled={isSaving}
          >
            No response
          </Button>

          {/* Overflow */}
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="size-8 p-0 text-muted-foreground"
                  disabled={isSaving}
                  aria-label="More actions"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => onRemindLater(item)}>
                  <Bell className="mr-2 size-3.5" />
                  Remind me later
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onNotInterested(item)}
                  className="text-muted-foreground"
                >
                  <ThumbsDown className="mr-2 size-3.5" />
                  Not interested
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Waiting card (sent, check-in not yet due) ────────────────────────────────

function WaitingCard({
  item,
  isSaving,
  onMarkSent,
  onRemindLater,
  onResolve,
  onLost,
}: {
  item: RecoveryItem
  isSaving: boolean
  onMarkSent: (item: RecoveryItem) => void
  onRemindLater: (item: RecoveryItem) => void
  onResolve: (item: RecoveryItem) => void
  onLost: (item: RecoveryItem) => void
}) {
  const checkBackFormatted = item.check_back_date
    ? new Date(`${item.check_back_date}T00:00:00`).toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
      })
    : null

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card opacity-80 shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-blue-300 dark:before:bg-blue-700">
      <div className="flex flex-col gap-3 py-4 pl-5 pr-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={item.status} isCheckIn={false} />
              <span className="text-xs text-muted-foreground">
                {sourceTypeLabel(item.reason as RecoveryItemReason)}
                {checkBackFormatted ? ` · check in ${checkBackFormatted}` : ""}
              </span>
            </div>
            <p className="mt-1.5 font-semibold text-foreground">
              {item.client_name}
            </p>
            <p className="text-sm text-muted-foreground">
              {money.format(item.amount)} · {reasonLabel(item.reason as RecoveryItemReason)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="size-8 p-0 text-muted-foreground"
                disabled={isSaving}
                aria-label="More actions"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => onMarkSent(item)}>
                <Bell className="mr-2 size-3.5" />
                Reschedule check-in
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onResolve(item)}>
                <CheckCircle2 className="mr-2 size-3.5" />
                Mark resolved
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onLost(item)}
                className="text-muted-foreground"
              >
                <ThumbsDown className="mr-2 size-3.5" />
                Mark lost
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

// ─── Public composite component ───────────────────────────────────────────────

export function RecoveryCard({
  item,
  isCheckIn,
  isWaiting,
  isSaving,
  onMarkSent,
  onRemindLater,
  onResolve,
  onLost,
  onPaid,
  onFollowUpAgain,
  onNoResponse,
}: {
  item: RecoveryItem
  isCheckIn: boolean
  isWaiting?: boolean
  isSaving: boolean
  onMarkSent: (item: RecoveryItem) => void
  onRemindLater: (item: RecoveryItem) => void
  onResolve: (item: RecoveryItem) => void
  onLost: (item: RecoveryItem) => void
  onPaid: (item: RecoveryItem) => void
  onFollowUpAgain: (item: RecoveryItem) => void
  onNoResponse: (item: RecoveryItem) => void
}) {
  if (isCheckIn) {
    return (
      <CheckInCard
        item={item}
        isSaving={isSaving}
        onPaid={onPaid}
        onFollowUpAgain={onFollowUpAgain}
        onNoResponse={onNoResponse}
        onNotInterested={onLost}
        onRemindLater={onRemindLater}
      />
    )
  }

  if (isWaiting) {
    return (
      <WaitingCard
        item={item}
        isSaving={isSaving}
        onMarkSent={onMarkSent}
        onRemindLater={onRemindLater}
        onResolve={onResolve}
        onLost={onLost}
      />
    )
  }

  return (
    <StandardCard
      item={item}
      isSaving={isSaving}
      onMarkSent={onMarkSent}
      onRemindLater={onRemindLater}
      onResolve={onResolve}
      onLost={onLost}
    />
  )
}
