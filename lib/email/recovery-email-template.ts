// Server-only utility — never import from client components.
// Generates HTML and plain-text versions of contractor recovery follow-up emails.
// All styles are inline so the email renders correctly in Gmail, Outlook,
// Apple Mail, and mobile clients without relying on external CSS.

export interface RecoveryEmailArgs {
  messageBody:         string
  subject:             string
  contractorName:      string        // owner_name from profiles
  companyName:         string        // company_name from profiles
  contractorEmail:     string | null // auth user email — used for reply-to note
  contractorPhone?:    string | null
  contractorWebsite?:  string | null
  inboundReplyToEmail?: string | null // when set, replies are tracked in-app
  appName?:            string        // defaults to "Euroflo"
  payUrl?:             string | null // when set, a prominent "Pay now" button renders
  payLabel?:           string        // button text, defaults to "Pay now"
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// Turns a plain-text message body into HTML paragraphs.
// Double newlines → paragraph breaks. Single newlines → <br>.
function bodyToHtmlParagraphs(rawBody: string): string {
  const escaped = escapeHtml(rawBody)
  const paragraphs = escaped.split(/\n\n+/)
  return paragraphs
    .map((para) => {
      const withBreaks = para.trim().replace(/\n/g, "<br>")
      return `<p style="margin:0 0 16px 0; font-size:16px; line-height:1.7; color:#111827;">${withBreaks}</p>`
    })
    .join("\n")
}

// Normalises a URL so it always has a protocol for href use.
function safeHref(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  return `https://${url}`
}

// ── HTML template ──────────────────────────────────────────────────────────────

export function renderRecoveryEmailHtml(args: RecoveryEmailArgs): string {
  const {
    messageBody,
    subject,
    contractorName,
    companyName,
    contractorEmail,
    contractorPhone,
    contractorWebsite,
    inboundReplyToEmail,
    appName = "Euroflo",
    payUrl,
    payLabel = "Pay now",
  } = args

  // Prominent "Pay now" button — the easiest path to getting paid is one tap.
  const payButton = payUrl
    ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(safeHref(payUrl))}"
                       style="display:inline-block; background-color:#024D8B; color:#FFFFFF;
                              font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                              font-size:16px; font-weight:600; text-decoration:none;
                              padding:14px 32px; border-radius:8px;">
                      ${escapeHtml(payLabel)}
                    </a>
                  </td>
                </tr>
              </table>`
    : ""

  const safeSubject       = escapeHtml(subject)
  const safeCompany       = escapeHtml(companyName)
  const safeOwner         = escapeHtml(contractorName)
  const safeApp           = escapeHtml(appName)
  const messageParagraphs = bodyToHtmlParagraphs(messageBody)

  // Signature lines — only render non-empty fields
  const sigLines: string[] = []

  if (contractorPhone) {
    sigLines.push(
      `<p style="margin:0 0 4px 0; font-size:14px; color:#4B5563;">${escapeHtml(contractorPhone)}</p>`
    )
  }

  if (contractorWebsite) {
    const href = safeHref(contractorWebsite)
    sigLines.push(
      `<p style="margin:0 0 4px 0; font-size:14px; color:#4B5563;"><a href="${escapeHtml(href)}" style="color:#024D8B; text-decoration:none;">${escapeHtml(contractorWebsite)}</a></p>`
    )
  }

  // Footer reply note:
  // - inbound configured → replies are tracked in the contractor's dashboard
  // - contractor email only → replies go directly to contractor (not tracked)
  // - neither → omit note
  const replyNote = inboundReplyToEmail
    ? "Reply to this email and your response will be recorded for your contractor."
    : contractorEmail
    ? `Reply directly to this email and your message will go to ${safeCompany}.`
    : ""

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${safeSubject}</title>
</head>
<body style="margin:0; padding:0; background-color:#F0F4F1; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">

  <!--[if mso]>
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td align="center">
  <![endif]-->

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#F0F4F1; min-width:100%;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Email card — max 600px -->
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px; width:100%; background-color:#FFFFFF;
                      border-radius:8px;
                      box-shadow:0 1px 3px rgba(0,0,0,0.08),0 1px 2px rgba(0,0,0,0.04);">

          <!-- Green header bar -->
          <tr>
            <td style="background-color:#024D8B; padding:18px 32px;
                       border-radius:8px 8px 0 0;">
              <span style="display:inline-block; width:8px; height:8px;
                           background-color:#FFFFFF; border-radius:50%;
                           margin-right:8px; vertical-align:middle; opacity:0.85;"></span>
              <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                           font-size:13px; font-weight:600; color:#FFFFFF;
                           letter-spacing:0.04em; vertical-align:middle;">
                Follow-up from ${safeCompany}
              </span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 28px 32px;">

              <!-- Subject heading -->
              <h1 style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                         margin:0 0 28px 0; font-size:22px; font-weight:700;
                         color:#111827; line-height:1.3; letter-spacing:-0.01em;">
                ${safeSubject}
              </h1>

              <!-- Message body -->
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                ${messageParagraphs}
              </div>

              <!-- Pay now -->
              ${payButton}

              <!-- Signature -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="margin-top:28px; border-top:1px solid #E5E7EB;">
                <tr>
                  <td style="padding-top:24px;">
                    <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                               margin:0 0 4px 0; font-size:15px; font-weight:600; color:#111827;">
                      ${safeOwner}
                    </p>
                    <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                               margin:0 0 6px 0; font-size:14px; color:#4B5563;">
                      ${safeCompany}
                    </p>
                    ${sigLines.join("\n                    ")}
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#F9FAFB; border-top:1px solid #E5E7EB;
                       padding:16px 32px; border-radius:0 0 8px 8px;">
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                        margin:0; font-size:12px; color:#9CA3AF; line-height:1.6;">
                Sent via ${safeApp} on behalf of ${safeCompany}.${replyNote ? " " + replyNote : ""}
              </p>
            </td>
          </tr>

        </table>
        <!-- /Email card -->

      </td>
    </tr>
  </table>
  <!-- /Outer wrapper -->

  <!--[if mso]>
  </td></tr></table>
  <![endif]-->

</body>
</html>`
}

// ── Plain text fallback ────────────────────────────────────────────────────────

export function renderRecoveryEmailText(args: RecoveryEmailArgs): string {
  const {
    messageBody,
    subject,
    contractorName,
    companyName,
    contractorEmail,
    contractorPhone,
    contractorWebsite,
    inboundReplyToEmail,
    appName = "Euroflo",
    payUrl,
    payLabel = "Pay now",
  } = args

  const sigParts = [contractorName, companyName]
  if (contractorPhone)   sigParts.push(contractorPhone)
  if (contractorWebsite) sigParts.push(contractorWebsite)

  const replyNote = inboundReplyToEmail
    ? "Reply to this email and your response will be recorded for your contractor."
    : contractorEmail
    ? `Reply directly to this email and your message will go to ${companyName}.`
    : ""

  return [
    subject,
    "─".repeat(subject.length),
    "",
    messageBody,
    ...(payUrl ? ["", `${payLabel}: ${safeHref(payUrl)}`] : []),
    "",
    "--",
    ...sigParts,
    "",
    `Sent via ${appName} on behalf of ${companyName}.${replyNote ? " " + replyNote : ""}`,
  ].join("\n")
}
