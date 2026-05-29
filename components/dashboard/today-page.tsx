"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import Link from "next/link"
import {
  ArrowUpRight,
  ClipboardList,
  Database,
  FileText,
  Plus,
  Send,
  Sparkles,
  TrendingUp,
} from "lucide-react"
import { toast } from "sonner"

import { AddRecoveryDialog } from "@/components/dashboard/add-recovery-dialog"
import { CheckBackDialog } from "@/components/dashboard/check-back-dialog"
import { RecoveryCard } from "@/components/dashboard/recovery-card"
import { ContentReveal } from "@/components/ui/content-reveal"
import { Button } from "@/components/ui/button"
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
  const [userId, setUserId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [checkBackItem, setCheckBackItem] = useState<RecoveryItem | null>(null)
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

    setItems(itemsResult.data ?? [])
    setClients(clientsResult.data ?? [])
    setOverdueInvoices(invoicesResult.data ?? [])
    setPendingEstimates(estimatesResult.data ?? [])
    setAcceptedEstimates(acceptedEstimatesResult.data ?? [])
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

  const needsActionItems = useMemo(
    () =>
      items
        .filter(
          (i) =>
            i.status === "needs_follow_up" &&
            (!i.check_back_date || i.check_back_date <= todayIso())
        )
        .sort((a, b) => b.amount - a.amount),
    [items]
  )

  const messageReadyItems = useMemo(
    () =>
      items
        .filter(
          (i) =>
            i.status === "message_ready" &&
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
    needsActionItems.length +
    messageReadyItems.length +
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

  async function handleRemindLater(item: RecoveryItem) {
    setIsSaving(true)
    const ok = await updateItem(item.id, { check_back_date: addDaysIso(1) })
    if (ok) toast.success("Snoozed until tomorrow.")
    setIsSaving(false)
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
    toast.success(`${invoice.client_name || invoice.invoice_number} added to recovery queue.`)
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
    toast.success(`${data.client_name} added to your recovery queue.`)
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
    onMarkSent: handleMarkSent,
    onRemindLater: handleRemindLater,
    onResolve: handleResolve,
    onLost: handleLost,
    onPaid: handlePaid,
    onFollowUpAgain: handleFollowUpAgain,
    onNoResponse: handleNoResponse,
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

      <div className="grid gap-4 p-4 sm:p-6 lg:p-8">
        <ContentReveal isLoading={isLoading} skeleton={<LoadingSkeleton />}>
          {!hasAnyItems ? (
            <OnboardingState
              onAdd={() => setAddOpen(true)}
              onDemo={() => void handleUseDemoData()}
              isDemoSeeding={isDemoSeeding}
            />
          ) : totalActionCount === 0 ? (
            <AllCaughtUp atRisk={atRisk} waitingCount={waitingItems.length} onAdd={() => setAddOpen(true)} />
          ) : (
            <div className="grid gap-6">
              {/* Hero summary */}
              <HeroSummary
                actionCount={totalActionCount}
                atRisk={atRisk}
                onAdd={() => setAddOpen(true)}
                onStartHighestValue={() =>
                  actionSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              />

              <div ref={actionSectionRef} className="grid gap-8">
                {/* Section 1: Needs action now */}
                {(checkInDueItems.length > 0 ||
                  needsActionItems.length > 0 ||
                  overdueInvoices.length > 0 ||
                  pendingEstimates.length > 0 ||
                  acceptedEstimates.length > 0) && (
                  <ActionSection
                    label="Needs action now"
                    dot="bg-amber-400"
                    count={checkInDueItems.length + needsActionItems.length + overdueInvoices.length + pendingEstimates.length + acceptedEstimates.length}
                  >
                    {checkInDueItems.map((item) => (
                      <RecoveryCard
                        key={item.id}
                        item={item}
                        isCheckIn
                        {...sharedCardProps}
                      />
                    ))}
                    {needsActionItems.map((item) => (
                      <RecoveryCard
                        key={item.id}
                        item={item}
                        isCheckIn={false}
                        {...sharedCardProps}
                      />
                    ))}
                    {overdueInvoices.map((inv) => (
                      <InvoiceActionCard
                        key={inv.id}
                        invoice={inv}
                        isSaving={isSaving}
                        onMarkPaid={handleInvoiceMarkPaid}
                        onAddToQueue={handleInvoiceAddToQueue}
                      />
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
                    {acceptedEstimates.map((est) => (
                      <AcceptedEstimateActionCard key={est.id} estimate={est} />
                    ))}
                  </ActionSection>
                )}

                {/* Section 2: Message ready */}
                {messageReadyItems.length > 0 && (
                  <ActionSection
                    label="Message ready"
                    dot="bg-green-500"
                    count={messageReadyItems.length}
                  >
                    {messageReadyItems.map((item) => (
                      <RecoveryCard
                        key={item.id}
                        item={item}
                        isCheckIn={false}
                        {...sharedCardProps}
                      />
                    ))}
                  </ActionSection>
                )}

                {/* Section 3: Waiting for reply */}
                {waitingItems.length > 0 && (
                  <ActionSection
                    label="Waiting for reply"
                    dot="bg-blue-400"
                    count={waitingItems.length}
                    muted
                  >
                    {waitingItems.map((item) => (
                      <RecoveryCard
                        key={item.id}
                        item={item}
                        isCheckIn={false}
                        isWaiting
                        {...sharedCardProps}
                      />
                    ))}
                  </ActionSection>
                )}
              </div>
            </div>
          )}
        </ContentReveal>
      </div>
    </>
  )
}

// ─── Hero summary card ────────────────────────────────────────

function HeroSummary({
  actionCount,
  atRisk,
  onAdd,
  onStartHighestValue,
}: {
  actionCount: number
  atRisk: number
  onAdd: () => void
  onStartHighestValue: () => void
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 via-transparent to-transparent" />
      <div className="relative flex flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <span className="text-xs font-bold tabular-nums text-amber-700 dark:text-amber-400">
                {actionCount}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              Today&apos;s follow-ups
            </h2>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {actionCount === 1
              ? "1 person needs attention."
              : `${actionCount} people need attention.`}{" "}
            <span className="font-medium text-foreground">
              {money.format(atRisk)}
            </span>{" "}
            still on the table.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            className="gap-1.5 bg-green-700 text-white hover:bg-green-800"
            onClick={onStartHighestValue}
          >
            <TrendingUp className="size-4" />
            Start with highest value
          </Button>
          <Button variant="outline" onClick={onAdd} className="gap-1.5">
            <Plus className="size-4" />
            Add recovery
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Action section wrapper ───────────────────────────────────

function ActionSection({
  label,
  dot,
  count,
  muted = false,
  children,
}: {
  label: string
  dot: string
  count: number
  muted?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <div className={cn("size-2 shrink-0 rounded-full", dot)} />
        <span className={cn(
          "shrink-0 text-xs font-semibold uppercase tracking-widest",
          muted ? "text-muted-foreground/70" : "text-muted-foreground"
        )}>
          {label}
        </span>
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          {count}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      {children}
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
        "relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md",
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
        isOverdue ? "before:bg-orange-500" : "before:bg-amber-400"
      )}
    >
      <div className="flex flex-col gap-3 py-4 pl-5 pr-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
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
              <p className="truncate font-semibold text-foreground">
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
            <p className="mt-0.5 text-sm text-muted-foreground">
              {invoice.invoice_number}
              {" · "}
              <span className="font-medium tabular-nums text-foreground">
                {money.format(invoice.amount ?? 0)}
              </span>
              {" · "}
              <span className="text-muted-foreground">Invoice</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5 bg-green-700 text-white hover:bg-green-800"
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
    <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-green-400">
      <div className="flex flex-col gap-3 py-4 pl-5 pr-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/25">
            <ClipboardList className="size-3.5 text-green-600 dark:text-green-400" />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="truncate font-semibold text-foreground">
                {estimate.client_name || "No client"}
              </p>
              <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
                follow-up due
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {estimate.estimate_number}
              {" · "}
              <span className="font-medium tabular-nums text-foreground">
                {money.format(estimate.amount ?? 0)}
              </span>
              {" · "}
              <span className="text-muted-foreground">Estimate</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="bg-green-700 text-white hover:bg-green-800"
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

// ─── Onboarding state ──────────────────────────────────────────

function AcceptedEstimateActionCard({ estimate }: { estimate: EstimateRow }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-green-600">
      <div className="flex flex-col gap-3 py-4 pl-5 pr-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/25">
            <ClipboardList className="size-3.5 text-green-700 dark:text-green-400" />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="truncate font-semibold text-foreground">
                {estimate.client_name || "No client"}
              </p>
              <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
                accepted
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {estimate.estimate_number}
              {" - "}
              <span className="font-medium tabular-nums text-foreground">
                {money.format(estimate.amount ?? 0)}
              </span>
              {" - "}
              <span className="text-muted-foreground">Create invoice next</span>
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="bg-green-700 text-white hover:bg-green-800"
          asChild
        >
          <Link href="/dashboard/estimates">Open estimate</Link>
        </Button>
      </div>
    </div>
  )
}

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
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-green-100 dark:bg-green-900/30">
        <Sparkles className="size-7 text-green-700 dark:text-green-400" />
      </div>
      <h2 className="text-xl font-semibold text-foreground">
        Let&apos;s set up your first recovery job.
      </h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Add a customer and what happened — EstiGator will generate a follow-up
        message and show you who to contact today.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Button
          className="w-full gap-2 bg-green-700 text-white hover:bg-green-800"
          onClick={onAdd}
        >
          <Plus className="size-4" />
          Add a real customer
        </Button>
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={onDemo}
          disabled={isDemoSeeding}
        >
          <Database className="size-4" />
          {isDemoSeeding ? "Loading demo data…" : "Use demo data"}
        </Button>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Already have customers?{" "}
        <Link href="/dashboard/clients" className="font-medium text-foreground hover:underline">
          Go to Clients
        </Link>
      </p>
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
    <div className="relative overflow-hidden rounded-2xl border border-green-200 bg-gradient-to-br from-green-50 to-emerald-50/60 dark:border-green-900/50 dark:from-green-950/30 dark:to-emerald-950/20">
      <div className="absolute right-0 top-0 size-40 -translate-y-1/2 translate-x-1/2 rounded-full bg-green-100/60 blur-3xl dark:bg-green-900/20" />
      <div className="relative px-8 py-10 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
          <svg
            className="size-6 text-green-600 dark:text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-green-800 dark:text-green-200">
          You&apos;re all caught up for today.
        </h3>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-green-700/70 dark:text-green-300/70">
          {atRisk > 0
            ? `${money.format(atRisk)} is being tracked.${waitingCount > 0 ? ` ${waitingCount} item${waitingCount === 1 ? "" : "s"} waiting for a reply.` : ""} Come back tomorrow.`
            : "No pending follow-ups. Come back tomorrow or add a new recovery job."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            className="gap-2 bg-green-700 text-white hover:bg-green-800"
            onClick={onAdd}
          >
            <Plus className="size-4" />
            Add recovery job
          </Button>
          <Button variant="outline" className="gap-2 border-green-200 bg-white/80 text-green-800 hover:bg-white dark:border-green-800 dark:bg-green-950/40 dark:text-green-200" asChild>
            <Link href="/dashboard/recoveries">
              <ArrowUpRight className="size-4" />
              View all recoveries
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
      <div className="h-28 animate-pulse rounded-2xl border border-border bg-muted/30" />
      <div className="grid gap-3 pt-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-36 animate-pulse rounded-xl border border-border bg-muted/30"
          />
        ))}
      </div>
    </div>
  )
}
