"use client"

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type RefObject,
} from "react"
import {
  m,
  useReducedMotion,
  useSpring,
  useMotionValue,
  useTransform,
  useInView,
  type MotionValue,
  type TargetAndTransition,
} from "motion/react"

export const EASE = [0.22, 1, 0.36, 1] as const
export const VIEWPORT = { once: true, margin: "-80px" }

// ─── Reduced-motion hook ─────────────────────────────────────────────────────

export function usePRM() {
  return useReducedMotion() ?? false
}

// ─── AnimatedNumber ───────────────────────────────────────────────────────────
// Counts up only when the element enters the viewport

export function AnimatedNumber({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
}: {
  value: number
  prefix?: string
  suffix?: string
  decimals?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: "-60px" })
  const [displayed, setDisplayed] = useState(0)
  const reduced = usePRM()

  useEffect(() => {
    if (!inView) return
    if (reduced) { setDisplayed(value); return }
    const duration = 1300
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplayed(parseFloat((eased * value).toFixed(decimals)))
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [inView, value, reduced, decimals])

  return (
    <span ref={ref}>
      {prefix}{displayed.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  )
}

// ─── MagneticButton ───────────────────────────────────────────────────────────
// Wraps children; pulls toward cursor on desktop only

export function MagneticButton({
  children,
  className = "",
  strength = 0.22,
}: {
  children: ReactNode
  className?: string
  strength?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, { stiffness: 220, damping: 22 })
  const sy = useSpring(y, { stiffness: 220, damping: 22 })
  const reduced = usePRM()
  const isMobile = useRef(false)

  useEffect(() => {
    isMobile.current = window.matchMedia("(pointer: coarse)").matches
  }, [])

  const onMove = useCallback(
    (e: React.MouseEvent) => {
      if (reduced || isMobile.current || !ref.current) return
      const r = ref.current.getBoundingClientRect()
      x.set((e.clientX - (r.left + r.width / 2)) * strength)
      y.set((e.clientY - (r.top + r.height / 2)) * strength)
    },
    [reduced, x, y, strength],
  )

  const onLeave = useCallback(() => { x.set(0); y.set(0) }, [x, y])

  return (
    <m.div
      ref={ref}
      style={reduced ? undefined : { x: sx, y: sy }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={className}
    >
      {children}
    </m.div>
  )
}

// ─── CursorSpotlight ─────────────────────────────────────────────────────────
// Renders a soft radial glow following cursor inside a card

export function CursorSpotlight({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
  const x = useMotionValue(-200)
  const y = useMotionValue(-200)
  const reduced = usePRM()

  useEffect(() => {
    const el = containerRef.current
    if (!el || reduced || window.matchMedia("(pointer: coarse)").matches) return
    const handler = (e: MouseEvent) => {
      const r = el.getBoundingClientRect()
      x.set(e.clientX - r.left)
      y.set(e.clientY - r.top)
    }
    el.addEventListener("mousemove", handler)
    return () => el.removeEventListener("mousemove", handler)
  }, [containerRef, x, y, reduced])

  if (reduced) return null

  return (
    <m.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      style={{
        background: `radial-gradient(180px circle at ${x}px ${y}px, rgba(22,163,74,0.08), transparent 70%)`,
      }}
    />
  )
}

// ─── SectionReveal ───────────────────────────────────────────────────────────
// Versatile reveal with distinct patterns per section

export type RevealPattern =
  | "fade-up"
  | "fade-left"
  | "fade-right"
  | "scatter"
  | "scale-in"

const INITIALS: Record<RevealPattern, TargetAndTransition> = {
  "fade-up":    { opacity: 0, y: 32 },
  "fade-left":  { opacity: 0, x: -40 },
  "fade-right": { opacity: 0, x: 40 },
  "scatter":    { opacity: 0, y: 24, rotate: 4, scale: 0.94 },
  "scale-in":   { opacity: 0, scale: 0.88 },
}
const FINAL: TargetAndTransition = { opacity: 1, y: 0, x: 0, rotate: 0, scale: 1 }

export function SectionReveal({
  children,
  className = "",
  pattern = "fade-up",
  delay = 0,
  inGroup = false,
}: {
  children: ReactNode
  className?: string
  pattern?: RevealPattern
  delay?: number
  inGroup?: boolean
}) {
  const reduced = usePRM()
  const initial: TargetAndTransition = reduced ? { opacity: 1 } : INITIALS[pattern]
  const transition = { duration: 0.72, ease: EASE, delay }

  if (inGroup) {
    return (
      <m.div
        className={className}
        variants={{ hidden: initial, visible: { ...FINAL, transition } }}
      >
        {children}
      </m.div>
    )
  }
  return (
    <m.div
      className={className}
      initial={reduced ? false : initial}
      whileInView={FINAL}
      viewport={VIEWPORT}
      transition={transition}
    >
      {children}
    </m.div>
  )
}

// ─── StaggerReveal ───────────────────────────────────────────────────────────
// Wraps children that each use SectionReveal inGroup

export function StaggerReveal({
  children,
  className = "",
  delay = 0,
  stagger = 0.09,
}: {
  children: ReactNode
  className?: string
  delay?: number
  stagger?: number
}) {
  const reduced = usePRM()
  return (
    <m.div
      className={className}
      initial={reduced ? false : "hidden"}
      whileInView="visible"
      viewport={VIEWPORT}
      variants={{
        hidden: {},
        visible: {
          transition: {
            delayChildren: reduced ? 0 : delay,
            staggerChildren: reduced ? 0 : stagger,
          },
        },
      }}
    >
      {children}
    </m.div>
  )
}

// ─── SectionBadge ────────────────────────────────────────────────────────────

export function SectionBadge({
  children,
  tone = "green",
}: {
  children: ReactNode
  tone?: "green" | "white" | "dark"
}) {
  const classes = {
    green:
      "border-green-200 bg-green-50 text-green-800 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset]",
    white:
      "border-white/75 bg-white/80 text-green-950 shadow-sm shadow-green-950/5 backdrop-blur",
    dark: "border-green-800 bg-green-950 text-green-100",
  }

  return (
    <m.span
      className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${classes[tone]}`}
      variants={{
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
      }}
    >
      {children}
    </m.span>
  )
}

// ─── FloatingBlobField ───────────────────────────────────────────────────────
// Signature visual: blobs drift at different depths, respond to scroll
// On mobile, count is reduced to 2

const BLOBS = [
  {
    top: "2%", left: "-14%", w: "38rem", h: "38rem",
    color: "bg-green-100/70",
    dur: 20, shift: -80, delay: 0,
    br: "62% 38% 54% 46% / 44% 62% 38% 56%",
    mobile: true,
  },
  {
    top: "38%", left: "-8%", w: "22rem", h: "22rem",
    color: "bg-green-200/40",
    dur: 15, shift: -40, delay: 2.5,
    br: "48% 52% 42% 58% / 60% 44% 56% 40%",
    mobile: false,
  },
  {
    top: "8%", right: "-10%", w: "28rem", h: "28rem",
    color: "bg-green-50/90",
    dur: 22, shift: -55, delay: 1,
    br: "54% 46% 62% 38% / 38% 56% 44% 62%",
    mobile: false,
  },
  {
    top: "60%", right: "0%", w: "16rem", h: "16rem",
    color: "bg-red-50/70",
    dur: 17, shift: -28, delay: 3.5,
    br: "40% 60% 48% 52% / 54% 40% 60% 46%",
    mobile: true,
  },
] as const

function BlobEl({
  blob,
  scrollYProgress,
}: {
  blob: (typeof BLOBS)[number]
  scrollYProgress: MotionValue<number>
}) {
  const reduced = usePRM()
  const rawY = useTransform(scrollYProgress, [0, 1], [0, blob.shift])
  const y = useSpring(rawY, { stiffness: 55, damping: 22 })

  const posStyle: React.CSSProperties = {
    top: blob.top,
    width: blob.w,
    height: blob.h,
    borderRadius: blob.br,
  }
  if ("left" in blob) posStyle.left = blob.left as string
  if ("right" in blob) posStyle.right = blob.right as string

  return (
    <m.div
      aria-hidden="true"
      className={`pointer-events-none absolute ${blob.color} ${blob.mobile ? "block" : "hidden sm:block"}`}
      style={{ ...posStyle, y: reduced ? 0 : y }}
      animate={
        reduced
          ? undefined
          : {
              borderRadius: [blob.br, "50% 50% 50% 50%", blob.br],
              x: [0, 14, -10, 0],
            }
      }
      transition={{
        duration: blob.dur,
        delay: blob.delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  )
}

export function FloatingBlobField({
  scrollYProgress,
}: {
  scrollYProgress: MotionValue<number>
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {BLOBS.map((blob, i) => (
        <BlobEl key={i} blob={blob} scrollYProgress={scrollYProgress} />
      ))}
    </div>
  )
}

// ─── AnimatedProgressBar ──────────────────────────────────────────────────────

export function AnimatedProgressBar({
  value,
  delay = 0,
  dark = false,
}: {
  value: number
  delay?: number
  dark?: boolean
}) {
  const reduced = usePRM()
  return (
    <div className={`h-1.5 overflow-hidden rounded-full ${dark ? "bg-green-800/50" : "bg-green-100"}`}>
      <m.div
        className={`h-full rounded-full ${dark ? "bg-green-400" : "bg-green-600"}`}
        initial={reduced ? false : { scaleX: 0, originX: 0 }}
        whileInView={{ scaleX: value / 100 }}
        viewport={VIEWPORT}
        transition={{ duration: 1.1, ease: EASE, delay }}
        style={reduced ? { width: `${value}%` } : { transformOrigin: "left" }}
      />
    </div>
  )
}

// ─── ScrollProgressBeam ───────────────────────────────────────────────────────
// A thin green line tracing progress through a section

export function ScrollProgressBeam({
  scrollYProgress,
}: {
  scrollYProgress: MotionValue<number>
}) {
  const reduced = usePRM()
  const scaleX = useSpring(scrollYProgress, { stiffness: 90, damping: 28 })

  if (reduced) return null

  return (
    <div
      aria-hidden="true"
      className="absolute -left-4 top-0 h-full w-0.5 overflow-hidden rounded-full bg-green-100 sm:-left-6"
    >
      <m.div
        className="w-full origin-top rounded-full bg-green-600"
        style={{ scaleY: scaleX, height: "100%" }}
      />
    </div>
  )
}
