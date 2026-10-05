"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { CalendarCheck2, Pill } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/page";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { useAsyncData } from "@/components/health/use-async-data";
import { fmtDateStrFull, fmtDateStrWeekday } from "@/components/health/format";
import {
  buildDoseRecords,
  summarizeAdherence,
  summarizeByDate,
  summarizeByMedicine,
  type DayAdherence,
} from "@/lib/analytics/adherence";
import { addDaysIST, eachIST, todayIST, type DoseStatus } from "@/lib/health-rules";
import { onMedicinesChanged } from "@/hooks/use-medicine-marking";
import { cn } from "@/lib/utils";
import { getMedicineLogsInRange, getMedicines } from "@/services/patient-service";

type MedicineHistoryProps = {
  patientId: string;
  /** The day the schedule is showing (highlighted in the table). */
  selectedDate: string;
  /** A bar or a table row was chosen: show that day's schedule. */
  onSelectDate: (date: string) => void;
};

type Range = "7" | "14" | "30";
const RANGES: SegmentedOption<Range>[] = [
  { value: "7", label: "7 दिन" },
  { value: "14", label: "14 दिन" },
  { value: "30", label: "30 दिन" },
];

const AXIS_TICK = { fontSize: 11, fill: "var(--color-chart-axis)" } as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

const STATUS_WORD: Record<DoseStatus, string> = {
  taken: "ली गई",
  late: "देर से ली",
  missed: "छूटी",
  pending: "दर्ज होना बाकी",
};

const CELL_CLASS: Record<DoseStatus, string> = {
  taken: "bg-positive",
  late: "bg-attention",
  missed: "bg-critical",
  pending: "bg-info",
};

function HistoryTooltip({ active, payload }: Partial<TooltipContentProps>) {
  const day = active && payload && payload.length > 0 ? (payload[0].payload as DayAdherence) : null;
  if (!day) return null;
  return (
    <div className="rounded-field border border-line bg-surface p-3 text-xs shadow-e3">
      <p className="text-sm font-semibold text-ink">{fmtDateStrWeekday(day.date)}</p>
      {day.due === 0 ? (
        <p lang="hi" className="mt-1 text-ink-muted">
          इस दिन कोई खुराक तय नहीं थी
        </p>
      ) : (
        <>
          <p className="tabular mt-1 text-sm font-semibold text-ink">
            {day.pct === null ? "—" : `${day.pct}%`} <span lang="hi" className="text-xs font-normal text-ink-muted">नियमितता</span>
          </p>
          <p lang="hi" className="tabular text-ink-muted">
            ली गई {day.taken} · देर से {day.late} · छूटी {day.missed}
            {day.pending > 0 ? ` · बाकी ${day.pending}` : ""}
          </p>
        </>
      )}
      <p lang="hi" className="mt-1 text-ink-muted">
        खोलने के लिए बार पर टैप करें
      </p>
    </div>
  );
}

function StatTile({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: "positive" | "attention" | "critical" }) {
  return (
    <div className="tile rounded-control px-3 py-2.5">
      <p lang="hi" className="text-xs font-medium text-ink-muted">
        {label}
      </p>
      <p
        className={cn(
          "tabular mt-0.5 text-lg font-semibold",
          tone === "positive" && "text-positive",
          tone === "attention" && "text-attention",
          tone === "critical" && "text-critical",
          !tone && "text-ink",
        )}
      >
        {value}
        {unit ? <span className="text-xs font-normal text-ink-muted"> {unit}</span> : null}
      </p>
    </div>
  );
}

