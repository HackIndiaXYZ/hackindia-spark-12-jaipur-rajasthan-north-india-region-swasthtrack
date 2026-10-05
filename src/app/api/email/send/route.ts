import type { DbClient } from "@/lib/db/builder";
import type { AuthUser } from "@/lib/auth/constants";
import { clock12, dateTimeBi } from "@/lib/email/format";
import { sendMail } from "@/lib/email/mailer";
import {
  renderAccessChangedEmail,
  renderCaregiverInviteEmail,
  renderCaregiverJoinedEmail,
  renderTestEmail,
  renderWelcomeEmail,
} from "@/lib/email/templates";
import type { RenderedEmail } from "@/lib/email/types";
import {
  HttpError,
  errorResponse,
  requirePatientAccess,
  requireUser,
} from "@/lib/db/server";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Per-user, per-type send limits (per server instance; stops a loop or a stuck button). */
const LIMITS: Record<string, { max: number; windowMs: number }> = {
  "account.test": { max: 5, windowMs: 3_600_000 },
  "account.welcome": { max: 2, windowMs: 3_600_000 },
  "caregiver.invite": { max: 6, windowMs: 3_600_000 },
  "caregiver.joined": { max: 3, windowMs: 3_600_000 },
  "caregiver.access-changed": { max: 20, windowMs: 3_600_000 },
};
const sendLog = new Map<string, number[]>();

function throttle(userId: string, type: string): void {
  const limit = LIMITS[type];
  const key = `${userId}:${type}`;
  const now = Date.now();
  const recent = (sendLog.get(key) ?? []).filter((t) => now - t < limit.windowMs);
  if (recent.length >= limit.max) {
    throw new HttpError(429, "Too many e-mails sent just now — please wait a while and try again.");
  }
  recent.push(now);
  sendLog.set(key, recent);
}

async function displayName(db: DbClient, user: AuthUser): Promise<string> {
  const { data } = await db.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  return data?.display_name?.trim() || user.email?.split("@")[0] || "SwasthTrack user";
}

async function patientName(db: DbClient, patientId: string): Promise<string> {
  const { data } = await db.from("patients").select("name").eq("id", patientId).maybeSingle();
  if (!data) throw new HttpError(404, "Patient not found");
  return data.name;
}

async function requireOwner(db: DbClient, userId: string, patientId: string): Promise<void> {
  const { role } = await requirePatientAccess(db, userId, patientId);
  if (role !== "owner") throw new HttpError(403, "Only the patient's owner can do this");
}

interface Built {
  to: string | string[];
  mail: RenderedEmail;
  /** Recipient is not the caller's own choice (e.g. the owner), so the address is not echoed back. */
  hideRecipient?: boolean;
}

