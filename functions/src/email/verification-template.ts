function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildVerificationEmailHtml(
  verificationUrl: string
): string {
  const safeVerificationUrl = escapeHtml(verificationUrl);

  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Verify Your ServicePilot Email</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f6fb;margin:0;padding:0;width:100%;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e3e9f2;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 20px 32px;text-align:center;">
                <div style="font-size:24px;font-weight:800;letter-spacing:1px;color:#0f172a;line-height:1.2;">
                  SERVICE<span style="color:#2563eb;">PILOT</span>
                </div>
                <div style="font-size:13px;color:#64748b;margin-top:6px;">
                  Field Service Management
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 4px 32px;text-align:center;">
                <h1 style="margin:0;color:#0f172a;font-size:26px;line-height:1.3;font-weight:800;">
                  Verify Your Email
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0 32px;text-align:center;">
                <p style="margin:0;color:#475569;font-size:16px;line-height:1.6;">
                  Thanks for creating your ServicePilot account.
                </p>
                <p style="margin:12px 0 0 0;color:#475569;font-size:16px;line-height:1.6;">
                  Please verify your email address to complete your registration and secure your account.
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:28px 32px 24px 32px;">
                <a href="${safeVerificationUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;line-height:1;border-radius:10px;padding:16px 28px;">
                  Verify Email
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px 32px;text-align:center;">
                <p style="margin:0;color:#64748b;font-size:14px;line-height:1.6;">
                  If the button does not work, copy and paste this secure Firebase verification link into your browser:
                </p>
                <p style="margin:10px 0 0 0;color:#2563eb;font-size:12px;line-height:1.5;word-break:break-all;">
                  <a href="${safeVerificationUrl}" style="color:#2563eb;text-decoration:underline;">${safeVerificationUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 32px;background:#f8fafc;border-top:1px solid #e3e9f2;text-align:center;">
                <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">
                  If you did not create a ServicePilot account, you can safely ignore this email.
                </p>
                <p style="margin:16px 0 0 0;color:#94a3b8;font-size:12px;line-height:1.5;">
                  ServicePilot<br>
                  Field Service Management
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}

export function buildVerificationEmailText(
  verificationUrl: string
): string {
  return [
    "SERVICEPILOT",
    "Field Service Management",
    "",
    "Verify Your Email",
    "",
    "Thanks for creating your ServicePilot account.",
    "",
    "Please verify your email address to complete your registration and secure your account.",
    "",
    `Verify Email: ${verificationUrl}`,
    "",
    "If you did not create a ServicePilot account, you can safely ignore this email.",
    "",
    "ServicePilot",
    "Field Service Management",
  ].join("\n");
}
