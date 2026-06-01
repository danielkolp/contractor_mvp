"use client"

import { useEffect, useState } from "react"
import { Check, ClipboardCopy, Loader2, Mail } from "lucide-react"
import { toast } from "sonner"

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
import type { Database } from "@/lib/supabase/database.types"
import { cn } from "@/lib/utils"

type RecoveryItem = Database["public"]["Tables"]["recovery_items"]["Row"]
type RecoveryItemReason = RecoveryItem["reason"]

function defaultSubject(reason: RecoveryItemReason): string {
  switch (reason) {
    case "estimate_no_reply":
      return "Following up on your estimate"
    case "invoice_overdue":
      return "Following up on payment"
    case "work_not_paid":
      return "Following up on payment"
    case "maybe_later":
      return "Checking in"
    default:
      return "Quick follow-up"
  }
}

function addDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function formatCheckBackLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

type CheckBackOption = "tomorrow" | "3days" | "1week" | "custom"

const CHECK_BACK_OPTIONS: {
  value: CheckBackOption
  label: string
  days: number
}[] = [
  { value: "tomorrow", label: "Tomorrow", days: 1 },
  { value: "3days",    label: "In 3 days", days: 3 },
  { value: "1week",    label: "In 1 week", days: 7 },
  { value: "custom",   label: "Custom",    days: 0 },
]

export function SendFollowUpDialog({
  open,
  item,
  onClose,
  onSent,
}: {
  open: boolean
  item: RecoveryItem | null
  onClose: () => void
  onSent: (updatedItem: RecoveryItem) => void
}) {
  const [subject,         setSubject]         = useState("")
  const [messageBody,     setMessageBody]     = useState("")
  const [checkBackOption, setCheckBackOption] = useState<CheckBackOption>("3days")
  const [customDate,      setCustomDate]      = useState(addDays(3))
  const [isSending,       setIsSending]       = useState(false)
  const [copied,          setCopied]          = useState(false)

  // Reset form whenever the dialog opens with a new item
  useEffect(() => {
    if (open && item) {
      setSubject(defaultSubject(item.reason as RecoveryItemReason))
      setMessageBody(item.message_body ?? "")
      setCheckBackOption("3days")
      setCustomDate(addDays(3))
      setCopied(false)
      setIsSending(false)
    }
  }, [open, item])

  function resolvedCheckBackDate(): string {
    if (checkBackOption === "custom") return customDate
    return addDays(
      CHECK_BACK_OPTIONS.find((o) => o.value === checkBackOption)!.days
    )
  }

  async function handleSend() {
    if (!item?.client_email) return
    setIsSending(true)
    try {
      const res = await fetch("/api/recovery/send-email", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recovery_item_id: item.id,
          subject:          subject.trim(),
          body:             messageBody.trim(),
          check_back_date:  resolvedCheckBackDate(),
        }),
      })

      const data = (await res.json()) as {
        error?:              string
        warning?:            string
        item?:               RecoveryItem
        provider_message_id?: string | null
      }

      if (!res.ok) {
        toast.error(data.error ?? "Failed to send email")
        return
      }

      if (data.warning) {
        toast.warning(data.warning)
      } else {
        toast.success(`Follow-up sent to ${item.client_email}`)
      }

      if (data.item) {
        onSent(data.item)
      }
      onClose()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to send email"
      )
    } finally {
      setIsSending(false)
    }
  }

  async function handleCopy() {
    if (!messageBody) return
    await navigator.clipboard.writeText(messageBody)
    setCopied(true)
    toast.success("Message copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
  }

  const hasEmail = Boolean(item?.client_email)
  const canSend  =
    hasEmail &&
    subject.trim().length > 0 &&
    messageBody.trim().length > 0 &&
    (checkBackOption !== "custom" || Boolean(customDate))

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send follow-up</DialogTitle>
          <DialogDescription>
            Review the message before sending to{" "}
            <strong>{item?.client_name ?? "this client"}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          {/* Email display or warning */}
          {hasEmail ? (
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">To</Label>
              <div className="flex items-center gap-2 rounded-lg border border-input bg-muted/30 px-3 py-2">
                <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {item?.client_email}
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              No email address on file for this client. Add one to the
              recovery item to enable direct sending. You can still copy the
              message below.
            </div>
          )}

          {/* Subject */}
          <div className="grid gap-1.5">
            <Label htmlFor="sf-subject">Subject</Label>
            <Input
              id="sf-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line…"
            />
          </div>

          {/* Body */}
          <div className="grid gap-1.5">
            <Label htmlFor="sf-body">Message</Label>
            <Textarea
              id="sf-body"
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              className="min-h-28 text-sm leading-6"
              placeholder="Your message…"
            />
          </div>

          {/* Check-back date (only shown when sending is possible) */}
          {hasEmail && (
            <div className="grid gap-2">
              <Label className="text-xs">Check back in</Label>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {CHECK_BACK_OPTIONS.map((opt) => {
                  const active    = checkBackOption === opt.value
                  const sublabel  = opt.days > 0
                    ? formatCheckBackLabel(addDays(opt.days))
                    : null
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setCheckBackOption(opt.value)}
                      className={cn(
                        "flex flex-col items-center rounded-lg border px-2 py-2 text-xs transition-colors",
                        active
                          ? "border-ef-300 bg-ef-mist font-medium text-ef-navy dark:border-ef-ocean dark:bg-ef-ink/40 dark:text-ef-mist"
                          : "border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <span>{opt.label}</span>
                      {sublabel && (
                        <span className="mt-0.5 text-[10px] text-muted-foreground">
                          {sublabel}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              {checkBackOption === "custom" && (
                <Input
                  type="date"
                  value={customDate}
                  min={addDays(1)}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="h-9"
                />
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-2 pt-1">
            {hasEmail && (
              <Button
                className="gap-2 bg-ef-ocean text-white hover:bg-ef-ocean"
                disabled={!canSend || isSending}
                onClick={() => void handleSend()}
              >
                {isSending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Mail className="size-4" />
                    Send follow-up email
                  </>
                )}
              </Button>
            )}

            <Button
              variant="outline"
              className="gap-2"
              disabled={!messageBody}
              onClick={() => void handleCopy()}
            >
              {copied ? (
                <>
                  <Check className="size-4 text-ef-ocean" />
                  Copied
                </>
              ) : (
                <>
                  <ClipboardCopy className="size-4" />
                  Copy message
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
