import { FileText } from "lucide-react"

import { PageHeader } from "@/components/dashboard/page-header"
import { Card, CardContent } from "@/components/ui/card"

export default function TemplatesPage() {
  return (
    <>
      <PageHeader
        title="Templates"
        description="Saved message templates for common follow-up situations."
      />
      <div className="p-4 sm:p-6 lg:p-8">
        <Card>
          <CardContent className="p-10 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-lg bg-muted text-muted-foreground">
              <FileText className="size-5" />
            </div>
            <h3 className="mt-4 text-base font-semibold">
              Templates coming soon
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              Save and reuse your best follow-up messages here. For now,
              messages are generated fresh for each recovery item.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
