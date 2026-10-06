/**
 * Server only. WHO may read or write WHICH rows: the Row Level Security policies
 * of the old Postgres migration (20261004000000_secure_auth_rls_soie.sql, in git history),
 * moved into the application because MySQL has no RLS and the browser never touches the
 * database. The executor calls these before every query; nothing is allowed by default.
 *
 * Roles on a patient (patient_members): owner (manage caregivers, delete) / editor (log
 * data) / viewer (read-only). A "system" principal is the scheduled e-mail job: read-only,
 * and only for the patients it was created for.
 */

import { QueryError } from "./pool";

export type Principal =
  | { kind: "user"; userId: string }
  | { kind: "system"; patientIds: string[] };

export interface Sql {
  sql: string;
  params: unknown[];
}

type Level = "member" | "writer" | "owner";

const sql = (text: string, params: unknown[] = []): Sql => ({ sql: text, params });

/** `col IN (patients this principal may access at `level`)`, or null when it may access none. */
export function patientCondition(p: Principal, level: Level, col: string): Sql | null {
  if (p.kind === "user") {
    const role = level === "owner" ? " AND pm.role = 'owner'" : level === "writer" ? " AND pm.role IN ('owner', 'editor')" : "";
    return sql(
      `${col} IN (SELECT pm.patient_id FROM patient_members pm WHERE pm.user_id = ? AND pm.status = 'active'${role})`,
      [p.userId],
    );
  }
  if (level !== "member" || p.patientIds.length === 0) return null;
  return sql(`${col} IN (${p.patientIds.map(() => "?").join(", ")})`, [...p.patientIds]);
}

const userOnly = (p: Principal, build: (userId: string) => Sql): Sql | null =>
  p.kind === "user" ? build(p.userId) : null;

/** Rows that carry a patient_id: members read, owners and editors write. */
function patientScoped(col = "patient_id"): Policy {
  return {
    select: (p) => patientCondition(p, "member", `t.${col}`),
    update: (p) => patientCondition(p, "writer", `t.${col}`),
    delete: (p) => patientCondition(p, "writer", `t.${col}`),
    insert: { level: "writer", scopeCol: col },
    immutable: ["id", col],
  };
}

export interface InsertRule {
  /** The row's `scopeCol` must belong to a patient the user holds at this level. */
  level?: Level;
  scopeCol?: string;
  /** Extra per-row condition (receives a lookup helper); return false to refuse the row. */
  check?: (ctx: CheckContext, row: Record<string, unknown>) => Promise<boolean>;
}

export interface CheckContext {
  principal: Principal;
  hasPatient: (patientId: string, level: Level) => Promise<boolean>;
  exists: (query: string, params: unknown[]) => Promise<boolean>;
}

export interface Policy {
  /** Visibility of rows to the reader (table alias is always `t`). Null = no access. */
  select: (p: Principal) => Sql | null;
  update?: (p: Principal) => Sql | null;
  delete?: (p: Principal) => Sql | null;
  /** Absent = rows cannot be inserted through the gateway. */
  insert?: InsertRule;
  /** Columns the server fills with the signed-in user's id on insert (whatever the client sent is ignored). */
  forced?: string[];
  /** Values that must hold for an inserted row (mirrors the old WITH CHECK). */
  require?: Record<string, unknown>;
  /** Columns an UPDATE may never change. */
  immutable?: string[];
  /** When set, an UPDATE may change ONLY these columns. */
  updatable?: string[];
}

const OWN_SESSION = "EXISTS (SELECT 1 FROM soie_sessions s WHERE s.id = t.session_id AND s.user_id = ?)";

