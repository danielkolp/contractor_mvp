import Link from "next/link"
import { RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function ClientSettingsPage() {
  return (
    <div className="mx-auto grid max-w-3xl gap-6 p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Client portal preferences will live here as the portal grows.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm leading-6 text-muted-foreground">
            For now, use your account email to receive estimate and invoice
            updates from your contractor.
          </p>
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="grid gap-0.5">
              <p className="text-sm font-medium">Setup wizard</p>
              <p className="text-xs text-muted-foreground">
                Re-run the guided setup to submit a new job request.
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/client/setup">
                <RotateCcw className="size-3.5" />
                Redo setup
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
