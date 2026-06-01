"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  Bell,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ThumbsDown,
  TrendingUp,
} from "lucide-react"
import { toast } from "sonner"

import { AddRecoveryDialog } from "@/components/dashboard/add-recovery-dialog"
import { CheckBackDialog } from "@/components/dashboard/check-back-dialog"
import { PageHeader } from "@/components/dashboard/page-header"
import { RecoveryRepliesDialog } from "@/components/dashboard/recovery-replies-dialog"
import { SendFollowUpDialog } from "@/components/dashboard/send-follow-up-dialog"
import { ContentReveal } from "@/components/ui/content-reveal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { generateRecoveryItemMessage, reasonLabel } from "@/lib/recovery-engine"
import { money } from "@/lib/format-money"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { cn } from "@/lib/utils"

type RecoveryItem = Database["public"]["Tables"]["recovery_items"]["Row"]
type RecoveryItemInsert = Database["public"]["Tables"]["recovery_items"]["Insert"]
type RecoveryItemUpdate = Database["public"]["Tables"]["recovery_items"]["Update"]
type RecoveryItemReason = RecoveryItem["reason"]
type ClientRow = Database["public"]["Tables"]["clients"]["Row"]

interface ReplyInfo {
  count: number
  latestFromName: string | null
  latestFromEmail: string
  latestReceivedAt: string
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysIso(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function isCheckInDue(item: RecoveryItem): boolean {
  if (item.status !== "sent" && item.status !== "waiting") return false
  if (!item.check_back_date) return false
  return item.check_back_date <= todayIso()
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  })
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

type TabFilter = "all" | "needs_follow_up" | "message_ready" | "waiting" | "won" | "lost"

const TABS: { value: TabFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs_follow_up", label: "Needs follow-up" },
  { value: "message_ready", label: "Message ready" },
  { value: "waiting", label: "Waiting" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
]

function filterItems(items: RecoveryItem[], tab: TabFilter): RecoveryItem[] {
  switch (tab) {
    case "needs_follow_up":
      return items.filter((i) => i.status === "needs_follow_up")
    case "message_ready":
      return items.filter((i) => i.status === "message_ready")
    case "waiting":
      return items.filter((i) => i.status === "sent" || i.status === "waiting")
    case "won":
      return items.filter((i) => i.status === "resolved")
    case "lost":
      return items.filter((i) => i.status === "lost")
    default:
      return items
  }
}

function StatusBadge({ item }: { item: RecoveryItem }) {
  if (isCheckInDue(item)) {
    return (
      <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200">
        Check-in due
      </Badge>
    )
  }
  switch (item.status) {
    case "needs_follow_up":
      return (
        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          Needs follow-up
        </Badge>
      )
    case "message_ready":
      return (
        <Badge variant="outline" className="border-ef-200 bg-ef-mist text-ef-ocean dark:border-ef-navy/60 dark:bg-ef-ink/40 dark:text-ef-200">
          Message ready
        </Badge>
      )
    case "sent":
    case "waiting":
      return (
        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200">
          Waiting
        </Badge>
      )
    case "resolved":
      return (
        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          Won
        </Badge>
      )
    case "lost":
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Lost
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground">
          {item.status.replace(/_/g, " ")}
        </Badge>
      )
  }
}

function primaryActionLabel(item: RecoveryItem): string {
  if (isCheckInDue(item)) return "Record response"
  if (item.status === "message_ready") {
    return item.client_email ? "Send follow-up email" : "Copy message"
  }
  if (item.status === "needs_follow_up") return "Review message"
  if (item.status === "sent" || item.status === "waiting") return "Reschedule"
  return "View"
}

export default function RecoveriesPage() {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<RecoveryItem[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [replyInfoMap, setReplyInfoMap] = useState<Record<string, ReplyInfo>>({})
  const [userId, setUserId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<TabFilter>("all")
  const [search, setSearch] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [checkBackItem, setCheckBackItem] = useState<RecoveryItem | null>(null)
  const [sendFollowUpItem, setSendFollowUpItem] = useState<RecoveryItem | null>(null)
  const [viewRepliesItem, setViewRepliesItem] = useState<RecoveryItem | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setIsLoading(false); return }
    setUserId(user.id)

    const [itemsResult, clientsResult] = await Promise.all([
      supabase
        .from("recovery_items")
        .select("*")
        .eq("user_id", user.id)
        .not("status", "in", "(archived)")
        .order("created_at", { ascending: false }),
      supabase
        .from("clients")
        .select("*")
        .eq("user_id", user.id)
        .order("company", { ascending: true }),
    ])

    const loadedItems = itemsResult.data ?? []
    setItems(loadedItems)
    setClients(clientsResult.data ?? [])

    if (loadedItems.length > 0) {
      const itemIds = loadedItems.map((i) => i.id)
      const { data: replies } = await supabase
        .from("recovery_email_replies")
        .select("recovery_item_id, from_email, from_name, received_at")
        .eq("user_id", user.id)
        .in("recovery_item_id", itemIds)
        .order("received_at", { ascending: false })

      if (replies && replies.length > 0) {
        const map: Record<string, ReplyInfo> = {}
        for (const reply of replies) {
          const id = reply.recovery_item_id
          if (!map[id]) {
            map[id] = {
              count: 0,
              latestFromName: reply.from_name,
              latestFromEmail: reply.from_email,
              latestReceivedAt: reply.received_at,
            }
          }
          map[id].count++
        }
        setReplyInfoMap(map)
      } else {
        setReplyInfoMap({})
      }
    } else {
      setReplyInfoMap({})
    }

    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(id)
  }, [load])

