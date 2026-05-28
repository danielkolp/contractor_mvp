"use client"

import { useRef, useState, useEffect, useCallback, type ComponentType, type ReactNode } from "react"
import Link from "next/link"
import {
  ArrowRight, CheckCircle2, ChevronDown, CircleDollarSign,
  ClipboardCheck, FileWarning, Gauge, HardHat, MessageSquareText,
  ReceiptText, ShieldCheck, Sparkles, TrendingUp, UsersRound, Wrench,
} from "lucide-react"
import {
  LazyMotion, domAnimation, m, useScroll, useTransform,
  useSpring, useMotionValue, AnimatePresence, LayoutGroup,
  type MotionValue,
} from "motion/react"

import { AnimatedHeroMockup } from "./hero-mockup"
import {
  EASE, VIEWPORT, usePRM, AnimatedNumber, MagneticButton,
  CursorSpotlight, SectionReveal, StaggerReveal, SectionBadge,
  AnimatedProgressBar, ScrollProgressBeam,
} from "./motion-primitives"

// ─── Brand ───────────────────────────────────────────────────────────────────

// ─── Data ────────────────────────────────────────────────────────────────────

const problems = [
  { title: "Quiet quotes", description: "A customer said they were interested, then the estimate disappeared under the next job.", icon: FileWarning, metric: 6.2, metricPrefix: "$", metricSuffix: "k", label: "waiting estimate" },
  { title: "Unpaid invoices", description: "The work is finished. The reminder still needs to be clear, polite, and sent.", icon: ClipboardCheck, metric: 17, metricSuffix: " days", label: "past due" },
  { title: "Past customers", description: "The easiest repeat work often comes from people who already trust the crew.", icon: UsersRound, metric: 48, label: "ready to re-engage" },
]

const steps = [
  { number: "01", title: "Find who needs follow-up", description: "Overdue invoices, quiet estimates, and past customers surface in a ranked queue." },
  { number: "02", title: "Review the draft", description: "The AI writes a plain, friendly message. Read it over — it takes ten seconds." },
  { number: "03", title: "Send when ready", description: "Nothing goes out until you approve it. Edit the tone, skip it, or come back later." },
  { number: "04", title: "Mark paid, waiting, or closed", description: "Update the status and the queue adjusts. No spreadsheet needed." },
]

const benefits = [
  { title: "Estimate follow-up", description: "Catch the quote that is one text away from becoming next week's job.", icon: ReceiptText },
  { title: "Invoice reminders", description: "Send firm, friendly nudges without rewriting awkward payment messages.", icon: CircleDollarSign },
  { title: "Customer win-backs", description: "Turn old jobs into repeat work with seasonal, useful check-ins.", icon: MessageSquareText },
  { title: "Cash-flow priority", description: "See which follow-up matters first by age, amount, and likelihood to pay.", icon: Gauge },
]

const darkQueueRows = [
  { client: "North Ridge Homes", type: "Invoice INV-1048", amount: "$4,850", progress: 82 },
  { client: "Harbor View HOA",   type: "Estimate EST-2211", amount: "$8,300",  progress: 64 },
  { client: "Mason & Co.",        type: "Repeat work",       amount: "$12,600", progress: 91 },
]

const faqs = [
  { question: "Will this send texts without me approving them?", answer: "No. Revenue Recovery drafts the message, but you decide what gets sent. You can edit, approve, skip, or leave it for later." },
  { question: "Does it sound like a real contractor?", answer: "Yes. The copy is short, plain, and respectful. It is built for real customer conversations, not accounting jargon." },
  { question: "Can I start without a full integration?", answer: "Yes. You can start by tracking invoices, estimates, and clients in the workspace, then connect more tools as the workflow grows." },
  { question: "Who is this for?", answer: "Small trade businesses and contractors who want a simple way to recover missed money without hiring an admin team." },
]

// ─── Shared components ────────────────────────────────────────────────────────

function LogoMark() {
  return (
    <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-green-700 text-xs font-black tracking-tight text-white shadow-lg shadow-green-700/20">
      RR
    </div>
  )
}

function AppLink({
  href, children, variant = "primary", className = "",
}: {
  href: string; children: ReactNode; variant?: "primary" | "secondary" | "dark" | "light"; className?: string
}) {
  const styles = {
    primary:   "bg-green-700 text-white shadow-xl shadow-green-700/20 hover:bg-green-800 hover:shadow-green-700/30",
    secondary: "border border-green-200 bg-white text-green-950 shadow-sm hover:border-green-300 hover:bg-green-50",
    dark:      "bg-zinc-900 text-white shadow-xl shadow-zinc-950/20 hover:bg-green-950",
    light:     "bg-white text-green-950 shadow-xl shadow-green-950/20 hover:bg-green-50",
  }
  return (
    <MagneticButton>
      <Link
        href={href}
        className={`inline-flex h-12 min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-black transition-all duration-200 active:scale-95 ${styles[variant]} ${className}`}
      >
        {children}
      </Link>
    </MagneticButton>
  )
}

// ─── Hero particle field ──────────────────────────────────────────────────────
// Three invoice/estimate chips positioned in the section's top padding zone
// (above the badge content, y < ~60px), so they never cross text or CTAs.
// Only shown on lg+ where py-16 gives enough vertical clearance.

const HERO_PARTICLES = [
  { id: "p1", label: "INV-1048",   sub: "7 days overdue",   left: "5%",  top: "1%",   rotate: -5, delay: 0.3,  amp:  9, opacity: 0.80 },
  { id: "p2", label: "EST-2211",   sub: "$8,300 · no reply", left: "28%", top: "1.3%", rotate:  3, delay: 0.55, amp: -8, opacity: 0.70 },
  { id: "p3", label: "Follow up?", sub: "Mason & Co.",       left: "52%", top: "0.8%", rotate: -2, delay: 0.75, amp:  7, opacity: 0.62 },
] as const

