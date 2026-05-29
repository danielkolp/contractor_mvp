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
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
} from "lucide-react"
import { toast } from "sonner"

import { AddRecoveryDialog } from "@/components/dashboard/add-recovery-dialog"
import { PageHeader } from "@/components/dashboard/page-header"
import { ClientListSkeleton } from "@/components/dashboard/skeleton-loaders"
import { ContentReveal } from "@/components/ui/content-reveal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatPhoneNumberInput } from "@/lib/phone-format"
import { money } from "@/lib/format-money"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { cn } from "@/lib/utils"

type ClientRow = Database["public"]["Tables"]["clients"]["Row"]
type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"]
type ClientUpdate = Database["public"]["Tables"]["clients"]["Update"]
type RecoveryItem = Database["public"]["Tables"]["recovery_items"]["Row"]
type PaymentReliability = Database["public"]["Enums"]["payment_reliability"]

type CustomerForm = {
  name: string
  company: string
  email: string
  phone: string
  lastContactedDate: string
  paymentReliability: PaymentReliability
}

const reliabilityLabels: PaymentReliability[] = [
  "Reliable",
  "Slow payer",
  "High risk",
  "New client",
]

const initialForm: CustomerForm = {
  name: "",
  company: "",
  email: "",
  phone: "",
  lastContactedDate: "",
  paymentReliability: "New client",
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never"
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function nullableText(v: string) {
  const t = v.trim()
  return t.length > 0 ? t : null
}

function getDisplayName(c: Pick<ClientRow, "company" | "name">): string {
  if (c.company && c.company.trim()) return c.company.trim()
  return c.name?.trim() || "Unnamed customer"
}

function reliabilityBadgeClass(label: PaymentReliability) {
  switch (label) {
    case "Reliable":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
    case "Slow payer":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
    case "High risk":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
    default:
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300"
  }
}

function formFromClient(c: ClientRow): CustomerForm {
  return {
    name: c.name ?? "",
    company: c.company ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    lastContactedDate: c.last_contacted_date ?? "",
    paymentReliability: c.payment_reliability,
  }
}

function SelectField({
  id,
  value,
  onChange,
  children,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  children: ReactNode
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {children}
    </select>
  )
}

export default function CustomersPage() {
  const supabase = useMemo(() => createClient(), [])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [recoveryItems, setRecoveryItems] = useState<RecoveryItem[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Dialogs
  const [editOpen, setEditOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<ClientRow | null>(null)
  const [form, setForm] = useState<CustomerForm>(initialForm)
  const [deleteTarget, setDeleteTarget] = useState<ClientRow | null>(null)

  // Add recovery dialog state
  const [addRecoveryOpen, setAddRecoveryOpen] = useState(false)
  const [recoveryPrefilledClient, setRecoveryPrefilledClient] = useState<ClientRow | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      setErrorMessage(userError?.message ?? "You must be logged in.")
      setIsLoading(false)
      return
    }
    setUserId(user.id)

    const [clientsRes, recoveryRes] = await Promise.all([
      supabase.from("clients").select("*").eq("user_id", user.id).order("company", { ascending: true }),
      supabase.from("recovery_items").select("*").eq("user_id", user.id).not("status", "in", "(archived)"),
    ])

    setClients(clientsRes.data ?? [])
    setRecoveryItems(recoveryRes.data ?? [])
    if (clientsRes.error) setErrorMessage(clientsRes.error.message)
    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(id)
  }, [load])

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) =>
      [c.name, c.company, c.email ?? ""].some((v) => (v ?? "").toLowerCase().includes(q))
    )
  }, [clients, search])

  function getCustomerRecoveries(client: ClientRow) {
    const name = getDisplayName(client).toLowerCase()
    return recoveryItems.filter(
      (r) =>
        r.client_name.toLowerCase() === name ||
        (client.email && r.client_email === client.email) ||
        (client.phone && r.client_phone === client.phone)
    )
  }

  // ─── Handlers ─────────────────────────────────────────────────

  function openAddCustomer() {
    setEditingClient(null)
    setForm(initialForm)
    setEditOpen(true)
  }

  function openEditCustomer(c: ClientRow) {
    setEditingClient(c)
    setForm(formFromClient(c))
    setEditOpen(true)
  }

  function openAddRecovery(c: ClientRow) {
    setRecoveryPrefilledClient(c)
    setAddRecoveryOpen(true)
  }

  function updateForm<K extends keyof CustomerForm>(field: K, value: CustomerForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!userId) return
    setIsSaving(true)
    setErrorMessage(null)

    if (editingClient) {
      const patch: ClientUpdate = {
        name: form.name.trim() || "New Contact",
        company: form.company.trim() || "New Company",
        email: nullableText(form.email),
        phone: nullableText(form.phone),
        last_contacted_date: form.lastContactedDate || null,
        payment_reliability: form.paymentReliability,
      }
      const { data, error } = await supabase
        .from("clients").update(patch).eq("id", editingClient.id).eq("user_id", userId).select().single()
      if (error) { setErrorMessage(error.message) }
      else {
        setClients((prev) => prev.map((c) => (c.id === data.id ? data : c)))
        setEditOpen(false)
        toast.success("Customer updated.")
      }
    } else {
      const payload: ClientInsert = {
        user_id: userId,
        name: form.name.trim() || "New Contact",
        company: form.company.trim() || "New Company",
        email: nullableText(form.email),
        phone: nullableText(form.phone),
        last_contacted_date: form.lastContactedDate || null,
        payment_reliability: form.paymentReliability,
      }
      const { data, error } = await supabase
        .from("clients").insert(payload).select().single()
      if (error) { setErrorMessage(error.message) }
      else {
        setClients((prev) => [data, ...prev])
        setEditOpen(false)
        toast.success(`${getDisplayName(data)} added.`)
      }
    }
    setIsSaving(false)
  }

  async function handleDelete() {
    if (!deleteTarget || !userId) return
    setIsSaving(true)
    await supabase.from("invoices").update({ client_id: null }).eq("user_id", userId).eq("client_id", deleteTarget.id)
    const { error } = await supabase.from("clients").delete().eq("id", deleteTarget.id).eq("user_id", userId)
    if (error) { toast.error(error.message) }
    else {
      setClients((prev) => prev.filter((c) => c.id !== deleteTarget.id))
      toast.success(`${getDisplayName(deleteTarget)} removed.`)
    }
    setDeleteTarget(null)
    setIsSaving(false)
  }

  async function handleSaveRecovery(payload: Omit<Database["public"]["Tables"]["recovery_items"]["Insert"], "user_id">) {
    if (!userId) { toast.error("You must be logged in."); return }
    const { data, error } = await supabase
      .from("recovery_items")
      .insert({ ...payload, user_id: userId })
      .select()
      .single()
    if (error) { toast.error(error.message); return }
    setRecoveryItems((prev) => [data, ...prev])
    toast.success(`Recovery added for ${data.client_name}.`)
  }

  // ─── Render ───────────────────────────────────────────────────

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone you might need to follow up with."
      >
        <Button
          variant="outline"
          size="sm"
          disabled={isLoading}
          onClick={() => void load()}
          className="gap-1.5"
        >
          <RotateCcw className={cn("size-3.5", isLoading && "animate-spin")} />
          Refresh
        </Button>
        <Button
          className="gap-1.5 bg-green-700 text-white hover:bg-green-800"
          onClick={openAddCustomer}
        >
          <Plus className="size-4" />
          Add customer
        </Button>
      </PageHeader>

      {/* Edit / Add customer dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) { setEditingClient(null); setForm(initialForm); setErrorMessage(null) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingClient ? "Edit customer" : "Add customer"}</DialogTitle>
            <DialogDescription>
              {editingClient ? "Update this customer's contact details." : "Add someone you work with or need to follow up with."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void handleSave(e)} className="grid gap-4 py-2">
            {errorMessage && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage}</p>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="cust-company">Company / Client name</Label>
              <Input
                id="cust-company"
                placeholder="ABC Roofing"
                value={form.company}
                onChange={(e) => updateForm("company", e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cust-name">Contact person</Label>
              <Input
                id="cust-name"
                placeholder="John Smith"
                value={form.name}
                onChange={(e) => updateForm("name", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="cust-email">Email</Label>
                <Input
                  id="cust-email"
                  type="email"
                  placeholder="john@example.com"
                  value={form.email}
                  onChange={(e) => updateForm("email", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cust-phone">Phone</Label>
                <Input
                  id="cust-phone"
                  type="tel"
                  placeholder="(555) 000-0000"
                  value={form.phone}
                  onChange={(e) => updateForm("phone", formatPhoneNumberInput(e.target.value))}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cust-reliability">Payment reliability</Label>
              <SelectField id="cust-reliability" value={form.paymentReliability} onChange={(v) => updateForm("paymentReliability", v as PaymentReliability)}>
                {reliabilityLabels.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </SelectField>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cust-last-contacted">Last contacted</Label>
              <Input
                id="cust-last-contacted"
                type="date"
                value={form.lastContactedDate}
                onChange={(e) => updateForm("lastContactedDate", e.target.value)}
              />
            </div>
            <DialogFooter className="gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isSaving}>Cancel</Button>
              </DialogClose>
              <Button type="submit" className="bg-green-700 text-white hover:bg-green-800" disabled={isSaving}>
                {isSaving ? "Saving…" : editingClient ? "Save changes" : "Add customer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove customer?</DialogTitle>
            <DialogDescription>
              This removes {deleteTarget ? getDisplayName(deleteTarget) : "this customer"} from your list. Any recovery jobs for them remain unchanged.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={isSaving}>Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={isSaving}
              onClick={() => void handleDelete()}
            >
              {isSaving ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add recovery for customer */}
      <AddRecoveryDialog
        open={addRecoveryOpen}
        onClose={() => { setAddRecoveryOpen(false); setRecoveryPrefilledClient(null) }}
        onSave={handleSaveRecovery}
        onSaveAndMarkSent={handleSaveRecovery}
        isSaving={isSaving}
        clients={clients}
        prefilledClientName={recoveryPrefilledClient ? getDisplayName(recoveryPrefilledClient) : undefined}
        prefilledEmail={recoveryPrefilledClient?.email ?? undefined}
        prefilledPhone={recoveryPrefilledClient?.phone ?? undefined}
      />

      <div className="space-y-5 p-4 sm:p-6 lg:p-8">
        <ContentReveal isLoading={isLoading} skeleton={<ClientListSkeleton rows={6} />}>
          <>
            {/* Search */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search customers…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 pl-8 text-sm"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {filteredClients.length} of {clients.length} customers
              </p>
            </div>

            {errorMessage && clients.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center">
                  <p className="font-semibold">Couldn't load customers</p>
                  <p className="mt-1 text-sm text-muted-foreground">{errorMessage}</p>
                  <Button className="mt-4" variant="outline" onClick={() => void load()}>
                    <RefreshCw className="size-4" /> Try again
                  </Button>
                </CardContent>
              </Card>
            ) : filteredClients.length === 0 ? (
              <EmptyCustomers onAdd={openAddCustomer} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredClients.map((client) => {
                  const recoveries = getCustomerRecoveries(client)
                  const active = recoveries.filter((r) => !["resolved", "lost"].includes(r.status ?? ""))
                  const atRisk = active.reduce((s, r) => s + r.amount, 0)

                  return (
                    <CustomerCard
                      key={client.id}
                      client={client}
                      activeRecoveries={active.length}
                      atRisk={atRisk}
                      isSaving={isSaving}
                      onAddRecovery={() => openAddRecovery(client)}
                      onEdit={() => openEditCustomer(client)}
                      onDelete={() => setDeleteTarget(client)}
                    />
                  )
                })}
              </div>
            )}
          </>
        </ContentReveal>
      </div>
    </>
  )
}