  const displayedItems = useMemo(() => {
    const filtered = filterItems(items, activeTab)
    if (!search.trim()) return filtered
    const q = search.toLowerCase()
    return filtered.filter(
      (i) =>
        i.client_name.toLowerCase().includes(q) ||
        (i.client_email ?? "").toLowerCase().includes(q) ||
        reasonLabel(i.reason as RecoveryItemReason).toLowerCase().includes(q)
    )
  }, [items, activeTab, search])

  const tabCounts = useMemo(() => {
    const counts: Record<TabFilter, number> = {
      all: items.length,
      needs_follow_up: items.filter((i) => i.status === "needs_follow_up").length,
      message_ready: items.filter((i) => i.status === "message_ready").length,
      waiting: items.filter((i) => i.status === "sent" || i.status === "waiting").length,
      won: items.filter((i) => i.status === "resolved").length,
      lost: items.filter((i) => i.status === "lost").length,
    }
    return counts
  }, [items])

  // ─── Stats ─────────────────────────────────────────────────────
  const totalAtRisk = useMemo(
    () =>
      items
        .filter((i) => i.status !== "resolved" && i.status !== "lost" && i.status !== "archived")
        .reduce((s, i) => s + i.amount, 0),
    [items]
  )

  const totalWon = useMemo(
    () => items.filter((i) => i.status === "resolved").reduce((s, i) => s + i.amount, 0),
    [items]
  )

  // ─── Handlers ─────────────────────────────────────────────────

  async function updateItem(id: string, patch: RecoveryItemUpdate): Promise<boolean> {
    if (!userId) return false
    const { data, error } = await supabase
      .from("recovery_items")
      .update(patch)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single()
    if (error) { toast.error(error.message); return false }
    setItems((prev) => prev.map((i) => (i.id === id ? data : i)))
    return true
  }

