"use client"

import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react"
import dynamic from "next/dynamic"
import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FileWarning,
  HardHat,
  HelpCircle,
  LayoutDashboard,
  ListOrdered,
  Receipt,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react"

const OceanScene = dynamic(
  () => import("@/components/dashboard/ocean-scene"),
  {
    ssr: false,
    loading: () => <div className="ef-ocean-scene" aria-hidden="true" />,
  }
)

type IconType = ComponentType<{ className?: string }>
type TabKey = "today" | "estimates" | "invoices"
type PillTone =
  | "overdue"
  | "due"
  | "paid"
  | "waiting"
  | "accepted"
  | "draft"
  | "followup"

const problems = [
  {
    title: "Quiet quotes",
    description:
      "A customer said they were interested, then the estimate disappeared under the next job.",
    icon: FileWarning,
    value: 6.2,
    prefix: "$",
    suffix: "k",
    decimals: 1,
    label: "waiting estimate",
  },
  {
    title: "Unpaid invoices",
    description:
      "The work is finished. The reminder still needs to be clear, polite, and actually sent.",
    icon: ClipboardCheck,
    value: 17,
    suffix: " days",
    label: "past due",
  },
  {
    title: "Past customers",
    description:
      "The easiest repeat work often comes from people who already trust the crew.",
    icon: UsersRound,
    value: 48,
    label: "ready to re-engage",
  },
]

const flowSteps = [
  {
    label: "Request",
    description: "Client submits via your link",
    icon: ClipboardList,
  },
  {
    label: "Estimate",
    description: "You send the quote",
    icon: FileText,
  },
  {
    label: "Approved",
    description: "Client accepts in the portal",
    icon: CheckCircle2,
  },
  {
    label: "Job done",
    description: "Work gets finished",
    icon: HardHat,
  },
  {
    label: "Paid",
    description: "Invoice clears",
    icon: Receipt,
  },
]

const tabs: Array<{ key: TabKey; label: string; icon: IconType }> = [
  { key: "today", label: "Today", icon: CalendarCheck2 },
  { key: "estimates", label: "Estimates", icon: FileText },
  { key: "invoices", label: "Invoices", icon: Receipt },
]

const sortRows = [
  {
    rank: 1,
    client: "Mason & Co.",
    detail: "INV-1031 - 21d overdue",
    amount: "$12,600",
    pill: "overdue",
    tone: "overdue" as const,
  },
  {
    rank: 2,
    client: "Harbor View HOA",
    detail: "EST-2211 - no reply",
    amount: "$8,300",
    pill: "follow up",
    tone: "due" as const,
  },
  {
    rank: 3,
    client: "Cedar Park Dental",
    detail: "Win-back - repeat work",
    amount: "$6,200",
    pill: "ready",
    tone: "followup" as const,
  },
  {
    rank: 4,
    client: "North Ridge Homes",
    detail: "INV-1048 - 7d overdue",
    amount: "$4,850",
    pill: "overdue",
    tone: "overdue" as const,
  },
]

const faqs = [
  {
    question: "Will this send texts without me approving them?",
    answer:
      "No. Euroflo drafts the message, but you decide what gets sent. You can edit, approve, skip, or leave it for later.",
  },
  {
    question: "Does it sound like a real contractor?",
    answer:
      "Yes. The copy is short, plain, and respectful. It is built for real customer conversations, not accounting jargon.",
  },
  {
    question: "Can I start without a full integration?",
    answer:
      "Yes. Start by tracking invoices, estimates, and clients in the workspace, then connect more tools as the workflow grows.",
  },
  {
    question: "Who is this for?",
    answer:
      "Small trade businesses and contractors who want a simple way to recover missed money without hiring an admin team.",
  },
]

const scatterStyles: CSSProperties[] = [
  { transform: "translate(-24px, 22px) rotate(-5deg)", opacity: 0.38 },
  { transform: "translate(18px, -16px) rotate(4deg)", opacity: 0.42 },
  { transform: "translate(-10px, -4px) rotate(-3deg)", opacity: 0.46 },
  { transform: "translate(24px, 18px) rotate(5deg)", opacity: 0.4 },
]

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  return reduced
}

