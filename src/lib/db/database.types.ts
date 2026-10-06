import type { BPThresholds } from "@/lib/health-rules";

/**
 * Hand-maintained mirror of the MySQL schema in `db/mysql/schema.sql`.
 * Keep it in step with that file and with `server/schema.ts`. Nullability follows the real
 * columns, except `food_items` columns that always carry a default and are
 * always written by the importer (those are typed non-null because the app
 * treats them that way).
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type MemberRole = "owner" | "editor" | "viewer";
export type MedicineLogStatus = "taken" | "late" | "missed" | "pending";
export type ChecklistStatus = "completed" | "pending" | "late" | "missed";
export type CalorieConfidence = "High" | "Medium" | "Low";

/** One food the family confirmed for a meal photo (what the photo matcher suggests again). */
export type FoodPhotoFood = {
  /** Catalogue id when the food came from the catalogue; null for a typed name. */
  food_item_id: string | null;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
};

export type AlertsEnabled = {
  bp: boolean;
  medicine: boolean;
  activity: boolean;
  sleep: boolean;
  missingData: boolean;
};

// Row shapes that RPC return types refer to (a type literal cannot reference
// its own indexed members without becoming circular).
type PatientRow = {
  id: string;
  name: string;
  age: number | null;
  gender: string | null;
  height_cm: number | null;
  current_weight_kg: number | null;
  target_weight_kg: number | null;
  daily_calorie_target: number;
  created_at: string;
  updated_at: string;
};

