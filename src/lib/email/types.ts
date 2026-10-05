import type { MonthlyReportSummary, WeeklyReportSummary } from "@/services/reports-analytics-service";
import type { Bi, CaregiverRoleKey } from "./format";

export type EmailSeverity = "INFO" | "ATTENTION" | "IMPORTANT";

/** Colour/wording bucket for a BP reading, decided by the caller from the patient's own lines. */
export type BpTone = "critical" | "high" | "low" | "normal";

export type CaregiverRole = CaregiverRoleKey;

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
  /** Adds a "sample preview" strip; used by the preview route and sample sends. */
  sample?: boolean;
  /** Base URL for the logo and links. Defaults to NEXT_PUBLIC_APP_URL; null leaves links out. */
  base?: string | null;
  /** What goes in "Sent to …". Defaults to a placeholder that `sendMail` fills in per recipient. */
  recipient?: string;
}

// ---- alerts -----------------------------------------------------------------

export interface BpAlertData {
  patientName: string;
  /** critical = very high / crisis range; high = above the alert line; low = below the low line. */
  level: "critical" | "high" | "low";
  /** "186/122" */
  value: string;
  pulse: number | null;
  slot: "morning" | "evening" | null;
  /** "7:42 AM" */
  timeLabel: string;
  /** Readings outside the range in the last 7 days, this one included. */
  outOfRange7d: number;
}

export interface ReminderData {
  patientName: string;
  /** "आज, दोपहर 2 बजे" / "Today, 2 PM" */
  when: Bi;
  /** `sub` is the line under the name, e.g. "5 mg · सुबह 8 बजे · 8 AM". */
  missedMedicines: { name: string; sub: string }[];
  missingRecords: Bi[];
  /** Whole days since anything was logged; null when not a concern. */
  daysWithoutData: number | null;
}

export interface WeightAlertData {
  patientName: string;
  currentKg: number;
  previousKg: number;
  /** Signed: positive = gained. */
  changeKg: number;
  /** Days between the two weigh-ins. */
  days: number;
  /** Why it was flagged, e.g. "a change of 2 kg or more within 7 days". */
  rule: Bi;
}

// ---- reports ----------------------------------------------------------------

export interface DailyReportData {
  patientName: string;
  date: Bi;
  alerts: EmailAlert[];
  bpReadings: {
    slot: "morning" | "evening" | null;
    timeLabel: string;
    pulse: number | null;
    value: string;
    tone: BpTone;
  }[];
  medicines: { total: number; taken: number; missed: string[]; pending: string[] };
  calories: { eaten: number; target: number; meals: Bi[] };
  steps: number | null;
  sleepHours: number | null;
  weightKg: number | null;
  notLogged: Bi[];
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
  sentAt: Bi;
}

export interface CaregiverInviteData {
  inviterName: string;
  patientName: string;
  /** The 8-character code the caregiver types into the app. */
  code: string;
  role: CaregiverRole;
  /** "11:39 AM IST" */
  validUntil: string;
  minutesValid: number;
}

export interface CaregiverJoinedData {
  patientName: string;
  caregiverName: string;
  caregiverEmail?: string | null;
  role: CaregiverRole;
  joinedAt: Bi;
}

export interface AccessChangedData {
  patientName: string;
  ownerName: string;
  change: "removed" | "role-changed";
  /** Set when change === "role-changed". */
  newRole?: CaregiverRole;
}

// ---- Sign-in mails (sent by src/lib/auth with a real one-time code) ---------

export interface AuthCodeData {
  code: string;
  /** How long the code works. Defaults to 10 (src/lib/auth/constants.ts OTP_VALID_MINUTES). */
  validMinutes?: number;
}
