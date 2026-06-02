// Server-only — never import from client components.
// Generates HTML and plain-text confirmation emails for the client intake flow.
// Sent when a new client submits a project request; includes the magic login link.

export interface ClientIntakeEmailArgs {
  clientName: string
  contractorName: string
  projectTitle: string
  magicLink: string
  appName?: string
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function renderClientIntakeEmailHtml(args: ClientIntakeEmailArgs): string {
  const {
    clientName,
    contractorName,
    projectTitle,
    magicLink,
    appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Contractor Portal",
  } = args

  const safeName       = escapeHtml(clientName)
  const safeContractor = escapeHtml(contractorName)
  const safeProject    = escapeHtml(projectTitle)
  const safeApp        = escapeHtml(appName)
  const safeLink       = magicLink // URLs must not be HTML-escaped inside href

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Your request was submitted — ${safeContractor}</title>
</head>
<body style="margin:0; padding:0; background-color:#F0F4F1; -webkit-text-size-adjust:100%;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#F0F4F1; min-width:100%;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px; width:100%; background-color:#FFFFFF;
                      border-radius:10px;
                      box-shadow:0 1px 4px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:#024D8B; padding:20px 32px; border-radius:10px 10px 0 0;">
              <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                           font-size:14px; font-weight:700; color:#FFFFFF; letter-spacing:0.06em;">
                ${safeApp}
              </span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:44px 32px 36px 32px;">

              <!-- Check circle -->
              <div style="text-align:center; margin-bottom:24px;">
                <div style="display:inline-block; width:60px; height:60px;
                            background-color:#E0F0FF; border-radius:50%;
                            text-align:center; line-height:60px; font-size:30px;">
                  ✓
                </div>
              </div>

              <h1 style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                         margin:0 0 12px 0; font-size:26px; font-weight:700; color:#111827;
                         text-align:center; line-height:1.25;">
                Your request was submitted
              </h1>

              <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                        margin:0 0 28px 0; font-size:16px; color:#4B5563;
                        text-align:center; line-height:1.65;">
                Hi ${safeName},<br><br>
                <strong style="color:#111827;">${safeContractor}</strong> received your request
                for &ldquo;${safeProject}&rdquo;.<br><br>
                Use your private ${safeApp} link to track the request, review estimates,
                and pay securely. No password is needed.
              </p>

              <!-- CTA button -->
              <div style="text-align:center; margin-bottom:28px;">
                <a href="${safeLink}"
                   style="display:inline-block; background-color:#024D8B; color:#FFFFFF;
                          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                          font-size:15px; font-weight:600; text-decoration:none;
                          padding:14px 36px; border-radius:8px; letter-spacing:0.01em;">
                  Track your job →
                </a>
              </div>

              <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                        margin:0; font-size:13px; color:#9CA3AF; text-align:center; line-height:1.6;">
                This link signs you in automatically and expires in 24 hours.<br>
                You can use this same email address anytime to request a fresh login link.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#F9FAFB; border-top:1px solid #E5E7EB;
                       padding:16px 32px; border-radius:0 0 10px 10px; text-align:center;">
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                        margin:0; font-size:12px; color:#9CA3AF; line-height:1.6;">
                Powered by ${safeApp} — contractor project management
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`
}

export function renderClientIntakeEmailText(args: ClientIntakeEmailArgs): string {
  const { clientName, contractorName, projectTitle, magicLink, appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Contractor Portal" } = args

  return [
    `Your request was submitted`,
    `═`.repeat(40),
    ``,
    `Hi ${clientName},`,
    ``,
    `${contractorName} received your request for "${projectTitle}".`,
    ``,
    `Use your private ${appName} link to track the request, review estimates,`,
    `and pay securely. No password is needed.`,
    ``,
    `Track your job:`,
    magicLink,
    ``,
    `This link signs you in automatically and expires in 24 hours.`,
    `You can use this same email address anytime to request a fresh login link.`,
    ``,
    `—`,
    `Powered by ${appName}`,
  ].join("\n")
}