function useSolidNav() {
  const [solid, setSolid] = useState(false)

  useEffect(() => {
    const update = () => setSolid(window.scrollY > 40)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [])

  return solid
}

function useRevealOnScroll(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduced) return

    root.classList.add("is-armed")

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add("is-in")
          observer.unobserve(entry.target)
        }
      },
      { threshold: 0.16 }
    )

    root.querySelectorAll(".ef-reveal").forEach((node) => observer.observe(node))

    return () => {
      observer.disconnect()
      root.classList.remove("is-armed")
    }
  }, [rootRef])
}

function useFlowProgress(ref: RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let frame = 0
    const update = () => {
      frame = 0
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight
      const next = (vh * 0.78 - rect.top) / (rect.height + vh * 0.5)
      setProgress(Math.max(0, Math.min(1, next)))
    }

    const requestUpdate = () => {
      if (frame) return
      frame = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener("scroll", requestUpdate, { passive: true })
    window.addEventListener("resize", requestUpdate)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener("scroll", requestUpdate)
      window.removeEventListener("resize", requestUpdate)
    }
  }, [ref])

  return progress
}

function CountUp({
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
  const [displayed, setDisplayed] = useState(0)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const node = ref.current
    if (!node) return

    if (reduced) {
      setDisplayed(value)
      return
    }

    let animationFrame = 0
    const run = () => {
      const started = performance.now()
      const duration = 1300

      const tick = (now: number) => {
        const p = Math.min((now - started) / duration, 1)
        const eased = 1 - Math.pow(1 - p, 3)
        setDisplayed(Number((value * eased).toFixed(decimals)))
        if (p < 1) animationFrame = window.requestAnimationFrame(tick)
      }

      animationFrame = window.requestAnimationFrame(tick)
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        run()
        observer.disconnect()
      },
      { threshold: 0.2 }
    )

    observer.observe(node)

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      observer.disconnect()
    }
  }, [decimals, reduced, value])

  return (
    <span ref={ref} className="ef-num">
      {prefix}
      {displayed.toLocaleString("en-CA", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  )
}

function CtaLink({
  href,
  children,
  variant = "accent",
  className = "",
}: {
  href: string
  children: ReactNode
  variant?: "accent" | "outline" | "dark" | "light"
  className?: string
}) {
  return (
    <Link href={href} className={`ef-btn ef-btn-${variant} ${className}`}>
      <span>{children}</span>
    </Link>
  )
}

function LogoLockup({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`ef-logo ${dark ? "ef-logo-dark" : ""}`}>
      <Image
        src="/images/euroflo-mark.svg"
        alt=""
        width={128}
        height={128}
        priority
      />
      <span>Euroflo</span>
    </div>
  )
}

function SectionHeading({
  icon: Icon,
  eyebrow,
  title,
  description,
}: {
  icon: IconType
  eyebrow: string
  title: string
  description?: string
}) {
  return (
    <div className="ef-section-head ef-reveal">
      <div className="ef-eyebrow">
        <Icon className="ef-icon-sm" />
        {eyebrow}
      </div>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  )
}

function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return <span className={`ef-pill ef-pill-${tone}`}>{children}</span>
}

function ProgressBar({ value, dark = false }: { value: number; dark?: boolean }) {
  return (
    <div className={`ef-progress ${dark ? "ef-progress-dark" : ""}`}>
      <span style={{ width: `${value}%` }} />
    </div>
  )
}

function ProblemCard({
  item,
  delay,
}: {
  item: (typeof problems)[number]
  delay: string
}) {
  const Icon = item.icon

  return (
    <article className="ef-problem-card ef-reveal" style={{ transitionDelay: delay }}>
      <div className="ef-card-blob" />
      <div className="ef-problem-top">
        <div className="ef-card-icon">
          <Icon className="ef-icon-md" />
        </div>
        <div className="ef-problem-metric">
          <div className="ef-problem-value">
            <CountUp
              value={item.value}
              prefix={item.prefix}
              suffix={item.suffix}
              decimals={item.decimals}
            />
          </div>
          <div>{item.label}</div>
        </div>
      </div>
      <h3>{item.title}</h3>
      <p>{item.description}</p>
    </article>
  )
}

