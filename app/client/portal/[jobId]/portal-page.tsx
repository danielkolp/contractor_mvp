"use client"

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"
import Link from "next/link"
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Download,
  FileText,
  Loader2,
  MessageSquare,
  Printer,
  Receipt,
  Send,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { money } from "@/lib/format-money"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"

type JobRequest = Database["public"]["Tables"]["job_requests"]["Row"]
type Estimate   = Database["public"]["Tables"]["estimates"]["Row"]
type Invoice    = Database["public"]["Tables"]["invoices"]["Row"]

// ── New-table row shapes (not yet in generated types) ─────────────────────────

type TimelineEvent = {
  id:           string
  event_type:   string
  title:        string
  notes:        string | null
  event_date:   string
  created_at:   string
}

type Message = {
  id:          string
  sender_id:   string
  sender_role: "contractor" | "client"
  body:        string
  created_at:  string
}

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  new:              "Under Review",
  reviewed:         "Estimate Pending",
  estimate_created: "Estimate Ready",
  accepted:         "Accepted",
  declined:         "Declined",
  closed:           "Closed",
}

const STATUS_NEXT: Record<string, string> = {
  new:              "Your contractor is reviewing your request. You'll be notified when there's an update.",
  reviewed:         "Your contractor is working on an estimate. We'll notify you when it's ready.",
  estimate_created: "An estimate is ready for your review. Accept or decline it below.",
  accepted:         "Your contractor will be in touch shortly to schedule the work.",
  declined:         "The estimate was declined. Contact your contractor if you have questions.",
  closed:           "This project has been closed.",
}

type StatusColor = "gray" | "yellow" | "green" | "red"

const STATUS_COLOR: Record<string, StatusColor> = {
  new:              "gray",
  reviewed:         "yellow",
  estimate_created: "green",
  accepted:         "green",
  declined:         "red",
  closed:           "gray",
}

const colorMap: Record<StatusColor, { bg: string; text: string; border: string; dot: string }> = {
  gray:   { bg: "bg-gray-50",    text: "text-gray-600",   border: "border-gray-200",  dot: "bg-gray-400" },
  yellow: { bg: "bg-amber-50",   text: "text-amber-700",  border: "border-amber-200", dot: "bg-amber-400" },
  green:  { bg: "bg-green-50",   text: "text-green-700",  border: "border-green-200", dot: "bg-green-500" },
  red:    { bg: "bg-red-50",     text: "text-red-700",    border: "border-red-200",   dot: "bg-red-400" },
}

function relativeTime(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  if (mins < 1)   return "Just now"
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)   return `${days}d ago`
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(
    new Date(iso)
  )
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day:   "numeric",
    year:  "numeric",
  }).format(new Date(iso))
}

// ── Timeline builder ──────────────────────────────────────────────────────────

type TimelineItem = {
  id:       string
  title:    string
  notes:    string | null
  date:     string
  done:     boolean
  isLatest: boolean
}

function buildTimeline(
  job:       JobRequest,
  estimates: Estimate[],
  events:    TimelineEvent[]
): TimelineItem[] {
  const items: { title: string; notes: string | null; date: string; priority: number }[] = []

  // Always first: request submitted
  items.push({ title: "Request Submitted", notes: null, date: job.created_at, priority: 0 })

  // Status-derived synthetic events
  if (job.status !== "new") {
    items.push({
      title:    "Contractor Reviewed Your Request",
      notes:    null,
      date:     job.updated_at,
      priority: 1,
    })
  }

  const sentEstimate = estimates.find(
    (e) => e.status !== "Draft" && e.status !== "Archived"
  )
  if (sentEstimate) {
    items.push({
      title: "Estimate Sent",
      notes: `${sentEstimate.estimate_number} — ${money.format(sentEstimate.amount)}`,
      date:  sentEstimate.sent_date ?? sentEstimate.created_at,
      priority: 2,
    })
  }

  if (job.status === "accepted") {
    items.push({
      title: "Estimate Accepted",
      notes: null,
      date:  job.updated_at,
      priority: 3,
    })
  }

  if (job.status === "declined") {
    items.push({
      title: "Estimate Declined",
      notes: null,
      date:  job.updated_at,
      priority: 3,
    })
  }

  // Manual events from the DB
  for (const ev of events) {
    items.push({ title: ev.title, notes: ev.notes, date: ev.event_date, priority: 4 })
  }

  // Sort chronologically
  items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return items.map((item, idx) => ({
    id:       `${item.priority}-${idx}`,
    title:    item.title,
    notes:    item.notes,
    date:     item.date,
    done:     true,
    isLatest: idx === items.length - 1,
  }))
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function PortalSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-44 animate-pulse rounded-2xl bg-gray-100" />
      <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
      <div className="h-52 animate-pulse rounded-2xl bg-gray-100" />
    </div>
  )
}

