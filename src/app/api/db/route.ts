import { executeQuery, executeRpcSafe } from "@/lib/db/server/executor";
import { HttpError, errorResponse } from "@/lib/db/server/http";
import type { GatewayRequest } from "@/lib/db/types";
import { requireUser } from "@/lib/auth/request";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1_000_000;

/**
 * POST /api/db — the browser's only way to the database.
 *
 * Body: { query: QuerySpec } | { rpc: { name, args } }  (see src/lib/db/types.ts).
 * The caller is the signed-in user (HttpOnly session cookie). The executor checks every
 * table, column, filter and row against that user's access (src/lib/db/server/policy.ts)
 * before running anything, so a hand-written request can reach no more than the app can.
 *
 * Always answers 200 with `{ data, error, count }` for a query, so the browser sees the
 * same shape as an in-process call; 401 only when there is no valid session.
 */
export async function POST(request: Request) {
  try {
    const { user } = await requireUser(request);
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) throw new HttpError(413, "Request is too large");

    let body: GatewayRequest;
    try {
      body = (await request.json()) as GatewayRequest;
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }
    const principal = { kind: "user" as const, userId: user.id };

    if (body && typeof body === "object" && "query" in body && body.query) {
      return Response.json(await executeQuery(body.query, principal), { headers: { "Cache-Control": "no-store" } });
    }
    if (body && typeof body === "object" && "rpc" in body && body.rpc && typeof body.rpc.name === "string") {
      return Response.json(await executeRpcSafe(body.rpc, principal), { headers: { "Cache-Control": "no-store" } });
    }
    throw new HttpError(400, "Expected { query } or { rpc }");
  } catch (err) {
    if (err instanceof HttpError && (err.status === 401 || err.status === 503)) {
      return Response.json({ data: null, error: { message: err.message, code: err.status === 401 ? "401" : "DB_NOT_CONFIGURED" }, count: null }, { status: err.status });
    }
    return errorResponse(err);
  }
}