function HeroParticleField() {
  const reduced = usePRM()
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {HERO_PARTICLES.map((p, i) => (
        <m.div
          key={p.id}
          className="absolute hidden lg:block"
          style={{ left: p.left, top: p.top }}
          initial={reduced ? false : { opacity: 0, y: 12, filter: "blur(3px)" }}
          animate={{ opacity: p.opacity, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.75, ease: EASE, delay: p.delay }}
        >
          <m.div
            animate={reduced ? undefined : { y: [0, p.amp, 0, -(p.amp * 0.35), 0] }}
            transition={{ duration: 11 + i * 1.4, ease: "easeInOut", repeat: Infinity, delay: p.delay + 0.6 }}
          >
            <div
              className="rounded-xl border border-green-300/55 bg-white px-3 py-2 shadow-md shadow-green-950/8"
              style={{ transform: `rotate(${p.rotate}deg)` }}
            >
              <div className="text-[11px] font-black text-zinc-800">{p.label}</div>
              <div className="text-[10px] font-semibold text-zinc-500">{p.sub}</div>
            </div>
          </m.div>
        </m.div>
      ))}
    </div>
  )
}

// ─── Hero headline ────────────────────────────────────────────────────────────
// Each phrase enters with a spring. "clear next steps" lands with extra weight.

function HeroHeadline() {
  const reduced = usePRM()
  const lines = [
    { prefix: "Turn ", phrase: "quiet quotes", tone: "red" },
    { prefix: "and ", phrase: "unpaid invoices", tone: "red" },
    { prefix: "into ", phrase: "clear next steps.", tone: "green" },
  ]
  return (
    <h1 className="mt-6 max-w-[44rem] text-5xl font-black leading-[1.08] tracking-tight text-zinc-950 sm:text-6xl sm:leading-[1.06] lg:max-w-none lg:text-6xl xl:text-7xl xl:leading-[1.04]">
      {lines.map((line, i) => (
        <m.span
          key={line.phrase}
          className={i === 1 ? "block md:whitespace-nowrap" : "block"}
          initial={reduced ? false : { opacity: 0, y: 28, filter: "blur(3px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{
            duration: i === 2 ? 0.85 : 0.7,
            ease: i === 2 ? [0.12, 0.8, 0.2, 1.2] : EASE,
            delay: 0.18 + i * 0.14,
          }}
        >
          {line.prefix}
          <span className={line.tone === "green"
                ? "bg-gradient-to-t from-green-100/90 from-[38%] to-transparent to-[56%] px-0.5 font-[family-name:var(--font-caveat)] text-[1.12em] font-bold leading-none tracking-normal text-green-700 [-webkit-box-decoration-break:clone] [box-decoration-break:clone]"
                : "bg-gradient-to-t from-amber-100/80 from-[30%] to-transparent to-[52%] px-0.5 text-zinc-900 [-webkit-box-decoration-break:clone] [box-decoration-break:clone]"
          }>
            {line.phrase}
          </span>
        </m.span>
      ))}
    </h1>
  )
}

// ─── Workflow tile ────────────────────────────────────────────────────────────

function WorkflowTile({ icon: Icon, title, description }: { icon: ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <SectionReveal inGroup>
      <m.div
        className="rounded-2xl border border-green-100 bg-white/88 p-4 shadow-sm shadow-green-950/5 backdrop-blur"
        whileHover={{ y: -3 }}
        transition={{ duration: 0.2, ease: EASE }}
      >
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-green-50 text-green-700">
            <Icon className="size-4" />
          </div>
          <div>
            <div className="font-black leading-tight text-zinc-950">{title}</div>
            <p className="mt-1 text-sm leading-5 text-zinc-600">{description}</p>
          </div>
        </div>
      </m.div>
    </SectionReveal>
  )
}

// ─── Problem cards ────────────────────────────────────────────────────────────
// Scatter in, settle to grid, then hover tilt + cursor spotlight

function ProblemCard({ item, index }: { item: typeof problems[number]; index: number }) {
  const reduced = usePRM()
  const cardRef = useRef<HTMLDivElement>(null)
  const Icon = item.icon
  const rotateX = useMotionValue(0)
  const rotateY = useMotionValue(0)
  const sRotateX = useSpring(rotateX, { stiffness: 180, damping: 20 })
  const sRotateY = useSpring(rotateY, { stiffness: 180, damping: 20 })

  // scatter offsets per card index
  const scatter = [
    { x: -32, y: 22, rotate: -4 },
    { x: 8,  y: -20, rotate: 2  },
    { x: 30, y: 20,  rotate: 4  },
  ][index]

  const onMove = useCallback((e: React.MouseEvent) => {
    if (reduced || !cardRef.current || window.matchMedia("(pointer: coarse)").matches) return
    const r = cardRef.current.getBoundingClientRect()
    const nx = ((e.clientX - r.left) / r.width - 0.5) * 2
    const ny = ((e.clientY - r.top) / r.height - 0.5) * 2
    rotateX.set(ny * -6)
    rotateY.set(nx * 7)
  }, [reduced, rotateX, rotateY])

  const onLeave = useCallback(() => { rotateX.set(0); rotateY.set(0) }, [rotateX, rotateY])

  return (
    <m.div
      ref={cardRef}
      className="group relative overflow-hidden rounded-[1.5rem] border border-green-100 bg-white p-6 shadow-sm shadow-green-950/5 perspective-[900px]"
      initial={reduced ? false : { opacity: 0, ...scatter }}
      whileInView={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.8, ease: EASE, delay: index * 0.1 }}
      style={reduced ? undefined : { rotateX: sRotateX, rotateY: sRotateY, transformStyle: "preserve-3d" }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      {/* cursor spotlight */}
      <CursorSpotlight containerRef={cardRef as React.RefObject<HTMLDivElement>} />
      <div className="absolute -right-8 -top-8 size-28 rounded-full bg-green-50" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="grid size-12 place-items-center rounded-xl bg-green-700 text-white">
            <Icon className="size-5" />
          </div>
          <div className="text-right">
            <div className="text-2xl font-black tracking-tight text-green-700">
              <AnimatedNumber
                value={item.metric}
                prefix={item.metricPrefix ?? ""}
                suffix={item.metricSuffix ?? ""}
                decimals={item.metricSuffix === "k" ? 1 : 0}
              />
            </div>
            <div className="text-xs font-black uppercase text-zinc-400">{item.label}</div>
          </div>
        </div>
        <h3 className="mt-6 text-xl font-black text-zinc-950">{item.title}</h3>
        <p className="mt-3 text-sm leading-6 text-zinc-600">{item.description}</p>
      </div>
    </m.div>
  )
}