export const POLICIES: Record<string, Policy> = {
  // --- tables carrying patient_id --------------------------------------
  medical_conditions: patientScoped(),
  medicines: patientScoped(),
  patient_food_favorites: patientScoped(),
  food_logs: patientScoped(),
  bp_logs: patientScoped(),
  weight_logs: patientScoped(),
  activity_logs: patientScoped(),
  sleep_logs: patientScoped(),
  daily_checklists: patientScoped(),
  patient_settings: { ...patientScoped(), immutable: ["patient_id"] },

  // A dose can only be logged against a medicine of the same patient.
  medicine_logs: {
    ...patientScoped(),
    insert: {
      level: "writer",
      scopeCol: "patient_id",
      check: (ctx, row) =>
        ctx.exists("SELECT 1 FROM medicines m WHERE m.id = ? AND m.patient_id = ? LIMIT 1", [row.medicine_id, row.patient_id]),
    },
    immutable: ["id", "patient_id", "medicine_id"],
  },

  soie_memories: { ...patientScoped(), forced: ["created_by"], immutable: ["id", "patient_id", "created_by"] },
  // A learned meal photo: the shape of the JSON columns is checked here (MySQL cannot), and
  // only the meal label may change afterwards.
  food_photo_examples: {
    ...patientScoped(),
    insert: {
      level: "writer",
      scopeCol: "patient_id",
      check: async (_ctx, row) => {
        validateFoodPhotoExample(row);
        return true;
      },
    },
    forced: ["created_by"],
    immutable: ["id", "patient_id", "created_by", "embedding", "foods", "thumbnail"],
  },

  // --- patients: created through the create_patient RPC only ------------
  patients: {
    select: (p) => patientCondition(p, "member", "t.id"),
    update: (p) => patientCondition(p, "writer", "t.id"),
    delete: (p) => patientCondition(p, "owner", "t.id"),
    immutable: ["id", "created_at"],
  },

  // --- shared food catalogue: readable by everyone signed in; a custom food is its creator's ---
  food_items: {
    select: () => sql("1 = 1"),
    update: (p) => userOnly(p, (id) => sql("t.created_by = ?", [id])),
    delete: (p) => userOnly(p, (id) => sql("t.created_by = ?", [id])),
    insert: {},
    forced: ["created_by"],
    require: { is_custom: true },
    immutable: ["id", "created_by"],
  },
  food_portions: {
    select: () => sql("1 = 1"),
    update: (p) => userOnly(p, (id) => sql("EXISTS (SELECT 1 FROM food_items f WHERE f.id = t.food_item_id AND f.created_by = ?)", [id])),
    delete: (p) => userOnly(p, (id) => sql("EXISTS (SELECT 1 FROM food_items f WHERE f.id = t.food_item_id AND f.created_by = ?)", [id])),
    insert: {
      check: (ctx, row) =>
        ctx.principal.kind === "user"
          ? ctx.exists("SELECT 1 FROM food_items f WHERE f.id = ? AND f.created_by = ? LIMIT 1", [row.food_item_id, ctx.principal.userId])
          : Promise.resolve(false),
    },
    immutable: ["id", "food_item_id"],
  },

  // --- accounts ----------------------------------------------------------
  // Read and rename your own profile. `role` and `email` never change from the client.
  profiles: {
    select: (p) => userOnly(p, (id) => sql("t.id = ?", [id])),
    update: (p) => userOnly(p, (id) => sql("t.id = ?", [id])),
    updatable: ["display_name"],
  },

  // You see your own memberships; owners see the whole roster. Every write is an RPC.
  patient_members: {
    select: (p) => {
      if (p.kind === "system") return patientCondition(p, "member", "t.patient_id");
      const owner = patientCondition(p, "owner", "t.patient_id");
      return owner ? sql(`(t.user_id = ? OR ${owner.sql})`, [p.userId, ...owner.params]) : null;
    },
  },
  caregiver_invites: {
    select: (p) => patientCondition(p, "owner", "t.patient_id"),
  },

  // --- SOIE: your own conversations, for patients you belong to ----------
  soie_sessions: {
    select: (p) => ownSessionRows(p),
    update: (p) => ownSessionRows(p),
    delete: (p) => ownSessionRows(p),
    insert: { level: "member", scopeCol: "patient_id" },
    forced: ["user_id"],
    immutable: ["id", "user_id", "patient_id"],
  },
  soie_messages: {
    select: (p) => userOnly(p, (id) => sql(OWN_SESSION, [id])),
    update: (p) => userOnly(p, (id) => sql(OWN_SESSION, [id])),
    delete: (p) => userOnly(p, (id) => sql(OWN_SESSION, [id])),
    insert: {
      check: (ctx, row) =>
        ctx.principal.kind === "user"
          ? ctx.exists("SELECT 1 FROM soie_sessions s WHERE s.id = ? AND s.user_id = ? LIMIT 1", [row.session_id, ctx.principal.userId])
          : Promise.resolve(false),
    },
    immutable: ["id", "session_id"],
  },
  soie_feedback: {
    select: (p) => userOnly(p, (id) => sql("t.user_id = ?", [id])),
    update: (p) => userOnly(p, (id) => sql("t.user_id = ?", [id])),
    delete: (p) => userOnly(p, (id) => sql("t.user_id = ?", [id])),
    insert: {
      check: (ctx, row) =>
        ctx.principal.kind === "user"
          ? ctx.exists(
              "SELECT 1 FROM soie_messages m JOIN soie_sessions s ON s.id = m.session_id WHERE m.id = ? AND s.user_id = ? LIMIT 1",
              [row.message_id, ctx.principal.userId],
            )
          : Promise.resolve(false),
    },
    forced: ["user_id"],
    immutable: ["id", "user_id", "message_id"],
  },
  soie_events: {
    select: (p) => userOnly(p, (id) => sql("t.user_id = ?", [id])),
    insert: {},
    forced: ["user_id"],
  },
};

