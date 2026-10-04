import {
  C,
  alertBlock,
  bullets,
  callout,
  emailShell,
  esc,
  heading,
  hi,
  kv,
  en,
  openApp,
  sectionTitle,
  toText,
} from "../layout";
import type {
  BpTone,
  DailyReportData,
  MonthlyReportData,
  RenderOptions,
  RenderedEmail,
  WeeklyReportData,
} from "../types";

const BP_TONE_COLOR: Record<BpTone, string> = {
  critical: C.critical,
  high: C.attention,
  low: C.attention,
  normal: C.green,
};

const REPORT_REASON = {
  hi: "आपने इस मरीज़ की रिपोर्ट चालू रखी हैं",
  en: "You have reports turned on for this patient",
};

const num = (n: number) => n.toLocaleString("en-IN");
const dash = "—";

function noteInsufficient(days: number, total: number, unitHi: string, unitEn: string): string {
  return callout(
    "info",
    `इस ${unitHi} बहुत कम डेटा दर्ज हुआ (${days}/${total} दिन), इसलिए नीचे के आँकड़े अधूरे हो सकते हैं।`,
    `Very little was logged this ${unitEn} (${days}/${total} days), so the numbers below may be incomplete.`,
  );
}

function shell(
  title: string,
  preheader: string,
  body: string,
  opts: RenderOptions,
): { html: string; text: string } {
  const html = emailShell({
    title,
    preheader,
    body,
    reasonHi: REPORT_REASON.hi,
    reasonEn: REPORT_REASON.en,
    sample: opts.sample,
  });
  return { html, text: toText(html) };
}

export function renderDailyReport(d: DailyReportData, opts: RenderOptions = {}): RenderedEmail {
  const parts: string[] = [heading(`${d.patientName} की दैनिक रिपोर्ट`, `Daily report · ${d.dateLabel}`)];

  if (d.alerts.length > 0) {
    parts.push(sectionTitle("ध्यान देने योग्य", "Needs attention"), d.alerts.map(alertBlock).join(""));
  }

  parts.push(sectionTitle("रक्तचाप", "Blood pressure"));
  parts.push(
    d.bpReadings.length === 0
      ? hi("आज कोई BP दर्ज नहीं हुआ", { size: 12, color: C.muted, mb: 1 }) + en("No BP logged today", { size: 11 })
      : kv(
          d.bpReadings.map((r) => ({
            label: `${r.time} · ${r.label}`,
            value: `<span style="color:${BP_TONE_COLOR[r.tone]};">${esc(r.value)}</span>${r.pulse ? ` <span style="font-weight:400;color:${C.muted};">· ${esc(r.pulse)} bpm</span>` : ""}`,
          })),
        ),
  );

  parts.push(sectionTitle("दवाइयाँ", "Medicines"));
  if (d.medicines.total === 0) {
    parts.push(hi("कोई सक्रिय दवाई नहीं", { size: 12, color: C.muted, mb: 1 }) + en("No active medicines", { size: 11 }));
  } else {
    const rows = [{ label: "ली गईं · Taken", value: `${d.medicines.taken} / ${d.medicines.total}` }];
    if (d.medicines.missed.length) {
      rows.push({ label: "छूटी · Missed", value: `<span style="color:${C.critical};">${esc(d.medicines.missed.join(", "))}</span>` });
    }
    if (d.medicines.pending.length) {
      rows.push({ label: "बाकी · Pending", value: esc(d.medicines.pending.join(", ")) });
    }
    parts.push(kv(rows));
  }

  parts.push(
    sectionTitle("आज का सारांश", "Today"),
    kv([
      { label: "कैलोरी · Calories", value: `${num(d.calories.eaten)} / ${num(d.calories.target)} kcal` },
      { label: "भोजन दर्ज · Meals logged", value: d.calories.meals.length ? esc(d.calories.meals.join(", ")) : dash },
      { label: "कदम · Steps", value: d.steps !== null ? num(d.steps) : dash },
      { label: "नींद · Sleep", value: d.sleepHours !== null ? `${d.sleepHours} hrs` : dash },
      { label: "वज़न · Weight", value: d.weightKg !== null ? `${d.weightKg} kg` : dash },
    ]),
  );

  if (d.missing.length > 0) {
    parts.push(sectionTitle("दर्ज होना बाकी", "Not logged today"), bullets(d.missing));
  }
  parts.push(openApp("/"));

  const flagged = d.alerts.some((a) => a.severity === "IMPORTANT");
  const subject = `${flagged ? "⚠️ " : ""}SwasthTrack daily report · ${d.patientName} · ${d.dateLabel}`;
  return {
    subject,
    ...shell(
      subject,
      d.alerts.length ? `${d.alerts.length} बातें ध्यान देने लायक · ${d.alerts.length} item(s) need attention` : "आज का सारांश · Today's summary",
      parts.join(""),
      opts,
    ),
  };
}

