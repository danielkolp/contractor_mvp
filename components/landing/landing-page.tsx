"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  FileWarning,
  HardHat,
  MessageSquareText,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  UsersRound,
} from "lucide-react"
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

gsap.registerPlugin(ScrollTrigger)

const problems = [
  {
    title: "Estimates go unanswered",
    description:
      "You send a quote and never hear back. A quick follow-up text could turn it into a job.",
    icon: FileWarning,
  },
  {
    title: "Invoices slip past due",
    description:
      "Jobs pile up. A few unpaid balances get buried in texts, calls, and new work.",
    icon: MessageSquareText,
  },
  {
    title: "Past customers go quiet",
    description:
      "People who hired you once are your best source of new work — but only if you stay on their radar.",
    icon: Clock3,
  },
]

const steps = [
  {
    number: "01",
    title: "Find the money sitting there",
    description:
      "See unfollowed estimates, overdue invoices, and dormant past customers in one clear list.",
  },
  {
    number: "02",
    title: "Review the draft message",
    description:
      "The AI writes a plain-English text for each opportunity. You read it, adjust it if you want, and decide.",
  },
  {
    number: "03",
    title: "Approve and send",
    description:
      "Nothing goes out without your approval. One tap to send. You stay in control the whole time.",
  },
]

const benefits = [
  {
    title: "Follow up on estimates",
    description:
      "Quotes that went quiet can still become jobs. A short text at the right time is all it takes.",
    icon: ReceiptText,
  },
  {
    title: "Chase overdue invoices",
    description:
      "Friendly reminders drafted for you, so you never have to awkwardly ask for money yourself.",
    icon: ClipboardCheck,
  },
  {
    title: "Win back past customers",
    description:
      "Re-engage clients who hired you before. They already trust your work.",
    icon: UsersRound,
  },
  {
    title: "Protect your cash flow",
    description:
      "See which unpaid balances are oldest and highest, so you know where to focus first.",
    icon: ShieldCheck,
  },
]

const dashboardRows = [
  {
    client: "North Ridge Homes",
    invoice: "INV-1048",
    amount: "$4,850",
    status: "7 days overdue",
    tone: "warning" as const,
  },
  {
    client: "Harbor View HOA",
    invoice: "INV-1042",
    amount: "$8,300",
    status: "Follow-up ready",
    tone: "default" as const,
  },
  {
    client: "Mason & Co.",
    invoice: "INV-1037",
    amount: "$12,600",
    status: "Draft ready",
    tone: "warning" as const,
  },
]

const faqs = [
  {
    question: "Will it send messages automatically without me seeing them?",
    answer:
      "No. Every message is drafted for your review first. You read it, approve it, and send it. Nothing goes to your customers without your explicit sign-off.",
  },
  {
    question: "What kind of messages does it write?",
    answer:
      "Plain, professional texts that sound like you — not robotic or corporate. A friendly invoice reminder, a quick check-in on an estimate, or a short note to a past customer.",
  },
  {
    question: "Do I need to connect any software right away?",
    answer:
      "No. You can start with simple invoice and client tracking and add integrations later. It works out of the box.",
  },
  {
    question: "Is this built for contractors or accounting teams?",
    answer:
      "Built for contractors first. The language, workflow, and dashboard focus on getting paid without needing a complicated finance setup.",
  },
]

