"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Check,
  Loader2,
  MapPin,
  Send,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ServiceAreaSelect } from "@/components/ui/service-area-select"
import {
  INPUT_LIMITS,
  inputErrorMessage,
  textField,
} from "@/lib/security/input"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"

type JobRequestInsert = Database["public"]["Tables"]["job_requests"]["Insert"]
type JobUrgency = Database["public"]["Enums"]["job_request_urgency"]

type Screen = "welcome" | "step1" | "step2" | "step3"

const URGENCY_OPTIONS: { value: JobUrgency; label: string; description: string }[] = [
  {
    value: "flexible",
    label: "Flexible",
    description: "No rush. I can wait for the right contractor.",
  },
  {
    value: "soon",
    label: "Soon",
    description: "I'd like to get this done within the next few weeks.",
  },
  {
    value: "urgent",
    label: "Urgent",
    description: "This needs attention as soon as possible.",
  },
]

interface FormState {
  title: string
  description: string
  serviceArea: string
  urgency: JobUrgency
}

export function ClientSetupWizard() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [screen, setScreen] = useState<Screen>("welcome")
  const [isLoading, setIsLoading] = useState(false)
  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    serviceArea: "",
    urgency: "flexible",
  })

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const stepOrder: Screen[] = ["step1", "step2", "step3"]
  const SCREEN_LABELS: Partial<Record<Screen, string>> = {
    step1: "The job",
    step2: "Details",
    step3: "Location",
  }
  const currentIndex = stepOrder.indexOf(screen)

  const canStep1 = form.title.trim().length > 0
  const canStep2 = form.description.trim().length > 0
  const canStep3 = form.serviceArea.length > 0

  async function handleSubmit() {
    setIsLoading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        toast.error("You must be signed in.")
        return
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("owner_name")
        .eq("user_id", user.id)
        .maybeSingle()

      let title: string
      let description: string
      let serviceArea: string
      try {
        title = textField(form.title, "Project title", {
          required: true,
          maxLength: INPUT_LIMITS.title,
        })
        description = textField(form.description, "Description", {
          required: true,
          maxLength: INPUT_LIMITS.description,
          multiline: true,
        })
        serviceArea = textField(form.serviceArea, "Service area", {
          required: true,
          maxLength: INPUT_LIMITS.serviceArea,
        })
      } catch (error) {
        toast.error(inputErrorMessage(error))
        return
      }

      const payload: JobRequestInsert = {
        client_id: user.id,
        client_name: profile?.owner_name || user.email || null,
        client_email: user.email ?? null,
        title,
        description,
        service_area: serviceArea,
        urgency: form.urgency,
        status: "new",
      }

      const { error } = await supabase.from("job_requests").insert(payload)

      if (error) {
        toast.error(error.message)
        return
      }

      toast.success("Job request submitted. Contractors in your area will be notified.")
      router.push("/client/dashboard")
      router.refresh()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-start justify-center px-4 py-12 sm:py-20">
      <div className="w-full max-w-md">
        {/* Welcome screen */}
        {screen === "welcome" && (
          <div className="flex flex-col gap-6 text-center">
            <div>
              <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-ef-mist text-ef-ocean dark:bg-ef-ink/40 dark:text-ef-300">
                <MapPin className="size-8" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">
                Let&apos;s find you the right contractor.
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Submit a job request and local contractors will send you
                estimates. It takes under two minutes.
              </p>
            </div>

            <div className="grid gap-3 text-left">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <p className="text-sm font-medium">How it works</p>
                <ol className="mt-3 grid gap-2">
                  {[
                    "Describe the work you need done",
                    "Contractors in your area review your request",
                    "You receive estimates and choose who to hire",
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ef-mist text-xs font-semibold text-ef-ocean dark:bg-ef-ink/60 dark:text-ef-300">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              <Button
                className="bg-ef-ocean text-white hover:bg-ef-ocean"
                onClick={() => setScreen("step1")}
              >
                Describe my project
              </Button>
            </div>
          </div>
        )}

        {/* Multi-step form */}
        {screen !== "welcome" && (
          <div className="flex flex-col gap-6">
            {/* Progress */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const prev =
                    currentIndex > 0 ? stepOrder[currentIndex - 1] : "welcome"
                  setScreen(prev)
                }}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Back"
              >
                <ArrowLeft className="size-4" />
              </button>
              <div className="flex items-center gap-1.5">
                {stepOrder.map((s, i) => (
                  <span key={s} className="flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={
                        i === currentIndex
                          ? "border-ef-200 bg-ef-mist text-ef-ocean dark:border-ef-navy/60 dark:bg-ef-ink/40 dark:text-ef-200"
                          : i < currentIndex
                            ? "border-ef-mist text-ef-ocean dark:border-ef-navy/30 dark:text-ef-cyan"
                            : "border-border text-muted-foreground"
                      }
                    >
                      {i < currentIndex ? (
                        <Check className="mr-0.5 size-2.5" />
                      ) : null}
                      {SCREEN_LABELS[s]}
                    </Badge>
                    {i < stepOrder.length - 1 && (
                      <span className="text-xs text-muted-foreground">›</span>
                    )}
                  </span>
                ))}
              </div>
            </div>

            <Card>
              <CardContent className="p-6">
                {/* Step 1: Job title */}
                {screen === "step1" && (
                  <div className="grid gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">What do you need done?</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Give your job request a short, clear title.
                      </p>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="cs-title">Job title *</Label>
                      <Input
                        id="cs-title"
                        placeholder="e.g. Kitchen backsplash repair"
                        value={form.title}
                        onChange={(e) => update("title", e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && canStep1) setScreen("step2")
                        }}
                      />
                    </div>
                    <Button
                      className="bg-ef-ocean text-white hover:bg-ef-ocean"
                      disabled={!canStep1}
                      onClick={() => setScreen("step2")}
                    >
                      Next →
                    </Button>
                  </div>
                )}

                {/* Step 2: Description */}
                {screen === "step2" && (
                  <div className="grid gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">Describe the work</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Include measurements, access details, and anything the
                        contractor should know about{" "}
                        <span className="font-medium text-foreground">
                          {form.title}
                        </span>
                        .
                      </p>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="cs-desc">Description *</Label>
                      <textarea
                        id="cs-desc"
                        className="min-h-32 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        placeholder="Describe the scope of work, existing conditions, preferred timeline, and any other details."
                        value={form.description}
                        onChange={(e) => update("description", e.target.value)}
                        autoFocus
                      />
                    </div>
                    <Button
                      className="bg-ef-ocean text-white hover:bg-ef-ocean"
                      disabled={!canStep2}
                      onClick={() => setScreen("step3")}
                    >
                      Next →
                    </Button>
                  </div>
                )}

                {/* Step 3: Location + urgency */}
                {screen === "step3" && (
                  <div className="grid gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">Where and when?</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Contractors near you will see this request.
                      </p>
                    </div>
                    <div className="grid gap-3">
                      <div className="grid gap-1.5">
                        <Label>Your location *</Label>
                        <ServiceAreaSelect
                          value={form.serviceArea}
                          onChange={(area) => update("serviceArea", area)}
                          placeholder="Select your city..."
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label>Urgency</Label>
                        <div className="grid gap-2">
                          {URGENCY_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => update("urgency", opt.value)}
                              className={`flex flex-col gap-0.5 rounded-lg border px-4 py-3 text-left transition-colors ${
                                form.urgency === opt.value
                                  ? "border-ef-300 bg-ef-mist dark:border-ef-ocean dark:bg-ef-ink/40"
                                  : "border-border hover:bg-muted"
                              }`}
                            >
                              <span className="text-sm font-medium">{opt.label}</span>
                              <span className="text-xs text-muted-foreground">
                                {opt.description}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <Button
                      className="gap-2 bg-ef-ocean text-white hover:bg-ef-ocean"
                      disabled={!canStep3 || isLoading}
                      onClick={() => void handleSubmit()}
                    >
                      {isLoading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                      {isLoading ? "Submitting..." : "Submit job request"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
