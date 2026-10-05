import { randomInt, randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import type { RpcSpec } from "../types";
import type { Principal } from "./policy";
import { QueryError, getPool, withTransaction } from "./pool";
import { DEFAULT_ALERTS_ENABLED, DEFAULT_BP_TARGETS, TABLES, type TableDef } from "./schema";
import { checkRule, fromDbValue, isUuid, toDbValue, toMysqlTimestamp } from "./values";

/**
 * Server only. The multi-step operations that used to be Postgres SECURITY DEFINER
 * functions: creating a patient (+ owner membership + settings in one transaction),
 * caregiver invites, the caregiver roster, and the owner-contact lookup behind the
 * "X joined your care team" e-mail.
 *
 * Every function authorises with the caller's own id, exactly like the SQL did, and
 * raises the same messages and SQLSTATE codes the UI maps to friendly text.
 */

type Row = Record<string, unknown>;
type Args = Record<string, unknown>;

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_MINUTES = 15;
const INVITE_ATTEMPT_LIMIT = 10;
const INVITE_ATTEMPT_WINDOW_MIN = 15;
const OWNER_CONTACT_WINDOW_MIN = 10;

const fail = (message: string, code: string): never => {
  throw new QueryError(message, code);
};

function callerId(principal: Principal): string {
  if (principal.kind !== "user") return fail("not authenticated", "28000");
  return principal.userId;
}

function shape(def: TableDef, raw: Row): Row {
  const out: Row = {};
  for (const col of Object.keys(def.cols)) if (col in raw) out[col] = fromDbValue(def.cols[col], raw[col]);
  return out;
}

async function one(conn: Pick<PoolConnection, "query">, query: string, params: unknown[] = []): Promise<Row | null> {
  const [rows] = await conn.query(query, params);
  return (rows as Row[])[0] ?? null;
}

async function many(conn: Pick<PoolConnection, "query">, query: string, params: unknown[] = []): Promise<Row[]> {
  const [rows] = await conn.query(query, params);
  return rows as Row[];
}

async function isOwner(conn: Pick<PoolConnection, "query">, patientId: string, userId: string): Promise<boolean> {
  return Boolean(
    await one(
      conn,
      "SELECT 1 AS ok FROM patient_members WHERE patient_id = ? AND user_id = ? AND status = 'active' AND role = 'owner' LIMIT 1",
      [patientId, userId],
    ),
  );
}

function uuidArg(value: unknown, name: string): string {
  if (!isUuid(value)) return fail(`${name} must be a UUID`, "22P02");
  return value.toLowerCase();
}

// ---------------------------------------------------------------------------

async function createPatient(args: Args, principal: Principal): Promise<Row> {
  const userId = callerId(principal);
  const name = typeof args.p_name === "string" ? args.p_name.trim() : "";
  if (!name) fail("patient name is required", "P0001");

  const def = TABLES.patients;
  const calories = args.p_daily_calorie_target == null ? 1600 : args.p_daily_calorie_target;
  const input: Row = {
    name,
    age: args.p_age ?? null,
    gender: args.p_gender ?? null,
    height_cm: args.p_height_cm ?? null,
    current_weight_kg: args.p_current_weight_kg ?? null,
    target_weight_kg: args.p_target_weight_kg ?? null,
    daily_calorie_target: calories,
  };
  for (const [col, value] of Object.entries(input)) {
    const rule = def.rules?.[col];
    if (rule) checkRule(col, rule, value);
  }

  const id = randomUUID();
  return withTransaction(async (conn) => {
    const cols = Object.keys(input);
    await conn.query(`INSERT INTO patients (id, ${cols.map((c) => `\`${c}\``).join(", ")}) VALUES (?, ${cols.map(() => "?").join(", ")})`, [
      id,
      ...cols.map((c) => toDbValue(def.cols[c], input[c], c)),
    ]);
    await conn.query("INSERT INTO patient_members (id, patient_id, user_id, role) VALUES (?, ?, ?, 'owner')", [randomUUID(), id, userId]);
    await conn.query(
      "INSERT INTO patient_settings (patient_id, daily_calorie_target, alerts_enabled, bp_targets) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE patient_id = patient_id",
      [id, toDbValue("int", calories, "daily_calorie_target"), JSON.stringify(DEFAULT_ALERTS_ENABLED), JSON.stringify(DEFAULT_BP_TARGETS)],
    );
    const created = await one(conn, "SELECT * FROM patients WHERE id = ?", [id]);
    return shape(def, created as Row);
  });
}

function newInviteCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  return code;
}

async function createCaregiverInvite(args: Args, principal: Principal): Promise<Row> {
  const userId = callerId(principal);
  const patientId = uuidArg(args.p_patient, "p_patient");
  const role = args.p_role == null ? "viewer" : args.p_role;
  const def = TABLES.caregiver_invites;

  return withTransaction(async (conn) => {
    if (!(await isOwner(conn, patientId, userId))) fail("only the patient owner can invite caregivers", "42501");
    if (role !== "editor" && role !== "viewer") fail("role must be editor or viewer", "P0001");

    await conn.query("UPDATE caregiver_invites SET status = 'cancelled' WHERE patient_id = ? AND status = 'pending'", [patientId]);

    const expires = toMysqlTimestamp(new Date(Date.now() + INVITE_MINUTES * 60_000));
    for (let attempt = 0; attempt < 6; attempt++) {
      const id = randomUUID();
      try {
        await conn.query(
          "INSERT INTO caregiver_invites (id, patient_id, created_by, role, code, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
          [id, patientId, userId, role, newInviteCode(), expires],
        );
        return shape(def, (await one(conn, "SELECT * FROM caregiver_invites WHERE id = ?", [id])) as Row);
      } catch (err) {
        // Two invites drew the same 8 characters (1 in a trillion): draw again.
        if ((err as { errno?: number }).errno !== 1062) throw err;
      }
    }
    return fail("could not create an invite code, please try again", "XX000");
  });
}

function toIsoUtc(mysqlTs: string): string {
  return fromDbValue("ts", mysqlTs) as string;
}

async function acceptCaregiverInvite(args: Args, principal: Principal): Promise<string> {
  const userId = callerId(principal);
  const code = typeof args.p_code === "string" ? args.p_code.trim().toUpperCase() : "";
  const pool = getPool();

  // Counted OUTSIDE the transaction below: a wrong code rolls that back, and the
  // attempt must still count or the limit could be guessed around.
  const since = toMysqlTimestamp(new Date(Date.now() - INVITE_ATTEMPT_WINDOW_MIN * 60_000));
  const recent = await one(pool, "SELECT COUNT(*) AS n FROM caregiver_invite_attempts WHERE user_id = ? AND attempted_at > ?", [userId, since]);
  if (Number(recent?.n ?? 0) >= INVITE_ATTEMPT_LIMIT) fail("too many attempts, try again later", "54000");
  await pool.query("INSERT INTO caregiver_invite_attempts (user_id) VALUES (?)", [userId]);

  let expired = false;
  const patientId = await withTransaction(async (conn) => {
    const invite = await one(conn, "SELECT * FROM caregiver_invites WHERE code = ? AND status = 'pending' FOR UPDATE", [code]);
    if (!code || !invite) return fail("invalid or already used invite code", "P0001");

    if (new Date(toIsoUtc(invite.expires_at as string)).getTime() < Date.now()) {
      await conn.query("UPDATE caregiver_invites SET status = 'expired' WHERE id = ?", [invite.id]);
      expired = true;
      return null;
    }

    await conn.query(
      `INSERT INTO patient_members (id, patient_id, user_id, role, invited_by) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = 'active', role = IF(role = 'owner', 'owner', VALUES(role))`,
      [randomUUID(), invite.patient_id, userId, invite.role, invite.created_by],
    );
    await conn.query("UPDATE caregiver_invites SET status = 'accepted', accepted_by = ?, accepted_at = ? WHERE id = ?", [
      userId,
      toMysqlTimestamp(new Date()),
      invite.id,
    ]);
    return invite.patient_id as string;
  });

  if (expired || !patientId) return fail("invite code has expired", "P0001");
  return patientId;
}

async function listPatientMembers(args: Args, principal: Principal): Promise<Row[]> {
  const userId = callerId(principal);
  const patientId = uuidArg(args.p_patient, "p_patient");
  const pool = getPool();
  if (!(await isOwner(pool, patientId, userId))) fail("only the patient owner can list members", "42501");
  const rows = await many(
    pool,
    `SELECT m.id AS member_id, m.user_id, p.email, p.display_name, m.role, m.status, m.created_at
       FROM patient_members m LEFT JOIN profiles p ON p.id = m.user_id
      WHERE m.patient_id = ? ORDER BY m.created_at`,
    [patientId],
  );
  return rows.map((r) => ({ ...r, email: r.email ?? null, display_name: r.display_name ?? null, created_at: fromDbValue("ts", r.created_at) }));
}

async function setPatientMember(args: Args, principal: Principal): Promise<null> {
  const userId = callerId(principal);
  const memberId = uuidArg(args.p_member, "p_member");
  const status = args.p_status ?? null;
  const role = args.p_role ?? null;

  await withTransaction(async (conn) => {
    const member = await one(conn, "SELECT * FROM patient_members WHERE id = ? FOR UPDATE", [memberId]);
    if (!member) fail("member not found", "P0001");
    const target = member as Row;
    if (!(await isOwner(conn, target.patient_id as string, userId))) fail("only the patient owner can manage members", "42501");
    if (target.user_id === userId) fail("you cannot change your own membership", "P0001");
    if (status !== null && status !== "active" && status !== "revoked") fail("invalid status", "P0001");
    if (role !== null && role !== "owner" && role !== "editor" && role !== "viewer") fail("invalid role", "P0001");
    await conn.query("UPDATE patient_members SET status = ?, role = ? WHERE id = ?", [status ?? target.status, role ?? target.role, memberId]);
  });
  return null;
}

/** The owner's address(es), for a caregiver whose membership is only minutes old. */
async function getPatientOwnerContacts(args: Args, principal: Principal): Promise<Row[]> {
  const userId = callerId(principal);
  const patientId = uuidArg(args.p_patient, "p_patient");
  const pool = getPool();
  const since = toMysqlTimestamp(new Date(Date.now() - OWNER_CONTACT_WINDOW_MIN * 60_000));
  const recent = await one(
    pool,
    "SELECT 1 AS ok FROM patient_members WHERE patient_id = ? AND user_id = ? AND status = 'active' AND role <> 'owner' AND created_at > ? LIMIT 1",
    [patientId, userId, since],
  );
  if (!recent) fail("no recent join to announce for this patient", "42501");
  return many(
    pool,
    `SELECT m.user_id AS owner_user_id, p.email AS owner_email, p.display_name AS owner_name
       FROM patient_members m LEFT JOIN profiles p ON p.id = m.user_id
      WHERE m.patient_id = ? AND m.role = 'owner' AND m.status = 'active'`,
    [patientId],
  );
}

const FUNCTIONS: Record<string, (args: Args, principal: Principal) => Promise<unknown>> = {
  create_patient: createPatient,
  create_caregiver_invite: createCaregiverInvite,
  accept_caregiver_invite: acceptCaregiverInvite,
  list_patient_members: listPatientMembers,
  set_patient_member: setPatientMember,
  get_patient_owner_contacts: getPatientOwnerContacts,
};

export async function executeRpc(spec: RpcSpec, principal: Principal): Promise<unknown> {
  const fn = Object.prototype.hasOwnProperty.call(FUNCTIONS, spec.name) ? FUNCTIONS[spec.name] : undefined;
  if (!fn) throw new QueryError(`Could not find the function public.${String(spec.name)}`, "PGRST202");
  const args = spec.args && typeof spec.args === "object" && !Array.isArray(spec.args) ? spec.args : {};
  return fn(args, principal);
}