// ── Status card ───────────────────────────────────────────────────────────────

function StatusCard({ job, hasEstimate }: { job: JobRequest; hasEstimate: boolean }) {
  const status  = job.status as keyof typeof STATUS_LABEL
  const color   = STATUS_COLOR[status] ?? "gray"
  const c       = colorMap[color]
  const label   = STATUS_LABEL[status] ?? status
  const nextMsg = STATUS_NEXT[status] ?? ""

  return (
    <div className={`rounded-2xl border ${c.border} ${c.bg} p-6`}>
      {/* Status badge */}
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
        <span className={`text-xs font-bold uppercase tracking-widest ${c.text}`}>
          {label}
        </span>
      </div>

      {/* Project title */}
      <h2 className="mt-3 text-xl font-bold text-gray-900 sm:text-2xl">
        {job.title}
      </h2>

      {/* Last updated */}
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500">
        <Clock className="h-3.5 w-3.5" />
        Last updated {relativeTime(job.updated_at)}
      </p>

      {/* Next step */}
      <div className="mt-4 rounded-xl border border-white/80 bg-white/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Next step
        </p>
        <p className="mt-1 text-sm leading-relaxed text-gray-700">{nextMsg}</p>
      </div>

      {/* CTA — scroll to estimates when relevant */}
      {hasEstimate && (
        <div className="mt-4">
          <a
            href="#estimates"
            className={`inline-flex items-center gap-2 rounded-xl ${c.dot === "bg-green-500" ? "bg-green-700 hover:bg-green-800" : "bg-gray-700 hover:bg-gray-800"} px-4 py-2.5 text-sm font-semibold text-white transition`}
          >
            <FileText className="h-4 w-4" />
            View Estimate
          </a>
        </div>
      )}
    </div>
  )
}

// ── Timeline ──────────────────────────────────────────────────────────────────

function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400">
        Project Timeline
      </h3>

      <ol className="mt-5 space-y-0">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1
          return (
            <li key={item.id} className="relative flex gap-4">
              {/* Vertical line */}
              {!isLast && (
                <div className="absolute left-[10px] top-5 h-full w-px bg-gray-200" />
              )}

              {/* Dot */}
              <div className="relative mt-1 flex h-5 w-5 shrink-0 items-center justify-center">
                {item.done ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <Circle className="h-5 w-5 text-gray-300" />
                )}
              </div>

              {/* Content */}
              <div className={`min-w-0 flex-1 pb-6 ${isLast ? "pb-0" : ""}`}>
                <p className={`text-sm font-semibold ${item.isLatest ? "text-gray-900" : "text-gray-700"}`}>
                  {item.title}
                </p>
                {item.notes && (
                  <p className="mt-0.5 text-xs text-gray-500">{item.notes}</p>
                )}
                <p className="mt-0.5 text-xs text-gray-400">{formatDate(item.date)}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ── Messages ──────────────────────────────────────────────────────────────────

