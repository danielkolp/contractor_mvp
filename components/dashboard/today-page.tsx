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
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Clock,
  Copy,
  CreditCard,
  Database,
  ExternalLink,
  FileText,
  Link2,
  MapPin,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { StatusPulse } from "@/components/ui/status-pulse"
import { generateRecoveryItemMessage } from "@/lib/recovery-engine"
import { money } from "@/lib/format-money"
import {
  INPUT_LIMITS,
  inputErrorMessage,
  isoDateField,
  numberField,
  optionalIsoDateField,
  optionalTextField,
  textField,
  uuidField,
} from "@/lib/security/input"
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
type JobRequestRow = DB["public"]["Tables"]["job_requests"]["Row"]

// A scheduled work day joined to the estimate it belongs to (the "job").
type WorkDayRow = {
  id: string
  starts_at: string
  ends_at: string | null
  status: string
  estimate_id: string
  estimates: {
    id: string
    client_name: string | null
    job_request_id: string | null
    job_completed_at: string | null
    status: string
  } | null
}

// A job (estimate) whose scheduled work days have all passed without being
// marked complete — the contractor is asked to confirm or add more days.
type JobAwaitingCompletion = {
  estimateId: string
  jobRequestId: string | null
  clientName: string
  lastDayIso: string
}

// Job-request statuses that still need the contractor to do something.
// (Excludes terminal / handed-off states: estimate_created, accepted,
// declined, declined_by_contractor, closed.)
const ACTIONABLE_REQUEST_STATUSES = new Set([
  "new",
  "reviewed",
  "needs_info",
  "inspection_scheduled",
  "inspection_confirmed",
  "visit_completed",
])

function requestUrgencyLabel(urgency: string): string {
  return urgency
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ")
}

function requestStatusLabel(status: string): string {
  if (status === "new") return "New"
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ")
}

// ─── Scheduled-visit agenda (inspections + work days) ───────────
type VisitItem = {
  kind: "inspection" | "work"
  id: string
  startsAt: string
  confirmed: boolean
  clientName: string
  href: string
}

const visitTimeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
})
const visitDayFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
})