function HeroPreview() {
  return (
    <div className="ef-preview-wrap ef-reveal">
      <div className="ef-float-chip ef-float-1">
        <span className="ef-dot ef-dot-overdue" />
        <span>
          <strong>INV-1048</strong> <small>- 7d overdue</small>
        </span>
      </div>
      <div className="ef-float-chip ef-float-2">
        <span className="ef-dot ef-dot-paid" />
        <span>
          <strong>Paid</strong> <small>- $9,100</small>
        </span>
      </div>
      <div className="ef-float-chip ef-float-3">
        <span className="ef-dot ef-dot-due" />
        <span>
          <strong>EST-2211</strong> <small>- follow up</small>
        </span>
      </div>

      <div className="ef-preview-card">
        <div className="ef-preview-head">
          <div>
            <div className="ef-preview-title">Recovery queue</div>
            <div className="ef-preview-sub">Ranked by urgency and value</div>
          </div>
          <span className="ef-preview-chip">
            <span className="ef-live ef-live-paid" />
            <CountUp value={18420} prefix="$" /> this month
          </span>
        </div>
        {[
          ["#1", "Mason & Co.", "Invoice INV-1031 - 21d overdue", "$12,600", 91],
          ["#2", "Harbor View HOA", "Estimate EST-2211 - no reply", "$8,300", 64],
          ["#3", "North Ridge Homes", "Invoice INV-1048 - 7d overdue", "$4,850", 82],
        ].map(([rank, name, detail, amount, progress]) => (
          <div className="ef-preview-row" key={rank as string}>
            <span className="ef-rank">{rank}</span>
            <div>
              <div className="ef-row-name">{name}</div>
              <div className="ef-row-sub">{detail}</div>
              <ProgressBar value={progress as number} />
            </div>
            <span className="ef-row-amount">{amount}</span>
          </div>
        ))}
        <div className="ef-draft-card">
          <div className="ef-draft-icon">
            <Sparkles className="ef-icon-sm" />
          </div>
          <div>
            <div className="ef-draft-title">
              Follow-up drafted, ready for review
            </div>
            <div className="ef-draft-copy">
              &quot;Hi Sam, quick reminder on invoice INV-1048...&quot;
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function HeroSection() {
  return (
    <section className="ef-hero" id="top" data-screen-label="Hero">
      <div className="ef-ocean-scene" aria-hidden="true">
        <OceanScene />
      </div>
      <div className="ef-hero-veil" aria-hidden="true" />
      <div className="ef-hero-dots" aria-hidden="true" />

      <div className="ef-wrap ef-hero-grid">
        <div className="ef-hero-copy ef-reveal">
          <span className="ef-eyebrow-chip">
            <span className="ef-live" />
            Built for trades owners
          </span>
          <h1>
            Turn quiet quotes and unpaid invoices into{" "}
            <span>a job that flows.</span>
          </h1>
          <p>
            Euroflo shows which clients need a follow-up, drafts the message,
            and keeps every estimate and invoice moving without you chasing
            people from memory.
          </p>
          <div className="ef-hero-cta">
            <CtaLink href="/signup">
              <Search className="ef-icon-sm" />
              Find missed follow-ups
            </CtaLink>
            <CtaLink href="/dashboard" variant="outline">
              View demo queue
            </CtaLink>
          </div>
          <div className="ef-trust-row">
            <span>
              <CheckCircle2 className="ef-icon-sm" />
              Nothing sent without your approval
            </span>
            <span>
              <CheckCircle2 className="ef-icon-sm" />
              Plain-English follow-ups
            </span>
          </div>
        </div>

        <HeroPreview />
      </div>

      <div className="ef-hero-waves" aria-hidden="true">
        <div className="ef-wave ef-wave-a" />
        <div className="ef-wave ef-wave-b" />
        <div className="ef-wave ef-wave-c" />
      </div>
      <svg
        className="ef-hero-divider"
        viewBox="0 0 1440 110"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M0,58 C240,108 480,14 720,40 C960,66 1200,112 1440,52 L1440,110 L0,110 Z" />
      </svg>
    </section>
  )
}

function ProblemSection() {
  return (
    <section className="ef-section ef-section-tint ef-after-hero">
      <div className="ef-wrap">
        <SectionHeading
          icon={Sparkles}
          eyebrow="The work is done"
          title="The money is still scattered across texts, quotes, and old customers."
          description="Euroflo turns scattered follow-up into a clear daily list, so the next action is always obvious."
        />
        <div className="ef-problem-grid">
          {problems.map((problem, index) => (
            <ProblemCard
              key={problem.title}
              item={problem}
              delay={`${index * 0.08}s`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function FlowBand() {
  const ref = useRef<HTMLElement>(null)
  const progress = useFlowProgress(ref)
  const activeCount = Math.min(
    flowSteps.length,
    Math.max(0, Math.ceil(progress * flowSteps.length))
  )

  return (
    <section
      ref={ref}
      className="ef-flowband"
      id="flow"
      style={{ "--flow-progress": `${progress * 100}%` } as CSSProperties}
    >
      <div className="ef-flow-glow" aria-hidden="true" />
      <div className="ef-wrap">
        <h2 className="ef-reveal">
          Every step in order. Nothing falls through the cracks.
        </h2>
        <p className="ef-flow-sub ef-reveal">
          From the first request to the final payment, Euroflo keeps the whole
          job moving downstream and tells you the moment something stalls.
        </p>
        <div className="ef-flow">
          <div className="ef-flow-track">
            <div />
          </div>
          {flowSteps.map((step, index) => {
            const Icon = step.icon
            return (
              <div
                className={`ef-flow-step ${index < activeCount ? "is-on" : ""}`}
                key={step.label}
              >
                <div className="ef-flow-node">
                  <Icon className="ef-icon-lg" />
                </div>
                <div className="ef-flow-label">{step.label}</div>
                <div className="ef-flow-desc">{step.description}</div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function TodayPanel() {
  const [sent, setSent] = useState(false)
  const rows: Array<{
    client: string
    detail: string
    amount: string
    status: string
    tone: PillTone
    icon: IconType
  }> = [
    {
      client: "Mason & Co.",
      detail: "Invoice INV-1031 - 21 days overdue",
      amount: "$12,600",
      status: "21d overdue",
      tone: "overdue",
      icon: FileText,
    },
    {
      client: "Harbor View HOA",
      detail: "Estimate EST-2211 - follow-up due",
      amount: "$8,300",
      status: "due today",
      tone: "due",
      icon: ClipboardList,
    },
    {
      client: "North Ridge Homes",
      detail: "Invoice INV-1048 - 7 days overdue",
      amount: "$4,850",
      status: "7d overdue",
      tone: "overdue",
      icon: FileText,
    },
  ]

  return (
    <div className="ef-panel">
      <div className="ef-panel-head">
        <div>
          <h4>Today</h4>
          <p>
            3 things need action - <span className="ef-num">$25,750</span> at
            risk
          </p>
        </div>
        <Pill tone="overdue">2 overdue</Pill>
      </div>

      {rows.map((row) => {
        const RowIcon = row.icon
        return (
          <div
            className={`ef-queue-card ef-queue-${row.tone}`}
            key={row.client}
          >
            <div className="ef-queue-icon">
              <RowIcon className="ef-icon-sm" />
            </div>
            <div>
              <div className="ef-queue-name">{row.client}</div>
              <div className="ef-queue-sub">{row.detail}</div>
            </div>
            <div className="ef-queue-amount">{row.amount}</div>
            <Pill tone={row.tone}>{row.status}</Pill>
          </div>
        )
      })}

      <div className={`ef-approve-card ${sent ? "is-sent" : ""}`}>
        <div className="ef-draft-icon">
          {sent ? <Check className="ef-icon-sm" /> : <Sparkles className="ef-icon-sm" />}
        </div>
        <div>
          <div className="ef-draft-title">
            {sent
              ? "Follow-up sent to North Ridge Homes"
              : "Follow-up drafted for North Ridge Homes"}
          </div>
          <div className="ef-draft-copy">
            {sent
              ? "We'll check back in 5 days. Nothing else to do."
              : '"Hi Sam, quick follow-up on invoice INV-1048 for $4,850..."'}
          </div>
        </div>
        <button
          type="button"
          className={`ef-approve-btn ${sent ? "is-done" : ""}`}
          onClick={() => setSent(true)}
          disabled={sent}
        >
          {sent ? <Check className="ef-icon-xs" /> : <Send className="ef-icon-xs" />}
          {sent ? "Sent" : "Approve & send"}
        </button>
      </div>
    </div>
  )
}

function EstimatesPanel() {
  const rows = [
    ["EST-2211", "Harbor View HOA", "May 18", "$8,300", "Follow-up due", "due"],
    ["EST-2188", "Lakeside Cafe", "May 09", "$3,400", "No reply", "followup"],
    ["EST-2150", "Birch & Vine Bakery", "May 02", "$2,100", "Follow-up sent", "waiting"],
    ["EST-2205", "Summit Builders", "May 20", "$11,800", "Accepted", "accepted"],
    ["EST-2199", "Riverside Clinic", "May 15", "$7,600", "Draft", "draft"],
  ]

  return (
    <div className="ef-panel">
      <div className="ef-panel-head">
        <div>
          <h4>Estimates</h4>
          <p>
            5 active - <span className="ef-num">$33,200</span> in the pipeline
          </p>
        </div>
        <Pill tone="accepted">1 accepted</Pill>
      </div>
      <DataTable
        columns={["Ref", "Client", "Sent", "Amount", "Status"]}
        rows={rows}
      />
    </div>
  )
}

function InvoicesPanel() {
  const rows = [
    ["INV-1031", "Mason & Co.", "May 03", "$12,600", "Overdue", "overdue"],
    ["INV-1048", "North Ridge Homes", "May 17", "$4,850", "Overdue", "overdue"],
    ["INV-1019", "Glenwood Property Mgmt", "May 24", "$5,200", "Follow-up sent", "waiting"],
    ["INV-1052", "Cedar Park Dental", "Jun 04", "$6,200", "Due soon", "due"],
    ["INV-1044", "Summit Builders", "May 30", "$9,100", "Paid", "paid"],
  ]

  return (
    <div className="ef-panel">
      <div className="ef-panel-head">
        <div>
          <h4>Invoices</h4>
          <p>Outstanding, overdue, and paid</p>
        </div>
      </div>
      <div className="ef-stat-grid">
        <div className="ef-stat-tile">
          <span>Outstanding</span>
          <strong className="ef-num">$22,650</strong>
        </div>
        <div className="ef-stat-tile ef-stat-overdue">
          <span>Overdue</span>
          <strong className="ef-num">$17,450</strong>
        </div>
        <div className="ef-stat-tile ef-stat-paid">
          <span>Paid this month</span>
          <strong className="ef-num">$24,500</strong>
        </div>
      </div>
      <DataTable
        columns={["Ref", "Client", "Due", "Amount", "Status"]}
        rows={rows}
      />
    </div>
  )
}

function DataTable({
  columns,
  rows,
}: {
  columns: string[]
  rows: string[][]
}) {
  return (
    <div className="ef-table-wrap">
      <table className="ef-table">
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th
                key={column}
                className={index >= columns.length - 2 ? "is-right" : ""}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              <td className="ef-ref">{row[0]}</td>
              <td className="ef-client">{row[1]}</td>
              <td>{row[2]}</td>
              <td className="is-right ef-num">{row[3]}</td>
              <td className="is-right">
                <Pill tone={row[5] as PillTone}>{row[4]}</Pill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProductShowcase() {
  const [activeTab, setActiveTab] = useState<TabKey>("today")
  const sideItems: Array<{
    key: TabKey | "clients" | "recovery"
    label: string
    icon: IconType
  }> = [
    { key: "today", label: "Today", icon: CalendarCheck2 },
    { key: "estimates", label: "Estimates", icon: FileText },
    { key: "invoices", label: "Invoices", icon: Receipt },
    { key: "clients", label: "Clients", icon: UsersRound },
    { key: "recovery", label: "Recovery", icon: RotateCcw },
  ]

  return (
    <section className="ef-section ef-showcase" id="product">
      <div className="ef-wrap">
        <SectionHeading
          icon={LayoutDashboard}
          eyebrow="Inside the workspace"
          title="One calm place to run the whole job."
          description="What needs doing today, the estimates you've sent, the invoices you're owed, and a follow-up drafted for every one. Nothing sends without your approval."
        />

        <div className="ef-tab-wrap ef-reveal">
          <div className="ef-tabbar" role="tablist" aria-label="Product preview">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  type="button"
                  className={`ef-tab ${activeTab === tab.key ? "is-active" : ""}`}
                  onClick={() => setActiveTab(tab.key)}
                  role="tab"
                  aria-selected={activeTab === tab.key}
                >
                  <Icon className="ef-icon-sm" />
                  {tab.label}
                </button>
              )
            })}
          </div>

          <div className="ef-app-frame">
            <div className="ef-app-bar">
              <span className="ef-window-dot ef-red" />
              <span className="ef-window-dot ef-yellow" />
              <span className="ef-window-dot ef-green" />
              <span>app.euroflo.com - Tidewater Renovations</span>
            </div>
            <div className="ef-app-body">
              <aside className="ef-app-side">
                <LogoLockup />
                {sideItems.map((item) => {
                  const SideIcon = item.icon
                  return (
                    <div
                      className={`ef-side-item ${activeTab === item.key ? "is-active" : ""}`}
                      key={item.key}
                    >
                      <SideIcon className="ef-icon-sm" />
                      {item.label}
                    </div>
                  )
                })}
                <div className="ef-side-note">
                  <div>
                    <ShieldCheck className="ef-icon-sm" />
                    You stay in control
                  </div>
                  <p>
                    Every follow-up is drafted for your review. Nothing sends
                    without your approval.
                  </p>
                </div>
              </aside>
              <div className="ef-app-main">
                {activeTab === "today" ? <TodayPanel /> : null}
                {activeTab === "estimates" ? <EstimatesPanel /> : null}
                {activeTab === "invoices" ? <InvoicesPanel /> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function RankedQueueSection() {
  const [sorted, setSorted] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setSorted(true), 450)
    return () => window.clearTimeout(timer)
  }, [])

  const resort = () => {
    setSorted(false)
    window.setTimeout(() => setSorted(true), 280)
  }

  return (
    <section className="ef-section ef-section-tint">
      <div className="ef-wrap ef-sort-grid">
        <div className="ef-sort-copy ef-reveal">
          <div className="ef-eyebrow ef-eyebrow-left">
            <ListOrdered className="ef-icon-sm" />
            Always ranked
          </div>
          <h2>Scattered follow-ups, sorted into one clear order.</h2>
          <p>
            Overdue invoices, quiet estimates, and win-backs land in a single
            queue ranked by what is most worth your time right now. You skip the
            spreadsheet and the mental math.
          </p>
          <button type="button" className="ef-sort-btn" onClick={resort}>
            <RotateCcw className="ef-icon-sm" />
            Re-sort the queue
          </button>
        </div>

        <div className="ef-sort-stage ef-reveal">
          <div className={`ef-sort-list ${sorted ? "is-sorted" : ""}`}>
            {sortRows.map((row, index) => (
              <div
                className="ef-sort-card"
                key={row.client}
                style={sorted ? undefined : scatterStyles[index]}
              >
                <span className="ef-sort-rank">{row.rank}</span>
                <div>
                  <div className="ef-sort-name">{row.client}</div>
                  <div className="ef-sort-sub">{row.detail}</div>
                </div>
                <Pill tone={row.tone}>{row.pill}</Pill>
                <strong className="ef-sort-amount ef-num">{row.amount}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function PricingSection() {
  return (
    <section className="ef-price-band" id="pricing">
      <div className="ef-wrap ef-price-grid">
        <div className="ef-price-copy ef-reveal">
          <div className="ef-eyebrow ef-eyebrow-left">
            <CircleDollarSign className="ef-icon-sm" />
            Simple pricing
          </div>
          <h2>Start free. Pay only when you get paid.</h2>
          <p>
            The Free plan has everything you need to send estimates, invoice,
            and chase what you&apos;re owed — for a 5% card fee (capped at $50
            per transaction) only when a client pays you online. Recording
            e-transfer, cash, or cheque payments is always free.
          </p>
          <div className="ef-mini-row">
            <span>
              <i />
              Free: $0/mo · 5% card fee, capped at $50
            </span>
            <span>
              <i />
              Pro: $49/mo · 2% card fee, capped at $25
            </span>
          </div>
        </div>

        <div className="ef-price-card ef-reveal">
          <div className="ef-price-top">
            <div>
              <h3>Pro</h3>
              <p>
                Lower fees, better follow-ups, branded estimates, and deposit
                control.
              </p>
            </div>
            <span>$0 to start</span>
          </div>
          <div className="ef-price">
            <strong className="ef-num">$49</strong>
            <span>per month</span>
          </div>
          <div className="ef-price-list">
            {[
              "2% card fee capped at $25 (Free: 5% capped at $50)",
              "Your branding on estimates and invoices",
              "Custom deposit amounts on estimates",
              "Follow-up tone presets for drafted messages",
              "Cancel any time",
            ].map((item) => (
              <div key={item}>
                <CheckCircle2 className="ef-icon-sm" />
                {item}
              </div>
            ))}
          </div>
          <CtaLink href="/signup" className="ef-full-btn">
            Start free
          </CtaLink>
          <p className="ef-price-note">No credit card required. Upgrade to Pro any time.</p>
        </div>
      </div>
    </section>
  )
}

function FaqSection() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section className="ef-section ef-section-tint">
      <div className="ef-wrap">
        <SectionHeading
          icon={HelpCircle}
          eyebrow="Questions"
          title="The straight answers."
        />
        <div className="ef-faq">
          {faqs.map((faq, index) => {
            const isOpen = open === index
            return (
              <div className={`ef-faq-item ef-reveal ${isOpen ? "is-open" : ""}`} key={faq.question}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : index)}
                  aria-expanded={isOpen}
                >
                  {faq.question}
                  <ChevronDown className="ef-icon-md" />
                </button>
                <div className="ef-faq-answer" aria-hidden={!isOpen}>
                  <p>{faq.answer}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function FinalCtaSection() {
  return (
    <section className="ef-final">
      <div className="ef-wrap">
        <h2 className="ef-reveal">
          Stop letting good jobs disappear <span>after the estimate.</span>
        </h2>
        <p className="ef-reveal">
          Euroflo shows which clients need a follow-up, drafts the message, and
          keeps every invoice and estimate moving.
        </p>
        <div className="ef-final-cta ef-reveal">
          <CtaLink href="/signup">
            <ArrowRight className="ef-icon-sm" />
            Start finding missed follow-ups
          </CtaLink>
          <CtaLink href="/dashboard" variant="dark">
            View demo queue
          </CtaLink>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="ef-footer">
      <div className="ef-wrap">
        <div className="ef-footer-row">
          <LogoLockup dark />
          <div className="ef-footer-links">
            <a href="#flow">How it flows</a>
            <a href="#pricing">Pricing</a>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/client/dashboard">Client portal</Link>
          </div>
        </div>
        <div className="ef-footer-copy">
          A job that flows the way it should. Euroflo. Default currency CAD.
        </div>
      </div>
    </footer>
  )
}

export function LandingPage() {
  const mainRef = useRef<HTMLElement>(null)
  const solidNav = useSolidNav()
  useRevealOnScroll(mainRef)

  return (
    <main ref={mainRef} className="ef-landing force-light">
      <header className={`ef-nav ${solidNav ? "is-solid" : ""}`}>
        <div className="ef-wrap ef-nav-row">
          <Link href="/" aria-label="Euroflo home">
            <LogoLockup />
          </Link>
          <nav className="ef-nav-actions" aria-label="Primary">
            <a href="#flow">How it flows</a>
            <a href="#product">Product</a>
            <a href="#pricing">Pricing</a>
            <CtaLink href="/signup" className="ef-nav-cta">
              <ArrowRight className="ef-icon-xs" />
              Get started free
            </CtaLink>
          </nav>
        </div>
      </header>

      <HeroSection />
      <ProblemSection />
      <FlowBand />
      <ProductShowcase />
      <RankedQueueSection />
      <PricingSection />
      <FaqSection />
      <FinalCtaSection />
      <Footer />
    </main>
  )
}
