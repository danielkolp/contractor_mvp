import Link from "next/link"
import { CheckCircle2 } from "lucide-react"

import { Button } from "@/components/ui/button"

export default async function GuestPaymentSuccessPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  return (
    <div className="force-light mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-ef-mist">
        <CheckCircle2 className="h-10 w-10 text-ef-ocean" />
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-gray-900">
        Payment received
      </h1>
      <p className="mt-4 max-w-sm text-base leading-relaxed text-gray-500">
        Your payment has been processed. Your contractor will be in touch to
        schedule the work.
      </p>

      <div className="mt-8 flex flex-col gap-3 w-full max-w-xs">
        <Button asChild className="bg-ef-ocean text-white hover:bg-ef-ocean">
          <Link href={`/guest/project/${token}`}>
            Back to project
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/client/setup?claim_token=${token}`}>
            Save to my account
          </Link>
        </Button>
      </div>
    </div>
  )
}
