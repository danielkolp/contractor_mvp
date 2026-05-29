import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="size-8 rounded-lg" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-7 w-20" />
        <Skeleton className="mt-2 h-3.5 w-32" />
      </CardContent>
    </Card>
  )
}

export function DashboardStatsSkeleton() {
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
    </section>
  )
}

export function InvoiceRowSkeleton() {
  return (
    <div className="grid gap-3 px-4 py-3 xl:grid-cols-[120px_1fr_112px_112px_120px_56px] xl:items-center border-b border-border last:border-b-0">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-36" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="h-8 w-16 rounded-lg" />
    </div>
  )
}

export function InvoiceListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {Array.from({ length: rows }).map((_, i) => (
        <InvoiceRowSkeleton key={i} />
      ))}
    </div>
  )
}

export function ClientCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex gap-3">
        <Skeleton className="size-10 shrink-0 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3.5 w-24" />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="mt-4 grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
      <div className="mt-4 flex justify-between items-center">
        <Skeleton className="h-3.5 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-16 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

export function ClientListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-4 2xl:grid-cols-2">
      {Array.from({ length: rows }).map((_, i) => (
        <ClientCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function RecoveryCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-3/4" />
      </div>
      <div className="mt-4 rounded-lg bg-muted/50 p-3 space-y-1.5">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3.5 w-full" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Skeleton className="h-8 rounded-lg" />
        <Skeleton className="h-8 rounded-lg" />
        <Skeleton className="h-8 rounded-lg" />
        <Skeleton className="h-8 rounded-lg" />
      </div>
    </div>
  )
}

export function FollowUpListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 rounded-lg border border-border p-3">
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3.5 w-24" />
          </div>
          <Skeleton className="h-7 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  )
}

export function RemindersListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3.5 w-24" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <Skeleton className="h-3.5 w-32" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20 rounded-lg" />
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function SettingsSkeleton() {
  return (
    <div className="grid gap-6 p-4 sm:p-6 lg:p-8">
      {[1, 2].map((i) => (
        <Card key={i}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-56" />
              </div>
              <Skeleton className="h-9 w-28 rounded-lg" />
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {[1, 2, 3, 4].map((j) => (
                <div key={j} className="space-y-2">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-9 w-full rounded-lg" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function RecoveryQueuePageSkeleton() {
  return (
    <div className="grid gap-6">
      {/* Hero summary card */}
      <Card className="border-2 border-green-100 dark:border-green-900/40">
        <CardContent className="p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-10 w-44" />
              <Skeleton className="h-3.5 w-40" />
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <Skeleton className="h-10 w-48 rounded-lg" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status mini-cards */}
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-7 w-8" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Section label */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3.5 w-48" />
      </div>

      {/* Featured card */}
      <Card className="border-2 border-green-100 dark:border-green-900/40">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2.5">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-28" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-5 w-32 rounded-full" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border border-green-100 bg-green-50 p-4 space-y-2 dark:border-green-900/50 dark:bg-green-950/30">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-4 w-full" />
          </div>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-7 w-24 rounded-lg" />
            </div>
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-3 w-56" />
          </div>
          <div className="flex flex-wrap gap-3 border-t border-border pt-4">
            <Skeleton className="h-10 w-36 rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </CardContent>
      </Card>

      {/* Queue list rows */}
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 sm:flex-row sm:items-center">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3.5 w-48" />
            </div>
            <div className="flex items-center gap-4">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-28 rounded-full" />
              </div>
              <Skeleton className="h-8 w-16 shrink-0 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DashboardMainSkeleton() {
  return (
    <div className="grid gap-6">
      <DashboardStatsSkeleton />
      <section className="grid gap-6 xl:grid-cols-[1.45fr_0.55fr]">
        <Card>
          <CardHeader className="gap-2">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </CardHeader>
          <CardContent>
            <InvoiceListSkeleton rows={4} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="gap-2">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-8 w-16 rounded-lg" />
            </div>
          </CardHeader>
          <CardContent>
            <FollowUpListSkeleton />
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