type CaregiverInviteRow = {
  id: string;
  patient_id: string;
  created_by: string;
  role: "editor" | "viewer";
  code: string;
  status: "pending" | "accepted" | "expired" | "cancelled";
  expires_at: string;
  accepted_by: string | null;
  accepted_at: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      patients: {
        Row: PatientRow;
        Insert: {
          id?: string;
          name: string;
          age?: number | null;
          gender?: string | null;
          height_cm?: number | null;
          current_weight_kg?: number | null;
          target_weight_kg?: number | null;
          daily_calorie_target?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          age?: number | null;
          gender?: string | null;
          height_cm?: number | null;
          current_weight_kg?: number | null;
          target_weight_kg?: number | null;
          daily_calorie_target?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      medical_conditions: {
        Row: {
          id: string;
          patient_id: string;
          condition_name: string;
          diagnosed_year: number | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          condition_name: string;
          diagnosed_year?: number | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          condition_name?: string;
          diagnosed_year?: number | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "medical_conditions_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      medicines: {
        Row: {
          id: string;
          patient_id: string;
          medicine_name: string;
          dose: string;
          scheduled_time: string;
          meal_relation: string | null;
          frequency: string;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          medicine_name: string;
          dose: string;
          scheduled_time: string;
          meal_relation?: string | null;
          frequency?: string;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          medicine_name?: string;
          dose?: string;
          scheduled_time?: string;
          meal_relation?: string | null;
          frequency?: string;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "medicines_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      food_items: {
        Row: {
          id: string;
          name: string;
          name_hi: string | null;
          category: string;
          subcategory: string | null;
          reference_weight_g: number;
          reference_unit: string;
          calories_per_100g: number | null;
          protein_g_100g: number;
          carbs_g_100g: number;
          fat_g_100g: number;
          fibre_g_100g: number;
          sodium_mg_100g: number | null;
          source_type: string;
          source_name: string | null;
          source_note: string | null;
          is_verified: boolean;
          is_custom: boolean;
          is_active: boolean;
          /** Null for the seeded catalogue; the creator's user id for custom foods. */
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          name_hi?: string | null;
          category: string;
          subcategory?: string | null;
          reference_weight_g?: number;
          reference_unit?: string;
          calories_per_100g?: number | null;
          protein_g_100g?: number;
          carbs_g_100g?: number;
          fat_g_100g?: number;
          fibre_g_100g?: number;
          sodium_mg_100g?: number | null;
          source_type?: string;
          source_name?: string | null;
          source_note?: string | null;
          is_verified?: boolean;
          is_custom?: boolean;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          name_hi?: string | null;
          category?: string;
          subcategory?: string | null;
          reference_weight_g?: number;
          reference_unit?: string;
          calories_per_100g?: number | null;
          protein_g_100g?: number;
          carbs_g_100g?: number;
          fat_g_100g?: number;
          fibre_g_100g?: number;
          sodium_mg_100g?: number | null;
          source_type?: string;
          source_name?: string | null;
          source_note?: string | null;
          is_verified?: boolean;
          is_custom?: boolean;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      food_portions: {
        Row: {
          id: string;
          food_item_id: string;
          portion_name: string;
          portion_name_hi: string | null;
          standardized_grams: number;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          food_item_id: string;
          portion_name: string;
          portion_name_hi?: string | null;
          standardized_grams: number;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          food_item_id?: string;
          portion_name?: string;
          portion_name_hi?: string | null;
          standardized_grams?: number;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "food_portions_food_item_id_fkey";
            columns: ["food_item_id"];
            isOneToOne: false;
            referencedRelation: "food_items";
            referencedColumns: ["id"];
          },
        ];
      };
      patient_food_favorites: {
        Row: {
          id: string;
          patient_id: string;
          food_item_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          food_item_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          food_item_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "patient_food_favorites_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patient_food_favorites_food_item_id_fkey";
            columns: ["food_item_id"];
            isOneToOne: false;
            referencedRelation: "food_items";
            referencedColumns: ["id"];
          },
        ];
      };
      food_logs: {
        Row: {
          id: string;
          patient_id: string;
          food_item_id: string | null;
          meal_type: string;
          food_name: string;
          quantity: number;
          unit: string;
          standardized_grams: number | null;
          calories: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          fibre_g: number;
          sodium_mg: number | null;
          oil_quantity: string;
          oil_calories: number;
          calorie_confidence: CalorieConfidence;
          source_type: string;
          source_note: string | null;
          consumed_at: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          food_item_id?: string | null;
          meal_type: string;
          food_name: string;
          quantity: number;
          unit: string;
          standardized_grams?: number | null;
          calories: number;
          protein_g?: number;
          carbs_g?: number;
          fat_g?: number;
          fibre_g?: number;
          sodium_mg?: number | null;
          oil_quantity?: string;
          oil_calories?: number;
          calorie_confidence?: CalorieConfidence;
          source_type?: string;
          source_note?: string | null;
          consumed_at?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          food_item_id?: string | null;
          meal_type?: string;
          food_name?: string;
          quantity?: number;
          unit?: string;
          standardized_grams?: number | null;
          calories?: number;
          protein_g?: number;
          carbs_g?: number;
          fat_g?: number;
          fibre_g?: number;
          sodium_mg?: number | null;
          oil_quantity?: string;
          oil_calories?: number;
          calorie_confidence?: CalorieConfidence;
          source_type?: string;
          source_note?: string | null;
          consumed_at?: string;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "food_logs_new_food_item_id_fkey";
            columns: ["food_item_id"];
            isOneToOne: false;
            referencedRelation: "food_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "food_logs_new_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      bp_logs: {
        Row: {
          id: string;
          patient_id: string;
          systolic: number;
          diastolic: number;
          pulse: number | null;
          reading_type: string | null;
          measured_at: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          systolic: number;
          diastolic: number;
          pulse?: number | null;
          reading_type?: string | null;
          measured_at?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          systolic?: number;
          diastolic?: number;
          pulse?: number | null;
          reading_type?: string | null;
          measured_at?: string;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bp_logs_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      weight_logs: {
        Row: {
          id: string;
          patient_id: string;
          weight_kg: number;
          measured_at: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          weight_kg: number;
          measured_at?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          weight_kg?: number;
          measured_at?: string;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "weight_logs_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_logs: {
        Row: {
          id: string;
          patient_id: string;
          date: string;
          steps: number;
          distance_km: number;
          walking_minutes: number;
          estimated_calories_burned: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          date: string;
          steps?: number;
          distance_km?: number;
          walking_minutes?: number;
          estimated_calories_burned?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          date?: string;
          steps?: number;
          distance_km?: number;
          walking_minutes?: number;
          estimated_calories_burned?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_logs_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      sleep_logs: {
        Row: {
          id: string;
          patient_id: string;
          date: string;
          sleep_hours: number;
          bedtime: string | null;
          wake_time: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          date: string;
          sleep_hours: number;
          bedtime?: string | null;
          wake_time?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          date?: string;
          sleep_hours?: number;
          bedtime?: string | null;
          wake_time?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sleep_logs_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      medicine_logs: {
        Row: {
          id: string;
          medicine_id: string;
          patient_id: string;
          scheduled_time: string;
          taken_time: string | null;
          status: MedicineLogStatus;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          medicine_id: string;
          patient_id: string;
          scheduled_time: string;
          taken_time?: string | null;
          status: MedicineLogStatus;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          medicine_id?: string;
          patient_id?: string;
          scheduled_time?: string;
          taken_time?: string | null;
          status?: MedicineLogStatus;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "medicine_logs_medicine_id_fkey";
            columns: ["medicine_id"];
            isOneToOne: false;
            referencedRelation: "medicines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "medicine_logs_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_checklists: {
        Row: {
          id: string;
          patient_id: string;
          checklist_date: string;
          item_key: string;
          item_label: string;
          scheduled_time: string | null;
          status: ChecklistStatus;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          checklist_date: string;
          item_key: string;
          item_label: string;
          scheduled_time?: string | null;
          status?: ChecklistStatus;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          checklist_date?: string;
          item_key?: string;
          item_label?: string;
          scheduled_time?: string | null;
          status?: ChecklistStatus;
          completed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_checklists_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      patient_settings: {
        Row: {
          patient_id: string;
          daily_calorie_target: number;
          daily_step_goal: number;
          sleep_target_hours: number;
          bp_monitoring_schedule: "morning_evening" | "morning_only" | "evening_only" | "custom";
          weight_unit: "kg" | "lb";
          height_unit: "cm" | "ft_in";
          distance_unit: "km" | "miles";
          timezone: string;
          preferred_language: "hi" | "en" | "bilingual";
          alerts_enabled: AlertsEnabled;
          bp_targets: BPThresholds;
          updated_at: string;
        };
        Insert: {
          patient_id: string;
          daily_calorie_target?: number;
          daily_step_goal?: number;
          sleep_target_hours?: number;
          bp_monitoring_schedule?: "morning_evening" | "morning_only" | "evening_only" | "custom";
          weight_unit?: "kg" | "lb";
          height_unit?: "cm" | "ft_in";
          distance_unit?: "km" | "miles";
          timezone?: string;
          preferred_language?: "hi" | "en" | "bilingual";
          alerts_enabled?: AlertsEnabled;
          bp_targets?: BPThresholds;
          updated_at?: string;
        };
        Update: {
          patient_id?: string;
          daily_calorie_target?: number;
          daily_step_goal?: number;
          sleep_target_hours?: number;
          bp_monitoring_schedule?: "morning_evening" | "morning_only" | "evening_only" | "custom";
          weight_unit?: "kg" | "lb";
          height_unit?: "cm" | "ft_in";
          distance_unit?: "km" | "miles";
          timezone?: string;
          preferred_language?: "hi" | "en" | "bilingual";
          alerts_enabled?: AlertsEnabled;
          bp_targets?: BPThresholds;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "patient_settings_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: true;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          role: "member" | "admin";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          role?: "member" | "admin";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          display_name?: string | null;
          role?: "member" | "admin";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      patient_members: {
        Row: {
          id: string;
          patient_id: string;
          user_id: string;
          role: MemberRole;
          status: "active" | "revoked";
          invited_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          user_id: string;
          role: MemberRole;
          status?: "active" | "revoked";
          invited_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          user_id?: string;
          role?: MemberRole;
          status?: "active" | "revoked";
          invited_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "patient_members_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      caregiver_invites: {
        Row: CaregiverInviteRow;
        Insert: {
          id?: string;
          patient_id: string;
          created_by: string;
          role?: "editor" | "viewer";
          code: string;
          status?: "pending" | "accepted" | "expired" | "cancelled";
          expires_at: string;
          accepted_by?: string | null;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          created_by?: string;
          role?: "editor" | "viewer";
          code?: string;
          status?: "pending" | "accepted" | "expired" | "cancelled";
          expires_at?: string;
          accepted_by?: string | null;
          accepted_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "caregiver_invites_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      caregiver_invite_attempts: {
        Row: {
          id: number;
          user_id: string;
          attempted_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          attempted_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          attempted_at?: string;
        };
        Relationships: [];
      };
      soie_sessions: {
        Row: {
          id: string;
          user_id: string;
          patient_id: string;
          title: string | null;
          created_at: string;
          last_active_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          patient_id: string;
          title?: string | null;
          created_at?: string;
          last_active_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          patient_id?: string;
          title?: string | null;
          created_at?: string;
          last_active_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "soie_sessions_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      soie_messages: {
        Row: {
          id: string;
          session_id: string;
          role: "user" | "assistant";
          content: string;
          answer: Json | null;
          model: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          role: "user" | "assistant";
          content: string;
          answer?: Json | null;
          model?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          role?: "user" | "assistant";
          content?: string;
          answer?: Json | null;
          model?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "soie_messages_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "soie_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      soie_feedback: {
        Row: {
          id: string;
          message_id: string;
          user_id: string;
          rating: "helpful" | "not_helpful";
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          user_id?: string;
          rating: "helpful" | "not_helpful";
          comment?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          user_id?: string;
          rating?: "helpful" | "not_helpful";
          comment?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "soie_feedback_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "soie_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      soie_events: {
        Row: {
          id: string;
          user_id: string;
          session_id: string | null;
          patient_id: string | null;
          intent: string | null;
          status:
            | "success"
            | "refused"
            | "emergency"
            | "no_data"
            | "validation_failed"
            | "fallback"
            | "error"
            | "rate_limited";
          tools_used: Json | null;
          data_points: number | null;
          latency_ms: number | null;
          model: string | null;
          input_tokens: number | null;
          output_tokens: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          session_id?: string | null;
          patient_id?: string | null;
          intent?: string | null;
          status:
            | "success"
            | "refused"
            | "emergency"
            | "no_data"
            | "validation_failed"
            | "fallback"
            | "error"
            | "rate_limited";
          tools_used?: Json | null;
          data_points?: number | null;
          latency_ms?: number | null;
          model?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          session_id?: string | null;
          patient_id?: string | null;
          intent?: string | null;
          status?:
            | "success"
            | "refused"
            | "emergency"
            | "no_data"
            | "validation_failed"
            | "fallback"
            | "error"
            | "rate_limited";
          tools_used?: Json | null;
          data_points?: number | null;
          latency_ms?: number | null;
          model?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      food_photo_examples: {
        Row: {
          id: string;
          patient_id: string;
          meal_type: string | null;
          foods: FoodPhotoFood[];
          embedding: number[];
          thumbnail: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          meal_type?: string | null;
          foods: FoodPhotoFood[];
          embedding: number[];
          thumbnail?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          meal_type?: string | null;
          foods?: FoodPhotoFood[];
          thumbnail?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "food_photo_examples_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      soie_memories: {
        Row: {
          id: string;
          patient_id: string;
          kind: "allergy" | "preference" | "routine" | "goal" | "note";
          content: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          kind: "allergy" | "preference" | "routine" | "goal" | "note";
          content: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          kind?: "allergy" | "preference" | "routine" | "goal" | "note";
          content?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "soie_memories_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_patient: {
        Args: {
          p_name: string;
          p_age?: number | null;
          p_gender?: string | null;
          p_height_cm?: number | null;
          p_current_weight_kg?: number | null;
          p_target_weight_kg?: number | null;
          p_daily_calorie_target?: number | null;
        };
        Returns: PatientRow;
      };
      create_caregiver_invite: {
        Args: {
          p_patient: string;
          p_role?: "editor" | "viewer";
        };
        Returns: CaregiverInviteRow;
      };
      accept_caregiver_invite: {
        Args: {
          p_code: string;
        };
        /** The id of the patient the caller just joined. */
        Returns: string;
      };
      list_patient_members: {
        Args: {
          p_patient: string;
        };
        Returns: Array<{
          member_id: string;
          user_id: string;
          email: string | null;
          display_name: string | null;
          role: MemberRole;
          status: "active" | "revoked";
          created_at: string;
        }>;
      };
      set_patient_member: {
        Args: {
          p_member: string;
          p_status?: "active" | "revoked" | null;
          p_role?: MemberRole | null;
        };
        Returns: undefined;
      };
      get_patient_owner_contacts: {
        Args: { p_patient: string };
        Returns: Array<{
          owner_user_id: string;
          owner_email: string | null;
          owner_name: string | null;
        }>;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
