"use client"

import { type FormEvent, useCallback, useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import {
  Check,
  ClipboardList,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Send,
} from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/dashboard/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ContentReveal } from "@/components/ui/content-reveal"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { money } from "@/lib/format-money"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"

type JobRequest = Database["public"]["Tables"]["job_requests"]["Row"]
type JobRequestUpdate = Database["public"]["Tables"]["job_requests"]["Update"]
type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"]
type EstimateInsert = Database["public"]["Tables"]["estimates"]["Insert"]

type Message = {
  id:          string
  sender_id:   string
  sender_role: "contractor" | "client"
  body:        string
  created_at:  string
}

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

function formatDate(value: string | null) {
  if (!value) return "Not set"
  return dateFmt.format(new Date(`${value.slice(0, 10)}T00:00:00`))
}

function inputDate(offsetDays = 0) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offsetDays)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function labelFromSlug(value: string) {
  return value
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ")
}

function budgetLabel(request: JobRequest) {
  if (request.budget_min && request.budget_max) {
    return `${money.format(request.budget_min)} - ${money.format(request.budget_max)}`
  }
  if (request.budget_min) return `From ${money.format(request.budget_min)}`
  if (request.budget_max) return `Up to ${money.format(request.budget_max)}`
  return "Budget not provided"
}

function requestNotes(request: JobRequest) {
  return [
    `Job request: ${request.title}`,
    "",
    request.description,
    "",
    `Service area: ${request.service_area}`,
    `Urgency: ${labelFromSlug(request.urgency)}`,
    `Budget: ${budgetLabel(request)}`,
    `Contact preference: ${request.contact_preference}`,
    request.photo_notes ? `Photo notes: ${request.photo_notes}` : null,
  ]
    .filter(Boolean)
    .join("\n")
}

function EstimateActionButton({
  request,
  estimateId,
  isSaving,
  onCreateEstimate,
}: {
  request: JobRequest
  estimateId: string | undefined
  isSaving: boolean
  onCreateEstimate: (r: JobRequest) => void
}) {
  const hasEstimate =
    request.status === "estimate_created" ||
    request.status === "accepted" ||
    request.status === "declined"

  if (estimateId) {
    return (
      <Button variant="outline" asChild>
        <Link href={`/dashboard/estimates?highlight=${estimateId}`}>
          <FileText className="size-4" />
          View estimate
        </Link>
      </Button>
    )
  }
  if (hasEstimate) {
    return (
      <Button variant="outline" disabled>
        <FileText className="size-4" />
        Estimate created
      </Button>
    )
  }
  return (
    <Button
      className="bg-green-700 text-white hover:bg-green-800"
      disabled={isSaving}
      onClick={() => onCreateEstimate(request)}
    >
      <Plus className="size-4" />
      Create estimate
    </Button>
  )
}

function RequestsSkeleton() {
  return (
    <div className="grid gap-3">
      {[1, 2, 3].map((item) => (
        <Skeleton key={item} className="h-32 rounded-xl" />
      ))}
    </div>
  )
}

