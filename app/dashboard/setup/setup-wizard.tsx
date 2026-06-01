"use client"

import { useCallback, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Check,
  ClipboardCopy,
  Database,
  Loader2,
  Sparkles,
  UserPlus,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { seedDemoRecoveryItems } from "@/lib/demo-data"
import {
  generateRecoveryItemMessage,
  reasonLabel,
} from "@/lib/recovery-engine"
import { createClient } from "@/lib/supabase/client"
import type { Database as DB } from "@/lib/supabase/database.types"

type RecoveryItemInsert = DB["public"]["Tables"]["recovery_items"]["Insert"]
type RecoveryItemReason = DB["public"]["Tables"]["recovery_items"]["Row"]["reason"]

type Screen =
  | "welcome"
  | "step1"
  | "step2"
  | "step3"
  | "step4"

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

interface FormState {
  clientName: string
  clientEmail: string
  clientPhone: string
  reason: RecoveryItemReason
  amount: string
  contactedDate: string
  message: string
}

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

export function SetupWizard() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [screen, setScreen] = useState<Screen>("welcome")
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [form, setForm] = useState<FormState>({
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    reason: "estimate_no_reply",
    amount: "",
    contactedDate: todayDate(),
    message: "",
  })

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleUseDemoData = useCallback(async () => {
    setIsLoading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        toast.error("You must be logged in.")
        return
      }

      const { error } = await seedDemoRecoveryItems(supabase, user.id)

      if (error) {
        toast.error(error)
        return
      }

      toast.success("Demo data loaded — here's what your queue looks like.")
      router.push("/dashboard")
      router.refresh()
    } finally {
      setIsLoading(false)
    }
  }, [router, supabase])

  function advanceTo(next: Screen) {
    if (next === "step4") {
      const generated = generateRecoveryItemMessage({
        clientName: form.clientName,
        reason: form.reason,
        amount: Number(form.amount) || 0,
      })
      update("message", generated)
    }
    setScreen(next)
  }

  async function handleCopyNow() {
    if (!form.message) return
    await navigator.clipboard.writeText(form.message)
    setCopied(true)
    toast.success("Message copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
  }

  async function saveAndRedirect(status: "message_ready" | "sent") {
    setIsLoading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        toast.error("You must be logged in.")
        return
      }

      const payload: RecoveryItemInsert = {
        user_id: user.id,
        client_name: form.clientName.trim(),
        client_email: form.clientEmail.trim() || null,
        client_phone: form.clientPhone.trim() || null,
        reason: form.reason,
        amount: Number(form.amount) || 0,
        contacted_date: form.contactedDate || null,
        status,
        message_body: form.message.trim() || null,
        // Surface "already sent" items on Today immediately so they aren't invisible.
        check_back_date: status === "sent" ? todayDate() : null,
      }

      const { error } = await supabase.from("recovery_items").insert(payload)

      if (error) {
        toast.error(error.message)
        return
      }

      toast.success(
        status === "sent"
          ? "Recovery item saved. Schedule a check-in on the Today screen."
          : "Recovery item saved. It's ready in your Today screen."
      )
      router.push("/dashboard")
      router.refresh()
    } finally {
      setIsLoading(false)
    }
  }

  const canStep1 = form.clientName.trim().length > 0
  const canStep3 = Number(form.amount) > 0

  const SCREENS: Partial<Record<Screen, string>> = {
    step1: "Who?",
    step2: "What happened?",
    step3: "How much?",
    step4: "Your message",
  }
  const stepOrder: Screen[] = ["step1", "step2", "step3", "step4"]
  const currentIndex = stepOrder.indexOf(screen)

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-start justify-center px-4 py-12 sm:py-20">
      <div className="w-full max-w-md">
        {/* Welcome screen */}
        {screen === "welcome" && (
          <div className="flex flex-col gap-6 text-center">
            <div>
              <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-ef-mist text-ef-ocean dark:bg-ef-ink/40 dark:text-ef-300">
                <span className="text-3xl">🐊</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight">
                Let&apos;s set up your first recovery job.
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                You&apos;re here because money is slipping through the cracks.
                Let&apos;s fix that — it takes under two minutes.
              </p>
            </div>

            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => setScreen("step1")}
                className="group flex items-center gap-4 rounded-xl border-2 border-ef-200 bg-ef-mist/60 px-5 py-4 text-left transition-colors hover:border-ef-300 hover:bg-ef-mist dark:border-ef-navy/60 dark:bg-ef-ink/20 dark:hover:border-ef-ocean"
              >
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-ef-ocean text-white">
                  <UserPlus className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">
                    Add a real customer
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    I have a client who owes me money or hasn&apos;t replied.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => void handleUseDemoData()}
                disabled={isLoading}
                className="group flex items-center gap-4 rounded-xl border border-border px-5 py-4 text-left transition-colors hover:bg-muted/60"
              >
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                  {isLoading ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <Database className="size-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">
                    {isLoading ? "Loading demo data…" : "Use demo data"}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    See how it works with three example clients.
                  </p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Multi-step wizard */}
        {screen !== "welcome" && (
          <div className="flex flex-col gap-6">
            {/* Progress */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const prev =
                    currentIndex > 0
                      ? stepOrder[currentIndex - 1]
                      : "welcome"
                  setScreen(prev)
                }}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Back"
              >
                <ArrowLeft className="size-4" />
              </button>
              <div className="flex items-center gap-1.5">
                {stepOrder.map((s, i) => (
                  <span key={s} className="flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={
                        i === currentIndex
                          ? "border-ef-200 bg-ef-mist text-ef-ocean dark:border-ef-navy/60 dark:bg-ef-ink/40 dark:text-ef-200"
                          : i < currentIndex
                          ? "border-ef-mist text-ef-ocean dark:border-ef-navy/30 dark:text-ef-cyan"
                          : "border-border text-muted-foreground"
                      }
                    >
                      {i < currentIndex ? (
                        <Check className="mr-0.5 size-2.5" />
                      ) : null}
                      {SCREENS[s]}
                    </Badge>
                    {i < stepOrder.length - 1 && (
                      <span className="text-xs text-muted-foreground">›</span>
                    )}
                  </span>
                ))}
              </div>
            </div>

            <Card>
              <CardContent className="p-6">
                {/* Step 1: Who */}
                {screen === "step1" && (
                  <div className="grid gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">Who is it?</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Enter the client&apos;s name and how to reach them.
                      </p>
                    </div>
                    <div className="grid gap-3">
                      <div className="grid gap-1.5">
                        <Label htmlFor="s-name">Customer / client name *</Label>
                        <Input
                          id="s-name"
                          placeholder="e.g. Mike Thompson"
                          value={form.clientName}
                          onChange={(e) => update("clientName", e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && canStep1)
                              advanceTo("step2")
                          }}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="s-email">Email (optional)</Label>
                        <Input
                          id="s-email"
                          type="email"
                          placeholder="client@example.com"
                          value={form.clientEmail}
                          onChange={(e) => update("clientEmail", e.target.value)}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="s-phone">Phone (optional)</Label>
                        <Input
                          id="s-phone"
                          type="tel"
                          placeholder="555-0100"
                          value={form.clientPhone}
                          onChange={(e) => update("clientPhone", e.target.value)}
                        />
                      </div>
                    </div>
                    <Button
                      className="bg-ef-ocean text-white hover:bg-ef-ocean"
                      disabled={!canStep1}
                      onClick={() => advanceTo("step2")}
                    >
                      Next →
                    </Button>
                  </div>
                )}

                {/* Step 2: What happened */}
                {screen === "step2" && (
                  <div className="grid gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">
                        What happened?
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Pick what best describes the situation with{" "}
                        {form.clientName}.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      {REASONS.map((r) => (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() => update("reason", r.value)}
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
                      className="bg-ef-ocean text-white hover:bg-ef-ocean"
                      onClick={() => advanceTo("step3")}
                    >
                      Next →
                    </Button>
                  </div>
                )}

                {/* Step 3: Worth */}
                {screen === "step3" && (
                  <div className="grid gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">
                        What is it worth?
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Enter the estimate, invoice, or job amount.
                      </p>
                    </div>
                    <div className="grid gap-3">
                      <div className="grid gap-1.5">
                        <Label htmlFor="s-amount">Amount ($) *</Label>
                        <Input
                          id="s-amount"
                          type="number"
                          min="0"
                          step="50"
                          placeholder="0"
                          value={form.amount}
                          onChange={(e) => update("amount", e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && canStep3)
                              advanceTo("step4")
                          }}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="s-date">
                          Date sent or last contacted
                        </Label>
                        <Input
                          id="s-date"
                          type="date"
                          value={form.contactedDate}
                          max={todayDate()}
                          onChange={(e) =>
                            update("contactedDate", e.target.value)
                          }
                        />
                      </div>
                    </div>
                    <Button
                      className="gap-2 bg-ef-ocean text-white hover:bg-ef-ocean"
                      disabled={!canStep3}
                      onClick={() => advanceTo("step4")}
                    >
                      <Sparkles className="size-4" />
                      Generate follow-up
                    </Button>
                  </div>
                )}

                {/* Step 4: Generated message */}
                {screen === "step4" && (
                  <div className="grid gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">
                        Here&apos;s your follow-up message
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Personalized for {form.clientName} ·{" "}
                        {reasonLabel(form.reason)}. Edit freely.
                      </p>
                    </div>

                    <Textarea
                      value={form.message}
                      onChange={(e) => update("message", e.target.value)}
                      className="min-h-36 text-sm leading-6"
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
                        onClick={() => void saveAndRedirect("message_ready")}
                        disabled={isLoading}
                      >
                        {isLoading && (
                          <Loader2 className="size-4 animate-spin" />
                        )}
                        Save for later
                      </Button>
                      <Button
                        variant="ghost"
                        className="gap-2 text-muted-foreground hover:text-foreground"
                        onClick={() => void saveAndRedirect("sent")}
                        disabled={isLoading}
                      >
                        Mark already followed up
                      </Button>
                    </div>

                    <p className="text-center text-xs text-muted-foreground">
                      Your message is never sent automatically. You stay in
                      control.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
