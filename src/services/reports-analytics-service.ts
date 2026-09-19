import {
  getActivityLogs,
  getBloodPressureLogs,
  getFoodLogs,
  getMedicineLogsByDate,
  getMedicines,
  getPatientProfile,
  getSleepLogs,
  getWeightLogs,
} from "./patient-service";
import {
  calculateDailyWellnessScore,
  type DailyWellnessScoreResult,
} from "./wellness-score-service";

export interface DayScorePoint {
  date: string;
  dayLabel: string; // e.g. "Mon 24"
  score: number;
  category: string;
  categoryHi: string;
  hasLogs: boolean;
  scoreResult?: DailyWellnessScoreResult;
}

export interface WeeklyReportSummary {
  weekRangeLabel: string;
  startDate: string;
  endDate: string;
  hasSufficientData: boolean;
  daysTrackedCount: number;
  totalDays: number;
  averageScore: number;
  highestScore: { score: number; date: string; dayLabel: string } | null;
  lowestScore: { score: number; date: string; dayLabel: string } | null;
  medicineAdherencePercent: number;
  foodLoggingConsistencyPercent: number;
  averageCalories: number | null;
  averageSteps: number | null;
  averageSleepHours: number | null;
  bpReadingsCount: number;
  weightChangeKg: number | null;
  startWeightKg: number | null;
  endWeightKg: number | null;
  dailyScores: DayScorePoint[];
  personalizedInsights: string[];
}

export interface MonthlyReportSummary {
  monthLabel: string;
  startDate: string;
  endDate: string;
  hasSufficientData: boolean;
  daysTrackedCount: number;
  totalDays: number;
  averageScore: number;
  medicineAdherencePercent: number;
  foodLoggingPercent: number;
  activityConsistencyPercent: number;
  sleepLoggingPercent: number;
  bpLoggingPercent: number;
  weightLoggingPercent: number;
  averageCalories: number | null;
  averageSteps: number | null;
  totalBpReadings: number;
  startWeightKg: number | null;
  endWeightKg: number | null;
  weightChangeKg: number | null;
  personalizedInsights: string[];
}

export interface YearlyMonthSummary {
  monthName: string;
  monthNumber: number;
  averageScore: number;
  medicineAdherencePercent: number;
  bpReadingsCount: number;
  averageWeightKg: number | null;
  daysTracked: number;
}

export interface YearlyReportSummary {
  year: number;
  hasSufficientData: boolean;
  averageScore: number;
  totalDaysTracked: number;
  months: YearlyMonthSummary[];
  personalizedInsights: string[];
}

/**
 * Convert a UTC timestamp (or Date) to a YYYY-MM-DD date string in Asia/Kolkata.
 * Mirrors timeline-service.ts's getISTDateStr so every report's day-boundary
 * comparison is explicitly IST-based instead of depending on the runtime's
 * local timezone (as isSameLocalDay/getTodayDateString do).
 */
function getISTDateStr(dateOrIso: Date | string): string {
  try {
    const d = typeof dateOrIso === "string" ? new Date(dateOrIso) : dateOrIso;
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  } catch {
    return String(dateOrIso).slice(0, 10);
  }
}

/**
 * Generate 7 trailing dates leading up to targetDate (YYYY-MM-DD)
 */