export default function ContractorJobRequestsPage() {
  const supabase = useMemo(() => createClient(), [])
  const [requests, setRequests] = useState<JobRequest[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<JobRequest | null>(null)
  const [messagingRequest, setMessagingRequest] = useState<JobRequest | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messageBody, setMessageBody] = useState("")
  const [isSendingMsg, startMsgTransition] = useTransition()
  const [linkCopied, setLinkCopied] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Maps job_request.id → estimate.id for requests that already have an estimate.
  const [estimateIdByRequestId, setEstimateIdByRequestId] = useState<Record<string, string>>({})

  const shareableLink = userId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/request/${userId}`
    : null

  function copyLink() {
    if (!shareableLink) return
    navigator.clipboard.writeText(shareableLink).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    })
  }

  async function openMessages(request: JobRequest) {
    setMessagingRequest(request)
    setMessages([])
    const { data } = await supabase
      .from("client_messages" as "job_requests")
      .select("*")
      .eq("job_request_id", request.id)
      .order("created_at", { ascending: true })
    setMessages((data ?? []) as unknown as Message[])
  }

  function sendMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!messagingRequest || !userId || !messageBody.trim()) return
    const text = messageBody.trim()
    setMessageBody("")

    startMsgTransition(async () => {
      const { data, error } = await supabase
        .from("client_messages" as "job_requests")
        .insert({
          job_request_id: messagingRequest.id,
          sender_id:      userId,
          sender_role:    "contractor",
          body:           text,
        } as unknown as Parameters<ReturnType<typeof supabase.from<"job_requests">>["insert"]>[0])
        .select()
        .single()

      if (error) { toast.error("Could not send message"); return }
      if (data) setMessages((prev) => [...prev, data as unknown as Message])
    })
  }

  const load = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setErrorMessage(userError?.message || "You must be logged in.")
      setIsLoading(false)
      return
    }

    setUserId(user.id)

    const { data, error } = await supabase
      .from("job_requests")
      .select("*")
      .eq("contractor_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      setRequests([])
    } else {
      const rows = data ?? []
      setRequests(rows)

      // Back-fill estimate IDs for requests that already have one so the
      // "View estimate" button appears correctly on first load.
      const linkedIds = rows
        .filter(
          (r) =>
            r.status === "estimate_created" ||
            r.status === "accepted" ||
            r.status === "declined"
        )
        .map((r) => r.id)

      if (linkedIds.length > 0) {
        const { data: estimateRows } = await supabase
          .from("estimates")
          .select("id, job_request_id")
          .in("job_request_id", linkedIds)

        if (estimateRows) {
          const map: Record<string, string> = {}
          for (const row of estimateRows) {
            if (row.job_request_id) map[row.job_request_id] = row.id
          }
          setEstimateIdByRequestId(map)
        }
      }
    }

    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(id)
  }, [load])

  async function updateRequestStatus(
    request: JobRequest,
    patch: JobRequestUpdate
  ) {
    const { data, error } = await supabase
      .from("job_requests")
      .update(patch)
      .eq("id", request.id)
      .select()
      .single()

    if (error) {
      toast.error(error.message)
      return null
    }

    setRequests((current) =>
      current.map((item) => (item.id === request.id ? data : item))
    )
    if (selectedRequest?.id === request.id) setSelectedRequest(data)
    return data
  }

  async function ensureClientForRequest(request: JobRequest) {
    if (!userId) return null

    if (request.client_email) {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", userId)
        .eq("email", request.client_email)
        .maybeSingle()

      if (data) return data
    }

    const clientName =
      request.client_name || request.client_email || "Client from job request"
    const payload: ClientInsert = {
      user_id: userId,
      name: clientName,
      company: clientName,
      email: request.client_email,
      notes: `Created from job request: ${request.title}`,
      payment_reliability: "New client",
    }

    const { data, error } = await supabase
      .from("clients")
      .insert(payload)
      .select()
      .single()

    if (error) {
      toast.error(error.message)
      return null
    }

    return data
  }

  async function createEstimateFromRequest(request: JobRequest) {
    if (!userId || isSaving) return
    setIsSaving(true)

    const client = await ensureClientForRequest(request)
    const amount = request.budget_max ?? request.budget_min ?? 0

    const payload: EstimateInsert = {
      user_id: userId,
      client_id: client?.id ?? null,
      job_request_id: request.id,
      client_name:
        client?.company ||
        client?.name ||
        request.client_name ||
        request.client_email ||
        null,
      estimate_number: `EST-${Date.now().toString().slice(-5)}`,
      amount,
      status: "Draft",
      sent_date: inputDate(),
      follow_up_date: inputDate(3),
      notes: requestNotes(request),
      line_items: [],
      tax_rate: 0,
    }

    const { data, error } = await supabase
      .from("estimates")
      .insert(payload)
      .select()
      .single()

    if (error) {
      toast.error(error.message)
      setIsSaving(false)
      return
    }

    await updateRequestStatus(request, { status: "estimate_created" })

    setEstimateIdByRequestId((prev) => ({ ...prev, [request.id]: data.id }))
    window.dispatchEvent(new Event("estg:badge-refresh"))

    toast.success(`Estimate ${data.estimate_number} created`)

    setIsSaving(false)
  }

  const newCount = requests.filter((r) => r.status === "new").length

  return (
    <>
      <PageHeader
        title="Job Requests"
        description="Review incoming client requests and turn them into estimates."
      >
        <Button variant="outline" onClick={() => void load()}>
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </PageHeader>

      {/* Messages dialog */}
      <Dialog
        open={messagingRequest !== null}
        onOpenChange={(open) => { if (!open) { setMessagingRequest(null); setMessages([]) } }}
      >
        <DialogContent className="max-w-lg">
          {messagingRequest && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <MessageSquare className="size-4 text-muted-foreground" />
                  {messagingRequest.title}
                </DialogTitle>
                <DialogDescription>
                  Messaging {messagingRequest.client_name || messagingRequest.client_email || "client"}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-72 min-h-[6rem] space-y-2 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3">
                {messages.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No messages yet. Start the conversation below.
                  </p>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.sender_role === "contractor"
                    return (
                      <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                          isMe
                            ? "bg-green-700 text-white"
                            : "bg-background border border-border text-foreground"
                        }`}>
                          {msg.body}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
              <form onSubmit={sendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  placeholder="Type a message…"
                  className="flex h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSendingMsg || !messageBody.trim()}
                  className="bg-green-700 text-white hover:bg-green-800"
                >
                  <Send className="size-4" />
                </Button>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedRequest !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedRequest(null)
        }}
      >
        <DialogContent className="max-w-2xl">
          {selectedRequest ? (
            <>
              <DialogHeader>
                <DialogTitle>{selectedRequest.title}</DialogTitle>
                <DialogDescription>
                  Submitted {formatDate(selectedRequest.created_at)} by{" "}
                  {selectedRequest.client_name ||
                    selectedRequest.client_email ||
                    "Client"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      Service area
                    </div>
                    <div className="mt-1">{selectedRequest.service_area}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      Urgency
                    </div>
                    <div className="mt-1">
                      {labelFromSlug(selectedRequest.urgency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      Budget
                    </div>
                    <div className="mt-1">{budgetLabel(selectedRequest)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      Contact preference
                    </div>
                    <div className="mt-1">
                      {selectedRequest.contact_preference}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase text-muted-foreground">
                    Description
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                    {selectedRequest.description}
                  </p>
                </div>
                {selectedRequest.photo_notes ? (
                  <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      Photo notes
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                      {selectedRequest.photo_notes}
                    </p>
                  </div>
                ) : null}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedRequest(null)
                      void openMessages(selectedRequest)
                    }}
                  >
                    <MessageSquare className="size-4" />
                    Message client
                  </Button>
                  <Button
                    variant="outline"
                    disabled={isSaving}
                    onClick={() =>
                      void updateRequestStatus(selectedRequest, {
                        status: "reviewed",
                      })
                    }
                  >
                    Mark reviewed
                  </Button>
                  <EstimateActionButton
                    request={selectedRequest}
                    estimateId={estimateIdByRequestId[selectedRequest.id]}
                    isSaving={isSaving}
                    onCreateEstimate={(r) => void createEstimateFromRequest(r)}
                  />
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 p-4 sm:p-6 lg:p-8">
        {/* Shareable link card */}
        {shareableLink && (
          <div className="flex flex-col gap-3 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900/60 dark:bg-green-950/20 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-green-900 dark:text-green-100">
                <Link2 className="size-4 shrink-0" />
                Your client request link
              </div>
              <p className="mt-0.5 truncate text-xs text-green-700 dark:text-green-300">
                {shareableLink}
              </p>
              <p className="mt-1 text-xs text-green-700/70 dark:text-green-400">
                Send this link to clients so they can submit a project request — no account needed.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-green-300 bg-white text-green-800 hover:bg-green-100 dark:border-green-700 dark:bg-transparent dark:text-green-200"
                onClick={copyLink}
              >
                {linkCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {linkCopied ? "Copied!" : "Copy link"}
              </Button>
              <Button size="sm" variant="outline" asChild
                className="border-green-300 bg-white text-green-800 hover:bg-green-100 dark:border-green-700 dark:bg-transparent dark:text-green-200"
              >
                <a href={shareableLink} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" />
                  Preview
                </a>
              </Button>
            </div>
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Incoming Requests</CardTitle>
                <CardDescription>
                  Client job requests submitted to your workspace.
                </CardDescription>
              </div>
              <Badge variant="outline" className="w-fit">
                {newCount} new
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {errorMessage ? (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {errorMessage}
              </div>
            ) : null}

            <ContentReveal isLoading={isLoading} skeleton={<RequestsSkeleton />}>
              {requests.length > 0 ? (
                <div className="grid gap-3">
                  {requests.map((request) => (
                    <div
                      key={request.id}
                      className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-semibold">
                              {request.title}
                            </h3>
                            {request.trade && (
                              <Badge
                                variant="outline"
                                className="border-green-200 bg-green-50 text-green-800 dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-200"
                              >
                                {request.trade}
                              </Badge>
                            )}
                            <Badge variant="outline">
                              {labelFromSlug(request.status)}
                            </Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3.5" />
                              {request.service_area}
                            </span>
                            <span>{labelFromSlug(request.urgency)}</span>
                            <span>{budgetLabel(request)}</span>
                          </div>
                          <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
                            {request.description}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setSelectedRequest(request)}
                          >
                            <FileText className="size-4" />
                            View details
                          </Button>
                          <EstimateActionButton
                            request={request}
                            estimateId={estimateIdByRequestId[request.id]}
                            isSaving={isSaving}
                            onCreateEstimate={(r) => void createEstimateFromRequest(r)}
                          />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="size-4" />
                                <span className="sr-only">More actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>{request.title}</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => void openMessages(request)}>
                                <MessageSquare className="size-4" />
                                Message client
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() =>
                                  void updateRequestStatus(request, {
                                    status: "reviewed",
                                  })
                                }
                              >
                                Mark reviewed
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() =>
                                  void updateRequestStatus(request, {
                                    status: "closed",
                                  })
                                }
                              >
                                Close request
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
                  <div className="mx-auto grid size-12 place-items-center rounded-lg bg-background text-muted-foreground">
                    <ClipboardList className="size-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">
                    No incoming requests
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    Share your client request link so clients can submit job requests directly to you.
                  </p>
                </div>
              )}
            </ContentReveal>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
