import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

export type WorkDay = Database["public"]["Tables"]["scheduled_work_days"]["Row"]

// When a work day has no explicit end time, assume this block length for the
// purposes of overlap detection and display.
export const DEFAULT_WORK_BLOCK_MS = 2 * 60 * 60 * 1000

const dayRangeFmt = new Intl.DateTimeFormat("en-CA", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

const timeFmt = new Intl.DateTimeFormat("en-CA", {
  hour: "numeric",
  minute: "2-digit",
})

/**
 * Human-readable range for a work day, e.g.
 *   "Monday, June 8, 2026, 8:00 a.m." or "… 8:00 a.m. – 4:00 p.m."
 */
export function formatWorkDayRange(day: Pick<WorkDay, "starts_at" | "ends_at">): string {
  const start = dayRangeFmt.format(new Date(day.starts_at))
  if (!day.ends_at) return start
  return `${start} – ${timeFmt.format(new Date(day.ends_at))}`
}

/** Effective end instant for overlap math (falls back to a default block). */
function effectiveEnd(startsAt: string, endsAt: string | null): number {
  if (endsAt) return new Date(endsAt).getTime()
  return new Date(startsAt).getTime() + DEFAULT_WORK_BLOCK_MS
}

/** Two half-open intervals overlap when each starts before the other ends. */
function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && bStart < aEnd
}

export interface ScheduleConflict {
  kind: "work" | "inspection"
  startsAt: string
  label: string
}

export interface FindConflictsArgs {
  supabase: SupabaseClient<Database>
  userId: string
  startsAt: string
  endsAt: string | null
  /** A work-day id to ignore (e.g. when editing an existing day). */
  excludeId?: string | null
}

/**
 * Find the contractor's other scheduled work days and inspections that overlap
 * a proposed time block. Used to *warn* — never to block — since a contractor
 * may run multiple crews.
 */
export async function findScheduleConflicts({
  supabase,
  userId,
  startsAt,
  endsAt,
  excludeId,
}: FindConflictsArgs): Promise<ScheduleConflict[]> {
  const proposedStart = new Date(startsAt).getTime()
  const proposedEnd = effectiveEnd(startsAt, endsAt)
  if (Number.isNaN(proposedStart)) return []

  // Narrow the DB scan to a ±36h window around the proposed day; overlap is then
  // confirmed precisely in JS.
  const windowStart = new Date(proposedStart - 36 * 60 * 60 * 1000).toISOString()
  const windowEnd = new Date(proposedEnd + 36 * 60 * 60 * 1000).toISOString()

  const [workResult, inspectionResult] = await Promise.all([
    supabase
      .from("scheduled_work_days")
      .select("id, starts_at, ends_at, estimate_id, estimates(client_name)")
      .eq("user_id", userId)
      .eq("status", "scheduled")
      .gte("starts_at", windowStart)
      .lte("starts_at", windowEnd),
    supabase
      .from("job_requests")
      .select("id, scheduled_visit_starts_at, scheduled_visit_ends_at, client_name")
      .eq("contractor_id", userId)
      .eq("scheduled_visit_type", "inspection")
      .in("status", ["inspection_scheduled", "inspection_confirmed"])
      .not("scheduled_visit_starts_at", "is", null)
      .gte("scheduled_visit_starts_at", windowStart)
      .lte("scheduled_visit_starts_at", windowEnd),
  ])

  const conflicts: ScheduleConflict[] = []

  for (const row of workResult.data ?? []) {
    if (excludeId && row.id === excludeId) continue
    const otherStart = new Date(row.starts_at).getTime()
    const otherEnd = effectiveEnd(row.starts_at, row.ends_at)
    if (!intervalsOverlap(proposedStart, proposedEnd, otherStart, otherEnd)) continue
    // Supabase types the embedded relation as an array.
    const rel = row.estimates as unknown as { client_name: string | null } | { client_name: string | null }[] | null
    const clientName = Array.isArray(rel) ? rel[0]?.client_name : rel?.client_name
    conflicts.push({
      kind: "work",
      startsAt: row.starts_at,
      label: `a work day${clientName ? ` with ${clientName}` : ""}`,
    })
  }

  for (const row of inspectionResult.data ?? []) {
    if (!row.scheduled_visit_starts_at) continue
    const otherStart = new Date(row.scheduled_visit_starts_at).getTime()
    const otherEnd = effectiveEnd(row.scheduled_visit_starts_at, row.scheduled_visit_ends_at)
    if (!intervalsOverlap(proposedStart, proposedEnd, otherStart, otherEnd)) continue
    conflicts.push({
      kind: "inspection",
      startsAt: row.scheduled_visit_starts_at,
      label: `an inspection${row.client_name ? ` with ${row.client_name}` : ""}`,
    })
  }

  return conflicts.sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  )
}
