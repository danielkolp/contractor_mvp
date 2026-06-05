"use client"

import { Banknote, CreditCard, Loader2, Send, SquarePen } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type PaymentMethod = "e_transfer" | "cash" | "cheque" | "card"

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  e_transfer: "E-transfer",
  cash: "Cash",
  cheque: "Cheque",
  card: "Card",
}

const MANUAL_METHODS: { value: PaymentMethod; label: string; icon: typeof Send }[] = [
  { value: "e_transfer", label: "E-transfer", icon: Send },
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "cheque", label: "Cheque", icon: SquarePen },
]

/**
 * Mark a job paid in ≤2 clicks. E-transfer / cash / cheque close it out free and
 * stop the chase. Card routes to the in-app Stripe flow when available (fee
 * applies) — otherwise it records an off-platform card payment, also free.
 */
export function MarkPaidDialog({
  open,
  onClose,
  clientName,
  amountLabel,
  isSaving = false,
  onConfirm,
  onCardOnline,
}: {
  open: boolean
  onClose: () => void
  clientName?: string | null
  amountLabel?: string | null
  isSaving?: boolean
  /** Record a manual, off-platform payment (no fee). */
  onConfirm: (method: PaymentMethod) => void
  /** If provided, the "Card" button collects online via Stripe (fee applies). */
  onCardOnline?: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as paid</DialogTitle>
          <DialogDescription>
            How were you paid{clientName ? ` by ${clientName}` : ""}
            {amountLabel ? ` (${amountLabel})` : ""}? E-transfer, cash, and cheque close
            this out for free.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {MANUAL_METHODS.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              variant="outline"
              className="h-auto justify-start gap-3 py-3"
              disabled={isSaving}
              onClick={() => onConfirm(value)}
            >
              <Icon className="size-4 text-ef-ocean" />
              <span className="flex flex-col items-start">
                <span className="font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">Paid off-platform, no fee</span>
              </span>
            </Button>
          ))}

          <Button
            variant="outline"
            className="h-auto justify-start gap-3 py-3"
            disabled={isSaving}
            onClick={() => (onCardOnline ? onCardOnline() : onConfirm("card"))}
          >
            {isSaving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CreditCard className="size-4 text-ef-ocean" />
            )}
            <span className="flex flex-col items-start">
              <span className="font-medium">Card</span>
              <span className="text-xs text-muted-foreground">
                {onCardOnline ? "Collect online via Stripe (fee applies)" : "Paid by card, no fee"}
              </span>
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
