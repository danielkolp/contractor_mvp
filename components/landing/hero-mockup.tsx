"use client"

import { useRef, useState, useEffect } from "react"
import {
  CircleDollarSign,
  Clock3,
  MessageSquareText,
  Sparkles,
  TrendingUp,
} from "lucide-react"
import {
  m,
  useSpring,
  useMotionValue,
  AnimatePresence,
  LayoutGroup,
} from "motion/react"

import { EASE, VIEWPORT, usePRM, AnimatedProgressBar, AnimatedNumber } from "./motion-primitives"

// ─── Data ─────────────────────────────────────────────────────────────────────

const QUEUE_ROWS = [
  { id: "r1", client: "North Ridge Homes", type: "Invoice INV-1048", amount: "$4,850", status: "7 days overdue", progress: 82, statusColor: "text-red-600 bg-red-50" },
  { id: "r2", client: "Harbor View HOA",   type: "Estimate EST-2211", amount: "$8,300",  status: "follow-up ready", progress: 64, statusColor: "text-green-700 bg-green-50" },
  { id: "r3", client: "Mason & Co.",        type: "Repeat work",       amount: "$12,600", status: "draft ready",    progress: 91, statusColor: "text-green-700 bg-green-50" },
]

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  value,
  prefix = "",
  suffix = "",
  label,
  note,
  delay,
  decimals = 0,
}: {
  icon: React.ComponentType<{ className?: string }>
  value: number
  prefix?: string
  suffix?: string
  label: string
  note: string
  delay: number
  decimals?: number
}) {
  const reduced = usePRM()
  return (
    <m.div
      className="rounded-2xl border border-green-100 bg-white p-4 shadow-sm shadow-green-950/8"
      initial={reduced ? false : { opacity: 0, y: 18, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      <div className="flex items-center justify-between">
        <div className="grid size-9 place-items-center rounded-xl bg-green-50 text-green-700">
          <Icon className="size-4" />
        </div>
        <m.span
          className="rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-black text-green-700"
          initial={reduced ? false : { opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: EASE, delay: delay + 0.15 }}
        >
          {note}
        </m.span>
      </div>
      <div className="mt-3 text-2xl font-black tracking-tight text-zinc-950">
        <AnimatedNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
      </div>
      <div className="mt-0.5 text-xs font-semibold text-zinc-500">{label}</div>
    </m.div>
  )
}

// ─── Queue row ─────────────────────────────────────────────────────────────────

function QueueRow({
  row,
  delay,
}: {
  row: (typeof QUEUE_ROWS)[number]
  delay: number
}) {
  const reduced = usePRM()
  return (
    <m.div
      layout
      className="grid gap-2.5 px-4 py-3.5"
      initial={reduced ? false : { opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.55, ease: EASE, delay }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-black text-zinc-950">{row.client}</div>
          <div className="mt-0.5 text-[11px] font-semibold text-zinc-500">{row.type}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-black text-zinc-950">{row.amount}</div>
          <div className="relative mt-1 inline-block">
            {/* One-time pulse ring on the overdue pill */}
            {row.id === "r1" && !reduced && (
              <m.div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full bg-red-400/25"
                initial={{ scale: 1, opacity: 0.5 }}
                animate={{ scale: 2.4, opacity: 0 }}
                transition={{ duration: 0.9, ease: "easeOut", delay: delay + 1.1 }}
              />
            )}
            <m.div
              className={`rounded-full px-2 py-0.5 text-[10px] font-black ${row.statusColor}`}
              initial={reduced ? false : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, ease: EASE, delay: delay + 0.18 }}
            >
              {row.status}
            </m.div>
          </div>
        </div>
      </div>
      <AnimatedProgressBar value={row.progress} delay={delay + 0.1} />
    </m.div>
  )
}

// ─── Floating draft bubble ─────────────────────────────────────────────────────
// Appears after queue rows, uses AnimatePresence for enter/exit cycles

function DraftBubble() {
  const [visible, setVisible] = useState(false)
  const reduced = usePRM()

  // Appears once after a short delay and stays visible
  useEffect(() => {
    if (reduced) { setVisible(true); return }
    const t = setTimeout(() => setVisible(true), 1800)
    return () => clearTimeout(t)
  }, [reduced])

  return (
    <AnimatePresence>
      {visible && (
        <m.div
          key="draft-bubble"
          className="absolute bottom-4 right-3 z-20 hidden w-52 rounded-2xl border border-green-100 bg-white p-3 shadow-xl shadow-green-950/10 lg:block"
          initial={{ opacity: 0, y: 14, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.94 }}
          transition={{ duration: 0.45, ease: EASE }}
        >
          <div className="mb-2.5 flex items-center gap-2">
            <div className="grid size-7 place-items-center rounded-full bg-green-100 text-green-700">
              <MessageSquareText className="size-3.5" />
            </div>
            <div className="text-xs font-black text-zinc-950">Draft approved</div>
          </div>
          <div className="rounded-xl bg-green-50 p-3 text-[11px] leading-5 text-green-950">
            Quick reminder on the invoice from last week. Let me know if you need the link again.
          </div>
        </m.div>
      )}
    </AnimatePresence>
  )
}

// ─── AnimatedHeroMockup ───────────────────────────────────────────────────────
// Hero UI that assembles itself:
//   shell → metric cards → header badge → queue rows stagger → AI draft bar

export function AnimatedHeroMockup() {
  const reduced = usePRM()
  const containerRef = useRef<HTMLDivElement>(null)

  // Mouse-tilt: reads mouse relative to the mockup container
  const tiltX = useMotionValue(0)
  const tiltY = useMotionValue(0)
  const stiffness = 120
  const damping = 18
  const sTiltX = useSpring(tiltX, { stiffness, damping })
  const sTiltY = useSpring(tiltY, { stiffness, damping })

  useEffect(() => {
    const el = containerRef.current
    if (!el || reduced || window.matchMedia("(pointer: coarse)").matches) return
    const handler = (e: MouseEvent) => {
      const r = el.getBoundingClientRect()
      const nx = ((e.clientX - r.left) / r.width - 0.5) * 2
      const ny = ((e.clientY - r.top) / r.height - 0.5) * 2
      tiltX.set(ny * -5)  // rotate around X axis
      tiltY.set(nx * 6)   // rotate around Y axis
    }
    const reset = () => { tiltX.set(0); tiltY.set(0) }
    window.addEventListener("mousemove", handler)
    el.addEventListener("mouseleave", reset)
    return () => {
      window.removeEventListener("mousemove", handler)
      el.removeEventListener("mouseleave", reset)
    }
  }, [reduced, tiltX, tiltY])

  return (
    <div ref={containerRef} className="relative mx-auto w-full max-w-[40rem] min-w-0 perspective-[1200px] lg:mx-0 lg:max-w-none">
      {/* Floating stat card above-left */}
      <m.div
        className="absolute left-4 top-8 z-20 hidden w-48 rounded-2xl border border-green-100 bg-white p-4 shadow-xl shadow-green-950/12 backdrop-blur md:block xl:-left-3"
        initial={reduced ? false : { opacity: 0, x: -20, scale: 0.9 }}
        animate={reduced ? { opacity: 1, x: 0, scale: 1 } : { opacity: 1, x: 0, scale: 1, y: [0, -8, 0], rotate: [0, -1, 0] }}
        transition={reduced ? { duration: 0.65, ease: EASE, delay: 1.1 } : { opacity: { duration: 0.65, ease: EASE, delay: 1.1 }, x: { duration: 0.65, ease: EASE, delay: 1.1 }, scale: { duration: 0.65, ease: EASE, delay: 1.1 }, y: { duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1.8 }, rotate: { duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1.8 } }}
      >
        <div>
          <div className="text-xs font-bold text-zinc-500">Found this week</div>
          <div className="mt-1 text-3xl font-black tracking-tight text-green-700">
            <AnimatedNumber value={24.8} prefix="$" suffix="k" decimals={1} />
          </div>
          <div className="mt-2 text-xs leading-5 text-zinc-600">
            Overdue balances and quiet estimates ready for follow-up.
          </div>
        </div>
      </m.div>

      {/* Main mockup shell with mouse tilt */}
      <m.div
        className="relative w-full overflow-visible rounded-[1.75rem] border border-green-100/80 bg-white shadow-2xl shadow-green-950/15"
        initial={reduced ? false : { opacity: 0, x: 48, scale: 0.96 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ duration: 0.85, ease: EASE, delay: 0.28 }}
        style={
          reduced
            ? undefined
            : { rotateX: sTiltX, rotateY: sTiltY, transformStyle: "preserve-3d" }
        }
      >
        {/* Gradient top wash */}
        <div className="absolute inset-x-0 top-0 h-20 rounded-t-[1.75rem] bg-gradient-to-b from-green-50 to-white" />

        {/* Header row */}
        <div className="relative border-b border-green-100 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <m.div
              initial={reduced ? false : { opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.5 }}
            >
              <div className="text-sm font-black text-zinc-950">Recovery queue</div>
              <div className="text-[11px] font-semibold text-zinc-500">
                Estimates, invoices, and customers ranked by next action
              </div>
            </m.div>
            <m.div
              className="inline-flex w-fit items-center gap-1.5 rounded-full border border-green-200 bg-white px-3 py-1.5 text-[11px] font-black text-green-700 shadow-sm"
              initial={reduced ? false : { opacity: 0, x: 12 }}
              animate={reduced
                ? { opacity: 1, x: 0 }
                : { opacity: [0, 1, 1], x: [12, 0, 0], scale: [1, 1, 1.05, 1] }}
              transition={reduced
                ? { duration: 0.5, ease: EASE, delay: 0.65 }
                : {
                    opacity: { duration: 0.5, ease: EASE, delay: 0.65 },
                    x:       { duration: 0.5, ease: EASE, delay: 0.65 },
                    scale:   { duration: 0.38, ease: EASE, delay: 1.5 },
                  }}
            >
              <TrendingUp className="size-3" />
              <AnimatedNumber value={18420} prefix="$" suffix=" recovered this month" />
            </m.div>
          </div>
        </div>

        <div className="relative grid gap-4 p-4 sm:p-5">
          {/* Metric cards — stagger in */}
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              icon={CircleDollarSign}
              value={24.8}
              prefix="$"
              suffix="k"
              decimals={1}
              label="At risk this week"
              note="high value"
              delay={0.6}
            />
            <MetricCard
              icon={Clock3}
              value={14}
              label="Average days late"
              note="watch"
              delay={0.72}
            />
            <MetricCard
              icon={MessageSquareText}
              value={11}
              label="Follow-ups ready"
              note="drafted"
              delay={0.84}
            />
          </div>

          {/* Queue rows */}
          <m.div
            className="overflow-hidden rounded-2xl border border-green-100 bg-white shadow-sm"
            initial={reduced ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.78 }}
          >
            <div className="flex items-center justify-between border-b border-green-100 bg-green-50/70 px-4 py-2.5">
              <div className="text-sm font-black text-zinc-950">Best next follow-up</div>
              <m.div
                className="text-xs font-black text-green-700"
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, ease: EASE, delay: 1.0 }}
              >
                3 ready
              </m.div>
            </div>

            <LayoutGroup>
              <div className="divide-y divide-green-100">
                {QUEUE_ROWS.map((row, i) => (
                  <QueueRow key={row.id} row={row} delay={0.92 + i * 0.12} />
                ))}
              </div>
            </LayoutGroup>
          </m.div>

          {/* AI draft bar — appears last */}
          <m.div
            className="rounded-2xl border border-green-700/40 bg-gradient-to-br from-green-900 to-green-950 p-4 text-white shadow-lg shadow-green-950/20"
            initial={reduced ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE, delay: 1.3 }}
          >
            <div className="flex items-center gap-3">
              <m.div
                className="grid size-9 place-items-center rounded-xl bg-green-500/20 text-green-200"
                animate={reduced ? undefined : { scale: [1, 1.08, 1] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <Sparkles className="size-4" />
              </m.div>
              <div>
                <div className="text-sm font-black">AI draft ready</div>
                <div className="text-xs text-green-100/80">
                  &ldquo;Hi Sam, quick reminder on invoice INV-1048…&rdquo;
                </div>
              </div>
            </div>
          </m.div>
        </div>

        {/* Floating draft bubble — appears after queue, cycles */}
        <DraftBubble />
      </m.div>
    </div>
  )
}
