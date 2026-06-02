import Stripe from "stripe"

if (!process.env.STRIPE_SECRET_KEY) {
  // Warn at module load time so misconfiguration is caught early in dev.
  console.warn("[stripe] STRIPE_SECRET_KEY is not set — Stripe calls will fail.")
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2026-05-27.dahlia",
})
