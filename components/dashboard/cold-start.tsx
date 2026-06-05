"use client"

import { useMemo, useState } from "react"
import { ArrowRight, Loader2, Plus, Sparkles, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { money } from "@/lib/format-money"
import { generateRecoveryItemMessage } from "@/lib/recovery-engine"
import { INPUT_LIMITS, inputErrorMessage, numberField, textField } from "@/lib/security/input"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"

type RecoveryReason = Database["public"]["Tables"]["recovery_items"]["Row"]["reason"]
type RecoveryItemInsert = Database["public"]["Tables"]["recovery_items"]["Insert"]

// The four real reasons a contractor's money goes quiet, in the order they hurt.
const REASONS: { value: RecoveryReason; label: string }[] = [
  { value: "invoice_overdue", label: "Invoice unpaid" },
  { value: "estimate_no_reply", label: "Quote went quiet" },
  { value: "work_not_paid", label: "Work done, not paid" },
  { value: "maybe_later", label: "Said 'maybe later'" },
]

const MAX_ROWS = 8

type Row = {
  key: number
  clientName: string
  reason: RecoveryReason
  amount: string
}

function blankRow(key: number): Row {
  return { key, clientName: "", reason: "invoice_overdue", amount: "" }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function ColdStart({
  userId,
  onSeeded,
  onDemo,
  onSkip,
  isDemoSeeding = false,
}: {
  userId: string
  onSeeded: () => void
  onDemo: () => void
  onSkip: () => void
  isDemoSeeding?: boolean
}) {
  const [rows, setRows] = useState<Row[]>(() => [blankRow(0), blankRow(1), blankRow(2)])
  const [nextKey, setNextKey] = useState(3)
  const [isSaving, setIsSaving] = useState(false)

  const atRisk = useMemo(
    () => rows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0),
    [rows]
  )

  const validRows = useMemo(
    () => rows.filter((r) => r.clientName.trim().length > 0 && (parseFloat(r.amount) || 0) > 0),
    [rows]
  )

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function addRow() {
    if (rows.length >= MAX_ROWS) return
    setRows((prev) => [...prev, blankRow(nextKey)])
    setNextKey((k) => k + 1)
  }

  function removeRow(key: number) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)))
  }

  async function startChasing() {
    if (validRows.length === 0 || !userId) return
    setIsSaving(true)

    let payloads: RecoveryItemInsert[]
    try {
      payloads = validRows.map((r) => {
        const clientName = textField(r.clientName, "Who owes you", {
          required: true,
          maxLength: INPUT_LIMITS.name,
        })
        const amount = numberField(parseFloat(r.amount) || 0, "Amount", {
          min: 0.01,
          max: 10_000_000,
        })
        return {
          user_id: userId,
          client_name: clientName,
          reason: r.reason,
          amount,
          contacted_date: todayIso(),
          status: "needs_follow_up",
          follow_up_count: 0,
          message_body: generateRecoveryItemMessage({
            clientName,
            reason: r.reason,
            amount,
            followUpCount: 0,
          }),
        }
      })
    } catch (error) {
      toast.error(inputErrorMessage(error))
      setIsSaving(false)
      return
    }

    const supabase = createClient()
    const { error } = await supabase.from("recovery_items").insert(payloads)
    if (error) {
      toast.error(error.message)
      setIsSaving(false)
      return
    }

    toast.success(
      `${payloads.length} ${payloads.length === 1 ? "job" : "jobs"} added. Let's get you paid.`
    )
    onSeeded()
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="grid gap-6 p-6 sm:p-8">
        {/* Header */}
        <div className="grid gap-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
              What are you owed right now?
            </h2>
            <div
              className="flex shrink-0 items-baseline gap-1.5 rounded-full bg-ef-mist px-4 py-1.5"
              aria-live="polite"
            >
              <span className="text-lg font-bold tabular-nums text-ef-ocean">
                {money.format(atRisk)}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-ef-ocean/70">
                at risk
              </span>
            </div>
          </div>
          <p className="max-w-prose text-sm text-muted-foreground">
            Add the quotes that went quiet and the invoices nobody paid. We&apos;ll total it up
            and start chasing. You approve every message.
          </p>
        </div>

        {/* Rows */}
        <div className="grid gap-3">
          {rows.map((row, idx) => (
            <div
              key={row.key}
              className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-[1.4fr_1.2fr_0.9fr_auto] sm:items-end"
            >
              <div className="grid gap-1.5">
                {idx === 0 && <Label className="text-xs">Who owes you?</Label>}
                <Input
                  value={row.clientName}
                  onChange={(e) => updateRow(row.key, { clientName: e.target.value })}
                  placeholder="Client or company"
                  maxLength={INPUT_LIMITS.name}
                  disabled={isSaving}
                />
              </div>
              <div className="grid gap-1.5">
                {idx === 0 && <Label className="text-xs">What happened?</Label>}
                <Select
                  value={row.reason}
                  onValueChange={(v) => updateRow(row.key, { reason: v as RecoveryReason })}
                  disabled={isSaving}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                {idx === 0 && <Label className="text-xs">How much?</Label>}
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    value={row.amount}
                    onChange={(e) => updateRow(row.key, { amount: e.target.value })}
                    placeholder="0"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    className="pl-7"
                    disabled={isSaving}
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="hidden text-muted-foreground hover:text-destructive sm:inline-flex"
                onClick={() => removeRow(row.key)}
                disabled={isSaving || rows.length <= 1}
                aria-label="Remove row"
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}

          {rows.length < MAX_ROWS && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={addRow}
              disabled={isSaving}
            >
              <Plus className="size-4" />
              Add another
            </Button>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            onClick={() => void startChasing()}
            disabled={validRows.length === 0 || isSaving}
            className="w-full sm:w-auto"
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
            Start chasing
            {!isSaving && <ArrowRight className="size-4" />}
          </Button>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onSkip}
              disabled={isSaving}
            >
              Skip for now
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDemo}
              disabled={isSaving || isDemoSeeding}
            >
              {isDemoSeeding ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              Use demo data instead
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