function visitTime(iso: string): string {
  return visitTimeFmt.format(new Date(iso))
}
function visitDay(iso: string): string {
  return visitDayFmt.format(new Date(iso))
}
function isSameLocalDay(iso: string, ref: Date): boolean {
  const d = new Date(iso)
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  )
}

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
  const [activeEstimates, setActiveEstimates] = useState<EstimateRow[]>([])
  const [workDays, setWorkDays] = useState<WorkDayRow[]>([])
  const [jobRequests, setJobRequests] = useState<JobRequestRow[]>([])
  const [requestSlug, setRequestSlug] = useState<string | null>(null)
  // null = unknown (still loading); false = cannot receive payments yet.
  const [stripeReady, setStripeReady] = useState<boolean | null>(null)
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
      activeEstimatesResult,
      jobRequestsResult,
      scheduledWorkResult,
      profileResult,
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
        supabase
          .from("estimates")
          .select("*")
          .eq("user_id", user.id)
          .in("status", ["Sent", "Follow-up Sent", "Interested"])
          .gt("follow_up_date", todayIso())
          .order("sent_date", { ascending: false })
          .limit(10),
        supabase
          .from("job_requests")
          .select("*")
          .eq("contractor_id", user.id)
          .order("created_at", { ascending: false }),
        // Scheduled work days, joined to their estimate (the "job"). Includes
        // past days so the completion prompt can ask "did you finish?".
        supabase
          .from("scheduled_work_days")
          .select(
            "id, starts_at, ends_at, status, estimate_id, estimates(id, client_name, job_request_id, job_completed_at, status)"
          )
          .eq("user_id", user.id)
          .eq("status", "scheduled")
          .order("starts_at", { ascending: true }),
        supabase
          .from("profiles")
          .select("request_slug, stripe_charges_enabled")
          .eq("user_id", user.id)
          .maybeSingle(),
      ])

    const loadedItems = itemsResult.data ?? []
    setItems(loadedItems)
    setClients(clientsResult.data ?? [])
    setOverdueInvoices(invoicesResult.data ?? [])
    setPendingEstimates(estimatesResult.data ?? [])
    setAcceptedEstimates(acceptedEstimatesResult.data ?? [])
    setActiveEstimates(activeEstimatesResult.data ?? [])
    setWorkDays((scheduledWorkResult.data ?? []) as unknown as WorkDayRow[])
    setJobRequests(jobRequestsResult.data ?? [])
    setRequestSlug(profileResult.data?.request_slug ?? null)
    setStripeReady(profileResult.data?.stripe_charges_enabled ?? false)

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

  // Active, contractor-actionable job requests (the "did anyone contact me?" inbox).
  const actionableRequests = useMemo(
    () =>
      jobRequests.filter((r) => ACTIONABLE_REQUEST_STATUSES.has(r.status ?? "")),
    [jobRequests]
  )

  const newRequests = useMemo(
    () => actionableRequests.filter((r) => r.status === "new"),
    [actionableRequests]
  )

  // ─── Scheduled visits (inspections + work days) ───────────────
  // Inspections live on job_requests; work days live on estimates. We merge
  // them into one chronological agenda so Today can answer "where do I need to
  // be?" — the question the app currently never answers for the contractor.
  const upcomingVisits = useMemo<VisitItem[]>(() => {
    const startOfTodayMs = (() => {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    })()

    const inspections: VisitItem[] = jobRequests
      .filter(
        (r) =>
          r.scheduled_visit_starts_at &&
          (r.status === "inspection_confirmed" || r.status === "inspection_scheduled")
      )
      .map((r) => ({
        kind: "inspection" as const,
        id: r.id,
        startsAt: r.scheduled_visit_starts_at!,
        confirmed: r.status === "inspection_confirmed",
        clientName: r.client_name || "a client",
        href: `/dashboard/job-requests?request=${r.id}`,
      }))

    const work: VisitItem[] = workDays.map((d) => ({
      kind: "work" as const,
      id: d.id,
      startsAt: d.starts_at,
      confirmed: true,
      clientName: d.estimates?.client_name || "a client",
      href: `/dashboard/estimates?highlight=${d.estimate_id}`,
    }))

    return [...inspections, ...work]
      .filter((v) => new Date(v.startsAt).getTime() >= startOfTodayMs)
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  }, [jobRequests, workDays])

  const todaysVisits = useMemo(
    () => upcomingVisits.filter((v) => isSameLocalDay(v.startsAt, new Date())),
    [upcomingVisits]
  )

  const todaysInspections = useMemo(
    () => todaysVisits.filter((v) => v.kind === "inspection"),
    [todaysVisits]
  )
  const todaysWork = useMemo(
    () => todaysVisits.filter((v) => v.kind === "work"),
    [todaysVisits]
  )
  // The next visit on a future day — used only when nothing is scheduled today.
  const nextVisit = useMemo(
    () => (todaysVisits.length === 0 ? upcomingVisits[0] ?? null : null),
    [todaysVisits, upcomingVisits]
  )

  // Jobs whose every scheduled work day has passed but that aren't marked
  // complete — surface a "did you finish?" prompt so multi-day jobs don't just
  // vanish from the agenda. Grouped by estimate.
  const jobsAwaitingCompletion = useMemo<JobAwaitingCompletion[]>(() => {
    const now = Date.now()
    const byEstimate = new Map<string, WorkDayRow[]>()
    for (const d of workDays) {
      const list = byEstimate.get(d.estimate_id)
      if (list) list.push(d)
      else byEstimate.set(d.estimate_id, [d])
    }

    const result: JobAwaitingCompletion[] = []
    for (const [estimateId, days] of byEstimate) {
      const est = days[0].estimates
      if (!est) continue
      if (est.job_completed_at) continue
      if (["Lost", "Declined", "Archived"].includes(est.status)) continue
      // The latest day's end (or start) must be in the past.
      const latestMs = Math.max(
        ...days.map((d) => new Date(d.ends_at ?? d.starts_at).getTime())
      )
      if (latestMs >= now) continue
      result.push({
        estimateId,
        jobRequestId: est.job_request_id,
        clientName: est.client_name || "this job",
        lastDayIso: new Date(latestMs).toISOString(),
      })
    }
    return result.sort(
      (a, b) => new Date(a.lastDayIso).getTime() - new Date(b.lastDayIso).getTime()
    )
  }, [workDays])

  const atRisk = useMemo(() => {
    const recoveryTotal = items.reduce((sum, i) => sum + i.amount, 0)
    const invoiceTotal = overdueInvoices.reduce((sum, i) => sum + (i.amount ?? 0), 0)
    const estimateTotal = pendingEstimates.reduce((sum, e) => sum + (e.amount ?? 0), 0)
    return recoveryTotal + invoiceTotal + estimateTotal
  }, [items, overdueInvoices, pendingEstimates])

  const totalActionCount =
    actionableRequests.length +
    checkInDueItems.length +
    needsFollowUpItems.length +
    overdueInvoices.length +
    pendingEstimates.length +
    acceptedEstimates.length +
    jobsAwaitingCompletion.length

  const followUpActionCount =
    checkInDueItems.length +
    needsFollowUpItems.length +
    overdueInvoices.length +
    pendingEstimates.length +
    acceptedEstimates.length +
    jobsAwaitingCompletion.length

  const hasAnyItems =
    items.length > 0 ||
    overdueInvoices.length > 0 ||
    pendingEstimates.length > 0 ||
    acceptedEstimates.length > 0 ||
    activeEstimates.length > 0 ||
    jobRequests.length > 0 ||
    jobsAwaitingCompletion.length > 0

  // ─── Recovery item handlers ───────────────────────────────────

  async function updateItem(id: string, patch: RecoveryItemUpdate): Promise<boolean> {
    if (!userId) return false
    let safeId: string
    try {
      safeId = uuidField(id, "Recovery item")
    } catch (error) {
      toast.error(inputErrorMessage(error))
      return false
    }

    const { data, error } = await supabase
      .from("recovery_items")
      .update(patch)
      .eq("id", safeId)
      .eq("user_id", userId)
      .select()
      .single()
    if (error) { toast.error(error.message); return false }
    setItems((prev) => prev.map((i) => (i.id === safeId ? data : i)))
    return true
  }

  function handleMarkSent(item: RecoveryItem) {
    setCheckBackItem(item)
  }

  async function handleCheckBackConfirm(date: string) {
    if (!checkBackItem) return
    let checkBackDate: string
    try {
      checkBackDate = isoDateField(date, "Check-back date")
    } catch (error) {
      toast.error(inputErrorMessage(error))
      return
    }

    setIsSaving(true)
    const ok = await updateItem(checkBackItem.id, { status: "sent", check_back_date: checkBackDate })
    if (ok) {
      toast.success(
        `Marked as sent. Check-in scheduled for ${new Date(
          `${checkBackDate}T00:00:00`
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
    let messageBody: string | null
    try {
      messageBody = optionalTextField(newMessage, "Message", {
        maxLength: INPUT_LIMITS.message,
        multiline: true,
      })
    } catch (error) {
      toast.error(inputErrorMessage(error))
      setIsSaving(false)
      return
    }
    const ok = await updateItem(item.id, {
      status: "needs_follow_up",
      check_back_date: null,
      message_body: messageBody,
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
    let messageBody: string | null
    try {
      messageBody = optionalTextField(newMessage, "Message", {
        maxLength: INPUT_LIMITS.message,
        multiline: true,
      })
    } catch (error) {
      toast.error(inputErrorMessage(error))
      setIsSaving(false)
      return
    }
    const ok = await updateItem(item.id, {
      status: "needs_follow_up",
      check_back_date: null,
      message_body: messageBody,
      follow_up_count: item.follow_up_count + 1,
    })
    if (ok) toast.success("Follow-up refreshed. Try again in a few days.")
    setIsSaving(false)
  }

  // ─── Invoice handlers ─────────────────────────────────────────

  async function handleInvoiceMarkPaid(invoice: InvoiceRow) {
    if (!userId) return
    let invoiceId: string
    try {
      invoiceId = uuidField(invoice.id, "Invoice")
    } catch (error) {
      toast.error(inputErrorMessage(error))
      return
    }

    setIsSaving(true)
    const { error } = await supabase
      .from("invoices")
      .update({ status: "Paid", paid_at: new Date().toISOString() })
      .eq("id", invoiceId)
      .eq("user_id", userId)
    if (error) {
      toast.error(error.message)
    } else {
      setOverdueInvoices((prev) => prev.filter((i) => i.id !== invoiceId))
      toast.success(`${invoice.client_name || invoice.invoice_number} marked as paid.`)
    }
    setIsSaving(false)
  }

  async function handleInvoiceAddToQueue(invoice: InvoiceRow) {
    if (!userId) return
    let invoiceId: string
    let payload: RecoveryItemInsert
    try {
      invoiceId = uuidField(invoice.id, "Invoice")
      const amount = numberField(invoice.amount ?? 0, "Amount", { min: 0, max: 10_000_000 })
      const message = generateRecoveryItemMessage({
        clientName: invoice.client_name || "there",
        reason: "invoice_overdue",
        amount,
        followUpCount: 0,
      })
      payload = {
        user_id: userId,
        client_name: textField(
          invoice.client_name || invoice.invoice_number || "Invoice client",
          "Client name",
          { required: true, maxLength: INPUT_LIMITS.name }
        ),
        reason: "invoice_overdue",
        amount,
        contacted_date: isoDateField(todayIso(), "Contacted date"),
        status: "message_ready",
        message_body: optionalTextField(message, "Message", {
          maxLength: INPUT_LIMITS.message,
          multiline: true,
        }),
      }
    } catch (error) {
      toast.error(inputErrorMessage(error))
      return
    }

    setIsSaving(true)
    const { data, error } = await supabase
      .from("recovery_items")
      .insert(payload)
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
      .eq("id", invoiceId)
      .eq("user_id", userId)

    setOverdueInvoices((prev) => prev.filter((i) => i.id !== invoiceId))
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
    let estimateId: string
    let safePatch = patch
    try {
      estimateId = uuidField(estimate.id, "Estimate")
      safePatch = {
        ...patch,
        follow_up_date:
          patch.follow_up_date === undefined
            ? undefined
            : optionalIsoDateField(patch.follow_up_date, "Follow-up date"),
      }
    } catch (error) {
      toast.error(inputErrorMessage(error))
      return
    }

    setIsSaving(true)
    const { error } = await supabase
      .from("estimates")
      .update(safePatch)
      .eq("id", estimateId)
      .eq("user_id", userId)
    if (error) {
      toast.error(error.message)
    } else {
      setPendingEstimates((prev) => prev.filter((e) => e.id !== estimateId))
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

  // ─── Job completion ───────────────────────────────────────────

  async function handleMarkJobComplete(job: JobAwaitingCompletion) {
    if (!userId) return
    let estimateId: string
    try {
      estimateId = uuidField(job.estimateId, "Estimate")
    } catch (error) {
      toast.error(inputErrorMessage(error))
      return
    }

    setIsSaving(true)
    const completedAt = new Date().toISOString()
    const { error } = await supabase
      .from("estimates")
      .update({ job_completed_at: completedAt })
      .eq("id", estimateId)
      .eq("user_id", userId)
    if (error) {
      toast.error(error.message)
      setIsSaving(false)
      return
    }
    // Mark the job's scheduled work days as completed and drop them from view.
    await supabase
      .from("scheduled_work_days")
      .update({ status: "completed" })
      .eq("estimate_id", estimateId)
      .eq("user_id", userId)
      .eq("status", "scheduled")
    setWorkDays((prev) => prev.filter((d) => d.estimate_id !== estimateId))
    toast.success(`${job.clientName} marked as completed.`)
    setIsSaving(false)
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

  const shareableLink = requestSlug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/request/${requestSlug}`
    : null

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
          {/* Stripe not connected — block on getting paid, surfaced up top. */}
          {stripeReady === false && (
            <div className="ef-reveal ef-d0 mb-6">
              <StripeNotConnectedBanner />
            </div>
          )}
          {!hasAnyItems ? (
            <div className="grid gap-6">
              <div className="ef-reveal ef-d0">
                <OnboardingState
                  requestLink={shareableLink}
                  onAdd={() => setAddOpen(true)}
                  onDemo={() => void handleUseDemoData()}
                  isDemoSeeding={isDemoSeeding}
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-6">
              {/* Request link — the contractor's most-asked "where is it?" */}
              {shareableLink && (
                <div className="ef-reveal ef-d0">
                  <RequestLinkCard link={shareableLink} />
                </div>
              )}

              {/* Summary hero — answers "did anyone contact me?", "where do I
                  need to be?" (agenda + calendar), and "what's next?" */}
              <div className="ef-reveal ef-d1">
                {totalActionCount === 0 && upcomingVisits.length === 0 ? (
                  <AllCaughtUp
                    atRisk={atRisk}
                    waitingCount={waitingItems.length}
                    hasActiveEstimates={activeEstimates.length > 0}
                    onAdd={() => setAddOpen(true)}
                  />
                ) : (
                  <CompactSummary
                    newRequestCount={newRequests.length}
                    requestCount={actionableRequests.length}
                    actionCount={followUpActionCount}
                    todaysInspections={todaysInspections}
                    todaysWork={todaysWork}
                    nextVisit={nextVisit}
                    visits={upcomingVisits}
                    onAdd={() => setAddOpen(true)}
                    onStartNextTask={() =>
                      actionSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                  />
                )}
              </div>

              <div ref={actionSectionRef} className="grid gap-6">
                {/* New & active job requests — the inbox */}
                {actionableRequests.length > 0 && (
                  <div className="ef-reveal ef-d2">
                    <ActionSection
                      label="New job requests"
                      count={actionableRequests.length}
                      urgent={newRequests.length > 0}
                    >
                      {actionableRequests.map((request) => (
                        <JobRequestCard key={request.id} request={request} />
                      ))}
                    </ActionSection>
                  </div>
                )}

                {/* Pending actions — follow-ups, invoices, accepted estimates */}
                {followUpActionCount > 0 && (
                  <div className="ef-reveal ef-d3">
                    <ActionSection
                      label="Needs your attention"
                      count={followUpActionCount}
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
                      {jobsAwaitingCompletion.map((job) => (
                        <JobCompletionPrompt
                          key={job.estimateId}
                          job={job}
                          isSaving={isSaving}
                          onMarkComplete={handleMarkJobComplete}
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
                )}

                {/* Active estimates — sent, waiting on the client */}
                {activeEstimates.length > 0 && (
                  <div className="ef-reveal ef-d4">
                    <ActiveEstimatesSection estimates={activeEstimates} />
                  </div>
                )}

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
  newRequestCount,
  requestCount,
  actionCount,
  todaysInspections,
  todaysWork,
  nextVisit,
  visits,
  onAdd,
  onStartNextTask,
}: {
  newRequestCount: number
  requestCount: number
  actionCount: number
  todaysInspections: VisitItem[]
  todaysWork: VisitItem[]
  nextVisit: VisitItem | null
  visits: VisitItem[]
  onAdd: () => void
  onStartNextTask: () => void
}) {
  // Lead with the question a contractor logs in to answer: did a job come in?
  let headline: React.ReactNode
  let subline: string
  if (newRequestCount > 0) {
    headline = (
      <>
        {newRequestCount === 1 ? "1 new job request" : `${newRequestCount} new job requests`}
        <span className="text-white/40"> came in</span>
      </>
    )
    subline =
      actionCount > 0
        ? `Plus ${actionCount} ${actionCount === 1 ? "thing" : "things"} to follow up on.`
        : "Review it and send an estimate."
  } else if (requestCount > 0) {
    headline = (
      <>
        {requestCount === 1 ? "1 job request" : `${requestCount} job requests`}
        <span className="text-white/40"> in progress</span>
      </>
    )
    subline =
      actionCount > 0
        ? `And ${actionCount} ${actionCount === 1 ? "thing" : "things"} to follow up on today.`
        : "Keep them moving toward an estimate."
  } else if (actionCount > 0) {
    headline = (
      <>
        {actionCount === 1 ? "1 thing" : `${actionCount} things`}
        <span className="text-white/40"> to follow up</span>
      </>
    )
    subline = "No new job requests — share your link to get more."
  } else {
    headline = (
      <>
        You&apos;re
        <span className="text-white/40"> all caught up</span>
      </>
    )
    subline = "Nothing needs you right now."
  }

  const agenda = buildScheduleHeadline(todaysInspections, todaysWork, nextVisit)

  return (
    <div className="relative overflow-hidden rounded-2xl shadow-lg">
      {/* CSS gradient base — also fallback if WebGL unavailable.
          Fixed navy literals (not the ef-ink theme var, which turns charcoal
          grey in dark mode and washes the blue ocean out). */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#002453] via-[#013060] to-[#024d8b]" />
      {/* Subtle dot texture */}
      <div className="absolute inset-0 ef-dot-grid opacity-[0.10]" />

      {/* 3D ocean scene — rounded + isolated so the animated canvas clips at its
          own compositor layer (matching the card radius) instead of being masked
          through the ancestor's clip every frame. Cuts the per-frame Paint cost;
          no visual change. */}
      <div className="absolute inset-0 overflow-hidden rounded-2xl [contain:paint] [will-change:transform]">
        <OceanScene />
      </div>

      {/* Left-side vignette — text legibility over the 3D scene */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#002453]/[0.92] via-[#002453]/50 to-transparent" />
      {/* Bottom vignette — blends ocean into card edge */}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#002453]/70 to-transparent" />

      {/* Content — two columns: summary + agenda (left), calendar (right) */}
      <div className="relative grid gap-6 px-5 py-6 sm:px-10 sm:py-9 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-10">
        <div className="min-w-0">
          {/* Today label */}
          <div className="mb-3 flex items-center gap-2.5 sm:mb-5">
            <StatusPulse variant="warning" pulse />
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/50">
              Today
            </span>
          </div>

          {/* Headline */}
          <h2 className="text-3xl font-bold leading-none tracking-tight text-white sm:text-5xl">
            {headline}
          </h2>

          {/* Subline */}
          <p className="mt-4 text-base text-white/55">{subline}</p>

          {/* Agenda — blends "where do I need to be?" into the hero */}
          {agenda && (
            <p className="mt-3 flex items-start gap-2 text-sm text-white/70">
              <CalendarClock className="mt-0.5 size-4 shrink-0 text-ef-sky" />
              <span>{agenda}</span>
            </p>
          )}

          {/* CTAs */}
          <div className="mt-5 flex flex-wrap gap-3 sm:mt-7">
            <Button
              className="bg-ef-orange text-white shadow-md shadow-black/25 hover:bg-ef-orange/90"
              onClick={onStartNextTask}
            >
              See what&apos;s next
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

        {/* Calendar — hoverable event markers */}
        <HeroCalendar visits={visits} />
      </div>
    </div>
  )
}

// ─── Hero calendar (hoverable event markers) ──────────────────

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"]
const monthLabelFmt = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" })

function HeroCalendar({ visits }: { visits: VisitItem[] }) {
  const [monthStart, setMonthStart] = useState(() => {
    const d = new Date()
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [hovered, setHovered] = useState<string | null>(null)
  const [modalDay, setModalDay] = useState<string | null>(null)

  const byDay = useMemo(() => {
    const map = new Map<string, VisitItem[]>()
    for (const v of visits) {
      const key = localDayKey(new Date(v.startsAt))
      const list = map.get(key)
      if (list) list.push(v)
      else map.set(key, [v])
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    }
    return map
  }, [visits])

  const year = monthStart.getFullYear()
  const month = monthStart.getMonth()
  const todayKey = localDayKey(new Date())
  const leadingBlanks = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // Always render a fixed 6-week (42-cell) grid so the calendar — and therefore
  // the hero card — keeps a constant height across months.
  const cells: (number | null)[] = Array.from({ length: 42 }, (_, i) => {
    const day = i - leadingBlanks + 1
    return day >= 1 && day <= daysInMonth ? day : null
  })

  const detailEvents = hovered ? byDay.get(hovered) ?? [] : []
  const PREVIEW_LIMIT = 2
  const previewEvents = detailEvents.slice(0, PREVIEW_LIMIT)
  const moreCount = detailEvents.length - previewEvents.length
  const modalEvents = modalDay ? byDay.get(modalDay) ?? [] : []

  return (
    <>
    <div
      data-testid="hero-calendar"
      className="w-full shrink-0 rounded-xl bg-ef-ink/45 p-3 ring-1 ring-white/15 backdrop-blur-sm lg:w-[18rem]"
    >
      {/* Month header */}
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-white/85">
          {monthLabelFmt.format(monthStart)}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setMonthStart(new Date(year, month - 1, 1))}
            className="grid size-6 place-items-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setMonthStart(new Date(year, month + 1, 1))}
            className="grid size-6 place-items-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAY_LABELS.map((d, i) => (
          <div key={i} className="py-1 text-center text-[10px] font-medium text-white/35">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5" onMouseLeave={() => setHovered(null)}>
        {cells.map((day, i) => {
          // Blank cells must keep the row height so months with fewer occupied
          // weeks don't collapse the grid (which would resize the card).
          if (day === null) return <div key={`b${i}`} className="h-8" />
          const key = localDayKey(new Date(year, month, day))
          const events = byDay.get(key)
          const isToday = key === todayKey
          const hasInspection = events?.some((e) => e.kind === "inspection")
          const hasWork = events?.some((e) => e.kind === "work")

          return (
            <button
              key={key}
              type="button"
              data-daykey={key}
              data-has-events={events ? "true" : undefined}
              disabled={!events}
              onMouseEnter={() => events && setHovered(key)}
              onFocus={() => events && setHovered(key)}
              onClick={() => events && setModalDay(key)}
              className={cn(
                "relative flex h-8 flex-col items-center justify-center rounded-md text-xs tabular-nums transition-colors",
                events ? "cursor-pointer" : "cursor-default",
                isToday
                  ? "bg-ef-orange font-bold text-white"
                  : events
                    ? "font-semibold text-white hover:bg-white/10"
                    : "text-white/45",
                hovered === key && !isToday && "bg-white/10"
              )}
            >
              <span>{day}</span>
              {/* Event markers */}
              {events && (
                <span className="mt-0.5 flex gap-0.5">
                  {hasInspection && (
                    <span className="size-1.5 rounded-full bg-amber-400" />
                  )}
                  {hasWork && <span className="size-1.5 rounded-full bg-ef-sky" />}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Hover detail — fixed height (sized for date header + 2 rows + "more")
          so hovering never changes the card height. */}
      <div className="mt-2 h-24 overflow-hidden border-t border-white/10 pt-2">
        {detailEvents.length > 0 ? (
          <div
            key={hovered ?? "none"}
            className="grid animate-in gap-0.5 fade-in-0 slide-in-from-bottom-1 duration-200 ease-out"
          >
            <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
              {visitDay(detailEvents[0].startsAt)}
            </div>
            {previewEvents.map((e) => (
              <Link
                key={`${e.kind}-${e.id}`}
                href={e.href}
                className="flex items-center gap-2 rounded-md px-1 py-0.5 text-xs text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    e.kind === "work" ? "bg-ef-sky" : "bg-amber-400"
                  )}
                />
                <span className="font-medium tabular-nums">{visitTime(e.startsAt)}</span>
                <span className="truncate text-white/60">
                  {e.kind === "work" ? "Work day" : "Inspection"} · {e.clientName}
                </span>
              </Link>
            ))}
            {moreCount > 0 && (
              <button
                type="button"
                onClick={() => hovered && setModalDay(hovered)}
                className="px-1 py-0.5 text-left text-xs text-white/40 transition-colors hover:text-white/70"
              >
                and {moreCount} more…
              </button>
            )}
          </div>
        ) : (
          <p className="px-1 pt-1 text-[11px] text-white/35">
            Hover a marked day to see what&apos;s on.
          </p>
        )}
      </div>
    </div>

    {/* Full-day modal — opened by clicking a marked day or "and X more…" */}
    <Dialog open={modalDay !== null} onOpenChange={(open) => !open && setModalDay(null)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {modalEvents.length > 0
              ? `${visitDay(modalEvents[0].startsAt)} · ${modalEvents.length} ${
                  modalEvents.length === 1 ? "visit" : "visits"
                }`
              : "Schedule"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-1.5">
          {modalEvents.map((e) => (
            <Link
              key={`${e.kind}-${e.id}`}
              href={e.href}
              onClick={() => setModalDay(null)}
              className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-muted/50"
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md",
                  e.kind === "work"
                    ? "bg-ef-mist text-ef-ocean dark:bg-ef-navy/25 dark:text-ef-cyan"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300"
                )}
              >
                {e.kind === "work" ? (
                  <ClipboardList className="size-3.5" />
                ) : (
                  <CalendarClock className="size-3.5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium tabular-nums text-foreground">
                  {visitTime(e.startsAt)}
                  <span className="text-muted-foreground">
                    {" · "}
                    {e.kind === "work" ? "Work day" : "Inspection"}
                  </span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {e.clientName}
                  {e.kind === "inspection" && !e.confirmed && (
                    <span className="text-amber-600 dark:text-amber-400">
                      {" · awaiting confirmation"}
                    </span>
                  )}
                </p>
              </div>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}

// ─── Request link card ────────────────────────────────────────

function RequestLinkCard({ link }: { link: string }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      toast.success("Request link copied — share it to get new jobs.")
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-ef-200 bg-ef-mist p-4 dark:border-ef-navy/60 dark:bg-ef-ink/20 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-ef-navy dark:text-ef-mist">
          <Link2 className="size-4 shrink-0" />
          Your request link
        </div>
        <p className="mt-0.5 truncate text-xs text-ef-ocean dark:text-ef-300" data-testid="today-request-link">
          {link}
        </p>
        <p className="mt-1 text-xs text-ef-ocean/70 dark:text-ef-cyan">
          Share this with clients — new jobs land here. No account needed on their end.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          className="gap-1.5 bg-ef-ocean text-white hover:bg-ef-ocean"
          onClick={copy}
          data-testid="today-copy-request-link"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied!" : "Copy link"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          asChild
          className="border-ef-300 bg-white text-ef-ocean hover:bg-ef-mist dark:border-ef-ocean dark:bg-transparent dark:text-ef-200"
        >
          <a href={link} target="_blank" rel="noreferrer">
            <ExternalLink className="size-3.5" />
            Preview
          </a>
        </Button>
      </div>
    </div>
  )
}

// ─── Stripe not connected banner ──────────────────────────────

function StripeNotConnectedBanner() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            You haven&apos;t connected Stripe
          </p>
          <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-300/80">
            Connect your Stripe account to receive payments from clients.
          </p>
        </div>
      </div>
      <Button
        size="sm"
        asChild
        className="shrink-0 gap-1.5 bg-amber-600 text-white hover:bg-amber-700"
      >
        <Link href="/dashboard/settings">
          <CreditCard className="size-3.5" />
          Connect Stripe
        </Link>
      </Button>
    </div>
  )
}

// ─── Today's agenda strip (inspections + work days) ───────────

function buildScheduleHeadline(
  todaysInspections: VisitItem[],
  todaysWork: VisitItem[],
  nextVisit: VisitItem | null
): string | null {
  const insp = todaysInspections.length
  const work = todaysWork.length

  // Nothing today → point at the next visit, if any.
  if (insp === 0 && work === 0) {
    if (!nextVisit) return null
    const label = nextVisit.kind === "inspection" ? "inspection" : "work day"
    return `No visits today. Next: ${label} with ${nextVisit.clientName} ${visitDay(
      nextVisit.startsAt
    )} at ${visitTime(nextVisit.startsAt)}.`
  }

  const segs: string[] = []
  if (insp === 1) {
    segs.push(
      `an inspection with ${todaysInspections[0].clientName} at ${visitTime(
        todaysInspections[0].startsAt
      )}`
    )
  } else if (insp > 1) {
    segs.push(`${insp} inspections`)
  }
  if (work === 1) {
    segs.push(
      `a work day with ${todaysWork[0].clientName} at ${visitTime(
        todaysWork[0].startsAt
      )}`
    )
  } else if (work > 1) {
    segs.push(`${work} work days`)
  }

  const joined = segs.join(" and ")
  // Lead with "No inspections today" when only work is booked (the contractor's
  // own phrasing) so the absence is explicit, not just implied.
  if (insp === 0) return `No inspections today — you have ${joined}.`
  return `You have ${joined} today.`
}

// ─── Job request card ─────────────────────────────────────────

function JobRequestCard({ request }: { request: JobRequestRow }) {
  const isNew = request.status === "new"
  const hasInfo = Boolean(request.more_details_response)

  return (
    <div
      className={cn(
        "euroflo-card-transition relative overflow-hidden rounded-xl border border-border bg-card shadow-sm hover:shadow-md",
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
        isNew ? "before:bg-ef-orange" : "before:bg-ef-cyan"
      )}
      data-testid="today-job-request-card"
    >
      <div className="flex flex-col gap-3 py-3.5 pl-5 pr-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              isNew ? "bg-orange-100 dark:bg-orange-900/25" : "bg-ef-mist dark:bg-ef-navy/25"
            )}
          >
            <ClipboardList
              className={cn(
                "size-3.5",
                isNew ? "text-ef-orange" : "text-ef-ocean dark:text-ef-cyan"
              )}
            />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">
                {request.title}
              </p>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                  isNew
                    ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                    : "bg-ef-mist text-ef-ocean dark:bg-ef-navy/30 dark:text-ef-300"
                )}
              >
                {requestStatusLabel(request.status)}
              </span>
              {hasInfo && (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/25 dark:text-amber-300">
                  Info received
                </span>
              )}
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              {request.client_name && (
                <>
                  <span className="font-medium text-foreground">{request.client_name}</span>
                  <span>·</span>
                </>
              )}
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {request.service_area}
              </span>
              <span>·</span>
              <span>{requestUrgencyLabel(request.urgency)}</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pl-11 lg:pl-0">
          <Button
            size="sm"
            className="gap-1.5 bg-ef-ocean text-white hover:bg-ef-ocean"
            asChild
          >
            <Link href={`/dashboard/job-requests?request=${request.id}`}>
              {isNew ? "Review" : "Open"}
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Active estimates (sent, waiting on client) ───────────────

function ActiveEstimatesSection({ estimates }: { estimates: EstimateRow[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="grid gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 text-left"
      >
        <StatusPulse variant="info" className="shrink-0" />
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Estimates waiting on clients
        </span>
        <span className="shrink-0 rounded-full border border-border bg-background px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          {estimates.length}
        </span>
        <div className="h-px flex-1 bg-border" />
        {open ? (
          <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="grid gap-3">
          {estimates.map((est) => (
            <div
              key={est.id}
              className="euroflo-card-transition relative overflow-hidden rounded-xl border border-border bg-card shadow-sm hover:shadow-md before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-ef-cyan"
            >
              <div className="flex flex-col gap-2.5 py-3.5 pl-5 pr-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ef-mist dark:bg-ef-navy/25">
                    <Clock className="size-3.5 text-ef-ocean dark:text-ef-cyan" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {est.client_name || "No client"}
                      </p>
                      <span className="shrink-0 rounded-full bg-ef-mist px-2 py-0.5 text-xs font-medium text-ef-ocean dark:bg-ef-navy/30 dark:text-ef-300">
                        Sent
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {est.estimate_number}
                      {" · "}
                      <span className="font-medium tabular-nums text-foreground">
                        {money.format(est.amount ?? 0)}
                      </span>
                      {" · "}
                      Waiting for the client to accept
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/dashboard/estimates?highlight=${est.id}`}>
                    <FileText className="size-3.5" />
                    View
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
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

// ─── Job completion prompt ─────────────────────────────────────
// A multi-day job whose scheduled days have all passed. Ask the contractor to
// confirm it's done, or send them to schedule more days.

function JobCompletionPrompt({
  job,
  isSaving,
  onMarkComplete,
}: {
  job: JobAwaitingCompletion
  isSaving: boolean
  onMarkComplete: (job: JobAwaitingCompletion) => void
}) {
  const scheduleHref = job.jobRequestId
    ? `/dashboard/job-requests?request=${job.jobRequestId}`
    : `/dashboard/estimates?highlight=${job.estimateId}`

  return (
    <div className="euroflo-card-transition relative overflow-hidden rounded-xl border border-border bg-card shadow-sm hover:shadow-md before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-ef-cyan">
      <div className="flex flex-col gap-2.5 py-3.5 pl-5 pr-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ef-mist dark:bg-ef-navy/25">
            <CalendarClock className="size-3.5 text-ef-ocean dark:text-ef-cyan" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              Did you finish {job.clientName}?
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Last work day was {visitDay(job.lastDayIso)}. Mark it complete or schedule more days.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 pl-11 sm:pl-0">
          <Button size="sm" variant="outline" asChild>
            <Link href={scheduleHref}>
              <Plus className="size-3.5" />
              Schedule more days
            </Link>
          </Button>
          <Button
            size="sm"
            className="bg-ef-ocean text-white hover:bg-ef-ocean"
            disabled={isSaving}
            onClick={() => onMarkComplete(job)}
            data-testid="mark-job-complete"
          >
            <Check className="size-3.5" />
            Mark complete
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Onboarding state ──────────────────────────────────────────

function OnboardingState({
  requestLink,
  onAdd,
  onDemo,
  isDemoSeeding,
}: {
  requestLink: string | null
  onAdd: () => void
  onDemo: () => void
  isDemoSeeding: boolean
}) {
  const [copied, setCopied] = useState(false)

  function copyLink() {
    if (!requestLink) return
    navigator.clipboard.writeText(requestLink).then(() => {
      setCopied(true)
      toast.success("Request link copied — share it to get your first job.")
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="relative overflow-hidden rounded-2xl shadow-lg">
      <div className="absolute inset-0 bg-gradient-to-br from-ef-ink via-[#013060] to-ef-ocean" />
      <div className="absolute inset-0 ef-dot-grid opacity-[0.18]" />
      <div className="pointer-events-none absolute -right-12 top-1/4 size-48 rounded-full bg-ef-sky/12 blur-3xl" />
      <div className="pointer-events-none absolute -top-8 left-1/4 size-40 rounded-full bg-ef-cyan/10 blur-2xl" />

      <div className="relative mx-auto max-w-md px-6 py-16 text-center sm:py-20">
        <div className="mx-auto mb-7 flex size-16 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
          <Sparkles className="size-7 text-ef-sky" />
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-white">
          No job requests yet.
        </h2>
        <p className="mt-4 text-sm leading-7 text-white/55">
          Share your request link and new jobs show up right here. Clients fill
          out a quick form — no account needed — and you turn it into an estimate
          and get paid.
        </p>

        {requestLink && (
          <div className="mt-7 rounded-xl border border-white/15 bg-white/5 p-3 text-left">
            <p className="truncate text-xs text-white/60">{requestLink}</p>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {requestLink && (
            <Button
              className="w-full gap-2 bg-ef-orange text-white shadow-md shadow-black/25 hover:bg-ef-orange/90"
              onClick={copyLink}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied!" : "Copy request link"}
            </Button>
          )}
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
          Already have a customer to follow up with?{" "}
          <button
            type="button"
            onClick={onAdd}
            className="font-medium text-white/60 underline-offset-2 transition-colors hover:text-white hover:underline"
          >
            Add them
          </button>
        </p>
      </div>
    </div>
  )
}

// ─── All caught up state ───────────────────────────────────────

function AllCaughtUp({
  atRisk,
  waitingCount,
  hasActiveEstimates,
  onAdd,
}: {
  atRisk: number
  waitingCount: number
  hasActiveEstimates: boolean
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
          {(() => {
            const parts: string[] = []
            if (atRisk > 0) parts.push(`${money.format(atRisk)} is being tracked.`)
            if (hasActiveEstimates) parts.push("Your sent estimates are waiting on clients.")
            if (waitingCount > 0)
              parts.push(`${waitingCount} item${waitingCount === 1 ? "" : "s"} waiting for a reply.`)
            parts.push("New job requests will show up here. Come back tomorrow.")
            return parts.join(" ")
          })()}
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
