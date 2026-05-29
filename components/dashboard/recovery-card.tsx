"use client"

import { useState } from "react"
import {
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Mail,
  MessageSquare,
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

export interface ReplyInfo {
  count: number
  latestFromName: string | null
  latestFromEmail: string
  latestTextBody: string | null
  latestReceivedAt: string
}

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

function relativeDateFromIso(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (diff === 0) return "today"
  if (diff === 1) return "yesterday"
  if (diff < 7) return `${diff} days ago`
  if (diff < 30) return `${Math.floor(diff / 7)} week${Math.floor(diff / 7) === 1 ? "" : "s"} ago`
  return `${Math.floor(diff / 30)} month${Math.floor(diff / 30) === 1 ? "" : "s"} ago`
}

function sourceTypeLabel(reason: RecoveryItemReason | null): string {
  switch (reason) {
    case "invoice_overdue":  return "Invoice"
    case "estimate_no_reply": return "Estimate"
    case "work_not_paid":    return "Unpaid job"
    case "maybe_later":      return "Prospect"
    default:                 return "Other"
  }
}

function suggestedNextStep(status: RecoveryItem["status"], followUpCount: number, hasEmail: boolean): string {
  if (status === "needs_follow_up") {
    if (followUpCount === 0)
      return hasEmail
        ? "Review the message below, then send it directly from here."
        : "Review the message below, copy it, and send it manually."
    return hasEmail
      ? "A new follow-up message is ready. Review and send."
      : "A new follow-up message is ready. Copy and send manually."
  }
  if (status === "message_ready") {
    return hasEmail
      ? "Send the follow-up email directly, or copy it to send yourself."
      : "Copy the message and send it, then log it as sent manually."
  }
  return "Follow up with this customer."
}

function StatusPill({
  status,
  isCheckIn,
}: {
  status: RecoveryItem["status"]
  isCheckIn: boolean
}) {
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

// ── Reply banner — shown when client has replied ──────────────────────────────

function ReplyBanner({
  replyInfo,
  onViewReplies,
}: {
  replyInfo: ReplyInfo
  onViewReplies: () => void
}) {
  const sender = replyInfo.latestFromName ?? replyInfo.latestFromEmail
  const excerpt = replyInfo.latestTextBody
    ? replyInfo.latestTextBody.slice(0, 120) + (replyInfo.latestTextBody.length > 120 ? "…" : "")
    : null

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2.5 dark:border-blue-900/50 dark:bg-blue-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="size-3.5 text-blue-600 dark:text-blue-400" />
          <span className="text-xs font-semibold text-blue-800 dark:text-blue-200">
            Client replied
          </span>
          <span className="text-xs text-muted-foreground">
            · {relativeDateFromIso(replyInfo.latestReceivedAt)}
          </span>
        </div>
        <button
          type="button"
          onClick={onViewReplies}
          className="text-xs font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"
        >
          View {replyInfo.count === 1 ? "reply" : `${replyInfo.count} replies`}
        </button>
      </div>
      {excerpt && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{sender}: </span>
          {excerpt}
        </p>
      )}
    </div>
  )
}

// ─── Standard card (needs_follow_up / message_ready) ─────────────────────────

