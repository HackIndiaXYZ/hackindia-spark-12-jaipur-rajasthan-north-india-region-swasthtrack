import { timingSafeEqual } from "node:crypto";
import { getNotifierClient } from "@/lib/supabase/notifier";
import { runEmailJob } from "@/services/email-notification-service";
import { fillRecipient } from "./layout";
import { getReportConfig, sendMail } from "./mailer";
import type { RenderedEmail } from "./templates";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Shared body of the cron endpoints. Vercel Cron calls these with
 * `Authorization: Bearer $CRON_SECRET`; anything else is rejected, so nobody
 * can use these URLs to make the server send mail. `?dryRun=1` (same auth)
 * returns the rendered HTML instead of sending, for previewing a template.
 *
 * The data is read as the "notifier" account when NOTIFY_USER_EMAIL/PASSWORD are
 * set (see lib/supabase/notifier.ts), so Row Level Security applies to cron too.
 */
export async function runCron(
  request: Request,
  build: (patientId: string) => Promise<RenderedEmail | null>,
): Promise<Response> {
  if (!process.env.CRON_SECRET) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = getReportConfig();
  if (!config) {
    return Response.json(
      { error: "REPORT_PATIENT_ID and REPORT_EMAIL_TO must both be set" },
      { status: 500 },
    );
  }

  try {
    const client = await getNotifierClient();
    const email = await runEmailJob(client, config.patientId, () => build(config.patientId));
    if (!email) return Response.json({ sent: false, reason: "nothing to report" });

    if (new URL(request.url).searchParams.get("dryRun") === "1") {
      return new Response(fillRecipient(email, config.recipients[0]).html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    const result = await sendMail(config.recipients, email);
    if (!result.ok) {
      console.error("[email] send failed:", result.error);
      return Response.json({ sent: false, error: result.error }, { status: 502 });
    }
    return Response.json({ sent: true, subject: email.subject, messageId: result.messageId });
  } catch (err) {
    console.error("[email] cron build failed:", err);
    return Response.json(
      { sent: false, error: err instanceof Error ? err.message : "Failed to build email" },
      { status: 500 },
    );
  }
}
