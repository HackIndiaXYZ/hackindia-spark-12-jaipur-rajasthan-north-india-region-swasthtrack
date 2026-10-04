/**
 * Doctor-visit CSV for the weekly report (RFC 4180): every field is escaped (a
 * value like "7,100 steps" or a name containing a comma cannot shift columns),
 * BP readings are included as values, and partial data (e.g. sleep logged but
 * short) is shown as the number, never as "Not logged".
 */
import { toCsv, type CsvCell } from "./csv";
import type { WeeklyReportSummary } from "@/services/reports-analytics-service";

export function buildWeeklyCsv(weekly: WeeklyReportSummary, patientName: string, generatedDate: string): string {
  const rows: CsvCell[][] = [];
  rows.push(["SwasthTrack Health Summary Report"]);
  rows.push(["Patient", patientName]);
  rows.push(["Report Range", weekly.weekRangeLabel]);
  rows.push(["Generated Date (IST)", generatedDate]);
  rows.push([]);
  rows.push(["DAILY TRACKING BREAKDOWN"]);
  rows.push([
    "Date",
    "Day",
    "Wellness Score",
    "Category",
    "Medicine doses taken / due",
    "Meals logged",
    "Calories (kcal)",
    "Steps",
    "Sleep (hours)",
    "BP readings (systolic/diastolic)",
    "Weight (kg)",
  ]);

  for (const d of weekly.dailyScores) {
    const raw = d.raw;
    rows.push([
      d.date,
      d.dayLabel,
      d.hasLogs ? d.score : "No data",
      d.hasLogs ? d.category : "",
      raw && raw.dosesDue > 0 ? `${raw.dosesAdherent}/${raw.dosesDue}` : "",
      raw ? raw.mealsLogged : "",
      raw?.calories ?? "",
      raw?.steps ?? "",
      raw?.sleepHours ?? "",
      raw ? raw.bpReadings.join("; ") : "",
      raw?.weightKg ?? "",
    ]);
  }

  rows.push([]);
  rows.push(["KEY METRICS & ADHERENCE"]);
  rows.push(["Average Daily Wellness Score (days with data)", weekly.hasSufficientData || weekly.daysTrackedCount > 0 ? `${weekly.averageScore}/100` : "Not enough data"]);
  rows.push(["Days with data", `${weekly.daysTrackedCount}/${weekly.totalDays}`]);
  rows.push(["Medicine Adherence (taken + late of due doses)", weekly.hasMedicineData ? `${weekly.medicineAdherencePercent}%` : "No doses due"]);
  rows.push(["Food Logging Consistency", `${weekly.foodLoggingConsistencyPercent}%`]);
  rows.push(["Average Daily Steps", weekly.averageSteps ?? "N/A"]);
  rows.push(["Average Daily Calories (kcal)", weekly.averageCalories ?? "N/A"]);
  rows.push(["Average Sleep (hours)", weekly.averageSleepHours ?? "N/A"]);
  rows.push(["Total BP Readings", weekly.bpReadingsCount]);
  rows.push(["Net Weight Change (kg)", weekly.weightChangeKg ?? "N/A"]);
  rows.push([]);
  rows.push(["DISCLAIMER"]);
  rows.push(["This report reflects habit tracking and logging consistency only. It is not a clinical medical diagnosis or treatment plan."]);

  // BOM so spreadsheet apps read Devanagari names correctly.
  return `\uFEFF${toCsv(rows)}`;
}
