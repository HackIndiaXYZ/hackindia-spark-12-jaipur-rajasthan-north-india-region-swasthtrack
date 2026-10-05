import { classifyBP } from "@/lib/health-rules";
import { authFetch } from "@/lib/db/auth-fetch";

/**
 * Fire-and-forget: asks the server to e-mail an alert for a just-saved reading.
 * The server makes the real decision (patient's own BP lines, weight-change rules)
 * and re-reads the row itself. Never throws — a failed alert must not make saving
 * the reading look failed.
 */
function postAlert(kind: "bp" | "weight", reading: { id: string; patient_id: string }): void {
  if (typeof window === "undefined") return;
  // Sends the signed-in user's token: the server checks they belong to the patient and reads the row as them.
  void authFetch("/api/notify/alert", {
    method: "POST",
    body: JSON.stringify({ kind, patientId: reading.patient_id, readingId: reading.id }),
    keepalive: true,
  }).catch(() => {});
}

/** Skips readings that are clearly fine (below the default target and not low) so routine logging does not hit the server. */
export function notifyAbnormalBp(reading: {
  id: string;
  patient_id: string;
  systolic: number;
  diastolic: number;
}): void {
  const c = classifyBP(reading.systolic, reading.diastolic);
  if (!c.aboveTarget && c.category !== "low") return;
  postAlert("bp", reading);
}

/** Weight needs history to judge, so the server decides; this only forwards the new weigh-in. */
export function notifyWeightLogged(reading: { id: string; patient_id: string }): void {
  postAlert("weight", reading);
}