// ─── Customer card ─────────────────────────────────────────────

function CustomerCard({
  client,
  activeRecoveries,
  atRisk,
  isSaving,
  onAddRecovery,
  onEdit,
  onDelete,
}: {
  client: ClientRow
  activeRecoveries: number
  atRisk: number
  isSaving: boolean
  onAddRecovery: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const displayName = getDisplayName(client)
  const contactPerson = client.name && client.name !== displayName ? client.name : null

  return (
    <div className="group flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Building2 className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{displayName}</p>
            {contactPerson && (
              <div className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                <UserRound className="size-3" />
                <span className="truncate">{contactPerson}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge
            variant="outline"
            className={cn("shrink-0 text-xs", reliabilityBadgeClass(client.payment_reliability))}
          >
            {client.payment_reliability}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="size-7 p-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                disabled={isSaving}
                aria-label="More actions"
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 size-3.5" />
                Edit customer
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 size-3.5" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Recovery stats */}
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">At risk</p>
          <p className={cn("font-semibold tabular-nums", atRisk > 0 && "text-amber-600 dark:text-amber-400")}>
            {atRisk > 0 ? money.format(atRisk) : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Open recoveries</p>
          <p className="font-semibold tabular-nums">
            {activeRecoveries > 0 ? activeRecoveries : "—"}
          </p>
        </div>
      </div>

      {/* Contact info + last contacted */}
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        {client.email && <span className="truncate">{client.email}</span>}
        {client.phone && <span>{client.phone}</span>}
        <span>Last contacted: {formatDate(client.last_contacted_date)}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="flex-1 gap-1.5 bg-green-700 text-white hover:bg-green-800"
          disabled={isSaving}
          onClick={onAddRecovery}
        >
          <Plus className="size-3.5" />
          Add recovery
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isSaving}
          onClick={onEdit}
          className="gap-1.5"
        >
          <Pencil className="size-3.5" />
          Edit
        </Button>
      </div>
    </div>
  )
}

// ─── Empty state ───────────────────────────────────────────────

function EmptyCustomers({ onAdd }: { onAdd: () => void }) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <UserRound className="size-5" />
        </div>
        <p className="font-semibold">No customers yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Add the people you work with, then open recovery jobs from their cards.
        </p>
        <Button
          className="mt-4 gap-2 bg-green-700 text-white hover:bg-green-800"
          onClick={onAdd}
        >
          <Plus className="size-4" />
          Add customer
        </Button>
      </CardContent>
    </Card>
  )
}
