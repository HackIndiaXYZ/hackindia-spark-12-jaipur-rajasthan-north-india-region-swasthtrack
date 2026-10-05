import type { AuthUser, SessionPayload } from "./constants";

/**
 * Browser only. The signed-in account as this tab knows it, plus a tiny event bus so the
 * auth provider hears about sign-in, sign-out and expiry (including from another tab).
 *
 * The truth lives on the server (HttpOnly cookie -> /api/auth/session); this is only a cache of it.
 */

export type SessionEvent = "SIGNED_IN" | "SIGNED_OUT" | "SESSION_REFRESHED";
type Listener = (event: SessionEvent, user: AuthUser | null) => void;

const listeners = new Set<Listener>();
let cachedUser: AuthUser | null = null;
let cacheKnown = false;
let channel: BroadcastChannel | null = null;

function broadcast(message: "signed-in" | "signed-out"): void {
  try {
    if (typeof BroadcastChannel === "undefined") return;
    channel ??= new BroadcastChannel("swasthtrack-auth");
    channel.postMessage(message);
  } catch {
    // no cross-tab sync in this browser
  }
}

/** Another tab signed in or out: re-read the session here. */
if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
  try {
    channel = new BroadcastChannel("swasthtrack-auth");
    channel.onmessage = () => void refreshSession();
  } catch {
    // ignore
  }
}

export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(event: SessionEvent, user: AuthUser | null): void {
  listeners.forEach((l) => l(event, user));
}

/** Called by the auth service right after the server accepted a sign-in. */
export function sessionStarted(user: AuthUser): void {
  cachedUser = user;
  cacheKnown = true;
  emit("SIGNED_IN", user);
  broadcast("signed-in");
}

/** Called after sign-out, or when the server rejects the session (401). */
export function sessionEnded(tellOtherTabs = true): void {
  const had = cachedUser !== null;
  cachedUser = null;
  cacheKnown = true;
  emit("SIGNED_OUT", null);
  if (had && tellOtherTabs) broadcast("signed-out");
}

/** Record what the server just said without notifying anyone (the first read of a page load). */
export function primeSession(user: AuthUser | null): void {
  cachedUser = user;
  cacheKnown = true;
}

export function knownUser(): AuthUser | null | undefined {
  return cacheKnown ? cachedUser : undefined;
}

let inflight: Promise<SessionPayload> | null = null;

/** GET /api/auth/session, de-duplicated. Updates the cache and tells listeners about a change. */
export function fetchSessionPayload(): Promise<SessionPayload> {
  inflight ??= (async () => {
    try {
      const res = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error(`session ${res.status}`);
      return (await res.json()) as SessionPayload;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Re-read the session and emit only if the signed-in account actually changed. */
export async function refreshSession(): Promise<SessionPayload | null> {
  let payload: SessionPayload;
  try {
    payload = await fetchSessionPayload();
  } catch {
    return null; // offline or the server is restarting: keep what we have
  }
  const before = cachedUser?.id ?? null;
  const after = payload.user?.id ?? null;
  cachedUser = payload.user;
  cacheKnown = true;
  if (before !== after) emit(after ? "SIGNED_IN" : "SIGNED_OUT", payload.user);
  return payload;
}
