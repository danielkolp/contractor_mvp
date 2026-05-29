"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  CheckCircle2,
  FileText,
  Inbox,
  type LucideIcon,
  Printer,
  Receipt,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

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
import { Skeleton } from "@/components/ui/skeleton"
import { money } from "@/lib/format-money"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"

type JobRequest = Database["public"]["Tables"]["job_requests"]["Row"]
type Estimate = Database["public"]["Tables"]["estimates"]["Row"]
type Invoice = Database["public"]["Tables"]["invoices"]["Row"]

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

function formatDate(value: string | null) {
  if (!value) return "Not set"
  return dateFmt.format(new Date(`${value.slice(0, 10)}T00:00:00`))
}

function statusLabel(value: string) {
  return value
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ")
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-lg bg-background text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-36 rounded-xl" />
      <div className="grid gap-6 xl:grid-cols-3">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  )
}

export function ClientDashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const [jobRequests, setJobRequests] = useState<JobRequest[]>([])
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setIsLoading(false)
      return
    }

    const { data: requests } = await supabase
      .from("job_requests")
      .select("*")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false })

    const requestRows = requests ?? []
    setJobRequests(requestRows)

    const requestIds = requestRows.map((request) => request.id)
    if (requestIds.length === 0) {
      setEstimates([])
      setInvoices([])
      setIsLoading(false)
      return
    }

    const [estimateResult, invoiceResult] = await Promise.all([
      supabase
        .from("estimates")
        .select("*")
        .in("job_request_id", requestIds)
        .order("sent_date", { ascending: false }),
      supabase
        .from("invoices")
        .select("*")
        .in("job_request_id", requestIds)
        .order("issue_date", { ascending: false }),
    ])

    setEstimates(estimateResult.data ?? [])
    setInvoices(invoiceResult.data ?? [])
    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(id)
  }, [load])

  async function respondToEstimate(
    estimate: Estimate,
    response: "Accepted" | "Declined"
  ) {
    if (!estimate.job_request_id) return
    setIsSaving(true)

    const requestStatus = response === "Accepted" ? "accepted" : "declined"
    const [estimateResult, requestResult] = await Promise.all([
      supabase
        .from("estimates")
        .update({ status: response })
        .eq("id", estimate.id)
        .select()
        .single(),
      supabase
        .from("job_requests")
        .update({ status: requestStatus })
        .eq("id", estimate.job_request_id)
        .select()
        .single(),
    ])

    if (estimateResult.error || requestResult.error) {
      toast.error("Could not update the estimate response.")
    } else {
      setEstimates((current) =>
        current.map((item) =>
          item.id === estimate.id ? estimateResult.data : item
        )
      )
      setJobRequests((current) =>
        current.map((item) =>
          item.id === estimate.job_request_id ? requestResult.data : item
        )
      )
      toast.success(
        response === "Accepted" ? "Estimate accepted" : "Estimate declined"
      )
    }

    setIsSaving(false)
  }

  return (
    <div className="grid gap-6 p-4 sm:p-6 lg:p-8">
      <ContentReveal isLoading={isLoading} skeleton={<DashboardSkeleton />}>
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Welcome to your EstiGator portal
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Submit job requests and review estimates or invoices connected
                to your work.
              </p>
            </div>
            <p className="rounded-lg border border-border bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground sm:text-right">
              Use the request link your contractor shared to submit a new job.
            </p>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Submitted Job Requests</CardTitle>
              <CardDescription>
                Requests you have sent for contractor review.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {jobRequests.length > 0 ? (
                <div className="grid gap-3">
                  {jobRequests.map((request) => (
                    <div
                      key={request.id}
                      className="rounded-lg border border-border bg-background p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{request.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {request.service_area} - {formatDate(request.created_at)}
                          </p>
                        </div>
                        <Badge variant="outline">
                          {statusLabel(request.status)}
                        </Badge>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {request.description}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Inbox}
                  title="No job requests yet"
                  description="Submit a job request when you are ready to share the work you need quoted."
                />
              )}
            </CardContent>
          </Card>

          <Card id="estimates">
            <CardHeader>
              <CardTitle>Estimates Received</CardTitle>
              <CardDescription>
                Review estimate details and respond when ready.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {estimates.length > 0 ? (
                <div className="grid gap-3">
                  {estimates.map((estimate) => {
                    const canRespond =
                      estimate.status !== "Accepted" &&
                      estimate.status !== "Declined" &&
                      estimate.status !== "Won" &&
                      estimate.status !== "Lost"

                    return (
                      <div
                        key={estimate.id}
                        className="rounded-lg border border-border bg-background p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">
                              {estimate.estimate_number}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-green-700 dark:text-green-400">
                              {money.format(estimate.amount)}
                            </p>
                          </div>
                          <Badge variant="outline">{estimate.status}</Badge>
                        </div>
                        {estimate.notes ? (
                          <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
                            {estimate.notes}
                          </p>
                        ) : null}
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <a
                              href={`/print/estimate/${estimate.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Printer className="size-3.5" />
                              View PDF
                            </a>
                          </Button>
                          {canRespond ? (
                            <>
                              <Button
                                size="sm"
                                className="bg-green-700 text-white hover:bg-green-800"
                                disabled={isSaving}
                                onClick={() =>
                                  void respondToEstimate(estimate, "Accepted")
                                }
                              >
                                <CheckCircle2 className="size-3.5" />
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isSaving}
                                onClick={() =>
                                  void respondToEstimate(estimate, "Declined")
                                }
                              >
                                <XCircle className="size-3.5" />
                                Decline
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={FileText}
                  title="No estimates received"
                  description="Estimates linked to your submitted job requests will appear here."
                />
              )}
            </CardContent>
          </Card>

          <Card id="invoices">
            <CardHeader>
              <CardTitle>Invoices Received</CardTitle>
              <CardDescription>
                View invoices connected to accepted work.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invoices.length > 0 ? (
                <div className="grid gap-3">
                  {invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="rounded-lg border border-border bg-background p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{invoice.invoice_number}</p>
                          <p className="mt-1 text-sm font-semibold text-green-700 dark:text-green-400">
                            {money.format(invoice.amount)}
                          </p>
                        </div>
                        <Badge variant="outline">{invoice.status}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Due {formatDate(invoice.due_date)}
                      </p>
                      <Button className="mt-4" size="sm" variant="outline" asChild>
                        <a
                          href={`/print/invoice/${invoice.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Printer className="size-3.5" />
                          View PDF
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Receipt}
                  title="No invoices received"
                  description="Invoices linked to your accepted work will appear here."
                />
              )}
            </CardContent>
          </Card>
        </section>
      </ContentReveal>
    </div>
  )
}
