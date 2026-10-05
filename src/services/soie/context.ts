/**
 * Patient context loader (IO). Server-side only.
 *
 * Runs through the USER-SCOPED database client from `requireUser`, so the access
 * rules (src/lib/db/server/policy.ts), not this code, decide what is visible.
 *
 * Exactness rules:
 *  - IST day boundaries for every range (never `toISOString().split("T")[0]`);
 *  - NO silent truncation: the data gateway caps a response (1000 rows), so
 *    every table is read page by page with `.range()` until the exact count is
 *    reached. Only a hard ceiling stops it, and then `truncated[metric]` is set
 *    and the answer says so;
 *  - medicine adherence needs the expected doses, which `records.ts` derives from
 *    schedule x days (see there).
 *
 * It deliberately does not import patient-service (browser oriented).
 */

import type { DbClient } from "@/lib/db/builder";
import { addDaysIST, istDayBounds, istRangeBounds, todayIST } from "@/lib/health-rules";
import { cleanFreeText, buildContext, type ActivityRow, type BPRow, type FoodRow, type MedicineLogRow, type MedicineRow, type RawPatientData, type SleepRow, type WeightRow } from "./records";
import type { MemoryKind, Metric, PatientContext } from "./types";
import type { SaveMemoryResult, ToolDeps } from "./tools";

export const DEFAULT_HISTORY_DAYS = 120;
const PAGE_SIZE = 1000;
const ROW_CEILING = 20_000;

export class ContextLoadError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ContextLoadError";
    this.status = status;
  }
}

type Db = DbClient;

interface PageResult<R> {
  data: R[] | null;
  error: { message: string } | null;
  count: number | null;
}

/** Reads every row, page by page. Advances by what the server actually returned, so a lower server-side max-rows is harmless. */
export async function fetchAllPages<R>(
  page: (from: number, to: number, wantCount: boolean) => PromiseLike<PageResult<R>>,
  opts: { pageSize?: number; ceiling?: number } = {},
): Promise<{ rows: R[]; truncated: boolean; total: number | null }> {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const ceiling = opts.ceiling ?? ROW_CEILING;
  const rows: R[] = [];
  let total: number | null = null;
  let from = 0;
  for (let guard = 0; guard < 1000; guard++) {
    const res = await page(from, from + pageSize - 1, total === null);
    if (res.error) throw new ContextLoadError(500, "Could not read patient data");
    const data = res.data ?? [];
    if (total === null && res.count !== null && res.count !== undefined) total = res.count;
    rows.push(...data);
    if (rows.length >= ceiling) {
      const more = total !== null ? total > ceiling : data.length > 0;
      return { rows: rows.slice(0, ceiling), truncated: more && (total === null || total > ceiling), total };
    }
    if (data.length === 0) break;
    from += data.length;
    if (total !== null ? rows.length >= total : data.length < pageSize) break;
  }
  return { rows, truncated: false, total };
}

export interface LoadOptions {
  days?: number;
  now?: Date;
  pageSize?: number;
  ceiling?: number;
}

// The builder surface used below, loosely typed: selected column lists make the
// generated row types unwieldy, and we cast rows to our own raw shapes anyway.
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyQuery = any;

/** One table, read page by page. `apply` adds filters and ordering AFTER select(), as the query builder requires. */
function paged<R>(db: { from: (t: string) => AnyQuery }, table: string, columns: string, apply: (q: AnyQuery) => AnyQuery, opts: LoadOptions) {
  return fetchAllPages<R>(
    (from, to, wantCount) => apply(db.from(table).select(columns, wantCount ? { count: "exact" } : undefined)).range(from, to) as PromiseLike<PageResult<R>>,
    { pageSize: opts.pageSize, ceiling: opts.ceiling },
  );
}