// ─── Queue story: scatter → sorted ───────────────────────────────────────────
// Scroll-linked animation: cards start clustered/overlapping, sort into a ranked
// list as the section scrolls into view — directly tells the product story.

const SCATTER_CARDS = [
  {
    id: "s0", label: "Mason & Co.", type: "Repeat work", amount: "$12,600",
    badge: "follow-up ready", badgeColor: "bg-green-50 text-green-700",
    // sortedY is the final vertical position (index × card height)
    sortedIndex: 0, scatterY: 58, scatterX: -14, scatterRotate: -7,
  },
  {
    id: "s1", label: "North Ridge Homes", type: "Invoice INV-1048", amount: "$4,850",
    badge: "7 days overdue", badgeColor: "bg-red-50 text-red-600",
    sortedIndex: 1, scatterY: -30, scatterX: 11, scatterRotate: 9,
  },
  {
    id: "s2", label: "Harbor View HOA", type: "Estimate EST-2211", amount: "$8,300",
    badge: "review", badgeColor: "bg-amber-50 text-amber-700",
    sortedIndex: 2, scatterY: -88, scatterX: 6, scatterRotate: -4,
  },
] as const

const CARD_H = 72 // px — height of one queue row including gap

// Each card owns its own transforms against the shared scrollYProgress
function ScatterCard({
  card,
  scrollYProgress,
}: {
  card: (typeof SCATTER_CARDS)[number]
  scrollYProgress: MotionValue<number>
}) {
  const reduced = usePRM()
  const sortedY = card.sortedIndex * CARD_H

  // When scroll=0: card is in the pile (sortedY + scatterY). When scroll≥0.8: sorted.
  const rawY = useTransform(scrollYProgress, [0, 0.8], [sortedY + card.scatterY, sortedY])
  const rawX = useTransform(scrollYProgress, [0, 0.8], [card.scatterX, 0])
  const rawRot = useTransform(scrollYProgress, [0, 0.8], [card.scatterRotate, 0])
  const rankOpacity = useTransform(scrollYProgress, [0.5, 0.85], [0, 1])

  const y = useSpring(rawY, { stiffness: 75, damping: 18 })
  const x = useSpring(rawX, { stiffness: 75, damping: 18 })
  const rotate = useSpring(rawRot, { stiffness: 75, damping: 18 })

  return (
    <m.div
      className="absolute inset-x-0"
      style={reduced ? { top: sortedY } : { y, x, rotate }}
    >
      <div className="flex items-center justify-between gap-3 rounded-xl border border-green-100 bg-white px-4 py-3.5 shadow-sm shadow-green-950/5">
        <div className="flex min-w-0 items-center gap-3">
          {/* Rank number fades in once sorted */}
          <m.span
            className="shrink-0 text-sm font-black text-green-700 opacity-0"
            style={reduced ? { opacity: 1 } : { opacity: rankOpacity }}
          >
            #{card.sortedIndex + 1}
          </m.span>
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-zinc-950">{card.label}</div>
            <div className="text-[11px] text-zinc-500">{card.type}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="text-sm font-black text-zinc-950">{card.amount}</div>
          <div className={`rounded-full px-2 py-0.5 text-[10px] font-black ${card.badgeColor}`}>
            {card.badge}
          </div>
        </div>
      </div>
    </m.div>
  )
}