  async function handleCopyMessage(item: RecoveryItem) {
    if (!item.message_body) return
    await navigator.clipboard.writeText(item.message_body)
    setCopiedId(item.id)
    toast.success("Message copied to clipboard")
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function handleMarkSentAndSchedule(item: RecoveryItem) {
    if (item.message_body) await handleCopyMessage(item)
    setCheckBackItem(item)
  }

  async function handleCheckBackConfirm(date: string) {
    if (!checkBackItem) return
    setIsSaving(true)
    const ok = await updateItem(checkBackItem.id, { status: "sent", check_back_date: date })
    if (ok) {
      toast.success(
        `Marked as sent. Check-in scheduled for ${new Date(
          `${date}T00:00:00`
        ).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}.`
      )
    }
    setCheckBackItem(null)
    setIsSaving(false)
  }

  async function handleFollowUpAgain(item: RecoveryItem) {
    setIsSaving(true)
    const newMessage = generateRecoveryItemMessage({
      clientName: item.client_name,
      reason: item.reason,
      amount: item.amount,
      followUpCount: item.follow_up_count + 1,
    })
    await updateItem(item.id, {
      status: "needs_follow_up",
      check_back_date: null,
      message_body: newMessage,
      follow_up_count: item.follow_up_count + 1,
    })
    toast.success("New follow-up message generated.")
    setIsSaving(false)
  }

  async function handleRemindLater(item: RecoveryItem) {
    setIsSaving(true)
    await updateItem(item.id, { check_back_date: addDaysIso(1) })
    toast.success("Snoozed until tomorrow.")
    setIsSaving(false)
  }

  function handleSendFollowUp(item: RecoveryItem) {
    setSendFollowUpItem(item)
  }

  function handleEmailSent(updatedItem: RecoveryItem) {
    setItems((prev) => prev.map((i) => (i.id === updatedItem.id ? updatedItem : i)))
  }

  async function handleMarkResolved(item: RecoveryItem) {
    setIsSaving(true)
    await updateItem(item.id, { status: "resolved" })
    toast.success(`${item.client_name} marked as won.`)
    setIsSaving(false)
  }

  async function handleMarkLost(item: RecoveryItem) {
    setIsSaving(true)
    await updateItem(item.id, { status: "lost" })
    toast.success(`${item.client_name} marked as lost.`)
    setIsSaving(false)
  }

  async function handleSaveItem(payload: Omit<RecoveryItemInsert, "user_id">) {
    if (!userId) { toast.error("You must be logged in."); return }
    const { data, error } = await supabase
      .from("recovery_items")
      .insert({ ...payload, user_id: userId })
      .select()
      .single()
    if (error) { toast.error(error.message); return }
    setItems((prev) => [data, ...prev])
    toast.success(`${data.client_name} added to recovery queue.`)
  }

  async function handleSaveAndMarkSent(payload: Omit<RecoveryItemInsert, "user_id">) {
    if (!userId) { toast.error("You must be logged in."); return }
    const { data, error } = await supabase
      .from("recovery_items")
      .insert({ ...payload, user_id: userId, status: "sent" })
      .select()
      .single()
    if (error) { toast.error(error.message); return }
    setItems((prev) => [data, ...prev])
    setCheckBackItem(data)
  }

  function handlePrimaryAction(item: RecoveryItem) {
    if (isCheckInDue(item) || item.status === "sent" || item.status === "waiting") {
      setCheckBackItem(item)
    } else if (item.status === "message_ready" && item.client_email) {
      setSendFollowUpItem(item)
    } else {
      void handleMarkSentAndSchedule(item)
    }
  }

  // ─── Render ───────────────────────────────────────────────────

  return (
    <>
      <PageHeader
        title="Recoveries"
        description="All your follow-up jobs in one place."
      >
        <Button
          variant="outline"
          size="sm"
          disabled={isLoading}
          onClick={() => void load()}
          className="gap-1.5"
        >
          <RotateCcw className={cn("size-3.5", isLoading && "animate-spin")} />
          Refresh
        </Button>
        <Button
          className="gap-1.5 bg-ef-ocean text-white hover:bg-ef-ocean"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="size-4" />
          Add recovery
        </Button>
      </PageHeader>

      <AddRecoveryDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={handleSaveItem}
        onSaveAndMarkSent={handleSaveAndMarkSent}
        isSaving={isSaving}
        clients={clients}
      />

      <CheckBackDialog
        open={checkBackItem !== null}
        clientName={checkBackItem?.client_name ?? ""}
        onConfirm={handleCheckBackConfirm}
        onCancel={() => setCheckBackItem(null)}
        isLoading={isSaving}
      />

      <SendFollowUpDialog
        open={sendFollowUpItem !== null}
        item={sendFollowUpItem}
        onClose={() => setSendFollowUpItem(null)}
        onSent={handleEmailSent}
      />

      <RecoveryRepliesDialog
        open={viewRepliesItem !== null}
        item={viewRepliesItem}
        onClose={() => setViewRepliesItem(null)}
      />

      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <ContentReveal isLoading={isLoading} skeleton={<RecoveriesPageSkeleton />}>
          <>
            {/* Summary stats */}
            {items.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatCard
                  label="Active"
                  value={items.filter((i) => !["resolved", "lost", "archived"].includes(i.status ?? "")).length}
                  sublabel="open recoveries"
                  highlight
                />
                <StatCard
                  label="At risk"
                  value={money.format(totalAtRisk)}
                  sublabel="total value"
                />
                <StatCard
                  label="Won"
                  value={money.format(totalWon)}
                  sublabel="total recovered"
                  className="col-span-2 sm:col-span-1"
                />
              </div>
            )}

            {/* Filter tabs */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-1">
                {TABS.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setActiveTab(tab.value)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                      activeTab === tab.value
                        ? "bg-ef-ocean text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    )}
                  >
                    {tab.label}
                    {tabCounts[tab.value] > 0 && (
                      <span
                        className={cn(
                          "min-w-[18px] rounded-full px-1 text-center text-xs",
                          activeTab === tab.value
                            ? "bg-white/20 text-white"
                            : "bg-background text-muted-foreground"
                        )}
                      >
                        {tabCounts[tab.value]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search customers…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 pl-8 text-sm"
                />
              </div>
            </div>

            {/* Item list */}
            {displayedItems.length === 0 ? (
              <EmptyTabState tab={activeTab} onAdd={() => setAddOpen(true)} />
            ) : (
              <div className="grid gap-2">
                {displayedItems.map((item) => (
                  <RecoveryRow
                    key={item.id}
                    item={item}
                    isSaving={isSaving}
                    copiedId={copiedId}
                    replyInfo={replyInfoMap[item.id]}
                    onPrimaryAction={handlePrimaryAction}
                    onCopyMessage={handleCopyMessage}
                    onMarkSentManually={setCheckBackItem}
                    onFollowUpAgain={handleFollowUpAgain}
                    onRemindLater={handleRemindLater}
                    onMarkResolved={handleMarkResolved}
                    onMarkLost={handleMarkLost}
                    onViewReplies={setViewRepliesItem}
                  />
                ))}
              </div>
            )}
          </>
        </ContentReveal>
      </div>
    </>
  )
}

// ─── Recovery row ──────────────────────────────────────────────

function RecoveryRow({
  item,
  isSaving,
  copiedId,
  replyInfo,
  onPrimaryAction,
  onCopyMessage,
  onMarkSentManually,
  onFollowUpAgain,
  onRemindLater,
  onMarkResolved,
  onMarkLost,
  onViewReplies,
}: {
  item: RecoveryItem
  isSaving: boolean
  copiedId: string | null
  replyInfo?: ReplyInfo
  onPrimaryAction:    (item: RecoveryItem) => void
  onCopyMessage:      (item: RecoveryItem) => void
  onMarkSentManually: (item: RecoveryItem) => void
  onFollowUpAgain:    (item: RecoveryItem) => void
  onRemindLater:      (item: RecoveryItem) => void
  onMarkResolved:     (item: RecoveryItem) => void
  onMarkLost:         (item: RecoveryItem) => void
  onViewReplies:      (item: RecoveryItem) => void
}) {
  const isResolved = item.status === "resolved"
  const isLost = item.status === "lost"
  const isDone = isResolved || isLost

  const nextAction = isCheckInDue(item)
    ? "Check in now"
    : item.check_back_date && item.check_back_date > todayIso()
    ? `Check in ${formatDate(item.check_back_date)}`
    : !isDone
    ? "Ready for follow-up"
    : null

  return (
    <div
      className={cn(
        "group flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3.5 transition-shadow hover:shadow-sm sm:flex-row sm:items-center",
        isDone && "opacity-60"
      )}
    >
      {/* Left: customer + meta */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-foreground">{item.client_name}</p>
          <StatusBadge item={item} />
          {replyInfo && replyInfo.count > 0 && (
            <button
              type="button"
              onClick={() => onViewReplies(item)}
              className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800 hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-950/60"
            >
              <MessageSquare className="size-3" />
              {replyInfo.count === 1 ? "1 reply" : `${replyInfo.count} replies`}
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>{sourceTypeLabel(item.reason as RecoveryItemReason)}</span>
          <span className="font-medium tabular-nums text-foreground">
            {money.format(item.amount)}
          </span>
          {item.contacted_date && (
            <span>Last contact {formatDate(item.contacted_date)}</span>
          )}
          {nextAction && (
            <span
              className={cn(
                isCheckInDue(item) && "font-medium text-sky-600 dark:text-sky-400"
              )}
            >
              {nextAction}
            </span>
          )}
        </div>
      </div>

      {/* Right: actions */}
      {!isDone && (
        <div className="flex shrink-0 items-center gap-2">
          {/* Primary action */}
          <Button
            size="sm"
            className={cn(
              "gap-1.5",
              isCheckInDue(item)
                ? "bg-sky-600 text-white hover:bg-sky-700"
                : "bg-ef-ocean text-white hover:bg-ef-ocean"
            )}
            disabled={isSaving}
            onClick={() => onPrimaryAction(item)}
          >
            {item.status === "message_ready" && item.client_email ? (
              <>
                <Mail className="size-3.5" />
                {primaryActionLabel(item)}
              </>
            ) : item.status === "message_ready" ? (
              copiedId === item.id ? (
                <>
                  <Check className="size-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <ClipboardCopy className="size-3.5" />
                  {primaryActionLabel(item)}
                </>
              )
            ) : isCheckInDue(item) ? (
              <>
                <RefreshCw className="size-3.5" />
                {primaryActionLabel(item)}
              </>
            ) : (
              primaryActionLabel(item)
            )}
          </Button>

          {/* Overflow */}
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
                <DropdownMenuItem onClick={() => onCopyMessage(item)}>
                  <ClipboardCopy className="mr-2 size-3.5" />
                  Copy message
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onMarkSentManually(item)}>
                <Check className="mr-2 size-3.5" />
                Mark sent manually
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onFollowUpAgain(item)}>
                <TrendingUp className="mr-2 size-3.5" />
                New follow-up
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onRemindLater(item)}>
                <Bell className="mr-2 size-3.5" />
                Remind later
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onMarkResolved(item)}>
                <CheckCircle2 className="mr-2 size-3.5" />
                Mark won
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onMarkLost(item)}
                className="text-muted-foreground"
              >
                <ThumbsDown className="mr-2 size-3.5" />
                Mark lost
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}

// ─── Stat card ─────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sublabel,
  highlight = false,
  className,
}: {
  label: string
  value: string | number
  sublabel: string
  highlight?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card px-4 py-3 shadow-sm",
        highlight && "border-ef-200 bg-ef-mist/50 dark:border-ef-navy/40 dark:bg-ef-ink/20",
        className
      )}
    >
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", highlight && "text-ef-ocean dark:text-ef-200")}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sublabel}</p>
    </div>
  )
}

// ─── Empty tab state ───────────────────────────────────────────

function EmptyTabState({ tab, onAdd }: { tab: TabFilter; onAdd: () => void }) {
  const messages: Record<TabFilter, { title: string; desc: string }> = {
    all: { title: "No recoveries yet", desc: "Add your first recovery job to get started." },
    needs_follow_up: { title: "Nothing needs follow-up", desc: "Items will appear here when they're due." },
    message_ready: { title: "No messages ready", desc: "Messages appear here once a follow-up is generated." },
    waiting: { title: "Nothing waiting", desc: "Items move here after you mark a message as sent." },
    won: { title: "No wins yet", desc: "Mark items as paid or booked to see them here." },
    lost: { title: "Nothing lost", desc: "Items marked as not interested appear here." },
  }
  const { title, desc } = messages[tab]

  return (
    <Card>
      <CardContent className="py-12 text-center">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <RotateCcw className="size-5" />
        </div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
        {tab === "all" && (
          <Button className="mt-4 gap-2 bg-ef-ocean text-white hover:bg-ef-ocean" onClick={onAdd}>
            <Plus className="size-4" />
            Add recovery
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function RecoveriesPageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-muted/30" />
        ))}
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded-lg bg-muted/30" />
        ))}
      </div>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-muted/30" />
      ))}
    </div>
  )
}
