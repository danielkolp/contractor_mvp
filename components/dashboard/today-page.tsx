"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import dynamic from "next/dynamic"
import Link from "next/link"

const OceanScene = dynamic(
  () => import("@/components/dashboard/ocean-scene"),
  { ssr: false }
)
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Database,
  FileText,
  Plus,
  Send,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"

import { AddRecoveryDialog } from "@/components/dashboard/add-recovery-dialog"
import { CheckBackDialog } from "@/components/dashboard/check-back-dialog"
import { RecoveryCard, type ReplyInfo } from "@/components/dashboard/recovery-card"
import { RecoveryRepliesDialog } from "@/components/dashboard/recovery-replies-dialog"
import { SendFollowUpDialog } from "@/components/dashboard/send-follow-up-dialog"
import { ContentReveal } from "@/components/ui/content-reveal"
import { Button } from "@/components/ui/button"
import { StatusPulse } from "@/components/ui/status-pulse"
import { generateRecoveryItemMessage } from "@/lib/recovery-engine"
import { money } from "@/lib/format-money"
import { createClient } from "@/lib/supabase/client"
import { seedDemoRecoveryItems } from "@/lib/demo-data"
import type { Database as DB } from "@/lib/supabase/database.types"
import { cn } from "@/lib/utils"

type RecoveryItem = DB["public"]["Tables"]["recovery_items"]["Row"]
type RecoveryItemInsert = DB["public"]["Tables"]["recovery_items"]["Insert"]
type RecoveryItemUpdate = DB["public"]["Tables"]["recovery_items"]["Update"]
type ClientRow = DB["public"]["Tables"]["clients"]["Row"]
type InvoiceRow = DB["public"]["Tables"]["invoices"]["Row"]
type EstimateRow = DB["public"]["Tables"]["estimates"]["Row"]

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysIso(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function overdueDays(dueDateIso: string): number {
  return Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(`${dueDateIso}T00:00:00`).getTime()) / 86_400_000
    )
  )
}

function isCheckInDue(item: RecoveryItem): boolean {
  if (item.status !== "sent" && item.status !== "waiting") return false
  if (!item.check_back_date) return false
  return item.check_back_date <= todayIso()
}

