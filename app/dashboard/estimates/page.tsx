"use client"

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  CheckCircle2,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/dashboard/page-header"
import { InvoiceListSkeleton } from "@/components/dashboard/skeleton-loaders"
import { ContentReveal } from "@/components/ui/content-reveal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { cn } from "@/lib/utils"

type ClientRow = Database["public"]["Tables"]["clients"]["Row"]
type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"]
type EstimateInsert = Database["public"]["Tables"]["estimates"]["Insert"]
type EstimateUpdate = Database["public"]["Tables"]["estimates"]["Update"]
type EstimateStatus = Database["public"]["Enums"]["estimate_status"]

type EstimateForm = {
  clientId: string
  clientName: string
  estimateNumber: string
  amount: string
  status: EstimateStatus
  sentDate: string
  followUpDate: string
  notes: string
}

const estimateStatuses: EstimateStatus[] = [
  "Draft",
  "Sent",
  "Follow-up Needed",
  "Follow-up Sent",
  "Interested",
  "Won",
  "Lost",
  "Archived",
]

const statusTone: Record<
  EstimateStatus,
  "default" | "success" | "warning" | "muted" | "outline"
> = {
  Draft: "muted",
  Sent: "default",
  "Follow-up Needed": "warning",
  "Follow-up Sent": "outline",
  Interested: "default",
  Won: "success",
  Lost: "muted",
  Archived: "muted",
}

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

function inputDate(offsetDays = 0) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offsetDays)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function formatDate(value: string | null) {
  if (!value) return "Not set"
  return dateFormatter.format(new Date(`${value}T00:00:00`))
}

