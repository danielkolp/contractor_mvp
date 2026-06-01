"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Check, ClipboardCopy, Loader2, Sparkles, X } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  generateRecoveryItemMessage,
  reasonLabel,
} from "@/lib/recovery-engine"
import type { Database } from "@/lib/supabase/database.types"

type RecoveryItemInsert = Database["public"]["Tables"]["recovery_items"]["Insert"]
type RecoveryItemReason = Database["public"]["Tables"]["recovery_items"]["Row"]["reason"]
type ClientRow = Database["public"]["Tables"]["clients"]["Row"]

function getClientLabel(client: ClientRow): string {
  if (client.company) {
    return client.name && client.name !== client.company
      ? `${client.company} — ${client.name}`
      : client.company
  }
  return client.name || "Unnamed client"
}

const REASONS: { value: RecoveryItemReason; label: string; description: string }[] = [
  {
    value: "estimate_no_reply",
    label: "Estimate sent, no reply",
    description: "I sent a quote but haven't heard back.",
  },
  {
    value: "invoice_overdue",
    label: "Invoice overdue",
    description: "I sent an invoice and it's past due.",
  },
  {
    value: "maybe_later",
    label: 'Customer said "maybe later"',
    description: "They were interested but went quiet.",
  },
  {
    value: "work_not_paid",
    label: "Work done, not paid",
    description: "I completed the job but haven't been paid.",
  },
  {
    value: "other",
    label: "Something else",
    description: "I'll describe it in the notes.",
  },
]

type Step = 1 | 2 | 3 | 4

interface FormState {
  selectedClientId: string | null
  clientName: string
  clientEmail: string
  clientPhone: string
  reason: RecoveryItemReason
  amount: string
  contactedDate: string
  message: string
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

const emptyForm: FormState = {
  selectedClientId: null,
  clientName: "",
  clientEmail: "",
  clientPhone: "",
  reason: "estimate_no_reply",
  amount: "",
  contactedDate: today(),
  message: "",
}

export function AddRecoveryDialog({
  open,
  onClose,
  onSave,
  onSaveAndMarkSent,
  isSaving,
  clients = [],
  prefilledClientName,
  prefilledEmail,
  prefilledPhone,
}: {
  open: boolean
  onClose: () => void
  onSave: (item: Omit<RecoveryItemInsert, "user_id">) => Promise<void>
  onSaveAndMarkSent: (
    item: Omit<RecoveryItemInsert, "user_id">
  ) => Promise<void>
  isSaving: boolean
  clients?: ClientRow[]
  prefilledClientName?: string
  prefilledEmail?: string
  prefilledPhone?: string
}) {
  const [step, setStep] = useState<Step>(1)
  const [copied, setCopied] = useState(false)
  const [form, setForm] = useState<FormState>(() =>
    prefilledClientName
      ? { ...emptyForm, clientName: prefilledClientName, clientEmail: prefilledEmail ?? "", clientPhone: prefilledPhone ?? "" }
      : emptyForm
  )
  const [clientQuery, setClientQuery] = useState("")
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false)

