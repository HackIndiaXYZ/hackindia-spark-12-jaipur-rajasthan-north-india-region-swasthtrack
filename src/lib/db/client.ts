import { DbClient } from "./builder";
import type { DbResponse, GatewayRequest } from "./types";

/**
 * Browser (and any non-server) data client. It never talks to MySQL: each query is
 * serialised and POSTed to /api/db, where the server authorises it as the signed-in
 * user (HttpOnly session cookie) and runs it. Same call shape as the server's
 * in-process client (src/lib/db/server/executor.ts `createDb`).
 */

let unauthorizedHandler: (() => void) | null = null;

/** The auth provider registers here to learn when the server says the session is gone (HTTP 401). */
export function onSessionRejected(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

async function post(body: GatewayRequest): Promise<DbResponse<unknown>> {
  let res: Response;
  try {
    res = await fetch("/api/db", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // The services match this text to show "check your connection".
    return { data: null, error: { message: "Failed to fetch" }, count: null };
  }

  if (res.status === 401) unauthorizedHandler?.();
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // not JSON: handled below
  }
  if (json && typeof json === "object" && "error" in json && "data" in json) return json as DbResponse<unknown>;
  const message = json && typeof json === "object" && typeof (json as { error?: unknown }).error === "string" ? (json as { error: string }).error : `Request failed (${res.status})`;
  return { data: null, error: { message, code: res.status === 401 ? "401" : String(res.status) }, count: null };
}

export const db = new DbClient(
  (query) => post({ query }),
  (rpc) => post({ rpc }),
);