function get7TrailingDates(endDateStr: string): string[] {
  const parts = endDateStr.split("-").map(Number);
  const end = new Date(parts[0], parts[1] - 1, parts[2]);
  const dates: string[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${day}`);
  }
  return dates;
}

/**
 * Rule-based personalized insights generator (purely deterministic, no LLM)
 */
function generateWeeklyInsights(summary: {
  medAdherence: number;
  foodConsistency: number;
  avgSteps: number | null;
  bpCount: number;
  weightChange: number | null;
  daysTracked: number;
}): string[] {
  const insights: string[] = [];

  if (summary.medAdherence >= 90) {
    insights.push("दवाइयों की निरंतरता (Medicine logging) इस सप्ताह बहुत अच्छी रही (≥90%)।");
  } else if (summary.medAdherence > 0 && summary.medAdherence < 75) {
    insights.push("Medicine logging consistency इस सप्ताह 75% से कम रही — नियमित पुष्टि पर ध्यान दें।");
  }

  if (summary.foodConsistency >= 85) {
    insights.push("भोजन का नियमित रिकॉर्ड (Meal logging) निरंतर बना रहा।");
  } else if (summary.foodConsistency < 60 && summary.daysTracked > 0) {
    insights.push("इस सप्ताह कुछ मुख्य meals दर्ज होने से छूट गए।");
  }

  if (summary.bpCount >= 10) {
    insights.push(`रक्तचाप निगरानी बहुत सक्रिय रही — इस सप्ताह कुल ${summary.bpCount} BP readings दर्ज हुईं।`);
  } else if (summary.bpCount > 0 && summary.bpCount < 5) {
    insights.push("सुबह और शाम दोनों समय नियमित BP नापने और दर्ज करने का प्रयास करें।");
  }

  if (summary.avgSteps && summary.avgSteps >= 5000) {
    insights.push(`शारीरिक गतिविधि अच्छी रही — प्रतिदिन औसत ${summary.avgSteps.toLocaleString()} कदम दर्ज हुए।`);
  }

  if (summary.weightChange !== null) {
    if (Math.abs(summary.weightChange) <= 0.3) {
      insights.push("इस अवधि में वजन अपेक्षाकृत स्थिर (Relatively stable) रहा है।");
    } else {
      insights.push(
        `Starting से weight में ${Math.abs(summary.weightChange)} kg का ${summary.weightChange > 0 ? "बढ़ाव (+)" : "घटाव (-)"} दर्ज हुआ है।`,
      );
    }
  }

  return insights;
}

/**
 * Fetch and aggregate 7-day Weekly Health Report Data
 */
export async function getWeeklyReportData(
  patientId?: string,
  endDate?: string,
): Promise<WeeklyReportSummary> {
  const profile = await getPatientProfile();
  const pid = patientId || profile.id;
  const targetEnd = endDate || getISTDateStr(new Date());
  const dates = get7TrailingDates(targetEnd);

  const [foodLogs, bpLogs, weightLogs, activityLogs, sleepLogs, medicines] =
    await Promise.all([
      getFoodLogs(pid, 100),
      getBloodPressureLogs(pid, 50),
      getWeightLogs(pid, 50),
      getActivityLogs(pid, 30),
      getSleepLogs(pid, 30),
      getMedicines(pid),
    ]);

  // Calculate daily score for each of the 7 days in parallel
  const dailyScoresPromises = dates.map(async (dStr) => {
    const scoreResult = await calculateDailyWellnessScore(pid, dStr);
    const dateObj = new Date(dStr);
    const dayLabel = dateObj.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
    });

    // Check if this date had any user logs
    const hasFood = foodLogs.some((f) => getISTDateStr(f.consumed_at) === dStr);
    const hasBP = bpLogs.some((b) => getISTDateStr(b.measured_at) === dStr);
    const hasWeight = weightLogs.some((w) => getISTDateStr(w.measured_at) === dStr);
    const hasAct = activityLogs.some((a) => a.date === dStr);
    const hasSleep = sleepLogs.some((s) => s.date === dStr);
    const hasLogs = hasFood || hasBP || hasWeight || hasAct || hasSleep;

    return {
      date: dStr,
      dayLabel,
      score: scoreResult.totalScore,
      category: scoreResult.category,
      categoryHi: scoreResult.categoryHi,
      hasLogs,
      scoreResult,
    };
  });

  const dailyScores = await Promise.all(dailyScoresPromises);

  const daysTrackedCount = dailyScores.filter((d) => d.hasLogs).length;
  const hasSufficientData = daysTrackedCount >= 3;

  // Compute Averages
  const scoredDays = dailyScores.filter((d) => d.hasLogs);
  const averageScore =
    scoredDays.length > 0
      ? Math.round(scoredDays.reduce((sum, d) => sum + d.score, 0) / scoredDays.length)
      : Math.round(dailyScores.reduce((sum, d) => sum + d.score, 0) / dailyScores.length);

  // Highest & Lowest
  let highestScore: WeeklyReportSummary["highestScore"] = null;
  let lowestScore: WeeklyReportSummary["lowestScore"] = null;

  if (scoredDays.length > 0) {
    const sorted = [...scoredDays].sort((a, b) => b.score - a.score);
    highestScore = {
      score: sorted[0].score,
      date: sorted[0].date,
      dayLabel: sorted[0].dayLabel,
    };
    lowestScore = {
      score: sorted[sorted.length - 1].score,
      date: sorted[sorted.length - 1].date,
      dayLabel: sorted[sorted.length - 1].dayLabel,
    };
  }

  // Medicine Adherence
  const activeMeds = medicines.filter((m) => m.active);
  const medicineAdherencePercent =
    activeMeds.length > 0
      ? Math.min(
          100,
          Math.round(
            (dailyScores.reduce((sum, d) => sum + (d.scoreResult?.components.medicine.percent || 0), 0) /
              (dailyScores.length * 100)) *
              100,
          ),
        )
      : 100;

  // Food Logging Consistency
  const daysWithFood = dates.filter((dStr) =>
    foodLogs.some((f) => getISTDateStr(f.consumed_at) === dStr),
  ).length;
  const foodLoggingConsistencyPercent = Math.min(100, Math.round((daysWithFood / 7) * 100));

  // Average Calories
  const weekFoodLogs = foodLogs.filter((f) => dates.includes(getISTDateStr(f.consumed_at)));
  const totalCalories = weekFoodLogs.reduce(
    (sum, f) => sum + Number(f.calories || 0),
    0,
  );
  const averageCalories =
    daysWithFood > 0 ? Math.round(totalCalories / daysWithFood) : null;

  // Average Steps
  const weekActs = activityLogs.filter(
    (a) => dates.includes(a.date) && a.steps > 0,
  );
  const totalSteps = weekActs.reduce((sum, a) => sum + Number(a.steps || 0), 0);
  const averageSteps =
    weekActs.length > 0 ? Math.round(totalSteps / weekActs.length) : null;

  // Average Sleep
  const weekSleeps = sleepLogs.filter(
    (s) => dates.includes(s.date) && Number(s.sleep_hours) > 0,
  );
  const totalSleep = weekSleeps.reduce(
    (sum, s) => sum + Number(s.sleep_hours || 0),
    0,
  );
  const averageSleepHours =
    weekSleeps.length > 0
      ? Number((totalSleep / weekSleeps.length).toFixed(1))
      : null;

  // BP Readings Count
  const weekBPs = bpLogs.filter((b) => dates.includes(getISTDateStr(b.measured_at)));
  const bpReadingsCount = weekBPs.length;

  // Weight Change
  const weekWeights = weightLogs
    .filter((w) => dates.includes(getISTDateStr(w.measured_at)))
    .sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime());

  const startWeightKg = weekWeights[0]?.weight_kg || null;
  const endWeightKg = weekWeights[weekWeights.length - 1]?.weight_kg || null;
  const weightChangeKg =
    startWeightKg !== null && endWeightKg !== null && weekWeights.length >= 2
      ? Number((endWeightKg - startWeightKg).toFixed(1))
      : null;

  const startDateObj = new Date(dates[0]);
  const endDateObj = new Date(dates[dates.length - 1]);
  const weekRangeLabel = `${startDateObj.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${endDateObj.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;

  const personalizedInsights = generateWeeklyInsights({
    medAdherence: medicineAdherencePercent,
    foodConsistency: foodLoggingConsistencyPercent,
    avgSteps: averageSteps,
    bpCount: bpReadingsCount,
    weightChange: weightChangeKg,
    daysTracked: daysTrackedCount,
  });

  return {
    weekRangeLabel,
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    hasSufficientData,
    daysTrackedCount,
    totalDays: 7,
    averageScore,
    highestScore,
    lowestScore,
    medicineAdherencePercent,
    foodLoggingConsistencyPercent,
    averageCalories,
    averageSteps,
    averageSleepHours,
    bpReadingsCount,
    weightChangeKg,
    startWeightKg,
    endWeightKg,
    dailyScores,
    personalizedInsights,
  };
}

/**
 * Fetch and aggregate 30-day Monthly Health Report Data
 */
export async function getMonthlyReportData(
  patientId?: string,
): Promise<MonthlyReportSummary> {
  const profile = await getPatientProfile();
  const pid = patientId || profile.id;

  const [foodLogs, bpLogs, weightLogs, activityLogs, sleepLogs] =
    await Promise.all([
      getFoodLogs(pid, 200),
      getBloodPressureLogs(pid, 100),
      getWeightLogs(pid, 60),
      getActivityLogs(pid, 60),
      getSleepLogs(pid, 60),
    ]);

  // Exactly-30-day inclusive window (day -29 .. day 0), explicitly IST-based
  // so the boundary doesn't depend on the runtime's local timezone and never
  // spans 31 calendar days the way a naive "today - 30" cutoff would.
  const endDateStr = getISTDateStr(new Date());
  const [endY, endM, endD] = endDateStr.split("-").map(Number);
  const startDateObj = new Date(endY, endM - 1, endD - 29);
  const startDateStr = `${startDateObj.getFullYear()}-${String(startDateObj.getMonth() + 1).padStart(2, "0")}-${String(startDateObj.getDate()).padStart(2, "0")}`;
  const endDateObj = new Date(endY, endM - 1, endD);

  const inWindow = (dStr: string) => dStr >= startDateStr && dStr <= endDateStr;

  const monthFood = foodLogs.filter((f) => inWindow(getISTDateStr(f.consumed_at)));
  const monthBP = bpLogs.filter((b) => inWindow(getISTDateStr(b.measured_at)));
  const monthWeights = weightLogs
    .filter((w) => inWindow(getISTDateStr(w.measured_at)))
    .sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime());
  const monthAct = activityLogs.filter((a) => inWindow(a.date));
  const monthSleep = sleepLogs.filter((s) => inWindow(s.date));

  // Collect distinct days with logs (IST calendar day)
  const trackedDays = new Set<string>();
  monthFood.forEach((f) => trackedDays.add(getISTDateStr(f.consumed_at)));
  monthBP.forEach((b) => trackedDays.add(getISTDateStr(b.measured_at)));
  monthWeights.forEach((w) => trackedDays.add(getISTDateStr(w.measured_at)));
  monthAct.forEach((a) => trackedDays.add(a.date));
  monthSleep.forEach((s) => trackedDays.add(s.date));

  // Safety net: the window is exactly 30 days, so this can never exceed 30,
  // but clamp defensively against any future change to the window logic.
  const daysTrackedCount = Math.min(30, trackedDays.size);
  const hasSufficientData = daysTrackedCount >= 7;

  // Averages & Percentages
  const foodLoggingPercent = Math.min(100, Math.round((new Set(monthFood.map(f => getISTDateStr(f.consumed_at))).size / 30) * 100));
  const bpLoggingPercent = Math.min(100, Math.round((new Set(monthBP.map(b => getISTDateStr(b.measured_at))).size / 30) * 100));
  const weightLoggingPercent = Math.min(100, Math.round((new Set(monthWeights.map(w => getISTDateStr(w.measured_at))).size / 30) * 100));
  const activityConsistencyPercent = Math.min(100, Math.round((monthAct.filter(a => a.steps > 0).length / 30) * 100));
  const sleepLoggingPercent = Math.min(100, Math.round((monthSleep.filter(s => Number(s.sleep_hours) > 0).length / 30) * 100));

  // Medicine Adherence — derived from real medicine logs across the 30-day
  // window (taken / (taken + late + missed)), instead of a hardcoded
  // constant. Mirrors the weekly report's use of real per-day medicine data.
  const windowDates: string[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(startDateObj);
    d.setDate(startDateObj.getDate() + i);
    windowDates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  const monthMedicineLogsByDay = await Promise.all(
    windowDates.map((dStr) => getMedicineLogsByDate(pid, dStr)),
  );
  const monthMedicineLogs = monthMedicineLogsByDay.flat();
  const takenDoses = monthMedicineLogs.filter((l) => l.status === "taken").length;
  const lateDoses = monthMedicineLogs.filter((l) => l.status === "late").length;
  const missedDoses = monthMedicineLogs.filter((l) => l.status === "missed").length;
  const trackedDoses = takenDoses + lateDoses + missedDoses;
  const medicineAdherencePercent =
    trackedDoses > 0 ? Math.min(100, Math.round((takenDoses / trackedDoses) * 100)) : 100;

  const totalCal = monthFood.reduce((s, f) => s + Number(f.calories || 0), 0);
  const foodDaysCount = new Set(monthFood.map(f => getISTDateStr(f.consumed_at))).size;
  const averageCalories = foodDaysCount > 0 ? Math.round(totalCal / foodDaysCount) : null;

  const totalSteps = monthAct.reduce((s, a) => s + Number(a.steps || 0), 0);
  const actDaysCount = monthAct.filter(a => a.steps > 0).length;
  const averageSteps = actDaysCount > 0 ? Math.round(totalSteps / actDaysCount) : null;

  const startWeightKg = monthWeights[0]?.weight_kg || null;
  const endWeightKg = monthWeights[monthWeights.length - 1]?.weight_kg || null;
  const weightChangeKg =
    startWeightKg && endWeightKg && monthWeights.length >= 2
      ? Number((endWeightKg - startWeightKg).toFixed(1))
      : null;

  const averageScore = Math.round(
    (foodLoggingPercent * 0.25) +
    (bpLoggingPercent * 0.2) +
    (weightLoggingPercent * 0.15) +
    (activityConsistencyPercent * 0.2) +
    (medicineAdherencePercent * 0.2),
  );

  const monthLabel = `${startDateObj.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${endDateObj.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;

  const insights: string[] = [
    `पिछले 30 दिनों में कुल ${daysTrackedCount} दिन सक्रिय ट्रैकिंग दर्ज की गई।`,
    `कुल ${monthBP.length} रक्तचाप (BP) माप रिकॉर्ड किए गए।`,
  ];
  if (weightChangeKg !== null) {
    insights.push(`माह के दौरान कुल वजन में ${weightChangeKg > 0 ? "+" : ""}${weightChangeKg} kg का बदलाव हुआ।`);
  }

  return {
    monthLabel,
    startDate: startDateStr,
    endDate: endDateStr,
    hasSufficientData,
    daysTrackedCount,
    totalDays: 30,
    averageScore,
    medicineAdherencePercent,
    foodLoggingPercent,
    activityConsistencyPercent,
    sleepLoggingPercent,
    bpLoggingPercent,
    weightLoggingPercent,
    averageCalories,
    averageSteps,
    totalBpReadings: monthBP.length,
    startWeightKg,
    endWeightKg,
    weightChangeKg,
    personalizedInsights: insights,
  };
}

/**
 * Fetch and aggregate 12-month Yearly Health Report Data
 */
export async function getYearlyReportData(
  patientId?: string,
  targetYear?: number,
): Promise<YearlyReportSummary> {
  const profile = await getPatientProfile();
  const pid = patientId || profile.id;
  const now = new Date();
  const year = targetYear || now.getFullYear();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth();

  const [bpLogs, weightLogs] = await Promise.all([
    getBloodPressureLogs(pid, 200),
    getWeightLogs(pid, 100),
  ]);

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  const months: YearlyMonthSummary[] = await Promise.all(
    monthNames.map(async (name, idx) => {
      const bpInMonth = bpLogs.filter((b) => {
        const d = new Date(b.measured_at);
        return d.getFullYear() === year && d.getMonth() === idx;
      });

      const wtInMonth = weightLogs.filter((w) => {
        const d = new Date(w.measured_at);
        return d.getFullYear() === year && d.getMonth() === idx;
      });

      const avgWt =
        wtInMonth.length > 0
          ? Number(
              (wtInMonth.reduce((s, w) => s + w.weight_kg, 0) / wtInMonth.length).toFixed(1),
            )
          : null;

      const daysTracked = new Set([
        ...bpInMonth.map((b) => b.measured_at.split("T")[0]),
        ...wtInMonth.map((w) => w.measured_at.split("T")[0]),
      ]).size;

      // Real per-day aggregation via calculateDailyWellnessScore — the same
      // "single source of truth" scorer the daily/weekly reports use —
      // instead of fixed 85/78 constants. Only computed for months that
      // already have tracked activity, and only over days that have
      // occurred (never into the future).
      let medAdh = 0;
      let avgScore = 0;

      if (daysTracked > 0) {
        const daysInMonth = new Date(year, idx + 1, 0).getDate();
        const lastDay =
          year === currentYear && idx === currentMonthIdx
            ? now.getDate()
            : year === currentYear && idx > currentMonthIdx
            ? 0
            : daysInMonth;

        if (lastDay > 0) {
          const dayStrings: string[] = [];
          for (let day = 1; day <= lastDay; day++) {
            dayStrings.push(
              `${year}-${String(idx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
            );
          }

          const dailyResults = await Promise.all(
            dayStrings.map((dStr) => calculateDailyWellnessScore(pid, dStr)),
          );

          avgScore = Math.round(
            dailyResults.reduce((s, r) => s + r.totalScore, 0) / dailyResults.length,
          );
          medAdh = Math.min(
            100,
            Math.round(
              dailyResults.reduce((s, r) => s + r.components.medicine.percent, 0) /
                dailyResults.length,
            ),
          );
        }
      }

      return {
        monthName: name,
        monthNumber: idx + 1,
        averageScore: avgScore,
        medicineAdherencePercent: medAdh,
        bpReadingsCount: bpInMonth.length,
        averageWeightKg: avgWt,
        daysTracked,
      };
    }),
  );

  const activeMonths = months.filter((m) => m.daysTracked > 0);
  const totalDaysTracked = months.reduce((s, m) => s + m.daysTracked, 0);
  const averageScore =
    activeMonths.length > 0
      ? Math.round(
          activeMonths.reduce((s, m) => s + m.averageScore, 0) / activeMonths.length,
        )
      : 0;

  return {
    year,
    hasSufficientData: activeMonths.length > 0,
    averageScore,
    totalDaysTracked,
    months,
    personalizedInsights: [
      `वर्ष ${year} में कुल ${totalDaysTracked} दिन ट्रैकिंग रिकॉर्ड दर्ज हुए।`,
      "वार्षिक रिकॉर्ड आपके डॉक्टर के नियमित चेकअप में सहायता प्रदान करते हैं।",
    ],
  };
}