  useEffect(() => {
    if (open) {
      setStep(1)
      setClientQuery("")
      setClientDropdownOpen(false)
      setForm(
        prefilledClientName
          ? { ...emptyForm, clientName: prefilledClientName, clientEmail: prefilledEmail ?? "", clientPhone: prefilledPhone ?? "", contactedDate: today() }
          : { ...emptyForm, contactedDate: today() }
      )
    }
  }, [open, prefilledClientName, prefilledEmail, prefilledPhone])

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase()
    if (!q) return clients
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q)
    )
  }, [clients, clientQuery])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function selectClient(client: ClientRow) {
    setForm((prev) => ({
      ...prev,
      selectedClientId: client.id,
      clientName: getClientLabel(client),
      clientEmail: client.email ?? "",
      clientPhone: client.phone ?? "",
    }))
    setClientQuery("")
    setClientDropdownOpen(false)
  }

  function clearSelectedClient() {
    setForm((prev) => ({
      ...prev,
      selectedClientId: null,
      clientName: "",
      clientEmail: "",
      clientPhone: "",
    }))
    setClientQuery("")
  }

  function handleClose() {
    onClose()
    setStep(1)
    setClientQuery("")
    setClientDropdownOpen(false)
    setForm({ ...emptyForm, contactedDate: today() })
  }

  function advance() {
    if (step === 3) {
      const generated = generateRecoveryItemMessage({
        clientName: form.clientName,
        reason: form.reason,
        amount: Number(form.amount) || 0,
      })
      update("message", generated)
    }
    setStep((s) => (s + 1) as Step)
  }

  function buildPayload(
    status: "message_ready" | "sent"
  ): Omit<RecoveryItemInsert, "user_id"> {
    return {
      client_name: form.clientName.trim(),
      client_email: form.clientEmail.trim() || null,
      client_phone: form.clientPhone.trim() || null,
      reason: form.reason,
      amount: Number(form.amount) || 0,
      contacted_date: form.contactedDate || null,
      status,
      message_body: form.message.trim() || null,
    }
  }

  async function handleCopyNow() {
    if (!form.message) return
    await navigator.clipboard.writeText(form.message)
    setCopied(true)
    toast.success("Message copied")
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSaveForLater() {
    await onSave(buildPayload("message_ready"))
    handleClose()
  }

  async function handleMarkAlreadySent() {
    await onSaveAndMarkSent(buildPayload("sent"))
    // parent will open check-back dialog; we just close the wizard
    handleClose()
  }

  const canStep1 = form.clientName.trim().length > 0
  const canStep3 = Number(form.amount) > 0

  const stepLabels = ["Who?", "What?", "Worth?", "Message"]

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as Step)}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Back"
              >
                <ArrowLeft className="size-4" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-1.5">
                {stepLabels.map((label, i) => (
                  <span key={label} className="flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={
                        i + 1 === step
                          ? "border-ef-200 bg-ef-mist text-ef-ocean dark:border-ef-navy/60 dark:bg-ef-ink/40 dark:text-ef-200"
                          : i + 1 < step
                          ? "border-ef-mist bg-ef-mist/50 text-ef-ocean dark:border-ef-navy/30 dark:text-ef-cyan"
                          : "border-border text-muted-foreground"
                      }
                    >
                      {i + 1 < step ? (
                        <Check className="mr-0.5 size-2.5" />
                      ) : null}
                      {label}
                    </Badge>
                    {i < stepLabels.length - 1 && (
                      <span className="text-xs text-muted-foreground">›</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Step 1: Who */}
        {step === 1 && (
          <div className="grid gap-4 py-2">
            <DialogDescription>
              Who is this follow-up for?
            </DialogDescription>
            <div className="grid gap-3">
              {clients.length > 0 && (
                <div className="grid gap-1.5">
                  <Label>Existing client</Label>
                  {form.selectedClientId ? (
                    <div className="flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm">
                      <span className="min-w-0 flex-1 truncate">{form.clientName}</span>
                      <button
                        type="button"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={clearSelectedClient}
                        aria-label="Clear client"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Input
                        placeholder="Search clients…"
                        value={clientQuery}
                        onChange={(e) => {
                          setClientQuery(e.target.value)
                          setClientDropdownOpen(true)
                        }}
                        onFocus={() => setClientDropdownOpen(true)}
                        onBlur={() =>
                          window.setTimeout(() => setClientDropdownOpen(false), 150)
                        }
                        autoFocus
                      />
                      {clientDropdownOpen && (
                        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-background shadow-md">
                          {filteredClients.length > 0 ? (
                            filteredClients.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                className="flex w-full px-3 py-2 text-left text-sm hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  selectClient(c)
                                }}
                              >
                                <span className="truncate">{getClientLabel(c)}</span>
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-2 text-sm text-muted-foreground">
                              {clientQuery ? `No clients match "${clientQuery}"` : "No clients yet"}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="ar-name">
                  {clients.length > 0 ? "Or enter name manually *" : "Customer / client name *"}
                </Label>
                <Input
                  id="ar-name"
                  placeholder="e.g. Mike Thompson"
                  value={form.clientName}
                  onChange={(e) => update("clientName", e.target.value)}
                  autoFocus={clients.length === 0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canStep1) advance()
                  }}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ar-email">Email (optional)</Label>
                <Input
                  id="ar-email"
                  type="email"
                  placeholder="client@example.com"
                  value={form.clientEmail}
                  onChange={(e) => update("clientEmail", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ar-phone">Phone (optional)</Label>
                <Input
                  id="ar-phone"
                  type="tel"
                  placeholder="555-0100"
                  value={form.clientPhone}
                  onChange={(e) => update("clientPhone", e.target.value)}
                />
              </div>
            </div>
            <Button
              className="mt-1 bg-ef-ocean text-white hover:bg-ef-ocean"
              disabled={!canStep1}
              onClick={advance}
            >
              Next →
            </Button>
          </div>
        )}

        {/* Step 2: What happened */}
        {step === 2 && (
          <div className="grid gap-4 py-2">
            <DialogDescription>
              What&apos;s the situation with {form.clientName}?
            </DialogDescription>
            <div className="grid gap-2">
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => {
                    update("reason", r.value)
                  }}
                  className={`flex flex-col gap-0.5 rounded-lg border px-4 py-3 text-left transition-colors ${
                    form.reason === r.value
                      ? "border-ef-300 bg-ef-mist dark:border-ef-ocean dark:bg-ef-ink/40"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <span className="text-sm font-medium">{r.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.description}
                  </span>
                </button>
              ))}
            </div>
            <Button
              className="mt-1 bg-ef-ocean text-white hover:bg-ef-ocean"
              onClick={advance}
            >
              Next →
            </Button>
          </div>
        )}

        {/* Step 3: Worth */}
        {step === 3 && (
          <div className="grid gap-4 py-2">
            <DialogDescription>
              How much is this job worth?
            </DialogDescription>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ar-amount">Amount ($) *</Label>
                <Input
                  id="ar-amount"
                  type="number"
                  min="0"
                  step="50"
                  placeholder="0"
                  value={form.amount}
                  onChange={(e) => update("amount", e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canStep3) advance()
                  }}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ar-date">Date sent or last contacted</Label>
                <Input
                  id="ar-date"
                  type="date"
                  value={form.contactedDate}
                  max={today()}
                  onChange={(e) => update("contactedDate", e.target.value)}
                />
              </div>
            </div>
            <Button
              className="mt-1 bg-ef-ocean text-white hover:bg-ef-ocean"
              disabled={!canStep3}
              onClick={advance}
            >
              <Sparkles className="size-4" />
              Generate message
            </Button>
          </div>
        )}

        {/* Step 4: Generated message */}
        {step === 4 && (
          <div className="grid gap-4 py-2">
            <DialogDescription>
              Here&apos;s your follow-up message for{" "}
              <strong>{form.clientName}</strong> ·{" "}
              {reasonLabel(form.reason)}. Edit it if you want.
            </DialogDescription>
            <Textarea
              value={form.message}
              onChange={(e) => update("message", e.target.value)}
              className="min-h-32 text-sm leading-6"
              placeholder="Your message will appear here…"
            />
            <div className="grid gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => void handleCopyNow()}
                disabled={!form.message}
              >
                {copied ? (
                  <Check className="size-4 text-ef-ocean" />
                ) : (
                  <ClipboardCopy className="size-4" />
                )}
                {copied ? "Copied!" : "Copy now"}
              </Button>
              <Button
                className="gap-2 bg-ef-ocean text-white hover:bg-ef-ocean"
                onClick={() => void handleSaveForLater()}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Save for later
              </Button>
              <Button
                variant="ghost"
                className="gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => void handleMarkAlreadySent()}
                disabled={isSaving}
              >
                Mark already followed up
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