const FOOD_PHOTO_EMBEDDING = 1024;
const FOOD_PHOTO_MAX_FOODS = 20;
const DATA_IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

/** The JSON columns of food_photo_examples, as the app writes them; anything else is refused with 23514. */
function validateFoodPhotoExample(row: Record<string, unknown>): void {
  const fail = (what: string): never => {
    throw new QueryError(`new row violates check constraint on "${what}"`, "23514");
  };
  const embedding = row.embedding;
  if (!Array.isArray(embedding) || embedding.length !== FOOD_PHOTO_EMBEDDING) fail("embedding");
  for (const v of embedding as unknown[]) if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 10) fail("embedding");
  const foods = row.foods;
  if (!Array.isArray(foods) || foods.length === 0 || foods.length > FOOD_PHOTO_MAX_FOODS) fail("foods");
  for (const f of foods as unknown[]) {
    if (!f || typeof f !== "object") fail("foods");
    const { food_item_id, name, quantity, unit, calories } = f as Record<string, unknown>;
    if (food_item_id !== null && !(typeof food_item_id === "string" && /^[0-9a-f-]{36}$/i.test(food_item_id))) fail("foods");
    if (typeof name !== "string" || name.trim() === "" || name.length > 255) fail("foods");
    if (typeof quantity !== "number" || !(quantity > 0) || quantity > 1000) fail("foods");
    if (typeof unit !== "string" || unit.length > 60) fail("foods");
    if (typeof calories !== "number" || !(calories >= 0) || calories > 100000) fail("foods");
  }
  const thumbnail = row.thumbnail;
  if (thumbnail !== null && thumbnail !== undefined && !(typeof thumbnail === "string" && DATA_IMAGE_RE.test(thumbnail))) fail("thumbnail");
  if (row.meal_type !== null && row.meal_type !== undefined && typeof row.meal_type !== "string") fail("meal_type");
}

function ownSessionRows(p: Principal): Sql | null {
  if (p.kind !== "user") return null;
  const member = patientCondition(p, "member", "t.patient_id");
  return member ? sql(`t.user_id = ? AND ${member.sql}`, [p.userId, ...member.params]) : null;
}
