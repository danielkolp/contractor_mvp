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
  Building2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
} from "lucide-react"

import { PageHeader } from "@/components/dashboard/page-header"
import { ClientListSkeleton } from "@/components/dashboard/skeleton-loaders"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { cn } from "@/lib/utils"

type ClientRow = Database["public"]["Tables"]["clients"]["Row"]
type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"]
type ClientUpdate = Database["public"]["Tables"]["clients"]["Update"]
type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"]
type PaymentReliability = Database["public"]["Enums"]["payment_reliability"]
type Trade = "Landscaping" | "Renovation" | "Roofing" | "Electrical" | "Plumbing"

type ClientForm = {
  name: string
  company: string
  email: string
  phone: string
  trade: Trade
  totalBilled: string
  unpaidBalance: string
  overdueInvoiceCount: string
  lastContactedDate: string
  paymentReliability: PaymentReliability
}

const reliabilityLabels: PaymentReliability[] = [
  "Reliable",
  "Slow payer",
  "High risk",
  "New client",
]

const trades: Trade[] = [
  "Landscaping",
  "Renovation",
  "Roofing",
  "Electrical",
  "Plumbing",
]

const initialForm: ClientForm = {
  name: "",
  company: "",
  email: "",
  phone: "",
  trade: "Renovation",
  totalBilled: "",
  unpaidBalance: "",
  overdueInvoiceCount: "0",
  lastContactedDate: "",
  paymentReliability: "New client",
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

function formatDate(value: string | null) {
  if (!value) {
    return "Not contacted"
  }

  return dateFormatter.format(new Date(`${value}T00:00:00`))
}

function parseNumber(value: string) {
  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : 0
}

function nullableText(value: string) {
  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : null
}

function nullableDate(value: string) {
  return value || null
}

function getClientLabel(client: Pick<ClientRow, "company" | "name">) {
  if (client.company) {
    return client.name && client.name !== client.company
      ? `${client.company} - ${client.name}`
      : client.company
  }

  return client.name || "Unnamed client"
}

function isMissingEstimatesTableError(message: string) {
  const normalized = message.toLowerCase()

  return (
    normalized.includes("estimates") &&
    (normalized.includes("schema cache") ||
      normalized.includes("does not exist") ||
      normalized.includes("could not find"))
  )
}

function normalize(value: string | null | undefined) {
  return (value || "").trim().toLowerCase()
}

function isUnpaidInvoice(invoice: InvoiceRow) {
  return invoice.status !== "Paid" && invoice.status !== "Draft"
}

function isOverdueInvoice(invoice: InvoiceRow) {
  return [
    "Overdue",
    "Follow-up Sent",
    "Payment Plan",
    "Escalated",
  ].includes(invoice.status)
}

function invoiceMatchesClient(client: ClientRow, invoice: InvoiceRow) {
  if (invoice.client_id === client.id) {
    return true
  }

  if (invoice.client_id) {
    return false
  }

  const invoiceClient = normalize(invoice.client_name)

  return (
    invoiceClient.length > 0 &&
    (invoiceClient === normalize(client.company) ||
      invoiceClient === normalize(client.name))
  )
}

function getClientInvoiceStats(client: ClientRow, invoices: InvoiceRow[]) {
  const relatedInvoices = invoices.filter((invoice) =>
    invoiceMatchesClient(client, invoice)
  )
  const hasInvoiceTotals = relatedInvoices.length > 0

  return {
    totalBilled: hasInvoiceTotals
      ? relatedInvoices.reduce((sum, invoice) => sum + invoice.amount, 0)
      : client.total_billed ?? 0,
    unpaidBalance: hasInvoiceTotals
      ? relatedInvoices
          .filter(isUnpaidInvoice)
          .reduce((sum, invoice) => sum + invoice.amount, 0)
      : client.unpaid_balance ?? 0,
    overdueInvoiceCount: hasInvoiceTotals
      ? relatedInvoices.filter(isOverdueInvoice).length
      : client.overdue_invoice_count ?? 0,
    invoiceCount: relatedInvoices.length,
  }
}

function reliabilityBadgeClass(label: PaymentReliability) {
  if (label === "Reliable") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  }

  if (label === "Slow payer") {
    return "border-amber-200 bg-amber-50 text-amber-700"
  }

  if (label === "High risk") {
    return "border-red-200 bg-red-50 text-red-700"
  }

  return "border-sky-200 bg-sky-50 text-sky-700"
}

