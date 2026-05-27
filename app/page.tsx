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

const problems = [
  {
    title: "Late invoices get buried",
    description:
      "Jobs move fast. A few unpaid invoices can slip behind texts, calls, and new work.",
    icon: FileWarning,
  },
  {
    title: "Follow-up feels awkward",
    description:
      "Most contractors do not want to chase clients, especially when the relationship matters.",
    icon: MessageSquareText,
  },
  {
    title: "Risk is hard to see",
    description:
      "It is tough to know which balances need attention before cash gets tight.",
    icon: Clock3,
  },
]

const steps = [
  {
    number: "01",
    title: "Add or import invoices",
    description:
      "See what is open, what is overdue, and what is due soon in one clean list.",
  },
  {
    number: "02",
    title: "Organize client follow-ups",
    description:
      "Keep reminders, payment plan notes, and owner review tasks tied to each client.",
  },
  {
    number: "03",
    title: "Act before cash is at risk",
    description:
      "Spot high-risk balances early and choose the next practical step.",
  },
]

const benefits = [
  {
    title: "Know what is unpaid",
    description: "Open invoices, overdue balances, and client status stay visible.",
    icon: ReceiptText,
  },
  {
    title: "Follow up faster",
    description: "Use a clear worklist instead of hunting through messages.",
    icon: ClipboardCheck,
  },
  {
    title: "Keep clients organized",
    description: "See who owes what, who needs a reminder, and who pays reliably.",
    icon: UsersRound,
  },
  {
    title: "Protect cash flow",
    description: "Find the invoices most likely to slow down payroll and materials.",
    icon: ShieldCheck,
  },
]

const dashboardRows = [
  {
    client: "North Ridge Homes",
    invoice: "INV-1048",
    amount: "$4,850",
    status: "7 days late",
    tone: "warning" as const,
  },
  {
    client: "Harbor View HOA",
    invoice: "INV-1042",
    amount: "$8,300",
    status: "Due now",
    tone: "default" as const,
  },
  {
    client: "Mason & Co.",
    invoice: "INV-1037",
    amount: "$12,600",
    status: "Review",
    tone: "warning" as const,
  },
]

const faqs = [
  {
    question: "Is this built for contractors or accounting teams?",
    answer:
      "It is built for contractors first. The language, workflow, and dashboard focus on getting paid without needing a complicated finance setup.",
  },
  {
    question: "Do I need to connect accounting software right away?",
    answer:
      "No. This foundation can start with simple invoice tracking and mock data. Integrations can come after the workflow is clear.",
  },
  {
    question: "Will it send messages automatically?",
    answer:
      "The product direction is to prepare simple follow-ups and let owners review sensitive cases before anything goes out.",
  },
  {
    question: "What kind of unpaid revenue does it show?",
    answer:
      "It highlights overdue invoices, upcoming due dates, client balances, and the amount of money sitting at risk.",
  },
]

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <Badge variant="outline" className="mb-4">
        {eyebrow}
      </Badge>
      <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-base leading-7 text-muted-foreground">
        {description}
      </p>
    </div>
  )
}

