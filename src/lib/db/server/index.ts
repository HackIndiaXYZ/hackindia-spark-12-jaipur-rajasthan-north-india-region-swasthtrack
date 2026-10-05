/**
 * Server only. The one import Route Handlers use for data access and caller identity.
 * (Browser code imports from "@/lib/db/client" instead, which never reaches MySQL.)
 */
export { HttpError, errorResponse, requirePatientAccess } from "./http";
export { createDb, executeQuery, executeRpcSafe } from "./executor";
export { isDatabaseConfigured } from "./pool";
export type { Principal } from "./policy";
export { requireUser, type AuthedRequest } from "@/lib/auth/request";