function StatusPill({
  tone,
  children,
}: {
  tone: "warning" | "default"
  children: React.ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        tone === "warning"
          ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
          : "bg-green-50 text-green-700 ring-1 ring-green-200"
      }`}
    >
      {children}
    </span>
  )
}

function DashboardPreview({ compact = false }: { compact?: boolean }) {
  return (
    <Card className="w-full overflow-hidden border-zinc-200 shadow-2xl shadow-zinc-200/60">
      <div className="border-b border-border bg-zinc-50 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">
              Revenue at risk
            </div>
            <div className="text-xs text-muted-foreground">Your dashboard</div>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 ring-1 ring-green-200">
            <TrendingUp className="size-3" />
            $18,420 recovered this month
          </span>
        </div>
      </div>
      <CardContent className="grid gap-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
            <CircleDollarSign className="size-4 text-green-700" />
            <div className="mt-3 text-2xl font-semibold tracking-tight">
              $24.8k
            </div>
            <div className="text-xs text-muted-foreground">At risk this week</div>
          </div>
          <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
            <Clock3 className="size-4 text-amber-600" />
            <div className="mt-3 text-2xl font-semibold tracking-tight">14</div>
            <div className="text-xs text-muted-foreground">
              Average days late
            </div>
          </div>
          <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
            <TrendingUp className="size-4 text-emerald-600" />
            <div className="mt-3 text-2xl font-semibold tracking-tight">11</div>
            <div className="text-xs text-muted-foreground">
              Follow-ups sent
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-sm font-medium">Needs a follow-up</div>
            <div className="text-xs text-muted-foreground">3 invoices</div>
          </div>
          <div className="divide-y divide-border">
            {dashboardRows.map((row) => (
              <div
                key={row.invoice}
                className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{row.client}</div>
                  <div className="text-xs text-muted-foreground">{row.invoice}</div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                  <div className="text-sm font-semibold">{row.amount}</div>
                  <StatusPill tone={row.tone}>{row.status}</StatusPill>
                </div>
              </div>
            ))}
          </div>
        </div>

        {!compact && (
          <div className="rounded-xl border border-green-100 bg-green-50 p-4 text-green-950">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium">Follow-up progress</div>
              <div className="text-xs text-green-700">78%</div>
            </div>
            <Progress value={78} className="bg-green-100 [&>div]:bg-green-600" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TrustBadge() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
      <ShieldCheck className="size-4 shrink-0" />
      <span>You stay in control. Nothing is sent without your approval.</span>
    </div>
  )
}

export function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null)
  const problemRef = useRef<HTMLElement>(null)
  const stepsRef = useRef<HTMLElement>(null)
  const previewRef = useRef<HTMLElement>(null)
  const benefitsRef = useRef<HTMLElement>(null)
  const faqRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const mm = gsap.matchMedia()

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const ctx = gsap.context(() => {
        // Hero entrance
        const heroEls = heroRef.current?.querySelectorAll("[data-hero]")
        if (heroEls) {
          gsap.fromTo(
            heroEls,
            { opacity: 0, y: 28 },
            {
              opacity: 1,
              y: 0,
              duration: 0.7,
              stagger: 0.12,
              ease: "power2.out",
            }
          )
        }

        // Problem cards
        if (problemRef.current) {
          const cards = problemRef.current.querySelectorAll("[data-animate-card]")
          gsap.fromTo(
            cards,
            { opacity: 0, y: 32 },
            {
              opacity: 1,
              y: 0,
              duration: 0.6,
              stagger: 0.1,
              ease: "power2.out",
              scrollTrigger: {
                trigger: problemRef.current,
                start: "top 82%",
              },
            }
          )
        }

        // Steps
        if (stepsRef.current) {
          const steps = stepsRef.current.querySelectorAll("[data-animate-card]")
          gsap.fromTo(
            steps,
            { opacity: 0, y: 32 },
            {
              opacity: 1,
              y: 0,
              duration: 0.6,
              stagger: 0.12,
              ease: "power2.out",
              scrollTrigger: {
                trigger: stepsRef.current,
                start: "top 82%",
              },
            }
          )
        }

        // Preview section
        if (previewRef.current) {
          gsap.fromTo(
            previewRef.current.querySelectorAll("[data-animate-fade]"),
            { opacity: 0, y: 24 },
            {
              opacity: 1,
              y: 0,
              duration: 0.65,
              stagger: 0.1,
              ease: "power2.out",
              scrollTrigger: {
                trigger: previewRef.current,
                start: "top 80%",
              },
            }
          )
        }

        // Benefits
        if (benefitsRef.current) {
          const cards = benefitsRef.current.querySelectorAll("[data-animate-card]")
          gsap.fromTo(
            cards,
            { opacity: 0, y: 28 },
            {
              opacity: 1,
              y: 0,
              duration: 0.55,
              stagger: 0.09,
              ease: "power2.out",
              scrollTrigger: {
                trigger: benefitsRef.current,
                start: "top 82%",
              },
            }
          )
        }

        // FAQ
        if (faqRef.current) {
          const items = faqRef.current.querySelectorAll("[data-animate-card]")
          gsap.fromTo(
            items,
            { opacity: 0, y: 20 },
            {
              opacity: 1,
              y: 0,
              duration: 0.5,
              stagger: 0.08,
              ease: "power2.out",
              scrollTrigger: {
                trigger: faqRef.current,
                start: "top 85%",
              },
            }
          )
        }
      })

      return () => ctx.revert()
    })

    return () => mm.revert()
  }, [])

  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-green-700 text-sm font-bold text-white">
              RR
            </div>
            <span className="truncate text-sm font-semibold tracking-tight">
              Revenue Recovery
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
            >
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-green-700 hover:bg-green-800 text-white"
            >
              <Link href="/signup">Get started free</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-white">
        <div
          ref={heroRef}
          className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-24"
        >
          <div className="flex min-w-0 flex-col justify-center">
            <div data-hero>
              <Badge
                variant="outline"
                className="w-fit gap-1.5 border-green-200 bg-green-50 text-green-800"
              >
                <HardHat className="size-3.5" />
                Built for contractors
              </Badge>
            </div>

            <h1
              data-hero
              className="mt-5 max-w-2xl text-3xl font-semibold tracking-tight text-zinc-950 sm:text-5xl lg:leading-[1.1]"
            >
              Recover revenue that slipped through the cracks.
            </h1>

            <p
              data-hero
              className="mt-5 max-w-xl text-base leading-7 text-zinc-600 sm:text-lg"
            >
              Follow up on estimates, invoices, and past customers — without
              doing it yourself. The AI drafts plain-English texts. You approve
              what gets sent.
            </p>

            <div data-hero className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-11 w-full bg-green-700 hover:bg-green-800 text-white sm:w-auto"
              >
                <Link href="/signup">
                  Start finding missed money
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-11 w-full sm:w-auto"
              >
                <Link href="/dashboard">See how it works</Link>
              </Button>
            </div>

            <div data-hero className="mt-6">
              <TrustBadge />
            </div>

            <div
              data-hero
              className="mt-6 grid gap-3 text-sm text-zinc-600 sm:grid-cols-3"
            >
              {[
                "No finance jargon",
                "Approve before it sends",
                "Built for trades owners",
              ].map((point) => (
                <div key={point} className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0 text-green-600" />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </div>

          <div data-hero className="relative min-w-0">
            <DashboardPreview />
          </div>
        </div>
      </section>

      {/* Problem */}
      <section
        ref={problemRef}
        className="border-y border-border bg-zinc-50 px-4 py-16 sm:px-6 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <Badge
              variant="outline"
              className="mb-4 border-amber-200 bg-amber-50 text-amber-800"
            >
              The problem
            </Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              Most contractors leave money on the table without realizing it.
            </h2>
            <p className="mt-4 text-base leading-7 text-zinc-600">
              It is not laziness — it is just that there are a hundred things
              happening at once and follow-up falls through.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {problems.map((item) => {
              const Icon = item.icon
              return (
                <Card
                  key={item.title}
                  data-animate-card
                  className="border-zinc-200 bg-white shadow-sm"
                >
                  <CardHeader>
                    <div className="mb-3 grid size-10 place-items-center rounded-lg bg-amber-50 text-amber-700">
                      <Icon className="size-5" />
                    </div>
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <CardDescription className="leading-6">
                      {item.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        ref={stepsRef}
        id="how-it-works"
        className="bg-white px-4 py-16 sm:px-6 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <Badge
              variant="outline"
              className="mb-4 border-green-200 bg-green-50 text-green-800"
            >
              How it works
            </Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              Find missed money. Review the message. Send the follow-up.
            </h2>
            <p className="mt-4 text-base leading-7 text-zinc-600">
              Three steps. No complicated setup. No chasing things yourself.
            </p>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {steps.map((step) => (
              <Card
                key={step.number}
                data-animate-card
                className="border-zinc-200 bg-white shadow-sm"
              >
                <CardHeader>
                  <div className="mb-3 inline-flex size-9 items-center justify-center rounded-lg bg-green-700 text-sm font-bold text-white">
                    {step.number}
                  </div>
                  <CardTitle className="text-base">{step.title}</CardTitle>
                  <CardDescription className="leading-6">
                    {step.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>

          {/* Trust callout */}
          <div className="mt-8 rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
            <ShieldCheck className="mx-auto size-6 text-green-700" />
            <p className="mt-3 text-sm font-medium text-green-900">
              Plain-language follow-ups your customers will actually read.
              <br />
              <span className="font-normal text-green-800">
                Built for busy contractors who do not have time to chase every
                lead.
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* Dashboard preview */}
      <section
        ref={previewRef}
        className="border-y border-border bg-zinc-50 px-4 py-16 sm:px-6 lg:px-8"
      >
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div className="min-w-0" data-animate-fade>
            <Badge
              variant="outline"
              className="mb-4 border-green-200 bg-green-50 text-green-800"
            >
              Dashboard preview
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              See overdue money and who to contact — right when you open it.
            </h2>
            <p className="mt-4 text-base leading-7 text-zinc-600">
              Designed for quick checks between job sites. Open it, see what
              needs attention, and act with one tap.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                className="w-full bg-green-700 hover:bg-green-800 text-white sm:w-auto"
              >
                <Link href="/dashboard">
                  Open dashboard
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href="/signup">Start for free</Link>
              </Button>
            </div>
          </div>
          <div className="min-w-0" data-animate-fade>
            <DashboardPreview compact />
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section
        ref={benefitsRef}
        className="bg-white px-4 py-16 sm:px-6 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <Badge
              variant="outline"
              className="mb-4 border-green-200 bg-green-50 text-green-800"
            >
              What you get
            </Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              Built for the way contractors actually work.
            </h2>
            <p className="mt-4 text-base leading-7 text-zinc-600">
              No complicated setup, no vague finance terms, and no guessing
              which follow-up matters most.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((benefit) => {
              const Icon = benefit.icon
              return (
                <Card
                  key={benefit.title}
                  data-animate-card
                  className="border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                >
                  <CardHeader>
                    <div className="mb-3 grid size-10 place-items-center rounded-lg bg-green-50 text-green-700">
                      <Icon className="size-5" />
                    </div>
                    <CardTitle className="text-base">{benefit.title}</CardTitle>
                    <CardDescription className="leading-6">
                      {benefit.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* Pricing CTA */}
      <section className="border-y border-border bg-green-950 px-4 py-16 text-white sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_380px] lg:items-center">
          <div className="min-w-0">
            <Badge className="mb-4 border-green-700 bg-green-900 text-green-100">
              Early access pricing
            </Badge>
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Start with the invoices you already know are overdue.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-green-200">
              One simple workspace. Track invoices, draft follow-ups, stay in
              control. Pricing that pays for itself the first time it works.
            </p>
          </div>
          <Card className="min-w-0 border-green-800 bg-white text-foreground">
            <CardHeader>
              <CardTitle>Early access</CardTitle>
              <CardDescription>
                For contractors who want a simple recovery dashboard before
                adding full integrations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-semibold tracking-tight">$49</div>
              <div className="mt-1 text-sm text-muted-foreground">
                per month · cancel any time
              </div>
              <Button
                asChild
                className="mt-5 w-full bg-green-700 hover:bg-green-800 text-white"
              >
                <Link href="/signup">Start recovering revenue</Link>
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                No credit card required to try.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* FAQ */}
      <section
        ref={faqRef}
        className="bg-white px-4 py-16 sm:px-6 lg:px-8"
      >
        <div className="mx-auto max-w-3xl">
          <div className="mx-auto max-w-3xl text-center">
            <Badge
              variant="outline"
              className="mb-4 border-zinc-200 bg-zinc-50 text-zinc-700"
            >
              FAQ
            </Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              Straight answers before you start.
            </h2>
            <p className="mt-4 text-base leading-7 text-zinc-600">
              A few things contractors ask before signing up.
            </p>
          </div>

          <div className="mt-10 grid gap-3">
            {faqs.map((faq) => (
              <Card
                key={faq.question}
                data-animate-card
                className="border-zinc-200 bg-white shadow-sm"
              >
                <CardHeader>
                  <CardTitle className="text-base">{faq.question}</CardTitle>
                  <CardDescription className="leading-6">
                    {faq.answer}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <footer className="border-t border-zinc-800 bg-zinc-950 px-4 py-14 text-white sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-green-700 text-sm font-bold">
                RR
              </div>
              <span className="text-sm font-semibold tracking-tight">
                Revenue Recovery
              </span>
            </div>
            <h2 className="mt-6 max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Make unpaid invoices visible before they become a bigger problem.
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-zinc-400">
              Find missed money. Review the message. Send the follow-up. Done.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-11 w-full bg-white text-zinc-950 hover:bg-zinc-100 sm:w-auto"
            >
              <Link href="/signup">Start for free</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-11 w-full border-zinc-700 bg-transparent text-white hover:bg-zinc-800 hover:text-white sm:w-auto"
            >
              <Link href="/dashboard">View demo</Link>
            </Button>
          </div>
        </div>
        <div className="mx-auto mt-10 max-w-7xl border-t border-zinc-800 pt-8 text-xs text-zinc-500">
          © {new Date().getFullYear()} Revenue Recovery. Built for contractors.
        </div>
      </footer>
    </main>
  )
}
