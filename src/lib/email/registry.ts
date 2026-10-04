/**
 * Every e-mail SwasthTrack can send, in one list: what it is, who gets it, how it
 * is triggered, and a sample render. The preview page and the "send me all
 * samples" script are built from this, so adding a template here is all it takes
 * for it to show up in both.
 */

import type { MonthlyReportSummary, WeeklyReportSummary } from "@/services/reports-analytics-service";
import {
  renderAccessChangedEmail,
  renderAlertEmail,
  renderCaregiverInviteEmail,
  renderCaregiverJoinedEmail,
  renderDailyReport,
  renderMonthlyReport,
  renderTestEmail,
  renderWeeklyReport,
  renderWeightAlertEmail,
  renderWelcomeEmail,
} from "./templates";
import type { EmailAlert, RenderedEmail } from "./types";

export type EmailTemplateKey =
  | "alert.bp"
  | "alert.reminders"
  | "alert.weight"
  | "report.daily"
  | "report.weekly"
  | "report.monthly"
  | "account.welcome"
  | "account.test"
  | "caregiver.invite"
  | "caregiver.joined"
  | "caregiver.access-changed";

export type EmailCategory = "alert" | "report" | "account";

export interface EmailTemplateDef {
  key: EmailTemplateKey;
  category: EmailCategory;
  label: string;
  /** Who receives it and what sends it. */
  trigger: string;
  sample: () => RenderedEmail;
}

const SAMPLE_PATIENT = "Raj Kishore Gupta";

const bpAlert: EmailAlert = {
  severity: "IMPORTANT",
  titleHi: "रक्तचाप बहुत ज़्यादा: 186/122",
  titleEn: "Very high blood pressure: 186/122",
  messageHi:
    "अभी की reading 186/122 mmHg · pulse 94 (7:42 AM · Morning) है। कृपया आराम से बैठकर कुछ मिनट बाद दोबारा नापें। reading ऐसी ही रहे, या चक्कर, सीने में दर्द या सांस फूलने जैसा कुछ लगे तो तुरंत डॉक्टर से संपर्क करें।",
  messageEn:
    "Latest reading is 186/122 mmHg · pulse 94 (7:42 AM · Morning). Please rest and re-measure after a few minutes. If it stays this high, or there is dizziness, chest pain or breathlessness, contact a doctor right away.",
  path: "/health",
};

const sampleWeekly: WeeklyReportSummary = {
  weekRangeLabel: "28 Sep – 4 Oct 2026",
  startDate: "2026-09-28",
  endDate: "2026-10-04",
  hasSufficientData: true,
  daysTrackedCount: 6,
  totalDays: 7,
  averageScore: 78,
  highestScore: { score: 91, date: "2026-10-01", dayLabel: "Thu" },
  lowestScore: { score: 55, date: "2026-09-30", dayLabel: "Wed" },
  medicineAdherencePercent: 88,
  hasMedicineData: true,
  foodLoggingConsistencyPercent: 81,
  averageCalories: 1540,
  averageSteps: 5200,
  averageSleepHours: 6.8,
  bpReadingsCount: 12,
  weightChangeKg: -0.4,
  startWeightKg: 74.2,
  endWeightKg: 73.8,
  dailyScores: [],
  personalizedInsights: [
    "दवाइयों की निरंतरता इस सप्ताह अच्छी रही।",
    "शारीरिक गतिविधि अच्छी रही — प्रतिदिन औसत 5,200 कदम दर्ज हुए।",
  ],
};

const sampleMonthly: MonthlyReportSummary = {
  monthLabel: "5 Sep – 4 Oct 2026",
  startDate: "2026-09-05",
  endDate: "2026-10-04",
  hasSufficientData: true,
  daysTrackedCount: 26,
  totalDays: 30,
  averageScore: 76,
  medicineAdherencePercent: 90,
  hasMedicineData: true,
  foodLoggingPercent: 83,
  activityConsistencyPercent: 70,
  sleepLoggingPercent: 60,
  bpLoggingPercent: 93,
  weightLoggingPercent: 40,
  averageCalories: 1585,
  averageSteps: 4900,
  totalBpReadings: 48,
  startWeightKg: 75.1,
  endWeightKg: 73.8,
  weightChangeKg: -1.3,
  personalizedInsights: ["इस महीने वज़न धीरे-धीरे घटा है (-1.3 kg)।", "BP नियमित रूप से दर्ज हुआ।"],
};