function DashboardPreview() {
  return (
    <Card className="w-full max-w-full overflow-hidden border-zinc-200 shadow-xl">
      <div className="border-b border-border bg-background p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold">Revenue at risk</div>
            <div className="text-xs text-muted-foreground">
              Contractor dashboard preview
            </div>
          </div>
          <Badge variant="success" className="max-w-full">
            $18,420 recovered this month
          </Badge>
        </div>
      </div>
      <CardContent className="grid gap-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-3">
            <CircleDollarSign className="size-4 text-teal-700" />
            <div className="mt-3 text-2xl font-semibold">$24.8k</div>
            <div className="text-xs text-muted-foreground">
              At risk this week
            </div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <Clock3 className="size-4 text-amber-600" />
            <div className="mt-3 text-2xl font-semibold">14.2</div>
            <div className="text-xs text-muted-foreground">
              Average days late
            </div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <TrendingUp className="size-4 text-emerald-700" />
            <div className="mt-3 text-2xl font-semibold">11</div>
            <div className="text-xs text-muted-foreground">
              Paid follow-ups
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-sm font-medium">Needs attention</div>
            <div className="text-xs text-muted-foreground">3 invoices</div>
          </div>
          <div className="divide-y divide-border">
            {dashboardRows.map((row) => (
              <div
                key={row.invoice}
                className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {row.client}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {row.invoice}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                  <div className="text-sm font-semibold">{row.amount}</div>
                  <Badge variant={row.tone}>{row.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-teal-100 bg-teal-50 p-4 text-teal-950">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">Follow-up progress</div>
            <div className="text-xs">78%</div>
          </div>
          <Progress value={78} className="bg-teal-100" />
        </div>
      </CardContent>
    </Card>
  )
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-zinc-50 text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-700 text-sm font-semibold text-white">
              RR
            </div>
            <span className="truncate text-sm font-semibold tracking-tight">
              Revenue Recovery
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">Start tracking</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="bg-background">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-20">
          <div className="min-w-0 flex flex-col justify-center">
            <Badge variant="outline" className="w-fit gap-1.5">
              <HardHat className="size-3.5" />
              Built for contractors
            </Badge>
            <h1 className="mt-5 max-w-3xl text-3xl font-semibold tracking-tight text-zinc-950 sm:text-5xl lg:text-6xl">
              Stop letting unpaid invoices disappear.
            </h1>
            <p className="mt-5 max-w-2xl break-words text-base leading-7 text-muted-foreground sm:text-lg">
              Track overdue invoices, follow up faster, and see exactly how much
              revenue is sitting unpaid.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-10 w-full sm:w-auto">
                <Link href="/signup">
                  Start tracking invoices
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-10 w-full sm:w-auto"
              >
                <Link href="/dashboard">View how it works</Link>
              </Button>
            </div>
            <div className="mt-8 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
              {[
                "No finance jargon",
                "Simple follow-up list",
                "Clear revenue at risk",
              ].map((point) => (
                <div key={point} className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-teal-700" />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="relative min-w-0">
            <DashboardPreview />
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-amber-50/50 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="The problem"
            title="Unpaid work should not be hidden in your busy week."
            description="Revenue recovery starts with seeing which jobs are finished, which invoices are late, and which clients need a practical follow-up."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {problems.map((item) => {
              const Icon = item.icon

              return (
                <Card key={item.title} className="bg-background">
                  <CardHeader>
                    <div className="mb-3 grid size-10 place-items-center rounded-lg bg-amber-100 text-amber-700">
                      <Icon className="size-5" />
                    </div>
                    <CardTitle>{item.title}</CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </CardHeader>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="bg-background px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="How it works"
            title="A simple recovery workflow you can actually use."
            description="The product keeps the process plain: track what is owed, organize the next follow-up, and act before unpaid revenue becomes a bigger problem."
          />
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {steps.map((step) => (
              <Card key={step.number}>
                <CardHeader>
                  <Badge variant="muted" className="mb-3 w-fit">
                    {step.number}
                  </Badge>
                  <CardTitle>{step.title}</CardTitle>
                  <CardDescription>{step.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-zinc-100/70 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div className="min-w-0">
            <Badge variant="outline" className="mb-4">
              Dashboard preview
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              See overdue money, client risk, and follow-up progress in one place.
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              The dashboard is designed for quick checks between job sites,
              estimates, and material runs. Open it, see what needs attention,
              and move on with a clear next step.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="w-full sm:w-auto">
                <Link href="/dashboard">
                  Open dashboard preview
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href="/signup">Start tracking invoices</Link>
              </Button>
            </div>
          </div>
          <div className="min-w-0">
            <DashboardPreview />
          </div>
        </div>
      </section>

      <section className="bg-background px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="Benefits"
            title="Built for the way contractors work."
            description="No complicated setup, no vague finance terms, and no guessing which unpaid invoices matter most."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((benefit) => {
              const Icon = benefit.icon

              return (
                <Card key={benefit.title}>
                  <CardHeader>
                    <div className="mb-3 grid size-10 place-items-center rounded-lg bg-teal-50 text-teal-700">
                      <Icon className="size-5" />
                    </div>
                    <CardTitle className="text-base">{benefit.title}</CardTitle>
                    <CardDescription>{benefit.description}</CardDescription>
                  </CardHeader>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-teal-950 px-4 py-14 text-white sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
          <div className="min-w-0">
            <Badge className="mb-4 border-teal-700 bg-teal-900 text-teal-100">
              Pricing teaser
            </Badge>
            <h2 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Start with the invoices you already know are overdue.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-teal-100">
              Pricing will stay simple: one contractor workspace, clear invoice
              tracking, and recovery tools that help pay for themselves.
            </p>
          </div>
          <Card className="min-w-0 border-teal-800 bg-white text-foreground">
            <CardHeader>
              <CardTitle>Early access</CardTitle>
              <CardDescription>
                For contractors who want a practical recovery dashboard before
                adding full integrations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-semibold">$49</div>
              <div className="mt-1 text-sm text-muted-foreground">
                per month target starting price
              </div>
              <Button asChild className="mt-5 w-full">
                <Link href="/signup">Start tracking invoices</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="bg-background px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <SectionHeading
            eyebrow="FAQ"
            title="Straight answers before you start."
            description="A few practical notes about how the product is meant to work for contractor revenue recovery."
          />
          <div className="mt-10 grid gap-3">
            {faqs.map((faq) => (
              <Card key={faq.question}>
                <CardHeader>
                  <CardTitle className="text-base">{faq.question}</CardTitle>
                  <CardDescription>{faq.answer}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-zinc-950 px-4 py-12 text-white sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-teal-600 text-sm font-semibold">
                RR
              </div>
              <span className="text-sm font-semibold tracking-tight">
                Revenue Recovery
              </span>
            </div>
            <h2 className="mt-6 max-w-2xl text-3xl font-semibold tracking-tight">
              Make unpaid invoices visible before they become a bigger problem.
            </h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-10 w-full bg-white text-zinc-950 hover:bg-zinc-200 sm:w-auto"
            >
              <Link href="/signup">Start tracking invoices</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-10 w-full border-zinc-700 bg-transparent text-white hover:bg-zinc-900 hover:text-white sm:w-auto"
            >
              <Link href="/dashboard">View how it works</Link>
            </Button>
          </div>
        </div>
      </footer>
    </main>
  )
}
