// Server-only — payment confirmation email templates.

function formatCad(cents: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

const HEADER_COLOR = "#0369a1"
const FONT = "Arial, sans-serif"

function emailShell(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:${FONT};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
        <tr><td style="background:${HEADER_COLOR};height:5px;"></td></tr>
        <tr><td style="padding:32px 40px;">${content}</td></tr>
        <tr><td style="background:#f4f4f5;padding:20px 40px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">Powered by Euroflo</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ── Contractor: payment received ──────────────────────────────────────────────

export interface ContractorPaymentArgs {
  contractorName:       string
  estimateNumber:       string
  clientTotalCents:     number
  contractorAmountCents: number
}

export function renderPaymentReceivedContractorHtml(args: ContractorPaymentArgs): string {
  const {
    contractorName,
    estimateNumber,
    clientTotalCents,
    contractorAmountCents,
  } = args

  const platformFee = clientTotalCents - contractorAmountCents

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;color:#111827;">Payment received</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">Hi ${contractorName},</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#111827;">
      Your client paid for <strong>Estimate ${estimateNumber}</strong> through Euroflo.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e5e7eb;border-radius:8px;margin:0 0 24px;">
      <tr style="background:#f9fafb;">
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Client paid</td>
        <td style="padding:12px 16px;font-size:18px;font-weight:700;color:#111827;text-align:right;">${formatCad(clientTotalCents)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;">Euroflo platform fee</td>
        <td style="padding:12px 16px;font-size:14px;color:#6b7280;text-align:right;">&minus;${formatCad(platformFee)}</td>
      </tr>
      <tr style="background:#eff6ff;">
        <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#1d4ed8;">Your payout</td>
        <td style="padding:12px 16px;font-size:18px;font-weight:700;color:#1d4ed8;text-align:right;">${formatCad(contractorAmountCents)}</td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#9ca3af;">
      Stripe will deposit your payout to your connected bank account on their normal schedule.
    </p>
  `

  return emailShell(content)
}

// ── Client: payment receipt ───────────────────────────────────────────────────

export interface ClientPaymentArgs {
  clientName:       string
  estimateNumber:   string
  clientTotalCents: number
}

export function renderPaymentReceivedClientHtml(args: ClientPaymentArgs): string {
  const { clientName, estimateNumber, clientTotalCents } = args

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;color:#111827;">Payment confirmed</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">Hi ${clientName},</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#111827;">
      We received your payment for <strong>Estimate ${estimateNumber}</strong>.
      Your contractor has been notified and will be in touch.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e5e7eb;border-radius:8px;margin:0 0 24px;">
      <tr style="background:#eff6ff;">
        <td style="padding:16px;font-size:14px;font-weight:700;color:#1d4ed8;">Amount paid</td>
        <td style="padding:16px;font-size:22px;font-weight:700;color:#1d4ed8;text-align:right;">${formatCad(clientTotalCents)}</td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#9ca3af;">
      Keep this email as your payment receipt.
    </p>
  `

  return emailShell(content)
}
