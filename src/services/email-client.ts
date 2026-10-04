import { authFetch } from "@/lib/supabase/auth-fetch";

/** The e-mails a signed-in user can trigger from the app (see /api/email/send). */
export type AppEmailRequest =
  | { type: "account.test" }
  | { type: "account.welcome"; patientId?: string }
  | { type: "caregiver.invite"; patientId: string; inviteId: string; to: string }
  | { type: "caregiver.joined"; patientId: string }
  | {
      type: "caregiver.access-changed";
      patientId: string;
      memberId: string;
      change: "removed" | "role-changed";
    };

/** Sends the e-mail and resolves with the address it went to; throws the server's message on failure. */
export async function sendAppEmail(request: AppEmailRequest): Promise<{ to: string }> {
  const res = await authFetch("/api/email/send", { method: "POST", body: JSON.stringify(request) });
  const body = (await res.json().catch(() => ({}))) as { to?: string; error?: string };
  if (!res.ok) {
    throw new Error(body.error || "ईमेल नहीं भेजा जा सका। (Could not send the e-mail.)");
  }
  return { to: body.to ?? "" };
}

/**
 * For e-mails that are a courtesy rather than the point of the action (welcome,
 * "your access changed"): never throws and never blocks the caller.
 */
export function sendAppEmailQuietly(request: AppEmailRequest): void {
  void sendAppEmail(request).catch((err) => {
    console.warn(`[email] ${request.type} not sent:`, err instanceof Error ? err.message : err);
  });
}