function MessagesSection({
  jobId,
  userId,
  messages,
  onSend,
}: {
  jobId:    string
  userId:   string
  messages: Message[]
  onSend:   (msg: Message) => void
}) {
  const [body, setBody]         = useState("")
  const [isPending, start]      = useTransition()
  const supabase                = useMemo(() => createClient(), [])
  const bottomRef               = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  function send(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return

    const text = body.trim()
    setBody("")

    start(async () => {
      const { data, error } = await supabase
        .from("client_messages" as "job_requests") // table not in generated types yet
        .insert({
          job_request_id: jobId,
          sender_id:      userId,
          sender_role:    "client",
          body:           text,
        } as unknown as Parameters<ReturnType<typeof supabase.from<"job_requests">>["insert"]>[0])
        .select()
        .single()

      if (error) {
        toast.error("Could not send message")
        return
      }

      if (data) onSend(data as unknown as Message)
    })
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6" id="messages">
      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-400">
        <MessageSquare className="h-4 w-4" />
        Messages
      </h3>

      {/* Thread */}
      <div className="mt-4 max-h-72 space-y-3 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-gray-400">
            No messages yet. Send your contractor a message below.
          </p>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === userId
            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    isMe
                      ? "bg-green-700 text-white"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  <p>{msg.body}</p>
                  <p
                    className={`mt-1 text-right text-[10px] ${
                      isMe ? "text-green-200" : "text-gray-400"
                    }`}
                  >
                    {relativeTime(msg.created_at)}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <form onSubmit={send} className="mt-4 flex gap-2">
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Send a message to your contractor…"
          className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
        />
        <Button
          type="submit"
          disabled={isPending || !body.trim()}
          className="bg-green-700 text-white hover:bg-green-800"
          size="sm"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  )
}

// ── Estimates section ─────────────────────────────────────────────────────────

