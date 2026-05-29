"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ClipboardList,
  FileText,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Wrench,
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
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"

type JobRequest = Database["public"]["Tables"]["job_requests"]["Row"]
type JobRequestUpdate = Database["public"]["Tables"]["job_requests"]["Update"]
type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"]
type EstimateInsert = Database["public"]["Tables"]["estimates"]["Insert"]

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const dateFmt = new Intl.DateTimeFormat("en-US", {
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
  const [contractorTrades, setContractorTrades] = useState<string[]>([])
  const [tradeFilter, setTradeFilter] = useState<"mine" | "all">("mine")
  const [userId, setUserId] = useState<string | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<JobRequest | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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

    const [{ data: profileData }, { data, error }] = await Promise.all([
      supabase
        .from("profiles")
        .select("trade")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("job_requests")
        .select("*")
        .order("created_at", { ascending: false }),
    ])

    const trades = profileData?.trade
      ? profileData.trade.split(",").map((t: string) => t.trim()).filter(Boolean)
      : []
    setContractorTrades(trades)

    if (error) {
      setErrorMessage(error.message)
      setRequests([])
    } else {
      setRequests(data ?? [])
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

    toast.success(`Estimate ${data.estimate_number} created`, {
      description: "The estimate is linked to this job request.",
    })

    setIsSaving(false)
  }

  const hasTrades = contractorTrades.length > 0

  const visibleRequests = useMemo(() => {
    if (tradeFilter === "mine" && hasTrades) {
      return requests.filter(
        (r) => r.trade && contractorTrades.includes(r.trade)
      )
    }
    return requests
  }, [requests, tradeFilter, contractorTrades, hasTrades])

  const newCount = visibleRequests.filter((r) => r.status === "new").length

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
                <div className="flex justify-end gap-2">
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
                  <Button
                    className="bg-green-700 text-white hover:bg-green-800"
                    disabled={isSaving}
                    onClick={() => void createEstimateFromRequest(selectedRequest)}
                  >
                    <Plus className="size-4" />
                    Create estimate
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 p-4 sm:p-6 lg:p-8">
        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Incoming Requests</CardTitle>
                <CardDescription>
                  Client-submitted job requests waiting for review.
                </CardDescription>
              </div>
              <Badge variant="outline" className="w-fit">
                {newCount} new
              </Badge>
            </div>
            {hasTrades && (
              <div className="flex items-center gap-2">
                <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
                <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
                  <button
                    type="button"
                    onClick={() => setTradeFilter("mine")}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                      tradeFilter === "mine"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    My trades ({contractorTrades.join(", ")})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTradeFilter("all")}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                      tradeFilter === "all"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    All requests
                  </button>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {errorMessage ? (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {errorMessage}
              </div>
            ) : null}

            <ContentReveal isLoading={isLoading} skeleton={<RequestsSkeleton />}>
              {visibleRequests.length > 0 ? (
                <div className="grid gap-3">
                  {visibleRequests.map((request) => {
                    const isMyTrade =
                      hasTrades && request.trade
                        ? contractorTrades.includes(request.trade)
                        : false
                    return (
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
                                className={cn(
                                  isMyTrade
                                    ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-200"
                                    : ""
                                )}
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
                          <Button
                            className="bg-green-700 text-white hover:bg-green-800"
                            disabled={isSaving}
                            onClick={() => void createEstimateFromRequest(request)}
                          >
                            <Plus className="size-4" />
                            Create estimate
                          </Button>
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
                  )
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
                  <div className="mx-auto grid size-12 place-items-center rounded-lg bg-background text-muted-foreground">
                    <ClipboardList className="size-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">
                    {tradeFilter === "mine" && hasTrades
                      ? `No ${contractorTrades.join(" or ")} requests yet`
                      : "No incoming requests"}
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    {tradeFilter === "mine" && hasTrades
                      ? "Clients haven't submitted requests matching your trades yet. Switch to \"All requests\" to browse others."
                      : "Client job requests will appear here when submitted."}
                  </p>
                  {tradeFilter === "mine" && hasTrades && (
                    <button
                      type="button"
                      onClick={() => setTradeFilter("all")}
                      className="mt-4 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      Show all requests
                    </button>
                  )}
                </div>
              )}
            </ContentReveal>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