export function renderWeeklyReport(w: WeeklyReportData, opts: RenderOptions = {}): RenderedEmail {
  const s = w.summary;
  const parts: string[] = [heading(`${w.patientName} की साप्ताहिक रिपोर्ट`, `Weekly report · ${s.weekRangeLabel}`)];

  if (!s.hasSufficientData) parts.push(noteInsufficient(s.daysTrackedCount, s.totalDays, "हफ़्ते", "week"));

  parts.push(
    sectionTitle("हफ़्ते का स्कोर", "Weekly score"),
    kv([
      { label: "औसत स्कोर · Average score", value: `${s.averageScore} / 100` },
      { label: "ट्रैक किए दिन · Days tracked", value: `${s.daysTrackedCount} / ${s.totalDays}` },
      ...(s.highestScore ? [{ label: "सबसे अच्छा दिन · Best day", value: `${esc(s.highestScore.dayLabel)} · ${s.highestScore.score}` }] : []),
      ...(s.lowestScore ? [{ label: "सबसे कमज़ोर दिन · Lowest day", value: `${esc(s.lowestScore.dayLabel)} · ${s.lowestScore.score}` }] : []),
    ]),
    sectionTitle("रक्तचाप", "Blood pressure"),
    kv([
      { label: "कुल readings · Readings", value: String(s.bpReadingsCount) },
      { label: "औसत BP · Average", value: w.bpAverage ? `${w.bpAverage.systolic}/${w.bpAverage.diastolic}` : dash },
      {
        label: "अलर्ट सीमा से बाहर · Outside alert range",
        value: w.bpAlertCount > 0 ? `<span style="color:${C.attention};">${w.bpAlertCount}</span>` : "0",
      },
    ]),
    sectionTitle("आदतें", "Habits"),
    kv([
      { label: "दवाई अनुपालन · Medicine adherence", value: s.hasMedicineData ? `${s.medicineAdherencePercent}%` : dash },
      { label: "भोजन दर्ज · Meal logging", value: `${s.foodLoggingConsistencyPercent}%` },
      { label: "औसत कैलोरी · Avg calories", value: s.averageCalories !== null ? `${num(s.averageCalories)} kcal` : dash },
      { label: "औसत कदम · Avg steps", value: s.averageSteps !== null ? num(s.averageSteps) : dash },
      { label: "औसत नींद · Avg sleep", value: s.averageSleepHours !== null ? `${s.averageSleepHours} hrs` : dash },
      {
        label: "वज़न बदलाव · Weight change",
        value: s.weightChangeKg !== null ? `${s.weightChangeKg > 0 ? "+" : ""}${s.weightChangeKg} kg` : dash,
      },
    ]),
  );

  if (s.personalizedInsights.length > 0) {
    parts.push(sectionTitle("इस हफ़्ते की बातें", "Insights"), bullets(s.personalizedInsights));
  }
  parts.push(openApp("/reports"));

  const subject = `SwasthTrack weekly report · ${w.patientName} · ${s.weekRangeLabel}`;
  return { subject, ...shell(subject, `औसत स्कोर ${s.averageScore}/100 · Average score ${s.averageScore}/100`, parts.join(""), opts) };
}

export function renderMonthlyReport(m: MonthlyReportData, opts: RenderOptions = {}): RenderedEmail {
  const s = m.summary;
  const parts: string[] = [heading(`${m.patientName} की मासिक रिपोर्ट`, `Monthly report · ${s.monthLabel}`)];

  if (!s.hasSufficientData) parts.push(noteInsufficient(s.daysTrackedCount, s.totalDays, "महीने", "month"));

  parts.push(
    sectionTitle("महीने का स्कोर", "Monthly score"),
    kv([
      { label: "औसत स्कोर · Average score", value: `${s.averageScore} / 100` },
      { label: "ट्रैक किए दिन · Days tracked", value: `${s.daysTrackedCount} / ${s.totalDays}` },
    ]),
    sectionTitle("रक्तचाप", "Blood pressure"),
    kv([
      { label: "कुल readings · Readings", value: String(s.totalBpReadings) },
      { label: "औसत BP · Average", value: m.bpAverage ? `${m.bpAverage.systolic}/${m.bpAverage.diastolic}` : dash },
      {
        label: "अलर्ट सीमा से बाहर · Outside alert range",
        value: m.bpAlertCount > 0 ? `<span style="color:${C.attention};">${m.bpAlertCount}</span>` : "0",
      },
    ]),
    sectionTitle("नियमितता", "Consistency (days logged)"),
    kv([
      { label: "दवाई अनुपालन · Medicine adherence", value: s.hasMedicineData ? `${s.medicineAdherencePercent}%` : dash },
      { label: "भोजन · Food", value: `${s.foodLoggingPercent}%` },
      { label: "BP", value: `${s.bpLoggingPercent}%` },
      { label: "गतिविधि · Activity", value: `${s.activityConsistencyPercent}%` },
      { label: "नींद · Sleep", value: `${s.sleepLoggingPercent}%` },
      { label: "वज़न · Weight", value: `${s.weightLoggingPercent}%` },
    ]),
    sectionTitle("औसत", "Averages"),
    kv([
      { label: "कैलोरी · Calories", value: s.averageCalories !== null ? `${num(s.averageCalories)} kcal` : dash },
      { label: "कदम · Steps", value: s.averageSteps !== null ? num(s.averageSteps) : dash },
      {
        label: "वज़न · Weight",
        value:
          s.startWeightKg !== null && s.endWeightKg !== null
            ? `${s.startWeightKg} → ${s.endWeightKg} kg${s.weightChangeKg !== null ? ` (${s.weightChangeKg > 0 ? "+" : ""}${s.weightChangeKg})` : ""}`
            : dash,
      },
    ]),
  );

  if (s.personalizedInsights.length > 0) {
    parts.push(sectionTitle("इस महीने की बातें", "Insights"), bullets(s.personalizedInsights));
  }
  parts.push(openApp("/reports"));

  const subject = `SwasthTrack monthly report · ${m.patientName} · ${s.monthLabel}`;
  return { subject, ...shell(subject, `औसत स्कोर ${s.averageScore}/100 · Average score ${s.averageScore}/100`, parts.join(""), opts) };
}
