"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  Check,
  Edit3,
  ListOrdered,
  Lock,
  Plus,
  Scale,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, NumberInput, TextInput } from "@/components/ui/form-field";
import { WeightTrendChart } from "@/components/health/weight-trend-chart";
import {
  deleteWeight,
  getWeightLogsByDateRange,
  logWeight,
  updateWeight,
  type WeightLogEntry,
} from "@/services/patient-service";

type WeightPanelProps = {
  patientId: string;
  logs: WeightLogEntry[];
  targetWeight?: number | null;
  onSuccess?: () => void;
};

// Allow editing/correcting weight entries
function canEditEntry(createdAt: string): boolean {
  return Boolean(createdAt);
}

type ChartRange = "7d" | "30d" | "3m" | "6m" | "1y";

function getDateRangeStart(range: ChartRange): Date {
  const now = new Date();
  switch (range) {
    case "7d": return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    case "30d": return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    case "3m": return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    case "6m": return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    case "1y": return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  }
}

// Compute weekly averages from logs
function computeWeeklySummaries(logs: WeightLogEntry[]): { week: string; avg: number; count: number; change: number | null }[] {
  if (logs.length === 0) return [];
  
  const sorted = [...logs].sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime());
  const weeks: Map<string, number[]> = new Map();
  
  sorted.forEach((log) => {
    const d = new Date(log.measured_at);
    // Get Monday of the week
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.getFullYear(), d.getMonth(), diff);
    const weekKey = monday.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    
    if (!weeks.has(weekKey)) weeks.set(weekKey, []);
    weeks.get(weekKey)!.push(log.weight_kg);
  });
  
  const result: { week: string; avg: number; count: number; change: number | null }[] = [];
  let prevAvg: number | null = null;
  
  weeks.forEach((weights, weekKey) => {
    const avg = Number((weights.reduce((s, w) => s + w, 0) / weights.length).toFixed(1));
    const change = prevAvg !== null ? Number((avg - prevAvg).toFixed(1)) : null;
    result.push({ week: weekKey, avg, count: weights.length, change });
    prevAvg = avg;
  });
  
  return result;
}

