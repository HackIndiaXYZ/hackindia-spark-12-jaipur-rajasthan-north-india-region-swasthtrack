import type { MonthlyReportSummary, WeeklyReportSummary } from "@/services/reports-analytics-service";

export type EmailSeverity = "INFO" | "ATTENTION" | "IMPORTANT";

/** Colour/wording bucket for a BP reading, decided by the caller from the patient's own lines. */
export type BpTone = "critical" | "high" | "low" | "normal";

export interface EmailAlert {
  severity: EmailSeverity;
  titleHi: string;
  titleEn: string;
  messageHi: string;
  messageEn: string;
  /** App path the "open" button points to, e.g. "/health". */
  path?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface RenderOptions {
  /** Adds a "sample preview" banner; used by the preview route and test sends. */
  sample?: boolean;
}

export type CaregiverRole = "editor" | "viewer";

// ---- alerts -----------------------------------------------------------------

export interface WeightAlertData {
  patientName: string;
  currentKg: number;
  previousKg: number;
  /** Signed: positive = gained. */
  changeKg: number;
  /** Days between the two weigh-ins. */
  days: number;
  /** Why it was flagged, e.g. "≥ 2 kg in 7 days". */
  ruleHi: string;
  ruleEn: string;
}

// ---- reports ----------------------------------------------------------------

export interface DailyReportData {
  patientName: string;
  dateLabel: string;
  bpReadings: { time: string; value: string; pulse: number | null; label: string; tone: BpTone }[];
  medicines: { total: number; taken: number; missed: string[]; pending: string[] };
  calories: { eaten: number; target: number; meals: string[] };
  steps: number | null;
  sleepHours: number | null;
  weightKg: number | null;
  missing: string[];
  alerts: EmailAlert[];
}

export interface WeeklyReportData {
  patientName: string;
  summary: WeeklyReportSummary;
  bpAverage: { systolic: number; diastolic: number } | null;
  bpAlertCount: number;
}

export interface MonthlyReportData {
  patientName: string;
  summary: MonthlyReportSummary;
  bpAverage: { systolic: number; diastolic: number } | null;
  bpAlertCount: number;
}

// ---- account / caregiver ----------------------------------------------------

export interface WelcomeData {
  name: string;
  patientName?: string | null;
}

export interface TestEmailData {
  to: string;
  sentAtLabel: string;
}

export interface CaregiverInviteData {
  inviterName: string;
  patientName: string;
  /** The 8-character code the caregiver types into the app. */
  code: string;
  role: CaregiverRole;
  /** Human label, e.g. "4 Oct, 3:45 PM". */
  expiresAtLabel: string;
  minutesValid: number;
}

export interface CaregiverJoinedData {
  patientName: string;
  caregiverName: string;
  caregiverEmail?: string | null;
  role: CaregiverRole;
  joinedAtLabel: string;
}

export interface AccessChangedData {
  patientName: string;
  ownerName: string;
  change: "removed" | "role-changed";
  /** Set when change === "role-changed". */
  newRole?: CaregiverRole;
}
