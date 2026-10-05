/**
 * Server only. The table registry: which tables and columns exist, how each value
 * is converted between JSON and MySQL, and the value rules that the SQL CHECK
 * constraints express (re-checked here so MySQL 5.7, which ignores CHECK, behaves
 * like MySQL 8 and Postgres did).
 *
 * Anything not listed here cannot be reached through the query gateway: the
 * `auth_*` tables and `caregiver_invite_attempts` are deliberately absent.
 *
 * Keep in step with db/mysql/schema.sql (`node scripts/db/check-schema.mjs` compares them).
 */

export type ColType = "uuid" | "text" | "int" | "num" | "bool" | "json" | "date" | "time" | "ts";

/** A value rule, mirroring a SQL CHECK. Null always passes (nullability is the column's own business). */
export interface Rule {
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
  oneOf?: readonly string[];
  maxLen?: number;
}

export interface TableDef {
  cols: Record<string, ColType>;
  /** Single-column primary key, used to hand written rows back. */
  pk: string;
  /** Generate a UUID for `id` when an insert does not carry one. */
  genId?: boolean;
  rules?: Record<string, Rule>;
  /** App-side defaults for columns the database cannot default (JSON in MySQL 5.7). */
  defaults?: Record<string, () => unknown>;
}

const GENDERS = ["Male", "Female", "Other"] as const;
const MEMBER_ROLES = ["owner", "editor", "viewer"] as const;
const CONFIDENCE = ["High", "Medium", "Low"] as const;
const LOG_STATUS = ["taken", "late", "missed", "pending"] as const;
const CHECKLIST_STATUS = ["completed", "pending", "late", "missed"] as const;

export const DEFAULT_ALERTS_ENABLED = { bp: true, medicine: true, activity: true, sleep: true, missingData: true };
export const DEFAULT_BP_TARGETS = {
  target_systolic: 130,
  target_diastolic: 80,
  alert_systolic: 160,
  alert_diastolic: 100,
  crisis_systolic: 180,
  crisis_diastolic: 120,
  low_systolic: 90,
  low_diastolic: 60,
};