export const EMAIL_TEMPLATES: EmailTemplateDef[] = [
  {
    key: "alert.bp",
    category: "alert",
    label: "BP alert (high / crisis / low)",
    trigger: "Immediately after a BP reading is saved and crosses the patient's alert line.",
    sample: () =>
      renderAlertEmail(SAMPLE_PATIENT, [bpAlert], `🚨 SwasthTrack · ${SAMPLE_PATIENT} · BP 186/122 (Very high)`, {
        sample: true,
      }),
  },
  {
    key: "alert.reminders",
    category: "alert",
    label: "Missed medicine / not logged reminder",
    trigger: "Cron, 2 PM IST — only sent when something is actually missing.",
    sample: () =>
      renderAlertEmail(
        SAMPLE_PATIENT,
        [
          {
            severity: "ATTENTION",
            titleHi: "दवाई छूट गई",
            titleEn: "Medicine dose missed",
            messageHi: "आज ये दवाइयाँ अभी तक नहीं ली गईं: Telmisartan 40 mg, Metoprolol 50 mg।",
            messageEn: "Not confirmed as taken today: Telmisartan 40 mg, Metoprolol 50 mg.",
            path: "/medicines",
          },
          {
            severity: "ATTENTION",
            titleHi: "आज के रिकॉर्ड बाकी हैं",
            titleEn: "Today's records are still missing",
            messageHi: "नाश्ता दर्ज नहीं (Breakfast) · सुबह का BP दर्ज नहीं (Morning BP)",
            messageEn: "Please log these when you can.",
            path: "/",
          },
        ],
        `SwasthTrack reminder · ${SAMPLE_PATIENT} · 2 items need attention`,
        { sample: true },
      ),
  },
  {
    key: "alert.weight",
    category: "alert",
    label: "Rapid weight change alert",
    trigger: "Immediately after a weigh-in that moves ≥ 2 kg in 7 days or ≥ 5% in 30 days.",
    sample: () =>
      renderWeightAlertEmail(
        {
          patientName: SAMPLE_PATIENT,
          currentKg: 76.4,
          previousKg: 73.9,
          changeKg: 2.5,
          days: 6,
          ruleHi: "7 दिन में 2 kg या उससे ज़्यादा का बदलाव।",
          ruleEn: "a change of 2 kg or more within 7 days",
        },
        { sample: true },
      ),
  },
  {
    key: "report.daily",
    category: "report",
    label: "Daily report",
    trigger: "Cron, 9 PM IST every day.",
    sample: () =>
      renderDailyReport(
        {
          patientName: SAMPLE_PATIENT,
          dateLabel: "Sun, 4 Oct 2026",
          bpReadings: [
            { time: "7:42 AM", value: "132/84", pulse: 74, label: "सुबह", tone: "normal" },
            { time: "8:15 PM", value: "164/102", pulse: 88, label: "शाम", tone: "high" },
          ],
          medicines: { total: 6, taken: 5, missed: ["Metoprolol 50 mg"], pending: [] },
          calories: { eaten: 1480, target: 1600, meals: ["Breakfast", "Lunch", "Dinner"] },
          steps: 5400,
          sleepHours: 6.5,
          weightKg: null,
          missing: ["नींद दर्ज नहीं (Sleep)"],
          alerts: [
            {
              severity: "ATTENTION",
              titleHi: "आज BP सामान्य सीमा से बाहर रहा",
              titleEn: "BP outside the usual range today",
              messageHi: "आज की readings: 8:15 PM 164/102 (High)। अगर यह बार-बार हो रहा है तो डॉक्टर से बात करें।",
              messageEn: "Today's readings: 8:15 PM 164/102 (High). If this keeps happening, talk to the doctor.",
              path: "/health",
            },
          ],
        },
        { sample: true },
      ),
  },
  {
    key: "report.weekly",
    category: "report",
    label: "Weekly report",
    trigger: "Cron, Sunday 8 PM IST.",
    sample: () =>
      renderWeeklyReport(
        { patientName: SAMPLE_PATIENT, summary: sampleWeekly, bpAverage: { systolic: 138, diastolic: 86 }, bpAlertCount: 2 },
        { sample: true },
      ),
  },
  {
    key: "report.monthly",
    category: "report",
    label: "Monthly report (last 30 days)",
    trigger: "Cron, 9 AM IST on the 1st of every month.",
    sample: () =>
      renderMonthlyReport(
        { patientName: SAMPLE_PATIENT, summary: sampleMonthly, bpAverage: { systolic: 136, diastolic: 85 }, bpAlertCount: 5 },
        { sample: true },
      ),
  },
  {
    key: "account.welcome",
    category: "account",
    label: "Welcome",
    trigger: "To the new user, right after they create their first patient profile.",
    sample: () => renderWelcomeEmail({ name: "Pawan", patientName: SAMPLE_PATIENT }, { sample: true }),
  },
  {
    key: "account.test",
    category: "account",
    label: "Test email",
    trigger: "To the signed-in user's own address, from the \"Send test email\" button.",
    sample: () =>
      renderTestEmail({ to: "me.guptapawan@gmail.com", sentAtLabel: "4 Oct 2026, 1:45 PM IST" }, { sample: true }),
  },
  {
    key: "caregiver.invite",
    category: "account",
    label: "Caregiver invite code",
    trigger: "To the address the owner types, from \"Email this invite\" on the caregiver dialog.",
    sample: () =>
      renderCaregiverInviteEmail(
        {
          inviterName: "Pawan",
          patientName: SAMPLE_PATIENT,
          code: "K7M2QX9D",
          role: "editor",
          expiresAtLabel: "4 Oct, 2:00 PM",
          minutesValid: 15,
        },
        { sample: true },
      ),
  },
  {
    key: "caregiver.joined",
    category: "account",
    label: "Caregiver joined (to the owner)",
    trigger: "To the owner right after someone redeems an invite (owner address via a database function, no service-role key).",
    sample: () =>
      renderCaregiverJoinedEmail(
        {
          patientName: SAMPLE_PATIENT,
          caregiverName: "Neha Gupta",
          caregiverEmail: "neha@example.com",
          role: "viewer",
          joinedAtLabel: "4 Oct 2026, 1:52 PM",
        },
        { sample: true },
      ),
  },
  {
    key: "caregiver.access-changed",
    category: "account",
    label: "Caregiver access removed / role changed",
    trigger: "To the caregiver when the owner removes them or changes their role.",
    sample: () =>
      renderAccessChangedEmail(
        { patientName: SAMPLE_PATIENT, ownerName: "Pawan", change: "role-changed", newRole: "editor" },
        { sample: true },
      ),
  },
];

export function getEmailTemplate(key: string): EmailTemplateDef | undefined {
  return EMAIL_TEMPLATES.find((t) => t.key === key);
}