function StandardCard({
  item,
  isSaving,
  replyInfo,
  onMarkSentManually,
  onSendFollowUp,
  onRemindLater,
  onResolve,
  onLost,
  onViewReplies,
}: {
  item: RecoveryItem
  isSaving: boolean
  replyInfo?: ReplyInfo
  onMarkSentManually: (item: RecoveryItem) => void
  onSendFollowUp:     (item: RecoveryItem) => void
  onRemindLater:      (item: RecoveryItem) => void
  onResolve:          (item: RecoveryItem) => void
  onLost:             (item: RecoveryItem) => void
  onViewReplies:      (item: RecoveryItem) => void
}) {
  const isMessageReady = item.status === "message_ready"
  const hasEmail       = Boolean(item.client_email)
  const [msgOpen, setMsgOpen] = useState(isMessageReady)
  const [copied,  setCopied]  = useState(false)

  async function handleCopy() {
    if (!item.message_body) return
    await navigator.clipboard.writeText(item.message_body)
    setCopied(true)
    toast.success("Message copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
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

        {/* Client replied banner */}
        {replyInfo && replyInfo.count > 0 && (
          <ReplyBanner
            replyInfo={replyInfo}
            onViewReplies={() => onViewReplies(item)}
          />
        )}

        {/* Suggested next step */}
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">Suggested: </span>
          {suggestedNextStep(item.status, item.follow_up_count, hasEmail)}
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

        {/* No-email hint when message is ready */}
        {isMessageReady && !hasEmail && (
          <p className="text-xs text-muted-foreground">
            Add a client email to this item to enable direct sending.
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {isMessageReady ? (
            hasEmail ? (
              /* Primary: email send */
              <Button
                size="sm"
                className="gap-1.5 bg-green-700 text-white hover:bg-green-800"
                onClick={() => onSendFollowUp(item)}
                disabled={isSaving}
              >
                <Mail className="size-3.5" />
                Send follow-up email
              </Button>
            ) : (
              /* Primary fallback: copy when no email */
              <Button
                size="sm"
                className="gap-1.5 bg-green-700 text-white hover:bg-green-800"
                onClick={() => void handleCopy()}
                disabled={isSaving}
              >
                {copied ? (
                  <Check className="size-3.5" />
                ) : (
                  <ClipboardCopy className="size-3.5" />
                )}
                {copied ? "Copied" : "Copy message"}
              </Button>
            )
          ) : (
            /* needs_follow_up primary */
            <Button
              size="sm"
              className="gap-1.5 bg-green-700 text-white hover:bg-green-800"
              onClick={() => setMsgOpen(true)}
              disabled={isSaving}
            >
              Review message
            </Button>
          )}

          {/* Copy-only secondary when we have email + message ready */}
          {isMessageReady && hasEmail && item.message_body && (
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

          {/* Manual mark-sent for needs_follow_up */}
          {!isMessageReady && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onMarkSentManually(item)}
              disabled={isSaving}
              className="gap-1.5"
            >
              Mark sent manually
            </Button>
          )}

          {/* Overflow menu */}
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
              <DropdownMenuContent align="end" className="w-48">
                {replyInfo && replyInfo.count > 0 && (
                  <DropdownMenuItem onClick={() => onViewReplies(item)}>
                    <MessageSquare className="mr-2 size-3.5" />
                    View replies
                  </DropdownMenuItem>
                )}
                {item.message_body && (
                  <DropdownMenuItem onClick={() => void handleCopy()}>
                    <ClipboardCopy className="mr-2 size-3.5" />
                    Copy message
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onMarkSentManually(item)}>
                  <Pencil className="mr-2 size-3.5" />
                  Mark sent manually
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
  replyInfo,
  onPaid,
  onFollowUpAgain,
  onNoResponse,
  onNotInterested,
  onRemindLater,
  onViewReplies,
}: {
  item: RecoveryItem
  isSaving: boolean
  replyInfo?: ReplyInfo
  onPaid:           (item: RecoveryItem) => void
  onFollowUpAgain:  (item: RecoveryItem) => void
  onNoResponse:     (item: RecoveryItem) => void
  onNotInterested:  (item: RecoveryItem) => void
  onRemindLater:    (item: RecoveryItem) => void
  onViewReplies:    (item: RecoveryItem) => void
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

        {/* Client replied banner */}
        {replyInfo && replyInfo.count > 0 && (
          <ReplyBanner
            replyInfo={replyInfo}
            onViewReplies={() => onViewReplies(item)}
          />
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5 bg-green-700 text-white hover:bg-green-800"
            onClick={() => onPaid(item)}
            disabled={isSaving}
          >
            <CheckCircle2 className="size-3.5" />
            Paid / Booked
          </Button>

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
                {replyInfo && replyInfo.count > 0 && (
                  <DropdownMenuItem onClick={() => onViewReplies(item)}>
                    <MessageSquare className="mr-2 size-3.5" />
                    View replies
                  </DropdownMenuItem>
                )}
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
  replyInfo,
  onMarkSentManually,
  onRemindLater,
  onResolve,
  onLost,
  onViewReplies,
}: {
  item: RecoveryItem
  isSaving: boolean
  replyInfo?: ReplyInfo
  onMarkSentManually: (item: RecoveryItem) => void
  onRemindLater:      (item: RecoveryItem) => void
  onResolve:          (item: RecoveryItem) => void
  onLost:             (item: RecoveryItem) => void
  onViewReplies:      (item: RecoveryItem) => void
}) {
  const checkBackFormatted = item.check_back_date
    ? new Date(`${item.check_back_date}T00:00:00`).toLocaleDateString("en-CA", {
        month: "short",
        day:   "numeric",
      })
    : null

  const hasReplies = replyInfo && replyInfo.count > 0

  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl border border-border bg-card shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
      hasReplies
        ? "border-blue-200 before:bg-blue-500 dark:border-blue-900/50"
        : "opacity-80 before:bg-blue-300 dark:before:bg-blue-700"
    )}>
      <div className="flex flex-col gap-3 py-4 pl-5 pr-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={item.status} isCheckIn={false} />
                {hasReplies && (
                  <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200">
                    <MessageSquare className="mr-1 size-3" />
                    Client replied
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {sourceTypeLabel(item.reason as RecoveryItemReason)}
                  {checkBackFormatted ? ` · check in ${checkBackFormatted}` : ""}
                </span>
              </div>
              <p className="mt-1.5 font-semibold text-foreground">
                {item.client_name}
              </p>
              <p className="text-sm text-muted-foreground">
                {money.format(item.amount)} ·{" "}
                {reasonLabel(item.reason as RecoveryItemReason)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hasReplies && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300"
                onClick={() => onViewReplies(item)}
                disabled={isSaving}
              >
                <MessageSquare className="size-3.5" />
                View {replyInfo.count === 1 ? "reply" : "replies"}
              </Button>
            )}
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
              <DropdownMenuContent align="end" className="w-48">
                {hasReplies && (
                  <DropdownMenuItem onClick={() => onViewReplies(item)}>
                    <MessageSquare className="mr-2 size-3.5" />
                    View replies
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onMarkSentManually(item)}>
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

        {/* Reply excerpt in waiting card */}
        {hasReplies && replyInfo.latestTextBody && (
          <div className="rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2 dark:border-blue-900/30 dark:bg-blue-950/10">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {replyInfo.latestFromName ?? replyInfo.latestFromEmail}:{" "}
              </span>
              {replyInfo.latestTextBody.slice(0, 140)}
              {replyInfo.latestTextBody.length > 140 ? "…" : ""}
            </p>
          </div>
        )}
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
  replyInfo,
  onMarkSent,
  onSendFollowUp,
  onRemindLater,
  onResolve,
  onLost,
  onPaid,
  onFollowUpAgain,
  onNoResponse,
  onViewReplies,
}: {
  item:            RecoveryItem
  isCheckIn:       boolean
  isWaiting?:      boolean
  isSaving:        boolean
  replyInfo?:      ReplyInfo
  onMarkSent:      (item: RecoveryItem) => void
  onSendFollowUp:  (item: RecoveryItem) => void
  onRemindLater:   (item: RecoveryItem) => void
  onResolve:       (item: RecoveryItem) => void
  onLost:          (item: RecoveryItem) => void
  onPaid:          (item: RecoveryItem) => void
  onFollowUpAgain: (item: RecoveryItem) => void
  onNoResponse:    (item: RecoveryItem) => void
  onViewReplies:   (item: RecoveryItem) => void
}) {
  if (isCheckIn) {
    return (
      <CheckInCard
        item={item}
        isSaving={isSaving}
        replyInfo={replyInfo}
        onPaid={onPaid}
        onFollowUpAgain={onFollowUpAgain}
        onNoResponse={onNoResponse}
        onNotInterested={onLost}
        onRemindLater={onRemindLater}
        onViewReplies={onViewReplies}
      />
    )
  }

  if (isWaiting) {
    return (
      <WaitingCard
        item={item}
        isSaving={isSaving}
        replyInfo={replyInfo}
        onMarkSentManually={onMarkSent}
        onRemindLater={onRemindLater}
        onResolve={onResolve}
        onLost={onLost}
        onViewReplies={onViewReplies}
      />
    )
  }

  return (
    <StandardCard
      item={item}
      isSaving={isSaving}
      replyInfo={replyInfo}
      onMarkSentManually={onMarkSent}
      onSendFollowUp={onSendFollowUp}
      onRemindLater={onRemindLater}
      onResolve={onResolve}
      onLost={onLost}
      onViewReplies={onViewReplies}
    />
  )
}
