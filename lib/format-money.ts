/**
 * Shared currency formatter.
 *
 * Default locale is en-CA / CAD to match our print PDFs and target market.
 * Pass a currency code (from user settings) to override.
 */

const LOCALE_MAP: Record<string, string> = {
  CAD: "en-CA",
  USD: "en-US",
  GBP: "en-GB",
  AUD: "en-AU",
  EUR: "de-DE",
}

function localeFor(currency: string): string {
  return LOCALE_MAP[currency] ?? "en-CA"
}

export function formatMoney(
  amount: number,
  currency = "CAD",
  options?: { maximumFractionDigits?: number }
): string {
  return new Intl.NumberFormat(localeFor(currency), {
    style: "currency",
    currency,
    maximumFractionDigits: options?.maximumFractionDigits ?? 0,
  }).format(amount)
}

/** Pre-built formatter for the common zero-decimal dashboard display (CAD). */
export const money = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
})