export function TodayPage() {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<RecoveryItem[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [overdueInvoices, setOverdueInvoices] = useState<InvoiceRow[]>([])
  const [pendingEstimates, setPendingEstimates] = useState<EstimateRow[]>([])
  const [acceptedEstimates, setAcceptedEstimates] = useState<EstimateRow[]>([])
  const [replyInfoMap, setReplyInfoMap] = useState<Record<string, ReplyInfo>>({})
  const [userId, setUserId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [checkBackItem, setCheckBackItem] = useState<RecoveryItem | null>(null)
  const [sendFollowUpItem, setSendFollowUpItem] = useState<RecoveryItem | null>(null)
  const [viewRepliesItem, setViewRepliesItem] = useState<RecoveryItem | null>(null)
  const [isDemoSeeding, setIsDemoSeeding] = useState(false)
  const actionSectionRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setIsLoading(true)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setIsLoading(false)
      return
    }

    setUserId(user.id)

    const [
      itemsResult,
      clientsResult,
      invoicesResult,
      estimatesResult,
      acceptedEstimatesResult,
    ] =
      await Promise.all([
        supabase
          .from("recovery_items")
          .select("*")
          .eq("user_id", user.id)
          .not("status", "in", "(resolved,lost,archived)")
          .order("created_at", { ascending: true }),
        supabase
          .from("clients")
          .select("*")
          .eq("user_id", user.id)
          .order("company", { ascending: true }),
        supabase
          .from("invoices")
          .select("*")
          .eq("user_id", user.id)
          .in("status", ["Sent", "Overdue"])
          .lte("due_date", todayIso())
          .order("due_date", { ascending: true }),
        supabase
          .from("estimates")
          .select("*")
          .eq("user_id", user.id)
          .lte("follow_up_date", todayIso())
          .not("status", "in", "(Accepted,Won,Declined,Lost,Archived)")
          .order("follow_up_date", { ascending: true }),
        supabase
          .from("estimates")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "Accepted")
          .order("updated_at", { ascending: false })
          .limit(5),
      ])

    const loadedItems = itemsResult.data ?? []
    setItems(loadedItems)
    setClients(clientsResult.data ?? [])
    setOverdueInvoices(invoicesResult.data ?? [])
    setPendingEstimates(estimatesResult.data ?? [])
    setAcceptedEstimates(acceptedEstimatesResult.data ?? [])

    if (loadedItems.length > 0) {
      const itemIds = loadedItems.map((i) => i.id)
      const { data: replies } = await supabase
        .from("recovery_email_replies")
        .select("recovery_item_id, from_email, from_name, text_body, received_at")
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
              latestTextBody: reply.text_body,
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

  // ─── Derived sections ─────────────────────────────────────────

  const checkInDueItems = useMemo(
    () => items.filter(isCheckInDue),
    [items]
  )

  const needsFollowUpItems = useMemo(
    () =>
      items
        .filter(
          (i) =>
            (i.status === "needs_follow_up" || i.status === "message_ready") &&
            (!i.check_back_date || i.check_back_date <= todayIso())
        )
        .sort((a, b) => b.amount - a.amount),
    [items]
  )

  const waitingItems = useMemo(
    () =>
      items.filter(
        (i) =>
          (i.status === "sent" || i.status === "waiting") &&
          !isCheckInDue(i)
      ),
    [items]
  )

  const atRisk = useMemo(() => {
    const recoveryTotal = items.reduce((sum, i) => sum + i.amount, 0)
    const invoiceTotal = overdueInvoices.reduce((sum, i) => sum + (i.amount ?? 0), 0)
    const estimateTotal = pendingEstimates.reduce((sum, e) => sum + (e.amount ?? 0), 0)
    return recoveryTotal + invoiceTotal + estimateTotal
  }, [items, overdueInvoices, pendingEstimates])

  const totalActionCount =
    checkInDueItems.length +
    needsFollowUpItems.length +
    overdueInvoices.length +
    pendingEstimates.length +
    acceptedEstimates.length

  const hasAnyItems =
    items.length > 0 ||
    overdueInvoices.length > 0 ||
    pendingEstimates.length > 0 ||
    acceptedEstimates.length > 0

  // ─── Recovery item handlers ───────────────────────────────────

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

  function handleMarkSent(item: RecoveryItem) {
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

  async function handleSnooze(item: RecoveryItem, days: number) {
    setIsSaving(true)
    const label = days === 1 ? "tomorrow" : days === 3 ? "in 3 days" : "next week"
    const ok = await updateItem(item.id, { check_back_date: addDaysIso(days) })
    if (ok) toast.success(`Snoozed — check back ${label}.`)
    setIsSaving(false)
  }

  async function handleRemindLater(item: RecoveryItem) {
    return handleSnooze(item, 1)
  }

  async function handleDone(item: RecoveryItem) {
    setIsSaving(true)
    const ok = await updateItem(item.id, { status: "archived" })
    if (ok) toast.success(`${item.client_name} — marked as handled.`)
    setIsSaving(false)
  }

  function handleSendFollowUp(item: RecoveryItem) {
    setSendFollowUpItem(item)
  }

  function handleEmailSent(updatedItem: RecoveryItem) {
    setItems((prev) => prev.map((i) => (i.id === updatedItem.id ? updatedItem : i)))
  }

  function handleViewReplies(item: RecoveryItem) {
    setViewRepliesItem(item)
  }

  async function handleResolve(item: RecoveryItem) {
    setIsSaving(true)
    const ok = await updateItem(item.id, { status: "resolved" })
    if (ok) toast.success(`${item.client_name} marked as resolved.`)
    setIsSaving(false)
  }

  async function handleLost(item: RecoveryItem) {
    setIsSaving(true)
    const ok = await updateItem(item.id, { status: "lost" })
    if (ok) toast.success(`${item.client_name} marked as not interested.`)
    setIsSaving(false)
  }

  async function handlePaid(item: RecoveryItem) {
    setIsSaving(true)
    const ok = await updateItem(item.id, { status: "resolved" })
    if (ok) toast.success(`${item.client_name} marked as paid / booked.`)
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
    const ok = await updateItem(item.id, {
      status: "needs_follow_up",
      check_back_date: null,
      message_body: newMessage,
      follow_up_count: item.follow_up_count + 1,
    })
    if (ok) toast.success("New follow-up message generated.")
    setIsSaving(false)
  }

  async function handleNoResponse(item: RecoveryItem) {
    setIsSaving(true)
    const newMessage = generateRecoveryItemMessage({
      clientName: item.client_name,
      reason: item.reason,
      amount: item.amount,
      followUpCount: item.follow_up_count + 1,
    })
    const ok = await updateItem(item.id, {
      status: "needs_follow_up",
      check_back_date: null,
      message_body: newMessage,
      follow_up_count: item.follow_up_count + 1,
    })
    if (ok) toast.success("Follow-up refreshed. Try again in a few days.")
    setIsSaving(false)
  }

  // ─── Invoice handlers ─────────────────────────────────────────

  async function handleInvoiceMarkPaid(invoice: InvoiceRow) {
    if (!userId) return
    setIsSaving(true)
    const { error } = await supabase
      .from("invoices")
      .update({ status: "Paid", paid_at: new Date().toISOString() })
      .eq("id", invoice.id)
      .eq("user_id", userId)
    if (error) {
      toast.error(error.message)
    } else {
      setOverdueInvoices((prev) => prev.filter((i) => i.id !== invoice.id))
      toast.success(`${invoice.client_name || invoice.invoice_number} marked as paid.`)
    }
    setIsSaving(false)
  }

  async function handleInvoiceAddToQueue(invoice: InvoiceRow) {
    if (!userId) return
    setIsSaving(true)
    const message = generateRecoveryItemMessage({
      clientName: invoice.client_name || "there",
      reason: "invoice_overdue",
      amount: invoice.amount ?? 0,
      followUpCount: 0,
    })
    const { data, error } = await supabase
      .from("recovery_items")
      .insert({
        user_id: userId,
        client_name: invoice.client_name || "",
        reason: "invoice_overdue",
        amount: invoice.amount ?? 0,
        contacted_date: todayIso(),
        status: "message_ready",
        message_body: message,
      })
      .select()
      .single()
    if (error) {
      toast.error(error.message)
      setIsSaving(false)
      return
    }
    await supabase
      .from("invoices")
      .update({ status: "Follow-up Sent" })
      .eq("id", invoice.id)
      .eq("user_id", userId)

    setOverdueInvoices((prev) => prev.filter((i) => i.id !== invoice.id))
    setItems((prev) => [...prev, data])
    toast.success(`${invoice.client_name || invoice.invoice_number} added to your follow-ups.`)
    setIsSaving(false)
  }

  // ─── Estimate handlers ────────────────────────────────────────

  async function handleEstimateUpdate(
    estimate: EstimateRow,
    patch: { status?: DB["public"]["Tables"]["estimates"]["Update"]["status"]; follow_up_date?: string | null }
  ) {
    if (!userId) return
    setIsSaving(true)
    const { error } = await supabase
      .from("estimates")
      .update(patch)
      .eq("id", estimate.id)
      .eq("user_id", userId)
    if (error) {
      toast.error(error.message)
    } else {
      setPendingEstimates((prev) => prev.filter((e) => e.id !== estimate.id))
    }
    setIsSaving(false)
  }

  async function handleEstimateWon(estimate: EstimateRow) {
    await handleEstimateUpdate(estimate, { status: "Won" })
    toast.success(`${estimate.client_name || estimate.estimate_number} marked as won.`)
  }

  async function handleEstimateLost(estimate: EstimateRow) {
    await handleEstimateUpdate(estimate, { status: "Lost" })
    toast.success(`${estimate.client_name || estimate.estimate_number} marked as lost.`)
  }

  async function handleEstimateSnooze(estimate: EstimateRow) {
    await handleEstimateUpdate(estimate, { follow_up_date: addDaysIso(7) })
    toast.success("Follow-up snoozed 7 days.")
  }

  // ─── Add recovery ─────────────────────────────────────────────

  async function handleSaveItem(payload: Omit<RecoveryItemInsert, "user_id">) {
    if (!userId) { toast.error("You must be logged in."); return }
    const { data, error } = await supabase
      .from("recovery_items")
      .insert({ ...payload, user_id: userId })
      .select()
      .single()
    if (error) { toast.error(error.message); return }
    setItems((prev) => [...prev, data])
    toast.success(`${data.client_name} added to your follow-ups.`)
  }

  async function handleSaveAndMarkSent(payload: Omit<RecoveryItemInsert, "user_id">) {
    if (!userId) { toast.error("You must be logged in."); return }
    const { data, error } = await supabase
      .from("recovery_items")
      .insert({ ...payload, user_id: userId, status: "sent" })
      .select()
      .single()
    if (error) { toast.error(error.message); return }
    setItems((prev) => [...prev, data])
    setCheckBackItem(data)
  }

  async function handleUseDemoData() {
    if (!userId) return
    setIsDemoSeeding(true)
    try {
      await seedDemoRecoveryItems(supabase, userId)
      await load()
      toast.success("Demo data loaded. Explore the app!")
    } catch {
      toast.error("Could not load demo data.")
    }
    setIsDemoSeeding(false)
  }

  // ─── Render ───────────────────────────────────────────────────

  const sharedCardProps = {
    isSaving,
    onMarkSent:      handleMarkSent,
    onSendFollowUp:  handleSendFollowUp,
    onSnooze:        handleSnooze,
    onDone:          handleDone,
    onRemindLater:   handleRemindLater,
    onResolve:       handleResolve,
    onLost:          handleLost,
    onPaid:          handlePaid,
    onFollowUpAgain: handleFollowUpAgain,
    onNoResponse:    handleNoResponse,
    onViewReplies:   handleViewReplies,
  }

  return (
    <>
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

      <div className="grid gap-4 p-4 sm:p-6 lg:p-8">
        <ContentReveal isLoading={isLoading} skeleton={<LoadingSkeleton />}>
          {!hasAnyItems ? (
            <div className="ef-reveal ef-d0">
              <OnboardingState
                onAdd={() => setAddOpen(true)}
                onDemo={() => void handleUseDemoData()}
                isDemoSeeding={isDemoSeeding}
              />
            </div>
          ) : totalActionCount === 0 ? (
            <div className="grid gap-6">
              <div className="ef-reveal ef-d0">
                <AllCaughtUp atRisk={atRisk} waitingCount={waitingItems.length} onAdd={() => setAddOpen(true)} />
              </div>
              {waitingItems.length > 0 && (
                <div className="ef-reveal ef-d2">
                  <WaitingSection
                    items={waitingItems}
                    replyInfoMap={replyInfoMap}
                    defaultOpen
                    sharedCardProps={sharedCardProps}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-6">
              <div className="ef-reveal ef-d0 order-2 sm:order-1">
                <CompactSummary
                  actionCount={totalActionCount}
                  atRisk={atRisk}
                  onAdd={() => setAddOpen(true)}
                  onStartNextTask={() =>
                    actionSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                />
              </div>

              <div ref={actionSectionRef} className="order-1 grid gap-6 sm:order-2">
                <div className="ef-reveal ef-d2">
                  <ActionSection
                    label="Needs your attention"
                    count={totalActionCount}
                    urgent
                  >
                    {overdueInvoices.map((inv) => (
                      <InvoiceActionCard
                        key={inv.id}
                        invoice={inv}
                        isSaving={isSaving}
                        onMarkPaid={handleInvoiceMarkPaid}
                        onAddToQueue={handleInvoiceAddToQueue}
                      />
                    ))}
                    {checkInDueItems.map((item) => (
                      <RecoveryCard
                        key={item.id}
                        item={item}
                        isCheckIn
                        replyInfo={replyInfoMap[item.id]}
                        {...sharedCardProps}
                      />
                    ))}
                    {needsFollowUpItems.map((item) => (
                      <RecoveryCard
                        key={item.id}
                        item={item}
                        isCheckIn={false}
                        replyInfo={replyInfoMap[item.id]}
                        {...sharedCardProps}
                      />
                    ))}
                    {acceptedEstimates.map((est) => (
                      <AcceptedEstimateActionCard key={est.id} estimate={est} />
                    ))}
                    {pendingEstimates.map((est) => (
                      <EstimateActionCard
                        key={est.id}
                        estimate={est}
                        isSaving={isSaving}
                        onWon={handleEstimateWon}
                        onLost={handleEstimateLost}
                        onSnooze={handleEstimateSnooze}
                      />
                    ))}
                  </ActionSection>
                </div>

                {waitingItems.length > 0 && (
                  <div className="ef-reveal ef-d4">
                    <WaitingSection
                      items={waitingItems}
                      replyInfoMap={replyInfoMap}
                      defaultOpen={false}
                      sharedCardProps={sharedCardProps}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </ContentReveal>
      </div>
    </>
  )
}

// ─── Compact summary card ─────────────────────────────────────

function CompactSummary({
  actionCount,
  atRisk,
  onAdd,
  onStartNextTask,
}: {
  actionCount: number
  atRisk: number
  onAdd: () => void
  onStartNextTask: () => void
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl shadow-lg">
      {/* CSS gradient base — also fallback if WebGL unavailable */}
      <div className="absolute inset-0 bg-gradient-to-br from-ef-ink via-[#013060] to-ef-ocean" />
      {/* Subtle dot texture */}
      <div className="absolute inset-0 ef-dot-grid opacity-[0.10]" />

      {/* 3D ocean scene */}
      <div className="absolute inset-0">
        <OceanScene />
      </div>

      {/* Left-side vignette — text legibility over the 3D scene */}
      <div className="absolute inset-0 bg-gradient-to-r from-ef-ink/[0.92] via-ef-ink/50 to-transparent" />
      {/* Bottom vignette — blends ocean into card edge */}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-ef-ink/40 to-transparent" />

      {/* Content */}
      <div className="relative px-5 py-6 sm:px-10 sm:py-12">
        {/* Today label */}
        <div className="mb-3 flex items-center gap-2.5 sm:mb-5">
          <StatusPulse variant="warning" pulse />
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/50">
            Today
          </span>
        </div>

        {/* Headline */}
        <h2 className="text-3xl font-bold leading-none tracking-tight text-white sm:text-5xl">
          {actionCount === 1 ? "1 thing" : `${actionCount} things`}
          <span className="text-white/40"> to handle</span>
        </h2>

        {/* Money on the table */}
        <p className="mt-4 flex items-baseline gap-2.5">
          <span className="text-2xl font-bold tabular-nums text-ef-orange">
            {money.format(atRisk)}
          </span>
          <span className="text-base text-white/50">on the table</span>
        </p>

        {/* CTAs */}
        <div className="mt-5 flex flex-wrap gap-3 sm:mt-8">
          <Button
            className="bg-ef-orange text-white shadow-md shadow-black/25 hover:bg-ef-orange/90"
            onClick={onStartNextTask}
          >
            Start next task
          </Button>
          <Button
            variant="outline"
            onClick={onAdd}
            className="gap-1.5 border-white/20 bg-white/10 text-white hover:border-white/30 hover:bg-white/15 hover:text-white"
          >
            <Plus className="size-4" />
            Follow up
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Action section wrapper ───────────────────────────────────

function ActionSection({
  label,
  count,
  urgent = false,
  children,
}: {
  label: string
  count: number
  urgent?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2.5">
        <StatusPulse
          variant={urgent ? "warning" : "info"}
          pulse={urgent}
          className="shrink-0"
        />
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="shrink-0 rounded-full border border-border bg-background px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          {count}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      {children}
    </div>
  )
}

// ─── Waiting section (collapsible) ────────────────────────────

function WaitingSection({
  items,
  replyInfoMap,
  defaultOpen,
  sharedCardProps,
}: {
  items: RecoveryItem[]
  replyInfoMap: Record<string, ReplyInfo>
  defaultOpen: boolean
  sharedCardProps: {
    isSaving: boolean
    onMarkSent: (item: RecoveryItem) => void
    onSendFollowUp: (item: RecoveryItem) => void
    onSnooze: (item: RecoveryItem, days: number) => void
    onDone: (item: RecoveryItem) => void
    onRemindLater: (item: RecoveryItem) => void
    onResolve: (item: RecoveryItem) => void
    onLost: (item: RecoveryItem) => void
    onPaid: (item: RecoveryItem) => void
    onFollowUpAgain: (item: RecoveryItem) => void
    onNoResponse: (item: RecoveryItem) => void
    onViewReplies: (item: RecoveryItem) => void
  }
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="grid gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 text-left"
      >
        <StatusPulse variant="neutral" className="shrink-0" />
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          Waiting on clients
        </span>
        <span className="shrink-0 rounded-full border border-border bg-background px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          {items.length}
        </span>
        <div className="h-px flex-1 bg-border" />
        {open ? (
          <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="grid gap-3 opacity-80">
          {items.map((item) => (
            <RecoveryCard
              key={item.id}
              item={item}
              isCheckIn={false}
              isWaiting
              replyInfo={replyInfoMap[item.id]}
              {...sharedCardProps}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Invoice action card ───────────────────────────────────────

function InvoiceActionCard({
  invoice,
  isSaving,
  onMarkPaid,
  onAddToQueue,
}: {
  invoice: InvoiceRow
  isSaving: boolean
  onMarkPaid: (invoice: InvoiceRow) => void
  onAddToQueue: (invoice: InvoiceRow) => void
}) {
  const days = invoice.due_date ? overdueDays(invoice.due_date) : 0
  const isOverdue = days > 0

  return (
    <div
      className={cn(
        "euroflo-card-transition relative overflow-hidden rounded-xl border border-border bg-card shadow-sm hover:shadow-md",
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
        isOverdue ? "before:bg-orange-500" : "before:bg-amber-400"
      )}
    >
      <div className="flex flex-col gap-2.5 py-3.5 pl-5 pr-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              isOverdue
                ? "bg-orange-100 dark:bg-orange-900/25"
                : "bg-amber-100 dark:bg-amber-900/25"
            )}
          >
            <FileText
              className={cn(
                "size-3.5",
                isOverdue
                  ? "text-orange-600 dark:text-orange-400"
                  : "text-amber-600 dark:text-amber-400"
              )}
            />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="truncate text-sm font-semibold text-foreground">
                {invoice.client_name || "No client"}
              </p>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                  isOverdue
                    ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300"
                )}
              >
                {isOverdue ? `${days}d overdue` : "due today"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {invoice.invoice_number}
              {" · "}
              <span className="font-medium tabular-nums text-foreground">
                {money.format(invoice.amount ?? 0)}
              </span>
              {" · "}
              Invoice
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5 bg-ef-orange text-white hover:bg-ef-orange"
            disabled={isSaving}
            onClick={() => onAddToQueue(invoice)}
          >
            <Send className="size-3.5" />
            Generate follow-up
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isSaving}
            onClick={() => onMarkPaid(invoice)}
          >
            Mark paid
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Estimate action card ──────────────────────────────────────

function EstimateActionCard({
  estimate,
  isSaving,
  onWon,
  onLost,
  onSnooze,
}: {
  estimate: EstimateRow
  isSaving: boolean
  onWon: (estimate: EstimateRow) => void
  onLost: (estimate: EstimateRow) => void
  onSnooze: (estimate: EstimateRow) => void
}) {
  return (
    <div className="euroflo-card-transition relative overflow-hidden rounded-xl border border-border bg-card shadow-sm hover:shadow-md before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-ef-cyan">
      <div className="flex flex-col gap-2.5 py-3.5 pl-5 pr-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ef-mist dark:bg-ef-navy/25">
            <ClipboardList className="size-3.5 text-ef-ocean dark:text-ef-cyan" />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="truncate text-sm font-semibold text-foreground">
                {estimate.client_name || "No client"}
              </p>
              <span className="shrink-0 rounded-full bg-ef-mist px-2 py-0.5 text-xs font-medium text-ef-ocean dark:bg-ef-navy/30 dark:text-ef-300">
                follow-up due
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {estimate.estimate_number}
              {" · "}
              <span className="font-medium tabular-nums text-foreground">
                {money.format(estimate.amount ?? 0)}
              </span>
              {" · "}
              Estimate
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="bg-ef-orange text-white hover:bg-ef-orange"
            disabled={isSaving}
            onClick={() => onWon(estimate)}
          >
            They said yes
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isSaving}
            onClick={() => onSnooze(estimate)}
          >
            Followed up
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={isSaving}
            onClick={() => onLost(estimate)}
            className="text-muted-foreground hover:text-foreground"
          >
            Not interested
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Accepted estimate card ────────────────────────────────────

function AcceptedEstimateActionCard({ estimate }: { estimate: EstimateRow }) {
  return (
    <div className="euroflo-card-transition relative overflow-hidden rounded-xl border border-border bg-card shadow-sm hover:shadow-md before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-ef-ocean">
      <div className="flex flex-col gap-2.5 py-3.5 pl-5 pr-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ef-mist dark:bg-ef-navy/25">
            <ClipboardList className="size-3.5 text-ef-ocean dark:text-ef-cyan" />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="truncate text-sm font-semibold text-foreground">
                {estimate.client_name || "No client"}
              </p>
              <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                Accepted
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {estimate.estimate_number}
              {" · "}
              <span className="font-medium tabular-nums text-foreground">
                {money.format(estimate.amount ?? 0)}
              </span>
              {" · "}
              Create invoice or collect payment next
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="bg-ef-orange text-white hover:bg-ef-orange"
          asChild
        >
          <Link href="/dashboard/estimates">Open estimate</Link>
        </Button>
      </div>
    </div>
  )
}

// ─── Onboarding state ──────────────────────────────────────────

function OnboardingState({
  onAdd,
  onDemo,
  isDemoSeeding,
}: {
  onAdd: () => void
  onDemo: () => void
  isDemoSeeding: boolean
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl shadow-lg">
      <div className="absolute inset-0 bg-gradient-to-br from-ef-ink via-[#013060] to-ef-ocean" />
      <div className="absolute inset-0 ef-dot-grid opacity-[0.18]" />
      <div className="pointer-events-none absolute -right-12 top-1/4 size-48 rounded-full bg-ef-sky/12 blur-3xl" />
      <div className="pointer-events-none absolute -top-8 left-1/4 size-40 rounded-full bg-ef-cyan/10 blur-2xl" />

      <div className="relative mx-auto max-w-sm px-6 py-16 text-center sm:py-20">
        <div className="mx-auto mb-7 flex size-16 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
          <Sparkles className="size-7 text-ef-sky" />
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-white">
          Follow up with your first customer.
        </h2>
        <p className="mt-4 text-sm leading-7 text-white/55">
          Add a customer and the reason you&apos;re chasing them — an unpaid
          invoice or a quiet estimate — and Euroflo drafts the message and shows
          you who to contact today.
        </p>
        <div className="mt-9 flex flex-col gap-3">
          <Button
            className="w-full gap-2 bg-ef-orange text-white shadow-md shadow-black/25 hover:bg-ef-orange/90"
            onClick={onAdd}
          >
            <Plus className="size-4" />
            Add a real customer
          </Button>
          <Button
            variant="outline"
            className="w-full gap-2 border-white/20 bg-white/10 text-white hover:border-white/30 hover:bg-white/15 hover:text-white"
            onClick={onDemo}
            disabled={isDemoSeeding}
          >
            <Database className="size-4" />
            {isDemoSeeding ? "Loading demo data…" : "Use demo data"}
          </Button>
        </div>
        <p className="mt-7 text-xs text-white/35">
          Already have customers?{" "}
          <Link href="/dashboard/clients" className="font-medium text-white/60 transition-colors hover:text-white">
            Go to Clients
          </Link>
        </p>
      </div>
    </div>
  )
}

// ─── All caught up state ───────────────────────────────────────

function AllCaughtUp({
  atRisk,
  waitingCount,
  onAdd,
}: {
  atRisk: number
  waitingCount: number
  onAdd: () => void
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl shadow-lg">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-900 via-emerald-700 to-emerald-500" />
      <div className="absolute inset-0 ef-dot-grid opacity-[0.10]" />
      <div className="pointer-events-none absolute -bottom-12 -right-8 size-56 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative px-6 py-12 text-center sm:px-10 sm:py-14">
        <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-full bg-emerald-400/15 ring-1 ring-emerald-400/25">
          <svg
            className="size-7 text-emerald-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h3 className="text-3xl font-bold tracking-tight text-white">
          You&apos;re caught up.
        </h3>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/50">
          {atRisk > 0
            ? `${money.format(atRisk)} is being tracked.${waitingCount > 0 ? ` ${waitingCount} item${waitingCount === 1 ? "" : "s"} waiting for a reply.` : ""} Come back tomorrow.`
            : "No follow-ups due. Come back tomorrow, or follow up with someone new."}
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button
            className="gap-2 bg-ef-orange text-white shadow-md shadow-black/25 hover:bg-ef-orange/90"
            onClick={onAdd}
          >
            <Plus className="size-4" />
            Follow up
          </Button>
          <Button
            variant="outline"
            className="gap-2 border-white/20 bg-white/10 text-white hover:border-white/30 hover:bg-white/15 hover:text-white"
            asChild
          >
            <Link href="/dashboard/recoveries">
              <ArrowUpRight className="size-4" />
              View all follow-ups
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="h-20 animate-pulse rounded-xl border border-border bg-muted/30" />
      <div className="grid gap-3 pt-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl border border-border bg-muted/30"
          />
        ))}
      </div>
    </div>
  )
}
