import { Save } from "lucide-react"

import { PageHeader } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { settingsSections } from "@/lib/mock-data"

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Placeholder settings for company details, reminder timing, and team preferences."
      >
        <Button>
          <Save className="size-4" />
          Save changes
        </Button>
      </PageHeader>

      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[0.75fr_1.25fr] lg:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Setup sections</CardTitle>
            <CardDescription>
              The future onboarding checklist for live configuration.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {settingsSections.map((section) => (
              <div key={section.title} className="rounded-lg border border-border p-3">
                <div className="text-sm font-medium">{section.title}</div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {section.description}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Company profile</CardTitle>
              <CardDescription>
                Mock values shown in the dashboard and reminder templates.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="business">Business name</Label>
                <Input id="business" defaultValue="Daniel Construction" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" defaultValue="(555) 018-4421" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="area">Service area</Label>
                  <Input id="area" defaultValue="Greater Vancouver" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recovery preferences</CardTitle>
              <CardDescription>
                Controls are visual placeholders until backend wiring is added.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                <div>
                  <div className="text-sm font-medium">
                    Send friendly reminders
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Automatically prepare reminders for invoices near due date.
                  </p>
                </div>
                <Switch defaultChecked aria-label="Send friendly reminders" />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                <div>
                  <div className="text-sm font-medium">
                    Require review over $5,000
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Pause higher-value follow-up for owner approval.
                  </p>
                </div>
                <Switch defaultChecked aria-label="Require review over 5000" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