function EstimatesSection({
  estimates,
  jobId,
  onRespond,
}: {
  estimates: Estimate[]
  jobId:     string
  onRespond: (est: Estimate, response: "Accepted" | "Declined") => void
}) {
  const [isSaving, setIsSaving] = useState(false)

  if (estimates.length === 0) return null

  return (
    <div className="space-y-3" id="estimates">
      <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400">
        Estimates
      </h3>
      {estimates.map((est) => {
        const canRespond =
          est.status !== "Accepted" &&
          est.status !== "Declined" &&
          est.status !== "Won" &&
          est.status !== "Lost"

        return (
          <div key={est.id} className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{est.estimate_number}</p>
                <p className="mt-1 text-2xl font-bold text-green-700">
                  {money.format(est.amount)}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  est.status === "Accepted" || est.status === "Won"
                    ? "bg-green-100 text-green-700"
                    : est.status === "Declined" || est.status === "Lost"
                    ? "bg-red-100 text-red-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {est.status}
              </span>
            </div>

            {est.notes && (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-500">
                {est.notes}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={`/print/estimate/${est.id}`} target="_blank" rel="noreferrer">
                  <Printer className="h-3.5 w-3.5" />
                  View PDF
                </a>
              </Button>

              {canRespond && (
                <>
                  <Button
                    size="sm"
                    disabled={isSaving}
                    className="bg-green-700 text-white hover:bg-green-800"
                    onClick={() => {
                      setIsSaving(true)
                      onRespond(est, "Accepted")
                    }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Accept Estimate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isSaving}
                    onClick={() => {
                      setIsSaving(true)
                      onRespond(est, "Declined")
                    }}
                  >
                    Decline
                  </Button>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Invoices section ──────────────────────────────────────────────────────────

function InvoicesSection({ invoices }: { invoices: Invoice[] }) {
  if (invoices.length === 0) return null

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400">
        Invoices
      </h3>
      {invoices.map((inv) => (
        <div key={inv.id} className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-gray-900">{inv.invoice_number}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {money.format(inv.amount)}
              </p>
              {inv.due_date && (
                <p className="mt-1 text-xs text-gray-400">
                  Due {formatDate(inv.due_date)}
                </p>
              )}
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                inv.status === "Paid"
                  ? "bg-green-100 text-green-700"
                  : inv.status === "Overdue"
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {inv.status}
            </span>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={`/print/invoice/${inv.id}`} target="_blank" rel="noreferrer">
                <Printer className="h-3.5 w-3.5" />
                View Invoice
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/print/invoice/${inv.id}`} target="_blank" rel="noreferrer">
                <Download className="h-3.5 w-3.5" />
                Download PDF
              </a>
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main portal page ──────────────────────────────────────────────────────────

export function PortalPage({ jobId }: { jobId: string }) {
  const supabase = useMemo(() => createClient(), [])

  const [job,       setJob]      = useState<JobRequest | null>(null)
  const [estimates, setEsts]     = useState<Estimate[]>([])
  const [invoices,  setInvs]     = useState<Invoice[]>([])
  const [events,    setEvents]   = useState<TimelineEvent[]>([])
  const [messages,  setMessages] = useState<Message[]>([])
  const [userId,    setUserId]   = useState<string>("")
  const [loading,   setLoading]  = useState(true)

  const load = useCallback(async () => {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)

    const [jobResult, estsResult, invsResult, eventsResult, msgsResult] =
      await Promise.all([
        supabase.from("job_requests").select("*").eq("id", jobId).maybeSingle(),
        supabase.from("estimates").select("*").eq("job_request_id", jobId).neq("status", "Draft"),
        supabase.from("invoices").select("*").eq("job_request_id", jobId),
        // New tables — cast through unknown since types not yet regenerated.
        supabase
          .from("project_timeline_events" as "job_requests")
          .select("*")
          .eq("job_request_id", jobId)
          .order("event_date", { ascending: true }),
        supabase
          .from("client_messages" as "job_requests")
          .select("*")
          .eq("job_request_id", jobId)
          .order("created_at", { ascending: true }),
      ])

    if (jobResult.data) setJob(jobResult.data)
    setEsts(estsResult.data ?? [])
    setInvs(invsResult.data ?? [])
    setEvents((eventsResult.data ?? []) as unknown as TimelineEvent[])
    setMessages((msgsResult.data ?? []) as unknown as Message[])
    setLoading(false)
  }, [supabase, jobId])

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(id)
  }, [load])

  async function respondToEstimate(est: Estimate, response: "Accepted" | "Declined") {
    if (!job) return

    const [estResult, jobResult] = await Promise.all([
      supabase
        .from("estimates")
        .update({ status: response })
        .eq("id", est.id)
        .select()
        .single(),
      supabase
        .from("job_requests")
        .update({ status: response === "Accepted" ? "accepted" : "declined" })
        .eq("id", jobId)
        .select()
        .single(),
    ])

    if (estResult.error || jobResult.error) {
      toast.error("Could not save your response. Please try again.")
      return
    }

    setEsts((prev) => prev.map((e) => (e.id === est.id ? estResult.data : e)))
    if (jobResult.data) setJob(jobResult.data)
    toast.success(response === "Accepted" ? "Estimate accepted" : "Estimate declined")
  }

  function addMessage(msg: Message) {
    setMessages((prev) => [...prev, msg])
  }

  const timeline = useMemo(
    () => (job ? buildTimeline(job, estimates, events) : []),
    [job, estimates, events]
  )

  const visibleEstimates = estimates.filter((e) => e.status !== "Draft")
  const hasEstimate      = visibleEstimates.length > 0

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">

      {/* Back link */}
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 text-gray-500" asChild>
          <Link href="/client/dashboard">
            <ArrowLeft className="mr-1 h-4 w-4" />
            All projects
          </Link>
        </Button>
      </div>

      {loading ? (
        <PortalSkeleton />
      ) : !job ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-sm text-gray-500">Project not found.</p>
          <Button variant="outline" className="mt-4" asChild>
            <Link href="/client/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Status card — the single most important screen element */}
          <StatusCard job={job} hasEstimate={hasEstimate} />

          {/* Timeline */}
          {timeline.length > 0 && <Timeline items={timeline} />}

          {/* Messages */}
          <MessagesSection
            jobId={jobId}
            userId={userId}
            messages={messages}
            onSend={addMessage}
          />

          {/* Estimates */}
          <EstimatesSection
            estimates={visibleEstimates}
            jobId={jobId}
            onRespond={(est, r) => void respondToEstimate(est, r)}
          />

          {/* Invoices */}
          <InvoicesSection invoices={invoices} />
        </>
      )}
    </div>
  )
}