function SelectField({
  id,
  value,
  onChange,
  children,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="flex h-9 min-w-0 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {children}
    </select>
  )
}

function ReliabilityBadge({ label }: { label: PaymentReliability }) {
  return (
    <Badge variant="outline" className={cn("w-fit", reliabilityBadgeClass(label))}>
      {label}
    </Badge>
  )
}

function formFromClient(client: ClientRow): ClientForm {
  return {
    name: client.name,
    company: client.company,
    email: client.email || "",
    phone: client.phone || "",
    trade: (client.trade || "Renovation") as Trade,
    totalBilled: String(client.total_billed ?? ""),
    unpaidBalance: String(client.unpaid_balance ?? ""),
    overdueInvoiceCount: String(client.overdue_invoice_count ?? 0),
    lastContactedDate: client.last_contacted_date || "",
    paymentReliability: client.payment_reliability,
  }
}

export default function ClientsPage() {
  const supabase = useMemo(() => createClient(), [])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [clientDialogOpen, setClientDialogOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<ClientRow | null>(null)
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null)
  const [form, setForm] = useState<ClientForm>(initialForm)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadClients = useCallback(async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setErrorMessage(userError?.message || "You must be logged in.")
      setClients([])
      setInvoices([])
      setUserId(null)
      setIsLoading(false)
      return
    }

    setUserId(user.id)

    const [clientsResult, invoicesResult] = await Promise.all([
      supabase
        .from("clients")
        .select("*")
        .eq("user_id", user.id)
        .order("company", { ascending: true }),
      supabase
        .from("invoices")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ])

    if (clientsResult.error) {
      setErrorMessage(clientsResult.error.message)
      setClients([])
    } else {
      setClients(clientsResult.data || [])
    }

    if (invoicesResult.error) {
      setErrorMessage(invoicesResult.error.message)
      setInvoices([])
    } else {
      setInvoices(invoicesResult.data || [])
    }

    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadClients()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [loadClients])

  const filteredClients = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    if (!query) {
      return clients
    }

    return clients.filter((client) =>
      [client.name, client.company, client.email || ""].some((value) =>
        value.toLowerCase().includes(query)
      )
    )
  }, [clients, searchQuery])

  function updateForm<Field extends keyof ClientForm>(
    field: Field,
    value: ClientForm[Field]
  ) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function openAddClient() {
    setEditingClient(null)
    setForm(initialForm)
    setClientDialogOpen(true)
  }

  function openEditClient(client: ClientRow) {
    setEditingClient(client)
    setForm(formFromClient(client))
    setClientDialogOpen(true)
  }

  function closeClientDialog(open: boolean) {
    setClientDialogOpen(open)

    if (!open) {
      setEditingClient(null)
      setForm(initialForm)
    }
  }

  async function linkMatchingInvoices(client: ClientRow, source = invoices) {
    if (!userId) {
      return
    }

    const matchingIds = source
      .filter(
        (invoice) => !invoice.client_id && invoiceMatchesClient(client, invoice)
      )
      .map((invoice) => invoice.id)

    if (matchingIds.length === 0) {
      return
    }

    const { data, error } = await supabase
      .from("invoices")
      .update({ client_id: client.id, client_name: getClientLabel(client) })
      .eq("user_id", userId)
      .in("id", matchingIds)
      .select()

    if (error) {
      setErrorMessage(error.message)
      return
    }

    const updatedById = new Map((data || []).map((invoice) => [invoice.id, invoice]))
    setInvoices((current) =>
      current.map((invoice) => updatedById.get(invoice.id) || invoice)
    )
  }

  async function syncLinkedClientReferences(client: ClientRow) {
    if (!userId) {
      return false
    }

    const clientName = getClientLabel(client)

    const [invoiceResult, estimateResult] = await Promise.all([
      supabase
        .from("invoices")
        .update({ client_name: clientName })
        .eq("user_id", userId)
        .eq("client_id", client.id)
        .select(),
      supabase
        .from("estimates")
        .update({ client_name: clientName })
        .eq("user_id", userId)
        .eq("client_id", client.id),
    ])

    if (invoiceResult.error) {
      setErrorMessage(invoiceResult.error.message)
      return false
    }

    if (
      estimateResult.error &&
      !isMissingEstimatesTableError(estimateResult.error.message)
    ) {
      setErrorMessage(estimateResult.error.message)
      return false
    }

    const updatedById = new Map(
      (invoiceResult.data || []).map((invoice) => [invoice.id, invoice])
    )
    setInvoices((current) =>
      current.map((invoice) => updatedById.get(invoice.id) || invoice)
    )

    return true
  }

  async function handleAddOrUpdateClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!userId) {
      setErrorMessage("You must be logged in to save clients.")
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    if (editingClient) {
      const payload: ClientUpdate = {
        name: form.name.trim() || "New Contact",
        company: form.company.trim() || "New Client Company",
        email: nullableText(form.email),
        phone: nullableText(form.phone),
        trade: form.trade,
        total_billed: parseNumber(form.totalBilled),
        unpaid_balance: parseNumber(form.unpaidBalance),
        overdue_invoice_count: Math.max(
          0,
          Math.floor(parseNumber(form.overdueInvoiceCount))
        ),
        last_contacted_date: nullableDate(form.lastContactedDate),
        payment_reliability: form.paymentReliability,
      }

      const { data, error } = await supabase
        .from("clients")
        .update(payload)
        .eq("id", editingClient.id)
        .eq("user_id", userId)
        .select()
        .single()

      if (error) {
        setErrorMessage(error.message)
      } else {
        setClients((current) =>
          current.map((client) => (client.id === data.id ? data : client))
        )
        setSelectedClient((current) =>
          current?.id === data.id ? data : current
        )
        const synced = await syncLinkedClientReferences(data)
        if (synced) {
          await linkMatchingInvoices(data)
          closeClientDialog(false)
        }
      }
    } else {
      const payload: ClientInsert = {
        user_id: userId,
        name: form.name.trim() || "New Contact",
        company: form.company.trim() || "New Client Company",
        email: nullableText(form.email),
        phone: nullableText(form.phone),
        trade: form.trade,
        total_billed: parseNumber(form.totalBilled),
        unpaid_balance: parseNumber(form.unpaidBalance),
        overdue_invoice_count: Math.max(
          0,
          Math.floor(parseNumber(form.overdueInvoiceCount))
        ),
        last_contacted_date: nullableDate(form.lastContactedDate),
        payment_reliability: form.paymentReliability,
      }

      const { data, error } = await supabase
        .from("clients")
        .insert(payload)
        .select()
        .single()

      if (error) {
        setErrorMessage(error.message)
      } else {
        setClients((current) => [data, ...current])
        await linkMatchingInvoices(data)
        closeClientDialog(false)
      }
    }

    setIsSaving(false)
  }

  async function deleteClient(clientId: string) {
    if (!userId) {
      setErrorMessage("You must be logged in to delete clients.")
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    const unlinkResult = await supabase
      .from("invoices")
      .update({ client_id: null })
      .eq("user_id", userId)
      .eq("client_id", clientId)

    if (unlinkResult.error) {
      setErrorMessage(unlinkResult.error.message)
      setIsSaving(false)
      return
    }

    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("id", clientId)
      .eq("user_id", userId)

    if (error) {
      setErrorMessage(error.message)
    } else {
      setClients((current) => current.filter((client) => client.id !== clientId))
      setInvoices((current) =>
        current.map((invoice) =>
          invoice.client_id === clientId ? { ...invoice, client_id: null } : invoice
        )
      )
      setSelectedClient((current) =>
        current?.id === clientId ? null : current
      )
    }

    setIsSaving(false)
  }

  return (
    <>
      <PageHeader
        title="Clients"
        description="Track contractor clients, unpaid balances, and payment reliability before follow-ups get messy."
      >
        <Button onClick={openAddClient}>
          <Plus className="size-4" />
          Add client
        </Button>
      </PageHeader>

      <div className="grid gap-6 p-4 sm:p-6 lg:p-8">
        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle>Clients</CardTitle>
                <CardDescription>
                  See who owes money and how reliable they have been.
                </CardDescription>
              </div>
              <Badge variant="outline" className="w-fit">
                {filteredClients.length} of {clients.length} clients
              </Badge>
            </div>
            <div className="relative w-full max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search name, company, or email"
              />
            </div>
          </CardHeader>
          <CardContent>
            {errorMessage ? (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                <div className="font-medium">Client sync error</div>
                <p className="mt-1 leading-6">{errorMessage}</p>
              </div>
            ) : null}

            <ContentReveal isLoading={isLoading} skeleton={<ClientListSkeleton rows={4} />}>
              {errorMessage && clients.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
                <h3 className="text-base font-semibold">
                  Something didn&apos;t load
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  Your data is safe. Try refreshing, or check your connection.
                </p>
                <Button
                  className="mt-5"
                  variant="outline"
                  onClick={() => {
                    setIsLoading(true)
                    setErrorMessage(null)
                    void loadClients()
                  }}
                >
                  <RefreshCw className="size-4" />
                  Try again
                </Button>
              </div>
            ) : filteredClients.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {filteredClients.map((client, i) => {
                  const stats = getClientInvoiceStats(client, invoices)

                  return (
                    <div
                      key={client.id}
                      className="rounded-lg border border-border bg-background p-4 animate-[fade-slide-up_0.35s_ease-out_both] motion-reduce:animate-none"
                      style={{ animationDelay: `${Math.min(i, 5) * 60}ms` }}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-700">
                            <Building2 className="size-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="break-words font-medium">
                              {client.company}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                              <span className="break-words">{client.name}</span>
                              <span>{client.trade || "Trade not set"}</span>
                            </div>
                          </div>
                        </div>
                        <ReliabilityBadge label={client.payment_reliability} />
                      </div>

                      <div className="mt-4 grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-2">
                        <div>
                          <div className="text-xs text-muted-foreground">
                            Unpaid
                          </div>
                          <div className="font-semibold">
                            {moneyFormatter.format(stats.unpaidBalance)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">
                            Overdue
                          </div>
                          <div className="font-semibold">
                            {stats.overdueInvoiceCount} invoices
                          </div>
                        </div>
                      </div>

                      {stats.invoiceCount > 0 ? (
                        <div className="mt-3 text-xs text-muted-foreground">
                          {stats.invoiceCount} invoice{stats.invoiceCount === 1 ? "" : "s"} connected
                        </div>
                      ) : stats.unpaidBalance === 0 && stats.overdueInvoiceCount === 0 ? (
                        <div className="mt-3 text-xs text-muted-foreground">
                          No invoices linked yet
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-muted-foreground">
                          Last contacted {formatDate(client.last_contacted_date)}
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                          <Button
                            variant="outline"
                            className="col-span-2 w-full sm:w-auto"
                            onClick={() => setSelectedClient(client)}
                          >
                            <UserRound className="size-4" />
                            View details
                          </Button>
                          <Button
                            variant="outline"
                            className="w-full sm:w-auto"
                            onClick={() => openEditClient(client)}
                          >
                            <Pencil className="size-4" />
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            className="w-full sm:w-auto"
                            onClick={() => void deleteClient(client.id)}
                            disabled={isSaving}
                          >
                            <Trash2 className="size-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
                <div className="mx-auto grid size-12 place-items-center rounded-lg bg-background text-muted-foreground">
                  {searchQuery.trim() ? (
                    <Search className="size-5" />
                  ) : (
                    <Building2 className="size-5" />
                  )}
                </div>
                <h3 className="mt-4 text-base font-semibold">
                  {searchQuery.trim()
                    ? "No clients match that search"
                    : "No clients yet"}
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  {searchQuery.trim()
                    ? "Try searching by contact name, company, or email."
                    : "Add your first client so invoices and balances stay connected."}
                </p>
                <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                  {searchQuery.trim() ? (
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => setSearchQuery("")}
                  >
                    Clear search
                  </Button>
                ) : null}
                  <Button className="w-full sm:w-auto" onClick={openAddClient}>
                    <Plus className="size-4" />
                    Add client
                  </Button>
                  {!searchQuery.trim() ? (
                    <Button variant="outline" className="w-full sm:w-auto" asChild>
                      <a href="/dashboard/invoices">Add invoice</a>
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
            </ContentReveal>
          </CardContent>
        </Card>
      </div>

      <Dialog open={clientDialogOpen} onOpenChange={closeClientDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingClient ? "Edit client" : "Add client"}
            </DialogTitle>
            <DialogDescription>
              {editingClient
                ? "Update the client details."
                : "Add a client you invoice or follow up with."}
            </DialogDescription>
          </DialogHeader>

          <form className="grid gap-4" onSubmit={handleAddOrUpdateClient}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="client-name">Contact name</Label>
                <Input
                  id="client-name"
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  placeholder="Sam Walker"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  value={form.company}
                  onChange={(event) => updateForm("company", event.target.value)}
                  placeholder="Walker Property Group"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                  placeholder="sam@example.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(event) => updateForm("phone", event.target.value)}
                  placeholder="(555) 010-4420"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="total-billed">Total billed</Label>
                <Input
                  id="total-billed"
                  type="number"
                  min="0"
                  value={form.totalBilled}
                  onChange={(event) =>
                    updateForm("totalBilled", event.target.value)
                  }
                  placeholder="12000"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="unpaid-balance">Unpaid balance</Label>
                <Input
                  id="unpaid-balance"
                  type="number"
                  min="0"
                  value={form.unpaidBalance}
                  onChange={(event) =>
                    updateForm("unpaidBalance", event.target.value)
                  }
                  placeholder="2500"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="overdue-count">Overdue invoices</Label>
                <Input
                  id="overdue-count"
                  type="number"
                  min="0"
                  value={form.overdueInvoiceCount}
                  onChange={(event) =>
                    updateForm("overdueInvoiceCount", event.target.value)
                  }
                  placeholder="1"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="trade">Trade</Label>
                <SelectField
                  id="trade"
                  value={form.trade}
                  onChange={(value) => updateForm("trade", value as Trade)}
                >
                  {trades.map((trade) => (
                    <option key={trade} value={trade}>
                      {trade}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="last-contacted">Last contacted</Label>
                <Input
                  id="last-contacted"
                  type="date"
                  value={form.lastContactedDate}
                  onChange={(event) =>
                    updateForm("lastContactedDate", event.target.value)
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="reliability">Payment reliability</Label>
                <SelectField
                  id="reliability"
                  value={form.paymentReliability}
                  onChange={(value) =>
                    updateForm("paymentReliability", value as PaymentReliability)
                  }
                >
                  {reliabilityLabels.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                </SelectField>
              </div>
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
                  : editingClient
                    ? "Save changes"
                    : "Add client"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedClient !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedClient(null)
          }
        }}
      >
        <DialogContent>
          {selectedClient ? (
            <>
              <DialogHeader>
                <DialogTitle>{selectedClient.company}</DialogTitle>
                <DialogDescription>
                  Client details, invoice totals, and current balance.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-medium">{selectedClient.name}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {selectedClient.trade || "Trade not set"} client
                    </div>
                  </div>
                  <ReliabilityBadge
                    label={selectedClient.payment_reliability}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-xs text-muted-foreground">Email</div>
                    <div className="mt-1 break-all text-sm font-medium">
                      {selectedClient.email || "No email"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-xs text-muted-foreground">Phone</div>
                    <div className="mt-1 text-sm font-medium">
                      {selectedClient.phone || "No phone"}
                    </div>
                  </div>
                  {(() => {
                    const stats = getClientInvoiceStats(selectedClient, invoices)

                    return (
                      <>
                        <div className="rounded-lg border border-border p-3">
                          <div className="text-xs text-muted-foreground">
                            Total billed
                          </div>
                          <div className="mt-1 text-lg font-semibold">
                            {moneyFormatter.format(stats.totalBilled)}
                          </div>
                        </div>
                        <div className="rounded-lg border border-border p-3">
                          <div className="text-xs text-muted-foreground">
                            Unpaid balance
                          </div>
                          <div className="mt-1 text-lg font-semibold">
                            {moneyFormatter.format(stats.unpaidBalance)}
                          </div>
                        </div>
                      </>
                    )
                  })()}
                </div>

                <div className="rounded-lg bg-muted/40 p-4 text-sm">
                  <div className="font-medium">Follow-up summary</div>
                  <p className="mt-2 leading-6 text-muted-foreground">
                    {
                      getClientInvoiceStats(selectedClient, invoices)
                        .overdueInvoiceCount
                    }{" "}
                    overdue invoices. Last contacted{" "}
                    {formatDate(selectedClient.last_contacted_date)}.
                  </p>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => openEditClient(selectedClient)}
                  >
                    <Pencil className="size-4" />
                    Edit client
                  </Button>
                </DialogFooter>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