export function MedicineHistory({ patientId, selectedDate, onSelectDate }: MedicineHistoryProps) {
  const [range, setRange] = useState<Range>("7");
  const [tick, setTick] = useState(0);
  const today = todayIST();
  const days = Number(range);
  const start = addDaysIST(today, -(days - 1));

  // Marking, undoing or editing a medicine elsewhere on the page re-reads the history.
  useEffect(() => onMedicinesChanged(patientId, () => setTick((t) => t + 1)), [patientId]);

  const data = useAsyncData(
    async () => {
      const [medicines, logs] = await Promise.all([getMedicines(patientId), getMedicineLogsInRange(patientId, start, today)]);
      return { medicines, doses: buildDoseRecords(medicines, logs, start, today) };
    },
    [patientId, start, today, tick],
  );

  const doses = data.data?.doses ?? [];
  const series = summarizeByDate(doses, start, today);
  const total = summarizeAdherence(doses);
  const perMedicine = summarizeByMedicine(doses);
  const maxPerDay = Math.max(1, ...series.map((d) => d.due));
  const yTicks = Array.from({ length: maxPerDay + 1 }, (_, i) => i);
  const windowDates = eachIST(start, today);

  return (
    <Card aria-labelledby="med-history-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="med-history-heading" className="flex items-center gap-2 text-lg font-semibold text-ink">
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-meds-soft text-meds ring-1 ring-meds-line">
              <CalendarCheck2 className="h-4 w-4" />
            </span>
            <span lang="hi">नियमितता का इतिहास</span>
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            <span lang="hi">रोज़ ली गई, देर से ली गई और छूटी खुराकें</span> · Adherence history
          </p>
        </div>
        <Segmented options={RANGES} value={range} onChange={setRange} ariaLabel="समय सीमा — Range" size="sm" />
      </div>

      {data.error ? (
        <ErrorState title="इतिहास लोड नहीं हो पाया" englishTitle="Could not load the history" onRetry={data.reload} />
      ) : data.loading ? (
        <div aria-busy="true" aria-label="लोड हो रहा है" className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-16 rounded-control" />
            ))}
          </div>
          <div className="skeleton h-52 rounded-card" />
        </div>
      ) : total.due === 0 ? (
        <EmptyState
          icon={Pill}
          title="इस अवधि में कोई खुराक तय नहीं थी"
          hindiTitle="No doses were due in this range"
          description="दवाई जोड़ने के बाद, हर दिन की खुराक यहाँ गिनी जाएगी।"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="नियमितता" value={total.pct === null ? "—" : `${total.pct}%`} tone={total.pct !== null && total.pct >= 80 ? "positive" : undefined} />
            <StatTile label="समय पर ली गई" value={String(total.taken)} unit={`/ ${total.evaluated}`} tone="positive" />
            <StatTile label="देर से ली गई" value={String(total.late)} tone={total.late > 0 ? "attention" : undefined} />
            <StatTile label="छूटी" value={String(total.missed)} tone={total.missed > 0 ? "critical" : undefined} />
          </div>

          <figure className="min-w-0">
            <figcaption className="sr-only">
              पिछले {days} दिनों में रोज़ की खुराकें: कुल नियमितता {total.pct ?? 0}%, {total.missed} छूटीं।
            </figcaption>
            <div className="h-52 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 4 }} barCategoryGap="22%">
                  <CartesianGrid stroke="var(--color-chart-grid)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={shortDate}
                    interval={days === 7 ? 0 : days === 14 ? 1 : 4}
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={{ stroke: "var(--color-chart-grid)" }}
                  />
                  <YAxis domain={[0, maxPerDay]} ticks={yTicks} width={28} tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    content={(props) => <HistoryTooltip {...props} />}
                    cursor={{ fill: "var(--color-gold-soft)", opacity: 0.7 }}
                    wrapperStyle={{ zIndex: 20, outline: "none" }}
                  />
                  {(
                    [
                      ["taken", "var(--color-positive)"],
                      ["late", "var(--color-attention)"],
                      ["missed", "var(--color-critical)"],
                    ] as const
                  ).map(([key, color]) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      stackId="doses"
                      fill={color}
                      stroke="var(--color-surface)"
                      strokeWidth={1}
                      isAnimationActive={false}
                      cursor="pointer"
                      onClick={(item) => {
                        const date = (item as { date?: string; payload?: { date?: string } }).date ?? (item as { payload?: { date?: string } }).payload?.date;
                        if (date) onSelectDate(date);
                      }}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-medium text-ink-muted">
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2.5 w-3 rounded-sm bg-positive" />
                <span lang="hi">समय पर ली गई</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2.5 w-3 rounded-sm bg-attention" />
                <span lang="hi">देर से ली गई</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2.5 w-3 rounded-sm bg-critical" />
                <span lang="hi">छूटी</span>
              </li>
            </ul>
          </figure>

          <section aria-labelledby="med-per-medicine-heading" className="space-y-2">
            <h3 id="med-per-medicine-heading" className="text-sm font-semibold text-ink">
              <span lang="hi">हर दवाई की नियमितता</span>
            </h3>
            <ul className="space-y-2">
              {perMedicine.map((m) => {
                const byDate = new Map(m.days.map((d) => [d.date, d.status]));
                const hh = String(Math.floor(m.scheduledMin / 60)).padStart(2, "0");
                const mm = String(m.scheduledMin % 60).padStart(2, "0");
                return (
                  <li key={m.medicineId} className="tile rounded-control px-3 py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-semibold text-ink">
                        {m.name} <span className="tabular text-xs font-normal text-ink-muted">{hh}:{mm}</span>
                      </p>
                      <p className="tabular shrink-0 text-sm font-semibold text-ink">{m.pct === null ? "—" : `${m.pct}%`}</p>
                    </div>
                    <div
                      role="img"
                      aria-label={`${m.name}: ${windowDates.length} दिनों में ${m.taken} समय पर, ${m.late} देर से, ${m.missed} छूटी`}
                      className="mt-2 grid gap-0.5"
                      style={{ gridTemplateColumns: `repeat(${windowDates.length}, minmax(0, 1fr))` }}
                    >
                      {windowDates.map((date) => {
                        const status = byDate.get(date);
                        return (
                          <span
                            key={date}
                            title={`${shortDate(date)} — ${status ? STATUS_WORD[status] : "तय नहीं"}`}
                            className={cn("h-4 rounded-sm", status ? CELL_CLASS[status] : "bg-surface-sunken")}
                          />
                        );
                      })}
                    </div>
                    <div className="mt-1 flex justify-between text-2xs text-ink-muted">
                      <span>{shortDate(start)}</span>
                      <span>{shortDate(today)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p lang="hi" className="text-xs text-ink-muted">
              बंद की गई दवाइयाँ और दवाई जोड़े जाने से पहले के दिन इसमें नहीं गिने जाते।
            </p>
          </section>

          <details className="rounded-card border border-line bg-surface/60">
            <summary className="flex min-h-control cursor-pointer items-center justify-between gap-2 px-3 text-sm font-semibold text-ink">
              <span lang="hi">तालिका देखें</span>
              <span className="text-xs font-normal text-ink-muted">Table</span>
            </summary>
            <div className="overflow-x-auto px-3 pb-3">
              <table className="w-full min-w-[22rem] text-left text-xs">
                <caption className="sr-only">रोज़ की खुराकों का हिसाब</caption>
                <thead>
                  <tr className="border-b border-line text-ink-muted">
                    <th scope="col" className="py-2 pr-2 font-medium">
                      <span lang="hi">दिन</span>
                    </th>
                    <th scope="col" className="py-2 pr-2 text-right font-medium">
                      <span lang="hi">ली गई</span>
                    </th>
                    <th scope="col" className="py-2 pr-2 text-right font-medium">
                      <span lang="hi">देर से</span>
                    </th>
                    <th scope="col" className="py-2 pr-2 text-right font-medium">
                      <span lang="hi">छूटी</span>
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {[...series].reverse().map((d) => (
                    <tr key={d.date} className={cn("border-b border-line last:border-0", d.date === selectedDate && "bg-gold-soft")}>
                      <th scope="row" className="py-1 pr-2 font-medium">
                        <button
                          type="button"
                          onClick={() => onSelectDate(d.date)}
                          aria-label={`${fmtDateStrFull(d.date)} की दवाइयाँ खोलें`}
                          className="pressable -ml-2 min-h-control cursor-pointer rounded-control px-2 text-left font-medium text-ink hover:bg-gold-soft"
                        >
                          {fmtDateStrWeekday(d.date)}
                        </button>
                      </th>
                      {d.due === 0 ? (
                        <td colSpan={4} lang="hi" className="py-1 text-right text-ink-muted">
                          कोई खुराक तय नहीं थी
                        </td>
                      ) : (
                        <>
                          <td className="tabular py-1 pr-2 text-right text-ink">{d.taken}</td>
                          <td className="tabular py-1 pr-2 text-right text-ink-muted">{d.late}</td>
                          <td className="tabular py-1 pr-2 text-right text-ink-muted">{d.missed}</td>
                          <td className="tabular py-1 text-right font-semibold text-ink">{d.pct === null ? "—" : `${d.pct}%`}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </Card>
  );
}
