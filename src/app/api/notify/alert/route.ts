import { getReportConfig, sendMail } from "@/lib/email/mailer";
import type { RenderedEmail } from "@/lib/email/types";
import {
  HttpError,
  errorResponse,
  requirePatientAccess,
  requireUser,
} from "@/lib/supabase/server";
import {
  buildBpAlertEmail,
  buildWeightAlertEmail,
  runEmailJob,
} from "@/services/email-notification-service";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Kind = "bp" | "weight";

/**
 * Best-effort guard against the same reading being mailed twice (double submit,
 * retry). Per server instance only — the real protection is that the caller must be
 * a member of the patient, the reading is re-read through their own session, must be
 * under 30 minutes old and must cross an alert line.
 */
const alreadySent = new Set<string>();

async function build(
  kind: Kind,
  patientId: string,
  readingId: string,
): Promise<{ email: RenderedEmail } | { email: null; reason: string }> {
  return kind === "weight"
    ? buildWeightAlertEmail(patientId, readingId)
    : buildBpAlertEmail(patientId, readingId);
}

/**
 * POST { kind?: "bp" | "weight", patientId, readingId } with the user's bearer token
 * (authFetch) — called by the app right after a BP reading or weigh-in is saved.
 * The body only identifies the reading; subject, content and recipients are all
 * decided on the server. Reads run as the signed-in user, so RLS applies.
 */
export async function POST(request: Request) {
  const key = { value: "" };
  try {
    const { user, supabase } = await requireUser(request);

    let body: { kind?: unknown; patientId?: unknown; readingId?: unknown };
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }

    const kind: Kind = body.kind === "weight" ? "weight" : "bp";
    const patientId = typeof body.patientId === "string" ? body.patientId : "";
    const readingId = typeof body.readingId === "string" ? body.readingId : "";
    if (!UUID.test(patientId) || !UUID.test(readingId)) {
      throw new HttpError(400, "patientId and readingId must be UUIDs");
    }

    // Must be a member of this patient; RLS would also hide the rows from anyone else.
    await requirePatientAccess(supabase, user.id, patientId);

    const config = getReportConfig();
    if (!config) return Response.json({ sent: false, reason: "email not configured" });
    if (patientId !== config.patientId) {
      return Response.json({ sent: false, reason: "patient not subscribed to e-mail alerts" });
    }

    key.value = `${kind}:${readingId}`;
    if (alreadySent.has(key.value)) {
      key.value = "";
      return Response.json({ sent: false, reason: "already sent" });
    }
    alreadySent.add(key.value);

    const outcome = await runEmailJob(supabase, patientId, () => build(kind, patientId, readingId));
    if (!outcome.email) {
      alreadySent.delete(key.value);
      return Response.json({ sent: false, reason: outcome.reason });
    }

    const result = await sendMail(config.recipients, outcome.email);
    if (!result.ok) {
      alreadySent.delete(key.value);
      console.error(`[email] ${kind} alert send failed:`, result.error);
      return Response.json({ sent: false, error: result.error }, { status: 502 });
    }
    return Response.json({ sent: true, kind });
  } catch (err) {
    if (key.value) alreadySent.delete(key.value);
    return errorResponse(err);
  }
}