export function WeightPanel({
  patientId,
  logs,
  targetWeight,
  onSuccess,
}: WeightPanelProps) {
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Chart state
  const [chartRange, setChartRange] = useState<ChartRange>("30d");
  const [chartLogs, setChartLogs] = useState<WeightLogEntry[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<"form" | "history" | "chart">("form");

  const latest = logs[0];

  // Load chart data when range or tab changes
  useEffect(() => {
    if (activeTab !== "chart") return;
    let active = true;

    const start = getDateRangeStart(chartRange);
    const end = new Date();

    getWeightLogsByDateRange(patientId, start.toISOString(), end.toISOString())
      .then((data) => {
        if (active) {
          setChartLogs(data);
        }
      })
      .catch(() => {
        // silent
      })
      .finally(() => {
        if (active) {
          setChartLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [activeTab, chartRange, patientId]);

  // Weekly summaries from chart data
  const weeklySummaries = computeWeeklySummaries(chartLogs);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    const weightNum = parseFloat(weight);
    if (isNaN(weightNum) || weightNum <= 20 || weightNum > 350) {
      setError("कृपया 20-350 kg के बीच सही वजन दर्ज करें");
      return;
    }

    try {
      setLoading(true);
      await logWeight({
        patient_id: patientId,
        weight_kg: weightNum,
        measured_at: new Date().toISOString(),
        notes: notes.trim() || null,
      });

      setWeight("");
      setNotes("");
      setSuccessMsg("Weight saved! (वजन दर्ज हो गया) ✅");
      setTimeout(() => setSuccessMsg(""), 4000);
      onSuccess?.();
    } catch {
      setError("वजन दर्ज करने में त्रुटि हुई।");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("क्या आप यह weight entry मिटाना चाहते हैं?")) return;
    try {
      await deleteWeight(id);
      setSuccessMsg("Weight entry deleted ✅");
      setTimeout(() => setSuccessMsg(""), 3000);
      onSuccess?.();
    } catch {
      setError("Delete में त्रुटि हुई।");
    }
  }

  function startEdit(log: WeightLogEntry) {
    setEditingId(log.id);
    setEditWeight(String(log.weight_kg));
    setEditNotes(log.notes || "");
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    const w = parseFloat(editWeight);
    if (isNaN(w) || w <= 20 || w > 350) {
      setError("कृपया सही वजन दर्ज करें");
      return;
    }
    try {
      await updateWeight(editingId, {
        weight_kg: w,
        notes: editNotes.trim() || null,
      });
      setEditingId(null);
      setSuccessMsg("Weight updated ✅");
      setTimeout(() => setSuccessMsg(""), 3000);
      onSuccess?.();
    } catch {
      setError("Update में त्रुटि हुई।");
    }
  }

  const rangeLabels: Record<ChartRange, string> = {
    "7d": "7 दिन",
    "30d": "30 दिन",
    "3m": "3 महीने",
    "6m": "6 महीने",
    "1y": "1 साल",
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-weight-soft text-weight">
            <Scale aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Body Weight</CardTitle>
              <Badge variant="info">वजन</Badge>
            </div>
            <CardDescription>
              {targetWeight
                ? `Target · लक्ष्य: ${targetWeight} kg`
                : "Target not set · लक्ष्य तय नहीं"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      {error ? (
        <div className="mb-4 rounded-card border border-critical-line bg-critical-soft p-3 text-sm font-medium text-critical">
          {error}
        </div>
      ) : null}

      {successMsg ? (
        <div className="mb-4 flex items-center gap-2 rounded-card border border-positive-line bg-positive-soft p-3 text-sm font-semibold text-positive">
          <Check className="h-4 w-4 text-positive" />
          {successMsg}
        </div>
      ) : null}

      {/* Latest reading + target progress */}
      <div className="mb-5 rounded-card border border-line bg-surface-sunken p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
              Latest Weight · ताज़ा वजन
            </p>
            <p className="mt-1 text-4xl font-extrabold text-ink">
              {latest ? `${latest.weight_kg}` : "--"}
              <span className="text-sm font-semibold text-ink-subtle"> kg</span>
            </p>
            {latest && (
              <p className="mt-0.5 text-xs text-ink-subtle">
                {new Date(latest.measured_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                {latest.notes ? ` · ${latest.notes}` : ""}
              </p>
            )}
          </div>
          {targetWeight && latest && (
            <div className="text-right">
              <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">Target</p>
              <p className="mt-1 text-lg font-extrabold text-emerald-700">{targetWeight} kg</p>
              <p className={`text-xs font-semibold ${latest.weight_kg > targetWeight ? "text-amber-600" : "text-emerald-600"}`}>
                {latest.weight_kg > targetWeight
                  ? `${(latest.weight_kg - targetWeight).toFixed(1)} kg ज्यादा`
                  : latest.weight_kg < targetWeight
                  ? `${(targetWeight - latest.weight_kg).toFixed(1)} kg कम`
                  : "🎯 Target achieved!"}
              </p>
            </div>
          )}
        </div>

        {/* Progress bar toward target */}
        {targetWeight && latest && latest.weight_kg > targetWeight && (
          <div className="mt-3">
            <div className="flex justify-between text-2xs text-ink-subtle mb-1">
              <span>Current: {latest.weight_kg} kg</span>
              <span>Target: {targetWeight} kg</span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-sunken overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-500 transition-all"
                style={{
                  // Show how much of the gap has been closed (assuming started at +10kg or more)
                  width: `${Math.min(100, Math.max(10, (1 - (latest.weight_kg - targetWeight) / 10) * 100))}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Panel view switch — identical to the blood pressure panel (§45). */}
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-control bg-surface-sunken p-1">
        {(["form", "history", "chart"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`pressable flex min-h-10 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-field px-2 text-sm font-medium ${
              activeTab === tab
                ? "bg-surface text-ink shadow-e1"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {tab === "form" ? (
              <>
                <Plus aria-hidden className="h-4 w-4 shrink-0" />
                <span>New</span>
              </>
            ) : tab === "history" ? (
              <>
                <ListOrdered aria-hidden className="h-4 w-4 shrink-0" />
                <span>History</span>
              </>
            ) : (
              <>
                <TrendingUp aria-hidden className="h-4 w-4 shrink-0" />
                <span>Trend</span>
              </>
            )}
          </button>
        ))}
      </div>

      {/* FORM TAB */}
      {activeTab === "form" && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-card border border-line bg-surface p-4">
          <Field label="Weight (वजन kg में)" hint="उदा. 78.4" required>
            <NumberInput
              allowDecimal
              maxLength={5}
              placeholder="78.4"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              required
              className="text-xl font-semibold"
            />
          </Field>

          <Field label="Notes (टिप्पणी)">
            <TextInput
              placeholder="e.g. Morning fasting / सुबह खाली पेट"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          <Button
            type="submit"
            disabled={loading}
            className="w-full"
            variant="primary"
          >
            <Plus aria-hidden className="h-4 w-4" />
            {loading ? "Saving..." : "Save Weight (वजन दर्ज करें)"}
          </Button>
        </form>
      )}

      {/* HISTORY TAB */}
      {activeTab === "history" && (
        <div className="rounded-card border border-line bg-surface p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-3">
            Weight History · वजन इतिहास
          </h4>
          {logs.length > 0 ? (
            <div className="divide-y divide-line">
              {logs.slice(0, 20).map((log) => {
                const editable = canEditEntry(log.created_at);
                const isEditing = editingId === log.id;

                if (isEditing) {
                  return (
                    <div key={log.id} className="py-3 space-y-2 bg-surface-sunken rounded-card p-3 my-1">
                      <input
                        type="number"
                        step="0.1"
                        value={editWeight}
                        onChange={(e) => setEditWeight(e.target.value)}
                        className="w-full rounded-field border border-line-strong px-2 py-1.5 text-sm"
                        placeholder="Weight (kg)"
                      />
                      <input
                        type="text"
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        className="w-full rounded-field border border-line-strong px-2 py-1.5 text-sm"
                        placeholder="Notes"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          className="rounded-control bg-positive px-3 py-1.5 text-xs font-semibold text-ink-inverse hover:brightness-95"
                        >
                          ✓ Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-control bg-surface-sunken px-3 py-1.5 text-xs font-semibold text-ink-muted hover:bg-line-strong"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={log.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink">{log.weight_kg} kg</span>
                        {targetWeight && (
                          <span className={`text-2xs font-semibold ${log.weight_kg > targetWeight ? "text-amber-600" : "text-emerald-600"}`}>
                            ({log.weight_kg > targetWeight ? "+" : ""}{(log.weight_kg - targetWeight).toFixed(1)} kg)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ink-subtle">
                        {new Date(log.measured_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {log.notes ? ` · ${log.notes}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {editable ? (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(log)}
                            className="flex h-9 w-9 items-center justify-center rounded-control border border-line bg-surface text-ink-subtle hover:bg-info-soft hover:text-info hover:border-info-line transition-colors"
                            title="Edit (बदलें)"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(log.id)}
                            className="flex h-9 w-9 items-center justify-center rounded-control border border-line bg-surface text-ink-subtle hover:bg-critical-soft hover:text-critical hover:border-critical-line transition-colors"
                            title="Delete (मिटाएं)"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <span title="Edit window (2 घंटे) समाप्त हो गई">
                          <Lock className="h-4 w-4 text-ink-subtle" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-ink-subtle py-6 text-center">
              कोई weight entry दर्ज नहीं है
            </p>
          )}
        </div>
      )}

      {/* CHART TAB */}
      {activeTab === "chart" && (
        <div className="space-y-4">
          {/* Range selector */}
          <div className="flex gap-1 flex-wrap">
            {(Object.keys(rangeLabels) as ChartRange[]).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setChartRange(range)}
                className={`rounded-control px-3 py-1.5 text-xs font-semibold transition-all ${
                  chartRange === range
                    ? "bg-amber-500 text-white shadow-e1"
                    : "bg-surface-sunken text-ink-muted hover:bg-line-strong"
                }`}
              >
                {rangeLabels[range]}
              </button>
            ))}
          </div>

          {/* Chart */}
          {chartLoading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            </div>
          ) : (
            <WeightTrendChart logs={chartLogs} targetWeight={targetWeight} />
          )}

          {/* Weekly summary */}
          {weeklySummaries.length > 0 ? (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-2">
                Weekly Summary · साप्ताहिक सारांश
              </h4>
              <div className="space-y-1">
                {weeklySummaries.map((ws) => (
                  <div key={ws.week} className="flex items-center justify-between rounded-field bg-surface-sunken px-3 py-2">
                    <div>
                      <span className="text-xs font-semibold text-ink-muted">Week of {ws.week}</span>
                      <span className="ml-2 text-2xs text-ink-subtle">({ws.count} entries)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{ws.avg} kg</span>
                      {ws.change !== null && (
                        <span className={`text-2xs font-semibold ${ws.change > 0 ? "text-rose-600" : ws.change < 0 ? "text-emerald-600" : "text-ink-subtle"}`}>
                          {ws.change > 0 ? "↑" : ws.change < 0 ? "↓" : "→"} {Math.abs(ws.change)} kg
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : !chartLoading && chartLogs.length === 0 ? (
            <div className="rounded-card border border-dashed border-line bg-surface-sunken/70 p-4 text-center">
              <p className="text-xs text-ink-subtle">पर्याप्त data नहीं है summary के लिए</p>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