function QueueStorySection() {
  const sectionRef = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 85%", "center 45%"],
  })

  return (
    <section ref={sectionRef} className="overflow-hidden border-b border-green-100 bg-green-50/50 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <SectionReveal pattern="fade-left">
            <SectionBadge tone="green">
              <Sparkles className="size-3.5" />
              From scattered to sorted
            </SectionBadge>
            <h2 className="mt-5 text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl sm:leading-[1.1]">
              Loose estimates and invoices snap into a ranked queue.
            </h2>
            <p className="mt-4 max-w-lg text-base leading-7 text-zinc-600">
              Revenue Recovery finds every open invoice, unanswered estimate, and past customer — then ranks them by what needs a nudge most urgently. No spreadsheet, no memory required.
            </p>
          </SectionReveal>

          {/* The animated scatter → sort visual */}
          <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
            {/* Container sized to exactly fit 3 sorted cards */}
            <div className="relative" style={{ height: CARD_H * SCATTER_CARDS.length }}>
              {SCATTER_CARDS.map((card) => (
                <ScatterCard key={card.id} card={card} scrollYProgress={scrollYProgress} />
              ))}
            </div>
            {/* Subtle label below */}
            <m.p
              className="mt-4 text-center text-xs font-semibold text-zinc-400"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              Ranked by age, amount, and next action
            </m.p>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Final CTA ────────────────────────────────────────────────────────────────

function FinalCTASection() {
  const reduced = usePRM()
  return (
    <section className="relative overflow-hidden bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      {/* Subtle green glow behind the content */}
      <m.div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 size-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-green-100/60 blur-3xl"
        animate={reduced ? undefined : { scale: [1, 1.08, 1], opacity: [0.6, 0.85, 0.6] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative mx-auto max-w-2xl text-center">
        <SectionReveal>
          <h2 className="text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl sm:leading-tight">
            Stop letting good jobs disappear{" "}
            <span className="text-green-700">after the estimate.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-zinc-600">
            Revenue Recovery shows which clients need a follow-up, drafts the message, and keeps every invoice or estimate moving — without you chasing people from memory.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <AppLink href="/signup">
              Start finding missed follow-ups
              <ArrowRight className="size-4" />
            </AppLink>
            <AppLink href="/dashboard" variant="secondary">
              View demo queue
            </AppLink>
          </div>
          <p className="mt-4 text-xs font-semibold text-zinc-400">No credit card required.</p>
        </SectionReveal>
      </div>
    </section>
  )
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({ eyebrow, title, description, dark = false }: { eyebrow: string; title: string; description: string; dark?: boolean }) {
  return (
    <StaggerReveal className="mx-auto max-w-3xl text-center">
      <SectionBadge tone={dark ? "dark" : "green"}>
        <Sparkles className="size-3.5" />
        {eyebrow}
      </SectionBadge>
      <m.h2
        className={`mt-5 text-3xl font-black tracking-tight sm:text-5xl sm:leading-[1.05] ${dark ? "text-white" : "text-zinc-950"}`}
        variants={{ hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } } }}
      >
        {title}
      </m.h2>
      <m.p
        className={`mx-auto mt-4 max-w-2xl text-base leading-7 sm:text-lg ${dark ? "text-zinc-300" : "text-zinc-600"}`}
        variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE, delay: 0.1 } } }}
      >
        {description}
      </m.p>
    </StaggerReveal>
  )
}

// ─── How it works — step cards ────────────────────────────────────────────────

// Step 2: typing message preview
function TypingPreview() {
  const [phase, setPhase] = useState(0) // 0=empty, 1=typing, 2=done
  const reduced = usePRM()

  useEffect(() => {
    if (reduced) { setPhase(2); return }
    const t1 = setTimeout(() => setPhase(1), 600)
    const t2 = setTimeout(() => setPhase(2), 2200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [reduced])

  const text = "Hi Sam, quick follow-up on invoice INV-1048. Happy to resend if useful."
  const shown = phase === 0 ? "" : phase === 1 ? text.slice(0, 38) : text

  return (
    <m.div
      className="rounded-[1.5rem] border border-green-100 bg-white p-4 shadow-xl shadow-green-950/10"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.65, ease: EASE }}
    >
      <div className="mb-4 flex items-center gap-3 border-b border-green-100 pb-3">
        <div className="grid size-9 place-items-center rounded-full bg-green-100 text-green-700">
          <HardHat className="size-4" />
        </div>
        <div>
          <div className="text-sm font-black text-zinc-950">Customer text</div>
          <div className="text-xs font-semibold text-zinc-500">Ready for review</div>
        </div>
      </div>
      <div className="space-y-3 text-sm">
        <m.div
          className="mr-8 rounded-2xl rounded-tl-sm bg-zinc-100 px-4 py-3 text-zinc-700"
          initial={{ opacity: 0, x: -10 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.45, ease: EASE, delay: 0.15 }}
        >
          Can you resend the invoice when you get a chance?
        </m.div>
        <m.div
          className="ml-8 rounded-2xl rounded-tr-sm bg-green-700 px-4 py-3 font-semibold text-white"
          initial={{ opacity: 0, x: 10 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.45, ease: EASE, delay: 0.3 }}
        >
          Absolutely. I just sent it over. Thanks again for the work with North Ridge.
        </m.div>
        <div className="ml-8 min-h-[52px] rounded-2xl rounded-tr-sm border border-green-200 bg-green-50 px-4 py-3 font-semibold text-green-950">
          {shown}
          {phase === 1 && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-green-700" />}
        </div>
      </div>
    </m.div>
  )
}

// Step 3: approval button with check micro-animation
function ApprovalPanel() {
  const [approved, setApproved] = useState(false)
  const reduced = usePRM()

  return (
    <m.div
      className="rounded-[1.5rem] bg-green-950 p-6 text-white shadow-2xl shadow-green-950/20"
      initial={reduced ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.65, ease: EASE, delay: 0.18 }}
    >
      <StaggerReveal delay={0.2}>
        <SectionBadge tone="dark">
          <ShieldCheck className="size-3.5" />
          Approval stays with you
        </SectionBadge>
        <m.h3
          className="mt-5 text-3xl font-black tracking-tight"
          variants={{ hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } } }}
        >
          Friendly follow-up, not awkward chasing.
        </m.h3>
        <m.p
          className="mt-4 text-sm leading-6 text-green-100"
          variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.5, ease: EASE } } }}
        >
          Every draft is short, useful, and written for a normal customer conversation.
        </m.p>
      </StaggerReveal>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <m.button
          className="relative h-11 overflow-hidden rounded-lg bg-white px-4 text-sm font-black text-green-950"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => { if (!reduced) setApproved(true); setTimeout(() => setApproved(false), 2000) }}
        >
          <AnimatePresence mode="wait">
            {approved ? (
              <m.span
                key="check"
                className="flex items-center gap-1.5"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <CheckCircle2 className="size-4 text-green-700" />
                Approved!
              </m.span>
            ) : (
              <m.span key="approve" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                Approve
              </m.span>
            )}
          </AnimatePresence>
        </m.button>
        <button className="h-11 rounded-lg border border-green-700 px-4 text-sm font-black text-green-100 transition hover:border-green-500">
          Edit
        </button>
      </div>
    </m.div>
  )
}

