import nodemailer, { type Transporter } from "nodemailer";

export interface ReportConfig {
  patientId: string;
  recipients: string[];
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Recipients and the patient they belong to come from env for now — the app has
 * no stored e-mail addresses (auth is phone-only). Returns null when unset so
 * callers can refuse to send rather than guess.
 */
export function getReportConfig(): ReportConfig | null {
  const patientId = process.env.REPORT_PATIENT_ID?.trim();
  const recipients = (process.env.REPORT_EMAIL_TO ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!patientId || recipients.length === 0) return null;
  return { patientId, recipients };
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  const pass = process.env.SMTP_PASS || process.env.RESEND_API_KEY;
  if (!pass) return null;
  const port = Number(process.env.SMTP_PORT || 465);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.resend.com",
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER || "resend", pass },
  });
  return transporter;
}

export async function sendMail(
  to: string[],
  mail: { subject: string; html: string; text: string },
): Promise<SendResult> {
  const t = getTransporter();
  if (!t) return { ok: false, error: "SMTP password / RESEND_API_KEY is not configured" };
  try {
    const info = await t.sendMail({
      from: process.env.EMAIL_FROM || "SwasthTrack <onboarding@resend.dev>",
      to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