async function build(
  type: string,
  body: Record<string, unknown>,
  user: AuthUser,
  db: DbClient,
): Promise<Built> {
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const userEmail = user.email;

  switch (type) {
    case "account.test": {
      if (!userEmail) throw new HttpError(400, "Your account has no e-mail address");
      return {
        to: userEmail,
        mail: renderTestEmail({ to: userEmail, sentAt: dateTimeBi(new Date()) }),
      };
    }

    case "account.welcome": {
      if (!userEmail) throw new HttpError(400, "Your account has no e-mail address");
      const patientId = str("patientId");
      let name: string | null = null;
      if (patientId) {
        await requirePatientAccess(db, user.id, patientId);
        name = await patientName(db, patientId);
      }
      return { to: userEmail, mail: renderWelcomeEmail({ name: await displayName(db, user), patientName: name }) };
    }

    case "caregiver.invite": {
      const patientId = str("patientId");
      const inviteId = str("inviteId");
      const to = str("to").trim().toLowerCase();
      if (!EMAIL_RE.test(to) || to.length > 254) throw new HttpError(400, "Enter a valid e-mail address");
      if (!inviteId) throw new HttpError(400, "inviteId is required");
      await requireOwner(db, user.id, patientId);

      const { data: invite, error } = await db
        .from("caregiver_invites")
        .select("code, role, status, expires_at")
        .eq("id", inviteId)
        .eq("patient_id", patientId)
        .maybeSingle();
      if (error) throw new HttpError(500, "Could not load the invite");
      if (!invite) throw new HttpError(404, "Invite not found");
      const expires = new Date(invite.expires_at);
      if (invite.status !== "pending" || expires.getTime() <= Date.now()) {
        throw new HttpError(409, "This invite has expired — create a new one and send that.");
      }

      return {
        to,
        mail: renderCaregiverInviteEmail({
          inviterName: await displayName(db, user),
          patientName: await patientName(db, patientId),
          code: invite.code,
          role: invite.role,
          validUntil: `${clock12(expires)} IST`,
          minutesValid: Math.max(1, Math.ceil((expires.getTime() - Date.now()) / 60_000)),
        }),
      };
    }

    case "caregiver.joined": {
      const patientId = str("patientId");
      const { role } = await requirePatientAccess(db, user.id, patientId);
      if (role === "owner") throw new HttpError(400, "Owners do not join their own patient");

      // The owner's address comes from a server function that only answers a caregiver whose
      // membership is minutes old (src/lib/db/server/rpc.ts getPatientOwnerContacts).
      const { data, error } = await db.rpc("get_patient_owner_contacts", { p_patient: patientId });
      if (error) {
        throw error.code === "42501"
          ? new HttpError(409, "There is no recent join to announce")
          : new HttpError(500, "Could not look up the owner");
      }
      const owners = (data ?? [])
        .map((o) => o.owner_email)
        .filter((e): e is string => Boolean(e));
      if (owners.length === 0) throw new HttpError(409, "The owner has no e-mail address on file");

      return {
        to: owners,
        hideRecipient: true,
        mail: renderCaregiverJoinedEmail({
          patientName: await patientName(db, patientId),
          caregiverName: await displayName(db, user),
          caregiverEmail: user.email ?? null,
          role: role === "editor" ? "editor" : "viewer",
          joinedAt: dateTimeBi(new Date()),
        }),
      };
    }

    case "caregiver.access-changed": {
      const patientId = str("patientId");
      const memberId = str("memberId");
      const change = str("change");
      if (change !== "removed" && change !== "role-changed") throw new HttpError(400, "change must be removed or role-changed");
      await requireOwner(db, user.id, patientId);

      // The roster (and so the e-mail address) comes from the owner-only RPC, never from the request.
      const { data: roster, error } = await db.rpc("list_patient_members", { p_patient: patientId });
      if (error) throw new HttpError(500, "Could not load the caregiver list");
      const member = (roster ?? []).find((m) => m.member_id === memberId);
      if (!member) throw new HttpError(404, "Caregiver not found");
      if (member.user_id === user.id) throw new HttpError(400, "That is you");
      if (!member.email) throw new HttpError(409, "This caregiver has no e-mail address on file");
      if (change === "removed" && member.status !== "revoked") throw new HttpError(409, "Access has not been removed");
      if (change === "role-changed" && (member.status !== "active" || member.role === "owner")) {
        throw new HttpError(409, "Role change does not apply to this member");
      }

      return {
        to: member.email,
        mail: renderAccessChangedEmail({
          patientName: await patientName(db, patientId),
          ownerName: await displayName(db, user),
          change,
          newRole: member.role === "editor" ? "editor" : "viewer",
        }),
      };
    }

    default:
      throw new HttpError(400, "Unknown e-mail type");
  }
}

/**
 * POST { type, ... } — e-mails the signed-in user triggers themselves. Unlike the
 * alert/cron mails these go to a person chosen by the request (the user's own
 * address, an invitee, or a caregiver the owner manages), so everything is checked:
 * a valid session, ownership of the patient where relevant, content built on the
 * server from database rows, and a per-user rate limit.
 *
 *   account.test              → the user's own address
 *   account.welcome           → the user's own address ({ patientId? })
 *   caregiver.invite          → { patientId, inviteId, to }
 *   caregiver.joined          → { patientId }  (to the owner; caller must have joined minutes ago)
 *   caregiver.access-changed  → { patientId, memberId, change: "removed" | "role-changed" }
 */
export async function POST(request: Request) {
  try {
    const { user, db } = await requireUser(request);

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }
    const type = typeof body.type === "string" ? body.type : "";
    if (!LIMITS[type]) throw new HttpError(400, "Unknown e-mail type");

    const { to, mail, hideRecipient } = await build(type, body, user, db);
    throttle(user.id, type);

    const result = await sendMail(Array.isArray(to) ? to : [to], mail);
    if (!result.ok) {
      console.error(`[email] ${type} failed:`, result.error);
      throw new HttpError(502, "The e-mail could not be sent. Please try again in a moment.");
    }
    return Response.json(hideRecipient ? { sent: true } : { sent: true, to });
  } catch (err) {
    return errorResponse(err);
  }
}
