"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Mail, MessageSquare, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"

type RecoveryItem       = Database["public"]["Tables"]["recovery_items"]["Row"]
type RecoveryEmailEvent = Database["public"]["Tables"]["recovery_email_events"]["Row"]
type RecoveryEmailReply = Database["public"]["Tables"]["recovery_email_replies"]["Row"]

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

// Strip HTML tags for a plain-text excerpt
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim()
}

function SentMessage({ event }: { event: RecoveryEmailEvent }) {
  return (
    <div className="flex gap-3">
      <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
        <Mail className="size-3.5 text-green-700 dark:text-green-400" />
      </div>
      <div className="flex-1 rounded-xl border border-border bg-muted/30 p-3">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-foreground">You sent</span>
          <span className="text-xs text-muted-foreground">
            {formatDateTime(event.sent_at)}
          </span>
        </div>
        {event.subject && (
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {event.subject}
          </p>
        )}
        <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
          {event.body}
        </p>
      </div>
    </div>
  )
}

function InboundReply({ reply }: { reply: RecoveryEmailReply }) {
  const displayName = reply.from_name ?? reply.from_email
  const bodyText    = reply.text_body ?? (reply.html_body ? stripHtml(reply.html_body) : "")

  return (
    <div className="flex flex-row-reverse gap-3">
      <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
        <MessageSquare className="size-3.5 text-blue-700 dark:text-blue-400" />
      </div>
      <div className="flex-1 rounded-xl border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900/50 dark:bg-blue-950/20">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-foreground">{displayName}</span>
          <span className="text-xs text-muted-foreground">
            {formatDateTime(reply.received_at)}
          </span>
        </div>
        {reply.subject && (
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {reply.subject}
          </p>
        )}
        {bodyText ? (
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
            {bodyText}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            (No message body)
          </p>
        )}
      </div>
    </div>
  )
}

export function RecoveryRepliesDialog({
  open,
  item,
  onClose,
}: {
  open: boolean
  item: RecoveryItem | null
  onClose: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [events, setEvents] = useState<RecoveryEmailEvent[]>([])
  const [replies, setReplies] = useState<RecoveryEmailReply[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const load = useCallback(async () => {
    if (!item) return
    setIsLoading(true)

    const [eventsResult, repliesResult] = await Promise.all([
      supabase
        .from("recovery_email_events")
        .select("*")
        .eq("recovery_item_id", item.id)
        .eq("status", "sent")
        .order("sent_at", { ascending: true }),
      supabase
        .from("recovery_email_replies")
        .select("*")
        .eq("recovery_item_id", item.id)
        .order("received_at", { ascending: true }),
    ])

    setEvents(eventsResult.data ?? [])
    setReplies(repliesResult.data ?? [])
    setIsLoading(false)
  }, [item, supabase])

  useEffect(() => {
    if (open && item) {
      void load()
    } else {
      setEvents([])
      setReplies([])
    }
  }, [open, item, load])

  // Merge sent messages and replies into a single chronological timeline
  type TimelineEntry =
    | { kind: "sent"; ts: string; event: RecoveryEmailEvent }
    | { kind: "reply"; ts: string; reply: RecoveryEmailReply }

  const timeline: TimelineEntry[] = useMemo(() => {
    const entries: TimelineEntry[] = [
      ...events.map((e) => ({ kind: "sent" as const, ts: e.sent_at, event: e })),
      ...replies.map((r) => ({ kind: "reply" as const, ts: r.received_at, reply: r })),
    ]
    return entries.sort((a, b) => a.ts.localeCompare(b.ts))
  }, [events, replies])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-xl">
        <DialogHeader className="flex-none">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="size-4 text-muted-foreground" />
              {item?.client_name ?? "Conversation"}
            </DialogTitle>
            {replies.length > 0 && (
              <Badge className="mr-6 border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200" variant="outline">
                {replies.length} {replies.length === 1 ? "reply" : "replies"}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col gap-4 py-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="size-7 animate-pulse rounded-full bg-muted" />
                  <div className="h-20 flex-1 animate-pulse rounded-xl bg-muted/50" />
                </div>
              ))}
            </div>
          ) : timeline.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-muted">
                <Mail className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No messages yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Sent follow-ups and client replies will appear here.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 py-4">
              {timeline.map((entry) =>
                entry.kind === "sent" ? (
                  <SentMessage key={`sent-${entry.event.id}`} event={entry.event} />
                ) : (
                  <InboundReply key={`reply-${entry.reply.id}`} reply={entry.reply} />
                )
              )}
            </div>
          )}
        </div>

        <div className="flex-none border-t border-border pt-3">
          <Button variant="outline" size="sm" onClick={onClose} className="gap-1.5">
            <X className="size-3.5" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