export const TABLES: Record<string, TableDef> = {
  patients: {
    pk: "id",
    genId: true,
    cols: {
      id: "uuid",
      name: "text",
      age: "int",
      gender: "text",
      height_cm: "num",
      current_weight_kg: "num",
      target_weight_kg: "num",
      daily_calorie_target: "int",
      created_at: "ts",
      updated_at: "ts",
    },
    rules: {
      age: { gt: 0, lte: 120 },
      gender: { oneOf: GENDERS },
      height_cm: { gt: 0 },
      current_weight_kg: { gt: 0 },
      target_weight_kg: { gt: 0 },
      daily_calorie_target: { gt: 0 },
    },
  },

  medical_conditions: {
    pk: "id",
    genId: true,
    cols: {
      id: "uuid",
      patient_id: "uuid",
      condition_name: "text",
      diagnosed_year: "int",
      notes: "text",
      created_at: "ts",
    },
    rules: { diagnosed_year: { gte: 1900, lte: 2100 } },
  },

  medicines: {
    pk: "id",
    genId: true,
    cols: {
      id: "uuid",
      patient_id: "uuid",
      medicine_name: "text",
      dose: "text",
      scheduled_time: "time",
      meal_relation: "text",
      frequency: "text",
      active: "bool",
      created_at: "ts",
    },
  },

  food_items: {
    pk: "id",
    genId: true,
    cols: {
      id: "uuid",
      name: "text",
      name_hi: "text",
      category: "text",
      subcategory: "text",
      reference_weight_g: "num",
      reference_unit: "text",
      calories_per_100g: "num",
      protein_g_100g: "num",
      carbs_g_100g: "num",
      fat_g_100g: "num",
      fibre_g_100g: "num",
      sodium_mg_100g: "num",
      source_type: "text",
      source_name: "text",
      source_note: "text",
      is_verified: "bool",
      is_custom: "bool",
      is_active: "bool",
      created_by: "uuid",
      created_at: "ts",
      updated_at: "ts",
    },
    rules: {
      reference_weight_g: { gt: 0 },
      calories_per_100g: { gte: 0 },
      protein_g_100g: { gte: 0 },
      carbs_g_100g: { gte: 0 },
      fat_g_100g: { gte: 0 },
      fibre_g_100g: { gte: 0 },
      sodium_mg_100g: { gte: 0 },
    },
  },

  food_portions: {
    pk: "id",
    genId: true,
    cols: {
      id: "uuid",
      food_item_id: "uuid",
      portion_name: "text",
      portion_name_hi: "text",
      standardized_grams: "num",
      notes: "text",
      created_at: "ts",
    },
    rules: { standardized_grams: { gt: 0 } },
  },

  patient_food_favorites: {
    pk: "id",
    genId: true,
    cols: { id: "uuid", patient_id: "uuid", food_item_id: "uuid", created_at: "ts" },
  },

  food_logs: {
    pk: "id",
    genId: true,
    cols: {
      id: "uuid",
      patient_id: "uuid",
      food_item_id: "uuid",
      meal_type: "text",
      food_name: "text",
      quantity: "num",
      unit: "text",
      standardized_grams: "num",
      calories: "num",
      protein_g: "num",
      carbs_g: "num",
      fat_g: "num",
      fibre_g: "num",
      sodium_mg: "num",
      oil_quantity: "text",
      oil_calories: "num",
      calorie_confidence: "text",
      source_type: "text",
      source_note: "text",
      consumed_at: "ts",
      notes: "text",
      created_at: "ts",
    },
    rules: {
      quantity: { gt: 0 },
      standardized_grams: { gte: 0 },
      calories: { gte: 0 },
      protein_g: { gte: 0 },
      carbs_g: { gte: 0 },
      fat_g: { gte: 0 },
      fibre_g: { gte: 0 },
      sodium_mg: { gte: 0 },
      oil_calories: { gte: 0 },
      calorie_confidence: { oneOf: CONFIDENCE },
    },
  },

  bp_logs: {
    pk: "id",
    genId: true,
    cols: {
      id: "uuid",
      patient_id: "uuid",
      systolic: "int",
      diastolic: "int",
      pulse: "int",
      reading_type: "text",
      measured_at: "ts",
      notes: "text",
      created_at: "ts",
    },
    rules: {
      systolic: { gt: 40, lt: 300 },
      diastolic: { gt: 20, lt: 200 },
      pulse: { gt: 30, lt: 250 },
    },
  },

  weight_logs: {
    pk: "id",
    genId: true,
    cols: { id: "uuid", patient_id: "uuid", weight_kg: "num", measured_at: "ts", notes: "text", created_at: "ts" },
    rules: { weight_kg: { gt: 0, lt: 500 } },
  },

  activity_logs: {
    pk: "id",
    genId: true,
    cols: {
      id: "uuid",
      patient_id: "uuid",
      date: "date",
      steps: "int",
      distance_km: "num",
      walking_minutes: "int",
      estimated_calories_burned: "num",
      created_at: "ts",
    },
    rules: {
      steps: { gte: 0 },
      distance_km: { gte: 0 },
      walking_minutes: { gte: 0 },
      estimated_calories_burned: { gte: 0 },
    },
  },

  sleep_logs: {
    pk: "id",
    genId: true,
    cols: {
      id: "uuid",
      patient_id: "uuid",
      date: "date",
      sleep_hours: "num",
      bedtime: "time",
      wake_time: "time",
      notes: "text",
      created_at: "ts",
    },
    rules: { sleep_hours: { gte: 0, lte: 24 } },
  },

  medicine_logs: {
    pk: "id",
    genId: true,
    cols: {
      id: "uuid",
      medicine_id: "uuid",
      patient_id: "uuid",
      scheduled_time: "ts",
      taken_time: "ts",
      status: "text",
      notes: "text",
      created_at: "ts",
    },
    rules: { status: { oneOf: LOG_STATUS } },
  },

  daily_checklists: {
    pk: "id",
    genId: true,
    cols: {
      id: "uuid",
      patient_id: "uuid",
      checklist_date: "date",
      item_key: "text",
      item_label: "text",
      scheduled_time: "time",
      status: "text",
      completed_at: "ts",
      created_at: "ts",
    },
    rules: { status: { oneOf: CHECKLIST_STATUS } },
  },

  patient_settings: {
    pk: "patient_id",
    cols: {
      patient_id: "uuid",
      daily_calorie_target: "int",
      daily_step_goal: "int",
      sleep_target_hours: "num",
      bp_monitoring_schedule: "text",
      weight_unit: "text",
      height_unit: "text",
      distance_unit: "text",
      timezone: "text",
      preferred_language: "text",
      alerts_enabled: "json",
      bp_targets: "json",
      updated_at: "ts",
    },
    rules: {
      daily_calorie_target: { gt: 0 },
      daily_step_goal: { gt: 0 },
      sleep_target_hours: { gt: 0, lte: 14 },
      bp_monitoring_schedule: { oneOf: ["morning_evening", "morning_only", "evening_only", "custom"] },
      weight_unit: { oneOf: ["kg", "lb"] },
      height_unit: { oneOf: ["cm", "ft_in"] },
      distance_unit: { oneOf: ["km", "miles"] },
      preferred_language: { oneOf: ["hi", "en", "bilingual"] },
    },
    defaults: {
      alerts_enabled: () => ({ ...DEFAULT_ALERTS_ENABLED }),
      bp_targets: () => ({ ...DEFAULT_BP_TARGETS }),
    },
  },

  profiles: {
    pk: "id",
    cols: { id: "uuid", email: "text", display_name: "text", role: "text", created_at: "ts", updated_at: "ts" },
    rules: { role: { oneOf: ["member", "admin"] } },
  },

  patient_members: {
    pk: "id",
    genId: true,
    cols: {
      id: "uuid",
      patient_id: "uuid",
      user_id: "uuid",
      role: "text",
      status: "text",
      invited_by: "uuid",
      created_at: "ts",
    },
    rules: { role: { oneOf: MEMBER_ROLES }, status: { oneOf: ["active", "revoked"] } },
  },

  caregiver_invites: {
    pk: "id",
    genId: true,
    cols: {
      id: "uuid",
      patient_id: "uuid",
      created_by: "uuid",
      role: "text",
      code: "text",
      status: "text",
      expires_at: "ts",
      accepted_by: "uuid",
      accepted_at: "ts",
      created_at: "ts",
    },
    rules: { role: { oneOf: ["editor", "viewer"] }, status: { oneOf: ["pending", "accepted", "expired", "cancelled"] } },
  },

  soie_sessions: {
    pk: "id",
    genId: true,
    cols: {
      id: "uuid",
      user_id: "uuid",
      patient_id: "uuid",
      title: "text",
      created_at: "ts",
      last_active_at: "ts",
    },
  },

  soie_messages: {
    pk: "id",
    genId: true,
    cols: {
      id: "uuid",
      session_id: "uuid",
      role: "text",
      content: "text",
      answer: "json",
      model: "text",
      created_at: "ts",
    },
    rules: { role: { oneOf: ["user", "assistant"] } },
  },

  soie_feedback: {
    pk: "id",
    genId: true,
    cols: {
      id: "uuid",
      message_id: "uuid",
      user_id: "uuid",
      rating: "text",
      comment: "text",
      created_at: "ts",
    },
    rules: { rating: { oneOf: ["helpful", "not_helpful"] } },
  },

  soie_events: {
    pk: "id",
    genId: true,
    cols: {
      id: "uuid",
      user_id: "uuid",
      session_id: "uuid",
      patient_id: "uuid",
      intent: "text",
      status: "text",
      tools_used: "json",
      data_points: "int",
      latency_ms: "int",
      model: "text",
      input_tokens: "int",
      output_tokens: "int",
      created_at: "ts",
    },
    rules: {
      status: {
        oneOf: ["success", "refused", "emergency", "no_data", "validation_failed", "fallback", "error", "rate_limited"],
      },
    },
  },

  soie_memories: {
    pk: "id",
    genId: true,
    cols: {
      id: "uuid",
      patient_id: "uuid",
      kind: "text",
      content: "text",
      created_by: "uuid",
      created_at: "ts",
    },
    rules: {
      kind: { oneOf: ["allergy", "preference", "routine", "goal", "note"] },
      content: { maxLen: 500 },
    },
  },
};

export function tableDef(name: string): TableDef | undefined {
  return Object.prototype.hasOwnProperty.call(TABLES, name) ? TABLES[name] : undefined;
}