/**
 * Format CSV string for Doctor Review Export
 */
export function generateCSVReport(
  weekly: WeeklyReportSummary,
  patientName: string,
): string {
  const lines: string[] = [];
  lines.push("SwasthTrack Health Summary Report");
  lines.push(`Patient,${patientName}`);
  lines.push(`Report Range,${weekly.weekRangeLabel}`);
  lines.push(`Generated Date,${new Date().toLocaleDateString("en-IN")}`);
  lines.push("");
  lines.push("DAILY TRACKING BREAKDOWN");
  lines.push("Date,Day,Wellness Score,Category,Medicine %,Food %,Activity Steps,Sleep Hours,BP Readings");

  weekly.dailyScores.forEach((d) => {
    const comp = d.scoreResult?.components;
    lines.push(
      [
        d.date,
        d.dayLabel,
        d.score,
        `"${d.category}"`,
        `${comp?.medicine.percent || 0}%`,
        `${comp?.food.percent || 0}%`,
        comp?.activity.status === "completed" || comp?.activity.status === "partial" ? comp.activity.details : "Not logged",
        comp?.sleep.status === "completed" ? comp.sleep.details : "Not logged",
        comp?.bp.status === "completed" || comp?.bp.status === "partial" ? `"${comp.bp.details}"` : "Not logged",
      ].join(","),
    );
  });

  lines.push("");
  lines.push("KEY METRICS & ADHERENCE");
  lines.push(`Average Weekly Wellness Score,${weekly.averageScore}/100`);
  lines.push(`Medicine Adherence,${weekly.medicineAdherencePercent}%`);
  lines.push(`Food Logging Consistency,${weekly.foodLoggingConsistencyPercent}%`);
  lines.push(`Average Daily Steps,${weekly.averageSteps || "N/A"}`);
  lines.push(`Average Daily Calories,${weekly.averageCalories ? weekly.averageCalories + " kcal" : "N/A"}`);
  lines.push(`Total BP Readings,${weekly.bpReadingsCount}`);
  lines.push(`Net Weight Change,${weekly.weightChangeKg !== null ? weekly.weightChangeKg + " kg" : "N/A"}`);
  lines.push("");
  lines.push("DISCLAIMER");
  lines.push('"This report reflects habit tracking and logging consistency only. It is not a clinical medical diagnosis or treatment plan."');

  return lines.join("\n");
}
