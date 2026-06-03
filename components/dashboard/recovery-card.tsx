"use client"

import { useState } from "react"
import {
  Ban,
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  ClipboardList,
  Clock,
  EyeOff,
  FileText,
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
    case "invoice_overdue":   return "Invoice"
    case "estimate_no_reply": return "Estimate"
    case "work_not_paid":     return "Unpaid job"
    case "maybe_later":       return "Prospect"
    default:                  return "Other"
  }
}

function StatusPill({
  status,
  isCheckIn,
}: {
  status: RecoveryItem["status"]
  isCheckIn: boolean
}) {
  if (isCheckIn) {
    return <Badge variant="info">Check-in due</Badge>
  }
  switch (status) {
    case "needs_follow_up":
      return <Badge variant="warning">Needs follow-up</Badge>
    case "message_ready":
      return (
        <Badge variant="outline" className="border-ef-200 bg-ef-mist text-ef-ocean dark:border-ef-navy/60 dark:bg-ef-ink/40 dark:text-ef-200">
          Message ready
        </Badge>
      )
    case "sent":
    case "waiting":
      return <Badge variant="info">Waiting for reply</Badge>
    default:
      return (
        <Badge variant="muted">
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
    <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 dark:border-blue-900/50 dark:bg-blue-950/20">
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
  onSnooze,
  onDone,
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
  onSnooze:           (item: RecoveryItem, days: number) => void
  onDone:             (item: RecoveryItem) => void
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

  const accentBar = isMessageReady ? "before:bg-ef-sky" : "before:bg-amber-400"
  const iconCls   = isMessageReady
    ? "bg-ef-mist text-ef-ocean dark:bg-ef-ink/40 dark:text-ef-cyan"
    : "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
  const ItemIcon  = item.reason === "estimate_no_reply" ? ClipboardList : FileText

  return (
    <div
      className={cn(
        "euroflo-card-transition relative overflow-hidden rounded-xl border border-border bg-card shadow-sm hover:shadow-md",
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
        accentBar
      )}
    >
      <div className="flex flex-col gap-3 py-3.5 pl-5 pr-4">
        {/* Compact main row */}
        <div className="flex items-center gap-3">
          <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", iconCls)}>
            <ItemIcon className="size-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-foreground">
                {item.client_name}
              </p>
              <StatusPill status={item.status} isCheckIn={false} />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {sourceTypeLabel(item.reason as RecoveryItemReason)}
              {item.contacted_date ? ` · ${relativeDate(item.contacted_date)}` : ""}
              {item.client_email
                ? ` · ${item.client_email}`
                : item.client_phone
                ? ` · ${item.client_phone}`
                : ""}
            </p>
          </div>
          <div className="shrink-0">
            <span className="text-base font-bold tabular-nums text-foreground">
              {money.format(item.amount)}
            </span>
          </div>
        </div>

        {/* Client replied banner */}
        {replyInfo && replyInfo.count > 0 && (
          <ReplyBanner
            replyInfo={replyInfo}
            onViewReplies={() => onViewReplies(item)}
          />
        )}

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

        {/* No-email hint */}
        {isMessageReady && !hasEmail && (
          <p className="text-xs text-muted-foreground">
            Add a client email to enable direct sending.
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {isMessageReady ? (
            hasEmail ? (
              <Button
                size="sm"
                className="gap-1.5 bg-ef-orange text-white hover:bg-ef-orange"
                onClick={() => onSendFollowUp(item)}
                disabled={isSaving}
              >
                <Mail className="size-3.5" />
                Send follow-up email
              </Button>
            ) : (
              <Button
                size="sm"
                className="gap-1.5 bg-ef-orange text-white hover:bg-ef-orange"
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
            <Button
              size="sm"
              className="gap-1.5 bg-ef-orange text-white hover:bg-ef-orange"
              onClick={() => setMsgOpen(true)}
              disabled={isSaving}
            >
              Review message
            </Button>
          )}

          {isMessageReady && hasEmail && item.message_body && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleCopy()}
              disabled={isSaving}
              className="gap-1.5"
            >
              {copied ? (
                <Check className="size-3.5 text-ef-ocean" />
              ) : (
                <ClipboardCopy className="size-3.5" />
              )}
              {copied ? "Copied" : "Copy only"}
            </Button>
          )}

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

          {/* Snooze — Not now */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={isSaving} className="gap-1.5">
                <Clock className="size-3.5" />
                Not now
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-36">
              <DropdownMenuItem onClick={() => onSnooze(item, 1)}>Tomorrow</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSnooze(item, 3)}>In 3 days</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSnooze(item, 7)}>Next week</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Done — This is handled */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDone(item)}
            disabled={isSaving}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <CheckCheck className="size-3.5" />
            This is handled
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
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDone(item)} className="text-muted-foreground">
                  <EyeOff className="mr-2 size-3.5" />
                  Hide suggestion
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onLost(item)} className="text-muted-foreground">
                  <Ban className="mr-2 size-3.5" />
                  Not relevant
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
  onSnooze,
  onDone,
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
  onSnooze:         (item: RecoveryItem, days: number) => void
  onDone:           (item: RecoveryItem) => void
  onRemindLater:    (item: RecoveryItem) => void
  onViewReplies:    (item: RecoveryItem) => void
}) {
  return (
    <div className="euroflo-card-transition relative overflow-hidden rounded-xl border border-sky-200 bg-sky-50/20 shadow-sm hover:shadow-md dark:border-sky-900/50 dark:bg-sky-950/10 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-sky-400">
      <div className="flex flex-col gap-3 py-3.5 pl-5 pr-4">
        {/* Compact main row */}
        <div className="flex items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-900/25 dark:text-sky-400">
            <Bell className="size-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm font-semibold text-foreground">
                Did {item.client_name} respond?
              </p>
              <StatusPill status={item.status} isCheckIn />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {reasonLabel(item.reason as RecoveryItemReason)}
              {item.contacted_date ? ` · sent ${relativeDate(item.contacted_date)}` : ""}
              {item.client_email || item.client_phone
                ? ` · ${item.client_email ?? item.client_phone}`
                : ""}
            </p>
          </div>
          <span className="shrink-0 text-base font-bold tabular-nums text-foreground">
            {money.format(item.amount)}
          </span>
        </div>

        {/* Reply banner */}
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
            className="gap-1.5 bg-ef-orange text-white hover:bg-ef-orange"
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

          {/* Snooze — Not now */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={isSaving} className="gap-1.5">
                <Clock className="size-3.5" />
                Not now
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-36">
              <DropdownMenuItem onClick={() => onSnooze(item, 1)}>Tomorrow</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSnooze(item, 3)}>In 3 days</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSnooze(item, 7)}>Next week</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Done — This is handled */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDone(item)}
            disabled={isSaving}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <CheckCheck className="size-3.5" />
            This is handled
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
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDone(item)} className="text-muted-foreground">
                  <EyeOff className="mr-2 size-3.5" />
                  Hide suggestion
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNotInterested(item)} className="text-muted-foreground">
                  <Ban className="mr-2 size-3.5" />
                  Not relevant
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
      "euroflo-card-transition relative overflow-hidden rounded-xl border border-border bg-card shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
      hasReplies
        ? "border-blue-200 before:bg-blue-500 dark:border-blue-900/50"
        : "opacity-80 before:bg-blue-300 dark:before:bg-blue-700"
    )}>
      <div className="flex flex-col gap-3 py-3.5 pl-5 pr-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusPill status={item.status} isCheckIn={false} />
                {hasReplies && (
                  <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200">
                    <MessageSquare className="mr-1 size-3" />
                    Client replied
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {item.client_name}
              </p>
              <p className="text-xs text-muted-foreground">
                {money.format(item.amount)}
                {" · "}
                {reasonLabel(item.reason as RecoveryItemReason)}
                {checkBackFormatted ? ` · check in ${checkBackFormatted}` : ""}
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
  onSnooze,
  onDone,
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
  onSnooze:        (item: RecoveryItem, days: number) => void
  onDone:          (item: RecoveryItem) => void
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
        onSnooze={onSnooze}
        onDone={onDone}
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
      onSnooze={onSnooze}
      onDone={onDone}
      onRemindLater={onRemindLater}
      onResolve={onResolve}
      onLost={onLost}
      onViewReplies={onViewReplies}
    />
  )
}