function StepCard({ step, index, total }: { step: typeof steps[number]; index: number; total: number }) {
  return (
    <SectionReveal inGroup pattern="fade-up" delay={index * 0.06}>
      <div className="group relative grid gap-4 rounded-[1.5rem] border border-green-100 bg-white p-5 shadow-sm shadow-green-950/5 transition duration-300 hover:border-green-200 hover:shadow-xl hover:shadow-green-950/10 sm:grid-cols-[auto_1fr]">
        {index < total - 1 && (
          <m.div
            aria-hidden="true"
            className="absolute left-10 top-[4.75rem] hidden h-[calc(100%+1rem)] w-px origin-top bg-green-200 lg:block"
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={VIEWPORT}
            transition={{ duration: 0.8, ease: EASE, delay: 0.25 + index * 0.15 }}
          />
        )}
        <div className="relative z-10 grid size-12 place-items-center rounded-xl bg-green-950 text-sm font-black text-white transition duration-300 group-hover:bg-green-700">
          {step.number}
        </div>
        <div>
          <h3 className="text-xl font-black text-zinc-950">{step.title}</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{step.description}</p>
        </div>
      </div>
    </SectionReveal>
  )
}

// ─── Dark product section ─────────────────────────────────────────────────────
// The "holy shit" moment: animated dot grid, expanding radial glow, dark queue

function DarkProductSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const reduced = usePRM()
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start end", "center center"] })
  const glowOpacity = useTransform(scrollYProgress, [0, 1], [0.1, 0.55])
  const glowScale   = useTransform(scrollYProgress, [0, 1], [0.78, 1.1])
  const dotY        = useTransform(scrollYProgress, [0, 1], [0, -28])

  return (
    <section ref={sectionRef} className="relative overflow-hidden border-y border-green-900/40 bg-zinc-950 px-4 py-20 text-white sm:px-6 lg:px-8">
      {/* Animated radial glow */}
      <m.div
        aria-hidden="true"
        className="absolute right-[-14rem] top-[-12rem] size-[42rem] rounded-full bg-green-500/25 blur-3xl"
        style={{ opacity: glowOpacity, scale: glowScale }}
      />
      <m.div
        aria-hidden="true"
        className="absolute left-[-10rem] bottom-[-8rem] size-[28rem] rounded-full bg-green-700/15 blur-3xl"
        style={{ opacity: glowOpacity }}
      />

      {/* Slowly drifting dot grid */}
      <m.div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[length:28px_28px]"
        style={reduced ? undefined : { y: dotY }}
      />

      <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
        <SectionReveal pattern="fade-left" delay={0.1}>
          <StaggerReveal delay={0.15}>
            <SectionBadge tone="dark">
              <Gauge className="size-3.5" />
              Product view
            </SectionBadge>
            <m.h2
              className="mt-5 text-4xl font-black tracking-tight sm:text-5xl sm:leading-[1.05]"
              variants={{ hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } } }}
            >
              Open the app and know exactly who needs a nudge.
            </m.h2>
            <m.p
              className="mt-5 text-base leading-7 text-zinc-300"
              variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.6, ease: EASE } } }}
            >
              The dashboard is built for quick decisions between job sites: highest value, oldest balance, best draft, next action.
            </m.p>
          </StaggerReveal>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <AppLink href="/dashboard" variant="light">View demo dashboard <ArrowRight className="size-4" /></AppLink>
            <AppLink href="/signup" variant="dark">Start free</AppLink>
          </div>
        </SectionReveal>

        {/* Dark queue preview */}
        <SectionReveal pattern="fade-right" delay={0.22}>
          <m.div
            className="relative w-full overflow-hidden rounded-[1.5rem] border border-green-800/60 bg-zinc-900/80 shadow-2xl shadow-green-950/40 backdrop-blur"
            initial={reduced ? false : { opacity: 0, x: 32, scale: 0.97 }}
            whileInView={{ opacity: 1, x: 0, scale: 1 }}
            viewport={VIEWPORT}
            transition={{ duration: 0.8, ease: EASE, delay: 0.3 }}
          >
            <div className="border-b border-green-800/60 px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-black text-white">Recovery queue</div>
                  <div className="text-[11px] font-semibold text-zinc-400">Ranked by urgency and value</div>
                </div>
                <m.div
                  className="inline-flex items-center gap-1.5 rounded-full border border-green-700/60 bg-green-900/60 px-3 py-1.5 text-[11px] font-black text-green-300"
                  initial={reduced ? false : { opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={VIEWPORT}
                  transition={{ duration: 0.5, ease: EASE, delay: 0.55 }}
                >
                  <TrendingUp className="size-3" />
                  $18,420 this month
                </m.div>
              </div>
            </div>

            <LayoutGroup>
              <div className="divide-y divide-green-900/60 px-5">
                {darkQueueRows.map((row, i) => (
                  <m.div
                    key={row.client}
                    layout
                    className="grid gap-2.5 py-4"
                    initial={reduced ? false : { opacity: 0, x: 16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={VIEWPORT}
                    transition={{ duration: 0.55, ease: EASE, delay: 0.5 + i * 0.1 }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-white">{row.client}</div>
                        <div className="text-[11px] text-zinc-500">{row.type}</div>
                      </div>
                      <div className="text-sm font-black text-green-300 shrink-0">{row.amount}</div>
                    </div>
                    <AnimatedProgressBar value={row.progress} delay={0.6 + i * 0.12} dark />
                  </m.div>
                ))}
              </div>
            </LayoutGroup>

            {/* Recovery message bar — glows once */}
            <m.div
              className="m-4 rounded-xl border border-green-700/50 bg-green-950/70 p-4"
              initial={reduced ? false : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VIEWPORT}
              transition={{ duration: 0.6, ease: EASE, delay: 0.85 }}
            >
              <div className="flex items-center gap-3">
                <m.div
                  className="grid size-9 shrink-0 place-items-center rounded-xl bg-green-500/15 text-green-400"
                  animate={reduced ? undefined : {
                    boxShadow: ["0 0 0px 0px rgba(74,222,128,0)", "0 0 18px 4px rgba(74,222,128,0.25)", "0 0 0px 0px rgba(74,222,128,0)"],
                  }}
                  transition={{ duration: 2.4, delay: 1.5, repeat: Infinity, repeatDelay: 3 }}
                >
                  <Sparkles className="size-4" />
                </m.div>
                <div>
                  <div className="text-sm font-black text-white">AI draft ready</div>
                  <div className="text-[11px] text-green-400/80">"Hi Sam, quick reminder on invoice INV-1048…"</div>
                </div>
              </div>
            </m.div>
          </m.div>
        </SectionReveal>
      </div>
    </section>
  )
}

// ─── Feature cards ────────────────────────────────────────────────────────────

function FeatureCard({ icon: Icon, title, description }: { icon: ComponentType<{ className?: string }>; title: string; description: string }) {
  const cardRef = useRef<HTMLDivElement>(null)
  return (
    <SectionReveal inGroup pattern="scale-in">
      <m.div
        ref={cardRef}
        className="group relative rounded-2xl border border-green-100 bg-white p-5 shadow-sm shadow-green-950/5 transition-shadow duration-300 hover:border-green-200 hover:shadow-xl hover:shadow-green-950/10"
        whileHover={{ y: -5 }}
        transition={{ duration: 0.22, ease: EASE }}
      >
        <CursorSpotlight containerRef={cardRef as React.RefObject<HTMLDivElement>} />
        <m.div
          className="relative z-10 mb-5 grid size-11 place-items-center rounded-xl bg-green-50 text-green-700 group-hover:bg-green-700 group-hover:text-white transition-colors duration-300"
          whileHover={{ scale: 1.1, rotate: -4 }}
          transition={{ duration: 0.22, ease: EASE }}
        >
          <Icon className="size-5" />
        </m.div>
        <h3 className="relative z-10 text-base font-black text-zinc-950">{title}</h3>
        <p className="relative z-10 mt-2 text-sm leading-6 text-zinc-600">{description}</p>
      </m.div>
    </SectionReveal>
  )
}

// ─── Pricing section ──────────────────────────────────────────────────────────
// Floating mini-cards + spring pricing card entrance; no dead space

const MINI_CARDS = [
  { label: "3 follow-ups ready", color: "text-green-700 bg-green-50 border-green-200" },
  { label: "Quote follow-up due", color: "text-amber-700 bg-amber-50 border-amber-200" },
  { label: "Invoice reminder drafted", color: "text-green-700 bg-green-50 border-green-200" },
]

function PricingMiniCard({ label, color, delay, y }: { label: string; color: string; delay: number; y: number[] }) {
  const reduced = usePRM()
  return (
    <m.div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold shadow-sm ${color}`}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: EASE, delay }}
      animate={reduced ? undefined : { y }}
    >
      <span className="size-1.5 rounded-full bg-current opacity-60" />
      {label}
    </m.div>
  )
}

function PricingSection() {
  const reduced = usePRM()
  const checklistItems = ["Recovery queue", "AI text drafts", "Invoice and estimate tracking", "Cancel any time"]

  return (
    <section className="relative overflow-hidden bg-green-950 px-4 py-16 text-white sm:px-6 sm:py-20 lg:px-8">
      {/* Abstract background shapes */}
      <m.div
        aria-hidden="true"
        className="absolute -left-20 -top-20 size-80 rounded-full bg-green-800/30 blur-3xl"
        animate={reduced ? undefined : { scale: [1, 1.1, 1], opacity: [0.3, 0.45, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <m.div
        aria-hidden="true"
        className="absolute -bottom-16 right-0 size-64 rounded-full bg-green-600/20 blur-2xl"
        animate={reduced ? undefined : { scale: [1, 1.15, 1], opacity: [0.2, 0.35, 0.2] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />

      <div className="relative mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_390px] lg:items-center">
        <SectionReveal pattern="fade-left" delay={0.1}>
          <StaggerReveal>
            <SectionBadge tone="dark">
              <CircleDollarSign className="size-3.5" />
              Early access pricing
            </SectionBadge>
            <m.h2
              className="mt-5 max-w-xl text-4xl font-black tracking-tight sm:text-5xl sm:leading-[1.05]"
              variants={{ hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } } }}
            >
              Start with the invoices you already know are overdue.
            </m.h2>
            <m.p
              className="mt-5 max-w-lg text-base leading-7 text-green-100"
              variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.55, ease: EASE } } }}
            >
              A focused workspace for estimates, invoices, clients, and AI-drafted follow-ups. It only needs to recover one missed payment to make the math obvious.
            </m.p>
          </StaggerReveal>

          {/* Floating mini-cards */}
          <div className="mt-8 flex flex-wrap gap-2">
            {MINI_CARDS.map((card, i) => (
              <PricingMiniCard
                key={card.label}
                label={card.label}
                color={card.color}
                delay={0.5 + i * 0.12}
                y={reduced ? [0] : [0, -5, 0]}
              />
            ))}
          </div>
        </SectionReveal>

        {/* Pricing card — spring entrance */}
        <m.div
          className="rounded-[1.5rem] border border-green-800 bg-white p-6 text-zinc-950 shadow-2xl shadow-green-950/30"
          initial={reduced ? false : { opacity: 0, y: 40, scale: 0.93 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.75, ease: [0.12, 0.8, 0.2, 1.1], delay: 0.2 }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-black">Early access</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600">For contractors who want the recovery workflow before full integrations.</p>
            </div>
            <m.div
              className="rounded-full bg-green-50 px-3 py-1 text-xs font-black text-green-700"
              animate={reduced ? undefined : { scale: [1, 1.06, 1] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            >
              beta
            </m.div>
          </div>
          <div className="mt-6 flex items-end gap-2">
            <div className="text-5xl font-black tracking-tight">$49</div>
            <div className="pb-2 text-sm font-bold text-zinc-500">per month</div>
          </div>

          {/* Animated checklist */}
          <StaggerReveal className="mt-6 grid gap-3 text-sm font-semibold text-zinc-700" delay={0.4} stagger={0.1}>
            {checklistItems.map((item) => (
              <SectionReveal key={item} inGroup pattern="fade-left">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0 text-green-700" />
                  {item}
                </div>
              </SectionReveal>
            ))}
          </StaggerReveal>

          <AppLink href="/signup" className="mt-6 w-full">
            Start recovering revenue
          </AppLink>
          <p className="mt-3 text-center text-xs font-semibold text-zinc-500">No credit card required to try.</p>
        </m.div>
      </div>
    </section>
  )
}

// ─── FAQ accordion (AnimatePresence) ─────────────────────────────────────────

function FAQItem({ faq, delay }: { faq: typeof faqs[number]; delay: number }) {
  const [open, setOpen] = useState(false)
  const reduced = usePRM()

  return (
    <SectionReveal inGroup pattern="fade-up" delay={delay}>
      <div className="rounded-2xl border border-green-100 bg-white shadow-sm shadow-green-950/5 overflow-hidden transition hover:border-green-200">
        <button
          className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left text-base font-black text-zinc-950"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {faq.question}
          <m.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="shrink-0 text-green-700"
          >
            <ChevronDown className="size-5" />
          </m.span>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <m.div
              key="answer"
              initial={reduced ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.32, ease: EASE }}
              className="overflow-hidden"
            >
              <p className="px-5 pb-5 pt-1 text-sm leading-6 text-zinc-600">{faq.answer}</p>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </SectionReveal>
  )
}

// ─── Landing page ─────────────────────────────────────────────────────────────

export function LandingPage() {
  const reduced = usePRM()

  // How-it-works section scroll beam
  const howItWorksRef = useRef<HTMLElement>(null)
  const { scrollYProgress: howProgress } = useScroll({
    target: howItWorksRef,
    offset: ["start center", "end center"],
  })

  return (
    <LazyMotion features={domAnimation}>
      <main className="min-h-screen overflow-x-hidden bg-white text-zinc-950">

        {/* ── Navbar ── */}
        <m.header
          className="sticky top-0 z-50 border-b border-green-100 bg-white/85 backdrop-blur-xl"
          initial={reduced ? false : { opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE }}
        >
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link href="/" className="flex min-w-0 items-center gap-3">
              <LogoMark />
              <span className="truncate text-sm font-black tracking-tight">Revenue Recovery</span>
            </Link>
            <nav className="flex items-center gap-2">
              <Link href="/dashboard" className="hidden rounded-lg px-3 py-2 text-sm font-bold text-zinc-700 transition hover:bg-green-50 hover:text-green-800 sm:inline-flex">
                Dashboard
              </Link>
              <AppLink href="/signup" className="h-10 min-h-10 px-4 text-xs">
                Get started free
              </AppLink>
            </nav>
          </div>
        </m.header>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden">
          {/* Radial gradient mask */}
          <div aria-hidden="true" className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_18%_24%,rgba(255,255,255,0.2),rgba(255,255,255,0.72)_34%,#fff_64%)]" />
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 z-0 h-28 bg-gradient-to-t from-white to-transparent" />
          {/* Ambient dot grid — fades toward the right */}
          <div aria-hidden="true" className="absolute inset-0 z-0 bg-[radial-gradient(circle,rgba(21,128,61,0.055)_1px,transparent_1px)] bg-[length:32px_32px] [mask-image:radial-gradient(ellipse_at_28%_50%,black_15%,transparent_68%)]" />
          {/* Scattered follow-up signal particles */}
          <HeroParticleField />

          <div className="relative z-10 mx-auto grid max-w-[88rem] gap-10 px-4 py-12 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,1.03fr)_minmax(0,0.97fr)] lg:items-center lg:gap-12 lg:px-8 lg:py-16 xl:gap-16">
            <div className="relative min-w-0">
              <div className="relative z-10">
              <m.div
                initial={reduced ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: EASE, delay: 0.08 }}
              >
                
              </m.div>

              <HeroHeadline />

              <m.p
                className="mt-6 max-w-2xl text-lg leading-8 text-zinc-700 sm:text-xl"
                initial={reduced ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: EASE, delay: 0.62 }}
              >
                Revenue Recovery shows which clients need a follow-up, drafts the message, and keeps every estimate or invoice moving — without you chasing people from memory.
              </m.p>

              <m.div
                className="mt-8 flex flex-col gap-3 sm:flex-row"
                initial={reduced ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, ease: EASE, delay: 0.76 }}
              >
                <MagneticButton>
                  <Link
                    href="/signup"
                    className="group inline-flex h-12 min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-green-700 px-5 text-sm font-black text-white shadow-xl shadow-green-700/20 transition-all duration-200 hover:bg-green-800 hover:shadow-2xl hover:shadow-green-700/35 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 sm:w-auto"
                  >
                    Find missed follow-ups
                    <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </Link>
                </MagneticButton>
                <MagneticButton>
                  <Link
                    href="/dashboard"
                    className="inline-flex h-12 min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-green-200 bg-white px-5 text-sm font-black text-green-950 shadow-sm transition-all duration-200 hover:border-green-300 hover:bg-green-50/80 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 sm:w-auto"
                  >
                    View demo queue
                  </Link>
                </MagneticButton>
              </m.div>
              </div>
            </div>

            {/* Hero mockup — assembles from pieces */}
            <AnimatedHeroMockup />
          </div>

          {/* Workflow tiles */}
          <div className="relative z-10 mx-auto max-w-7xl px-4 pb-16 pt-4 sm:px-6 sm:pb-20 sm:pt-6 lg:px-8">
            <StaggerReveal
              className="grid gap-3 rounded-[1.5rem] border border-green-100 bg-white/80 p-3 shadow-sm shadow-green-950/5 backdrop-blur md:grid-cols-3"
              delay={0.9}
              stagger={0.1}
            >
              <WorkflowTile icon={TrendingUp} title="Find who needs follow-up" description="Overdue invoices and quiet estimates rise to the top." />
              <WorkflowTile icon={MessageSquareText} title="Review the draft" description="Plain-language copy is ready before you start typing." />
              <WorkflowTile icon={ShieldCheck} title="Send when ready" description="You approve every message before it reaches a customer." />
            </StaggerReveal>
          </div>
        </section>

        {/* ── Problem section ── */}
        <section className="border-y border-green-100 bg-green-50/60 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="The work is done"
              title="The money is still scattered across texts, invoices, and old customers."
              description="Revenue Recovery turns scattered follow-up into a clear daily list, so the next action is obvious."
            />
            {/* Cards scatter in, settle to grid */}
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {problems.map((item, i) => (
                <ProblemCard key={item.title} item={item} index={i} />
              ))}
            </div>
          </div>
        </section>

        {/* ── Queue story: scatter → sorted ── */}
        <QueueStorySection />

        {/* ── How it works ── */}
        <section ref={howItWorksRef} className="relative bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="How it works"
              title="A simple follow-up system that feels like part of your workday."
              description="Open the queue, review the draft, and approve the messages that make sense."
            />

            <div className="mt-14 grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
              {/* Steps with beam */}
              <div className="relative">
                {/* ScrollProgressBeam tracks section scroll */}
                <ScrollProgressBeam scrollYProgress={howProgress} />
                <StaggerReveal className="relative grid gap-4 pl-2 sm:pl-4" delay={0.12} stagger={0.14}>
                  {steps.map((step, i) => (
                    <StepCard key={step.number} step={step} index={i} total={steps.length} />
                  ))}
                </StaggerReveal>
              </div>

              {/* Right column: typing preview (step 2) + approval (step 3) */}
              <SectionReveal pattern="fade-right" delay={0.25}>
                <div className="relative">
                  <div className="absolute -inset-4 rounded-[2rem] bg-green-100/70 sm:-inset-6" />
                  <div className="relative grid gap-4 md:grid-cols-[0.9fr_1.1fr] md:items-start">
                    <TypingPreview />
                    <ApprovalPanel />
                  </div>
                </div>
              </SectionReveal>
            </div>
          </div>
        </section>

        {/* ── Dark product section ── */}
        <DarkProductSection />

        {/* ── Feature cards ── */}
        <section className="bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="What you get"
              title="A recovery engine for the moments contractors usually miss."
              description="Not an accounting suite. A focused tool for turning quiet money into a clear next step."
            />
            <StaggerReveal className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" delay={0.15} stagger={0.09}>
              {benefits.map((b) => (
                <FeatureCard key={b.title} icon={b.icon} title={b.title} description={b.description} />
              ))}
            </StaggerReveal>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <FinalCTASection />

        {/* ── Pricing ── */}
        <PricingSection />

        {/* ── FAQ ── */}
        <section className="bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <SectionHeading
              eyebrow="FAQ"
              title="Straight answers before you start."
              description="A few things contractors usually ask before trying the workflow."
            />
            <StaggerReveal className="mt-10 grid gap-3" delay={0.1} stagger={0.07}>
              {faqs.map((faq, i) => (
                <FAQItem key={faq.question} faq={faq} delay={i * 0.04} />
              ))}
            </StaggerReveal>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="bg-zinc-950 px-4 py-12 text-white sm:px-6 lg:px-8">
          <StaggerReveal className="mx-auto flex max-w-7xl flex-col gap-8 lg:flex-row lg:items-center lg:justify-between" delay={0.1} stagger={0.12}>
            <SectionReveal inGroup pattern="fade-left">
              <div>
                <div className="flex items-center gap-3">
                  <LogoMark />
                  <span className="text-sm font-black tracking-tight">Revenue Recovery</span>
                </div>
                <h2 className="mt-5 max-w-xl text-3xl font-black tracking-tight">
                  Stop letting good jobs disappear after the estimate.
                </h2>
                <p className="mt-3 max-w-lg text-sm leading-6 text-zinc-400">
                  Find the follow-up. Review the draft. Send when it feels right.
                </p>
              </div>
            </SectionReveal>
            <SectionReveal inGroup pattern="fade-right">
              <div className="flex flex-col gap-3 sm:flex-row">
                <AppLink href="/signup" variant="light">Start finding missed follow-ups</AppLink>
                <AppLink href="/dashboard" variant="dark">View demo queue</AppLink>
              </div>
            </SectionReveal>
          </StaggerReveal>
          <div className="mx-auto mt-8 max-w-7xl border-t border-zinc-800 pt-6 text-xs text-zinc-500">
            &copy; {new Date().getFullYear()} Revenue Recovery. Built for contractors.
          </div>
        </footer>

      </main>
    </LazyMotion>
  )
}