function nullableText(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function nullableDate(value: string) {
  return value || null
}

function parseAmount(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function getClientLabel(client: ClientRow): string {
  if (client.company) {
    return client.name && client.name !== client.company
      ? `${client.company} - ${client.name}`
      : client.company
  }
  return client.name || "Unnamed client"
}

function SelectField({
  id,
  value,
  onChange,
  children,
  className,
  ...props
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
  className?: string
} & Omit<React.ComponentProps<"select">, "onChange" | "value" | "children">) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "flex h-9 min-w-0 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
}

const initialForm: EstimateForm = {
  clientId: "",
  clientName: "",
  estimateNumber: "",
  amount: "",
  status: "Sent",
  sentDate: inputDate(),
  followUpDate: inputDate(3),
  notes: "",
}

function formFromEstimate(estimate: EstimateRow): EstimateForm {
  return {
    clientId: estimate.client_id ?? "",
    clientName: estimate.client_name ?? "",
    estimateNumber: estimate.estimate_number,
    amount: String(estimate.amount ?? ""),
    status: estimate.status,
    sentDate: estimate.sent_date,
    followUpDate: estimate.follow_up_date ?? "",
    notes: estimate.notes ?? "",
  }
}

export default function EstimatesPage() {
  const supabase = useMemo(() => createClient(), [])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [estimates, setEstimates] = useState<EstimateRow[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEstimate, setEditingEstimate] = useState<EstimateRow | null>(
    null
  )
  const [form, setForm] = useState<EstimateForm>(initialForm)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadEstimates = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setErrorMessage(userError?.message || "You must be logged in.")
      setClients([])
      setEstimates([])
      setUserId(null)
      setIsLoading(false)
      return
    }

    setUserId(user.id)

    const [clientsResult, estimatesResult] = await Promise.all([
      supabase
        .from("clients")
        .select("*")
        .eq("user_id", user.id)
        .order("company", { ascending: true }),
      supabase
        .from("estimates")
        .select("*")
        .eq("user_id", user.id)
        .order("sent_date", { ascending: false }),
    ])

    const firstError = clientsResult.error || estimatesResult.error

    if (firstError) {
      setErrorMessage(
        firstError.message.includes("estimates")
          ? "The estimates table is not available yet. Apply supabase/apply_estimates.sql in Supabase, then refresh."
          : firstError.message
      )
      setClients([])
      setEstimates([])
    } else {
      setClients(clientsResult.data ?? [])
      setEstimates(estimatesResult.data ?? [])
    }

    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadEstimates()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [loadEstimates])

  const filteredEstimates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return estimates

    return estimates.filter(
      (estimate) =>
        estimate.estimate_number.toLowerCase().includes(query) ||
        (estimate.client_name ?? "").toLowerCase().includes(query) ||
        estimate.status.toLowerCase().includes(query)
    )
  }, [estimates, searchQuery])

  const openEstimates = useMemo(
    () =>
      estimates.filter(
        (estimate) =>
          estimate.status !== "Won" &&
          estimate.status !== "Lost" &&
          estimate.status !== "Archived"
      ),
    [estimates]
  )

  function updateForm<Field extends keyof EstimateForm>(
    field: Field,
    value: EstimateForm[Field]
  ) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function openAddEstimate() {
    setEditingEstimate(null)
    setForm({
      ...initialForm,
      estimateNumber: `EST-${Date.now().toString().slice(-5)}`,
    })
    setDialogOpen(true)
  }

  function openEditEstimate(estimate: EstimateRow) {
    setEditingEstimate(estimate)
    setForm(formFromEstimate(estimate))
    setDialogOpen(true)
  }

  function closeEstimateDialog(open: boolean) {
    setDialogOpen(open)
    if (!open) {
      setEditingEstimate(null)
      setForm(initialForm)
    }
  }

  async function handleAddOrUpdateEstimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!userId) {
      setErrorMessage("You must be logged in to save estimates.")
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    const selectedClient = form.clientId
      ? clients.find((client) => client.id === form.clientId) ?? null
      : null
    const resolvedClientName = selectedClient
      ? getClientLabel(selectedClient)
      : nullableText(form.clientName)

    const payload: EstimateInsert = {
      user_id: userId,
      client_id: form.clientId || null,
      client_name: resolvedClientName,
      estimate_number:
        form.estimateNumber.trim() || `EST-${Date.now().toString().slice(-5)}`,
      amount: parseAmount(form.amount),
      status: form.status,
      sent_date: form.sentDate || inputDate(),
      follow_up_date: nullableDate(form.followUpDate),
      notes: nullableText(form.notes),
    }

    if (editingEstimate) {
      const updatePayload: EstimateUpdate = {
        client_id: payload.client_id,
        client_name: payload.client_name,
        estimate_number: payload.estimate_number,
        amount: payload.amount,
        status: payload.status,
        sent_date: payload.sent_date,
        follow_up_date: payload.follow_up_date,
        notes: payload.notes,
      }
      const { data, error } = await supabase
        .from("estimates")
        .update(updatePayload)
        .eq("id", editingEstimate.id)
        .eq("user_id", userId)
        .select()
        .single()

      if (error) {
        setErrorMessage(error.message)
        toast.error("Could not save estimate")
      } else {
        setEstimates((current) =>
          current.map((estimate) =>
            estimate.id === editingEstimate.id ? data : estimate
          )
        )
        closeEstimateDialog(false)
        toast.success("Estimate saved")
      }
    } else {
      const { data, error } = await supabase
        .from("estimates")
        .insert(payload)
        .select()
        .single()

      if (error) {
        setErrorMessage(error.message)
        toast.error("Could not add estimate")
      } else {
        setEstimates((current) => [data, ...current])
        closeEstimateDialog(false)
        toast.success("Estimate added")
      }
    }

    setIsSaving(false)
  }

  async function updateEstimateStatus(
    estimate: EstimateRow,
    status: EstimateStatus
  ) {
    if (!userId) {
      setErrorMessage("You must be logged in to update estimates.")
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    const payload: EstimateUpdate = {
      status,
      follow_up_date:
        status === "Won" || status === "Lost" || status === "Archived"
          ? null
          : estimate.follow_up_date,
    }

    const { data, error } = await supabase
      .from("estimates")
      .update(payload)
      .eq("id", estimate.id)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) {
      setErrorMessage(error.message)
      toast.error("Could not update estimate")
    } else {
      setEstimates((current) =>
        current.map((item) => (item.id === estimate.id ? data : item))
      )
      toast.success(`Estimate marked ${status.toLowerCase()}`)
    }

    setIsSaving(false)
  }

  return (
    <>
      <PageHeader
        title="Estimates"
        description="Track quotes you sent and know when to ask if the customer wants to move forward."
      >
        <Button onClick={openAddEstimate}>
          <Plus className="size-4" />
          Add estimate
        </Button>
      </PageHeader>

      <Dialog open={dialogOpen} onOpenChange={closeEstimateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingEstimate ? "Edit estimate" : "Add estimate"}
            </DialogTitle>
            <DialogDescription>
              Save the quote details and the next follow-up date.
            </DialogDescription>
          </DialogHeader>

          <form className="grid gap-4" onSubmit={handleAddOrUpdateEstimate}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="estimate-client">Client</Label>
                <SelectField
                  id="estimate-client"
                  value={form.clientId}
                  onChange={(value) => {
                    const client = clients.find((item) => item.id === value)
                    updateForm("clientId", value)
                    if (client) {
                      updateForm("clientName", getClientLabel(client))
                    }
                  }}
                  disabled={isSaving}
                >
                  <option value="">No linked client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {getClientLabel(client)}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="estimate-client-name">Client name</Label>
                <Input
                  id="estimate-client-name"
                  value={form.clientName}
                  onChange={(event) =>
                    updateForm("clientName", event.target.value)
                  }
                  placeholder="Homeowner or company"
                  disabled={isSaving}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="estimate-number">Estimate number</Label>
                <Input
                  id="estimate-number"
                  value={form.estimateNumber}
                  onChange={(event) =>
                    updateForm("estimateNumber", event.target.value)
                  }
                  placeholder="EST-1024"
                  disabled={isSaving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="estimate-amount">Amount</Label>
                <Input
                  id="estimate-amount"
                  value={form.amount}
                  onChange={(event) => updateForm("amount", event.target.value)}
                  placeholder="4500"
                  type="number"
                  min="0"
                  step="1"
                  disabled={isSaving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="estimate-status">Status</Label>
                <SelectField
                  id="estimate-status"
                  value={form.status}
                  onChange={(value) =>
                    updateForm("status", value as EstimateStatus)
                  }
                  disabled={isSaving}
                >
                  {estimateStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </SelectField>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="estimate-sent-date">Sent date</Label>
                <Input
                  id="estimate-sent-date"
                  type="date"
                  value={form.sentDate}
                  onChange={(event) => updateForm("sentDate", event.target.value)}
                  disabled={isSaving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="estimate-follow-up-date">Follow-up date</Label>
                <Input
                  id="estimate-follow-up-date"
                  type="date"
                  value={form.followUpDate}
                  onChange={(event) =>
                    updateForm("followUpDate", event.target.value)
                  }
                  disabled={isSaving}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="estimate-notes">Notes</Label>
              <textarea
                id="estimate-notes"
                value={form.notes}
                onChange={(event) => updateForm("notes", event.target.value)}
                placeholder="Scope, customer concerns, or what to mention when you follow up."
                className="min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                disabled={isSaving}
              />
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isSaving}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isSaving}>
                {isSaving
                  ? "Saving..."
                  : editingEstimate
                    ? "Save changes"
                    : "Add estimate"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 p-4 sm:p-6 lg:p-8">
        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle>Estimate worklist</CardTitle>
                <CardDescription>
                  Follow up on open quotes before they go quiet.
                </CardDescription>
              </div>
              <Badge variant="outline" className="w-fit">
                {openEstimates.length} open estimate
                {openEstimates.length === 1 ? "" : "s"}
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search client, estimate, or status"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!searchQuery}
                onClick={() => setSearchQuery("")}
              >
                Clear
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            {errorMessage ? (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                <div className="font-medium">Estimate sync error</div>
                <p className="mt-1 leading-6">{errorMessage}</p>
              </div>
            ) : null}

            <ContentReveal
              isLoading={isLoading}
              skeleton={<InvoiceListSkeleton rows={6} />}
            >
              {errorMessage && estimates.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
                  <h3 className="text-base font-semibold">
                    Something didn&apos;t load
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    Apply the estimates migration, then refresh this page.
                  </p>
                  <Button
                    className="mt-5"
                    variant="outline"
                    onClick={() => void loadEstimates()}
                  >
                    <RefreshCw className="size-4" />
                    Try again
                  </Button>
                </div>
              ) : filteredEstimates.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-border">
                  <div className="hidden grid-cols-[120px_1fr_120px_120px_130px_72px] gap-4 border-b border-border bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground xl:grid">
                    <div>Estimate</div>
                    <div>Client</div>
                    <div>Follow-up</div>
                    <div>Amount</div>
                    <div>Status</div>
                    <div />
                  </div>
                  <div className="divide-y divide-border">
                    {filteredEstimates.map((estimate) => (
                      <div key={estimate.id} className="min-w-0 px-4 py-3">
                        <div className="grid min-w-0 gap-3 rounded-md xl:grid-cols-[120px_1fr_120px_120px_130px_72px] xl:items-center">
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {estimate.estimate_number}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground xl:hidden">
                              Sent {formatDate(estimate.sent_date)}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {estimate.client_name || "No client"}
                            </div>
                          </div>
                          <div className="text-sm">
                            <div className="flex items-center gap-2 xl:block">
                              <span className="text-xs font-medium uppercase text-muted-foreground xl:hidden">
                                Follow-up
                              </span>
                              <span>{formatDate(estimate.follow_up_date)}</span>
                            </div>
                          </div>
                          <div className="font-semibold">
                            {moneyFormatter.format(estimate.amount)}
                          </div>
                          <div>
                            <Badge variant={statusTone[estimate.status]}>
                              {estimate.status}
                            </Badge>
                          </div>
                          <div className="flex justify-start gap-2 xl:justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Actions for ${estimate.estimate_number}`}
                                  disabled={isSaving}
                                >
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <DropdownMenuLabel>
                                  {estimate.estimate_number}
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() => openEditEstimate(estimate)}
                                >
                                  <Pencil className="size-4" />
                                  Edit estimate
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() =>
                                    void updateEstimateStatus(estimate, "Won")
                                  }
                                >
                                  <CheckCircle2 className="size-4" />
                                  Mark won
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() =>
                                    void updateEstimateStatus(estimate, "Lost")
                                  }
                                >
                                  <XCircle className="size-4" />
                                  Mark lost
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
                  <div className="mx-auto grid size-12 place-items-center rounded-lg bg-background text-muted-foreground">
                    <FileText className="size-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">
                    No estimates yet
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    Add an estimate after you send a quote so the app can tell
                    you when to follow up.
                  </p>
                  <Button className="mt-5" onClick={openAddEstimate}>
                    <Plus className="size-4" />
                    Add estimate
                  </Button>
                </div>
              )}
            </ContentReveal>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
