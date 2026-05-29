"use client"

import { useState } from "react"
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

type Option = "tomorrow" | "3days" | "1week" | "custom"

function addDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  })
}

const OPTIONS: { value: Option; label: string; days: number }[] = [
  { value: "tomorrow", label: "Tomorrow", days: 1 },
  { value: "3days", label: "In 3 days", days: 3 },
  { value: "1week", label: "In 1 week", days: 7 },
  { value: "custom", label: "Custom date", days: 0 },
]

export function CheckBackDialog({
  open,
  clientName,
  onConfirm,
  onCancel,
  isLoading,
}: {
  open: boolean
  clientName: string
  onConfirm: (date: string) => Promise<void>
  onCancel: () => void
  isLoading: boolean
}) {
  const [selected, setSelected] = useState<Option>("3days")
  const [customDate, setCustomDate] = useState(addDays(3))

  const resolvedDate =
    selected === "custom"
      ? customDate
      : addDays(OPTIONS.find((o) => o.value === selected)!.days)

  function handleConfirm() {
    if (!resolvedDate) return
    void onConfirm(resolvedDate)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>When should we check back?</DialogTitle>
          <DialogDescription>
            We'll resurface {clientName} on this date so you don't forget to
            follow up.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-1">
          {OPTIONS.map((opt) => {
            const active = selected === opt.value
            const sublabel =
              opt.days > 0 ? formatDate(addDays(opt.days)) : null
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelected(opt.value)}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                  active
                    ? "border-green-300 bg-green-50 font-medium text-green-900 dark:border-green-700 dark:bg-green-950/40 dark:text-green-100"
                    : "border-border hover:bg-muted"
                }`}
              >
                <span>{opt.label}</span>
                {sublabel ? (
                  <span className="text-xs text-muted-foreground">
                    {sublabel}
                  </span>
                ) : null}
              </button>
            )
          })}

          {selected === "custom" && (
            <div className="grid gap-1.5 pt-1">
              <Label htmlFor="check-back-date" className="text-xs">
                Pick a date
              </Label>
              <Input
                id="check-back-date"
                type="date"
                value={customDate}
                min={addDays(1)}
                onChange={(e) => setCustomDate(e.target.value)}
                className="h-9"
              />
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            className="flex-1 bg-green-700 text-white hover:bg-green-800"
            disabled={isLoading || (selected === "custom" && !customDate)}
            onClick={handleConfirm}
          >
            {isLoading ? "Scheduling…" : "Schedule check-in"}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
