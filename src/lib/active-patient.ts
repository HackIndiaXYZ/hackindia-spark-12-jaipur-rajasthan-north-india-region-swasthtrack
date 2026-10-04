/**
 * Which patient the signed-in user is currently looking at.
 *
 * A plain module-level store (not React state) so the data services, which are
 * called from effects, event handlers and non-React code alike, can resolve
 * "the current patient" without every caller threading an id through. The auth
 * context is the only writer: it sets this from the user's real memberships and
 * clears it on sign-out. Nothing here is persisted; the "last chosen patient"
 * UI preference lives in the auth context and is validated against memberships.
 */

let activePatientId: string | null = null;
const listeners = new Set<(id: string | null) => void>();

export function getActivePatientId(): string | null {
  return activePatientId;
}

export function setActivePatientId(id: string | null): void {
  const next = id || null;
  if (next === activePatientId) return;
  activePatientId = next;
  listeners.forEach((listener) => listener(next));
}

/** Subscribe to changes (used by the data layer to drop caches). Returns an unsubscribe. */
export function subscribeActivePatient(listener: (id: string | null) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
