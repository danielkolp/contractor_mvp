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
  Loader2,
  MessageSquare,
  Send,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  buildTimeline,
  EstimatesSection,
  FlowBar,
  InvoicesSection,
  PortalSkeleton,
  StatusCard,
  Timeline,
} from "@/components/client/portal-sections"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"

type JobRequest    = Database["public"]["Tables"]["job_requests"]["Row"]
type Estimate      = Database["public"]["Tables"]["estimates"]["Row"]
type Invoice       = Database["public"]["Tables"]["invoices"]["Row"]
type TimelineEvent = Database["public"]["Tables"]["project_timeline_events"]["Row"]
type Message       = Database["public"]["Tables"]["client_messages"]["Row"]

// ── Messages ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `${days}d ago`
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(
    new Date(iso)
  )
}

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
  const [body, setBody]    = useState("")
  const [isPending, start] = useTransition()
  const supabase           = useMemo(() => createClient(), [])
  const bottomRef          = useRef<HTMLDivElement>(null)

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
        .from("client_messages")
        .insert({
          job_request_id: jobId,
          sender_id:      userId,
          sender_role:    "client" as const,
          body:           text,
        })
        .select()
        .single()

      if (error) {
        toast.error("Could not send message")
        return
      }

      if (data) onSend(data)
    })
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6" id="messages">
      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-400">
        <MessageSquare className="h-4 w-4" />
        Messages
      </h3>

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
                    isMe ? "bg-ef-ocean text-white" : "bg-gray-100 text-gray-800"
                  }`}
                >
                  <p>{msg.body}</p>
                  <p
                    className={`mt-1 text-right text-[10px] ${
                      isMe ? "text-ef-200" : "text-gray-400"
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

      <form onSubmit={send} className="mt-4 flex gap-2">
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Send a message to your contractor…"
          className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-ef-sky focus:ring-2 focus:ring-ef-sky/20"
        />
        <Button
          type="submit"
          disabled={isPending || !body.trim()}
          className="bg-ef-ocean text-white hover:bg-ef-ocean"
          size="sm"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
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
        supabase
          .from("project_timeline_events")
          .select("*")
          .eq("job_request_id", jobId)
          .order("event_date", { ascending: true }),
        supabase
          .from("client_messages")
          .select("*")
          .eq("job_request_id", jobId)
          .order("created_at", { ascending: true }),
      ])

    if (jobResult.data) setJob(jobResult.data)
    setEsts(estsResult.data ?? [])
    setInvs(invsResult.data ?? [])
    setEvents(eventsResult.data ?? [])
    setMessages(msgsResult.data ?? [])
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
          <StatusCard job={job} hasEstimate={hasEstimate} />
          <FlowBar job={job} hasEstimate={hasEstimate} invoices={invoices} estimates={visibleEstimates} />
          {timeline.length > 0 && <Timeline items={timeline} />}
          <MessagesSection
            jobId={jobId}
            userId={userId}
            messages={messages}
            onSend={addMessage}
          />
          <EstimatesSection
            estimates={visibleEstimates}
            onRespond={(est, r) => void respondToEstimate(est, r)}
          />
          <InvoicesSection invoices={invoices} />
        </>
      )}
    </div>
  )
}