/** Loads one patient's data and builds the typed, ref-stamped context. */
export async function loadPatientContext(client: Db, patientId: string, opts: LoadOptions = {}): Promise<PatientContext> {
  const now = opts.now ?? new Date();
  const days = opts.days ?? DEFAULT_HISTORY_DAYS;
  const today = todayIST(now);
  const range = istRangeBounds(days, today);
  const db = client as unknown as { from: (t: string) => AnyQuery };
  const truncated: Partial<Record<Metric, boolean>> = {};

  // Medicine logs get one extra day each side: older app versions stored times shifted by the UTC offset.
  const medFrom = istDayBounds(addDaysIST(range.startDate, -1)).startISO;
  const medTo = istDayBounds(addDaysIST(today, 1)).endISO;

  const cols = {
    bp: "id,systolic,diastolic,pulse,reading_type,measured_at,notes",
    weight: "id,weight_kg,measured_at,notes",
    food: "id,meal_type,food_name,quantity,unit,calories,protein_g,carbs_g,fat_g,fibre_g,sodium_mg,consumed_at",
    sleep: "id,date,sleep_hours,bedtime,wake_time",
    activity: "id,date,steps,distance_km,walking_minutes,estimated_calories_burned",
    medLogs: "id,medicine_id,scheduled_time,taken_time,status",
  };

  const [patientRes, settingsRes, condRes, medRes, memRes, bp, weight, food, sleep, activity, medLogs] = await Promise.all([
    db.from("patients").select("age,gender,height_cm,current_weight_kg,target_weight_kg,daily_calorie_target").eq("id", patientId).maybeSingle(),
    db.from("patient_settings").select("daily_calorie_target,daily_step_goal,sleep_target_hours,bp_targets").eq("patient_id", patientId).maybeSingle(),
    db.from("medical_conditions").select("condition_name,diagnosed_year,notes").eq("patient_id", patientId),
    db.from("medicines").select("id,medicine_name,dose,scheduled_time,meal_relation,frequency,active,created_at").eq("patient_id", patientId),
    db.from("soie_memories").select("id,kind,content,created_at").eq("patient_id", patientId).order("created_at", { ascending: false }).limit(100),
    paged<BPRow>(db, "bp_logs", cols.bp, (q) => q.eq("patient_id", patientId).gte("measured_at", range.startISO).lte("measured_at", range.endISO).order("measured_at", { ascending: true }).order("id", { ascending: true }), opts).then(tag(truncated, "bp"), reject),
    paged<WeightRow>(db, "weight_logs", cols.weight, (q) => q.eq("patient_id", patientId).gte("measured_at", range.startISO).lte("measured_at", range.endISO).order("measured_at", { ascending: true }).order("id", { ascending: true }), opts).then(tag(truncated, "weight"), reject),
    paged<FoodRow>(db, "food_logs", cols.food, (q) => q.eq("patient_id", patientId).gte("consumed_at", range.startISO).lte("consumed_at", range.endISO).order("consumed_at", { ascending: true }).order("id", { ascending: true }), opts).then(tag(truncated, "food"), reject),
    paged<SleepRow>(db, "sleep_logs", cols.sleep, (q) => q.eq("patient_id", patientId).gte("date", range.startDate).lte("date", range.endDate).order("date", { ascending: true }).order("id", { ascending: true }), opts).then(tag(truncated, "sleep"), reject),
    paged<ActivityRow>(db, "activity_logs", cols.activity, (q) => q.eq("patient_id", patientId).gte("date", range.startDate).lte("date", range.endDate).order("date", { ascending: true }).order("id", { ascending: true }), opts).then(tag(truncated, "steps"), reject),
    paged<MedicineLogRow>(db, "medicine_logs", cols.medLogs, (q) => q.eq("patient_id", patientId).gte("scheduled_time", medFrom).lte("scheduled_time", medTo).order("scheduled_time", { ascending: true }).order("id", { ascending: true }), opts).then(tag(truncated, "medicine"), reject),
  ]);

  if (patientRes.error) throw new ContextLoadError(500, "Could not read the patient profile");
  if (!patientRes.data) throw new ContextLoadError(404, "Patient not found or not accessible");
  for (const r of [settingsRes, condRes, medRes, memRes]) if (r.error) throw new ContextLoadError(500, "Could not read patient data");

  const feedbackNotes = await loadFeedbackNotes(db, patientId);

  const raw: RawPatientData = {
    patientId,
    now,
    days,
    patient: patientRes.data,
    settings: settingsRes.data ?? null,
    conditions: condRes.data ?? [],
    medicines: (medRes.data ?? []) as MedicineRow[],
    memories: memRes.data ?? [],
    bp,
    weight,
    food,
    sleep,
    activity,
    medicineLogs: medLogs,
    truncated,
    feedbackNotes,
  };
  return buildContext(raw);
}

function tag<R>(truncated: Partial<Record<Metric, boolean>>, metric: Metric) {
  return (res: { rows: R[]; truncated: boolean }): R[] => {
    if (res.truncated) truncated[metric] = true;
    return res.rows;
  };
}
function reject(e: unknown): never {
  throw e instanceof ContextLoadError ? e : new ContextLoadError(500, "Could not read patient data");
}

/**
 * The family's own "not helpful" comments for THIS patient, newest first. These
 * are the only feedback the model ever sees (as style preferences, quoted).
 * Best effort: any failure just means no notes.
 */
export async function loadFeedbackNotes(db: { from: (t: string) => AnyQuery }, patientId: string): Promise<string[]> {
  try {
    const fb = await db.from("soie_feedback").select("message_id,comment,created_at").eq("rating", "not_helpful").not("comment", "is", null).order("created_at", { ascending: false }).limit(20);
    if (fb.error || !fb.data?.length) return [];
    const ids = fb.data.map((r: { message_id: string }) => r.message_id);
    const msgs = await db.from("soie_messages").select("id,session_id").in("id", ids);
    if (msgs.error || !msgs.data?.length) return [];
    const sessionIds = Array.from(new Set(msgs.data.map((m: { session_id: string }) => m.session_id)));
    const sess = await db.from("soie_sessions").select("id").eq("patient_id", patientId).in("id", sessionIds);
    if (sess.error || !sess.data?.length) return [];
    const okSessions = new Set(sess.data.map((s: { id: string }) => s.id));
    const okMessages = new Set(msgs.data.filter((m: { session_id: string }) => okSessions.has(m.session_id)).map((m: { id: string }) => m.id));
    return fb.data
      .filter((r: { message_id: string; comment: string | null }) => okMessages.has(r.message_id) && r.comment && r.comment.trim())
      .slice(0, 5)
      .map((r: { comment: string }) => cleanFreeText(r.comment, 200));
  } catch {
    return [];
  }
}

/** Tool dependencies backed by the user-scoped client (the policy enforces owner/editor on soie_memories). */
export function makeToolDeps(client: Db, patientId: string): ToolDeps {
  const db = client as unknown as { from: (t: string) => AnyQuery };
  return {
    async saveMemory(kind: MemoryKind, content: string): Promise<SaveMemoryResult> {
      const { data, error } = await db.from("soie_memories").insert({ patient_id: patientId, kind, content }).select("id").single();
      if (error || !data) return { error: "insert failed" };
      return { id: data.id as string };
    },
  };
}
