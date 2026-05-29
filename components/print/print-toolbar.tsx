"use client"

import { ArrowLeft, Printer, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export function PrintToolbar({ backHref }: { backHref: string }) {
  return (
    <div className="print:hidden fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 shadow-sm sm:px-6">
      <Button variant="ghost" size="sm" asChild>
        <a href={backHref}>
          <ArrowLeft className="mr-1.5 size-4" />
          Back
        </a>
      </Button>
      <span className="text-sm font-medium text-zinc-500">
        EstiGator Document Preview
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-dashed text-xs text-zinc-400 hover:text-zinc-600"
          onClick={() => window.location.reload()}
          title="Re-fetch latest data from the database"
        >
          <RefreshCw className="size-3.5" />
          Regenerate
        </Button>
        <Button
          size="sm"
          className="bg-green-700 hover:bg-green-800 text-white"
          onClick={() => window.print()}
        >
          <Printer className="mr-1.5 size-4" />
          Print / Save PDF
        </Button>
      </div>
    </div>
  )
}
