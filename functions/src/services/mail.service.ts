import { createTransport } from "nodemailer";

import { defineSecret } from "firebase-functions/params";

export const smtpHost = defineSecret("SMTP_HOST");
export const smtpPort = defineSecret("SMTP_PORT");
export const smtpUser = defineSecret("SMTP_USER");
export const smtpPassword = defineSecret("SMTP_PASSWORD");

export const mailSecrets = [
  smtpHost,
  smtpPort,
  smtpUser,
  smtpPassword,
];

type SendVerificationEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendVerificationEmailMessage({
  to,
  subject,
  html,
  text,
}: SendVerificationEmailInput): Promise<void> {
  const port = Number(smtpPort.value());

  if (!Number.isInteger(port)) {
    throw new Error("Invalid SMTP port configuration.");
  }

  const transporter = createTransport({
    host: smtpHost.value(),
    port,
    secure: port === 465,
    auth: {
      user: smtpUser.value(),
      pass: smtpPassword.value(),
    },
  });

  await transporter.sendMail({
    from: `"ServicePilot" <${smtpUser.value()}>`,
    to,
    subject,
    html,
    text,
  });
}
