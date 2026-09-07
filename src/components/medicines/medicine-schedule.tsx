"use client";

import { useEffect, useState } from "react";
import {
  Calendar,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  RotateCcw,
  Settings,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getMedicineLogsByDate,
  getTodayDateString,
  logMedicineStatus,
  deleteMedicineLog,
  evaluateMedicineStatusAndMessage,
  type MedicineItem,
  type MedicineLogEntry,
} from "@/services/patient-service";
import { AddMedicineDialog } from "@/components/forms/add-medicine-dialog";
import { ManageMedicinesDialog } from "@/components/forms/manage-medicines-dialog";

type MedicineScheduleProps = {
  patientId: string;
  medicines: MedicineItem[];
  logs?: MedicineLogEntry[];
  onAddMedicine: () => void;
  onRefresh: () => void;
};

type StatusType = "taken" | "late" | "missed" | "pending";

const statusStyles: Record<StatusType, string> = {
  taken: "border-emerald-500 bg-emerald-600 text-white font-bold shadow-md ring-2 ring-emerald-600/30",
  late: "border-amber-500 bg-amber-500 text-white font-bold shadow-md ring-2 ring-amber-500/30",
  missed: "border-rose-500 bg-rose-600 text-white font-bold shadow-md ring-2 ring-rose-600/30",
  pending: "border-slate-300 bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-400 font-semibold shadow-2xs",
};

/** "आज", "कल", or a short local date — never a hard-coded special case. */
function formatDateLabel(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return "आज (Today)";

  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const yesterday = new Date(ty, tm - 1, td);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.getTime() === yesterday.getTime()) return "कल (Yesterday)";

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getMedicinePeriod(timeStr: string): "Morning" | "Afternoon" | "Evening" | "Night" {
  const hour = parseInt(timeStr.split(":")[0], 10);
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  if (hour < 21) return "Evening";
  return "Night";
}

export function MedicineSchedule({
  patientId,
  medicines,
  logs: initialLogs,
  onAddMedicine,
  onRefresh,
}: MedicineScheduleProps) {
  const todayStr = getTodayDateString();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [currentLogs, setCurrentLogs] = useState<MedicineLogEntry[]>(initialLogs || []);
  const [pendingMarks, setPendingMarks] = useState<Map<string, StatusType>>(new Map());
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState<string | null>(null);
  const [medicineToEdit, setMedicineToEdit] = useState<MedicineItem | null>(null);
  const [isManageOpen, setIsManageOpen] = useState(false);

  // Load logs whenever selectedDate or patientId changes
  useEffect(() => {
    getMedicineLogsByDate(patientId, selectedDate).then((fetched) => {
      setCurrentLogs(fetched);
      setPendingMarks(new Map());
    });
  }, [patientId, selectedDate]);

  function adjustDate(offsetDays: number) {
    // `new Date("YYYY-MM-DD")` parses as UTC midnight, so reading the result
    // back with local getters shifted the day by one west of UTC. Building the
    // date from explicit components keeps it in the patient's own timezone
    // (§56).
    const [y, m, d] = selectedDate.split("-").map(Number);
    const curr = new Date(y, m - 1, d);
    curr.setDate(curr.getDate() + offsetDays);
    const next = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, "0")}-${String(curr.getDate()).padStart(2, "0")}`;
    // Future doses cannot be recorded.
    if (next > getTodayDateString()) return;
    setSelectedDate(next);
  }

  const periods = ["Morning", "Afternoon", "Evening", "Night"] as const;
  const grouped = periods.reduce<Record<string, MedicineItem[]>>((acc, period) => {
    acc[period] = medicines.filter((m) => getMedicinePeriod(m.scheduled_time) === period);
    return acc;
  }, {});

  // Server logs first, then the optimistic marks on top. The previous order
  // seeded the map with `pendingMarks` and let `currentLogs` overwrite them,
  // so re-marking a dose that already had a log showed no change until the
  // refetch landed (§23).
  const statusMap = new Map<string, StatusType>();
  currentLogs.forEach((log) => statusMap.set(log.medicine_id, log.status as StatusType));
  pendingMarks.forEach((status, medicineId) => statusMap.set(medicineId, status));

  async function handleMarkAuto(medicine: MedicineItem) {
    const previousPending = new Map(pendingMarks);
    setRollbackError(null);

    const evalResult = evaluateMedicineStatusAndMessage(medicine, selectedDate);
    const finalStatus = evalResult.computedStatus;

    // Optimistic update
    setPendingMarks((prev) => {
      const next = new Map(prev);
      next.set(medicine.id, finalStatus);
      return next;
    });

    setBulkSuccessMsg(evalResult.userMessageHi);
    setTimeout(() => setBulkSuccessMsg(null), 4500);

    try {
      const targetTime = `${selectedDate}T${medicine.scheduled_time}`;
      await logMedicineStatus({
        medicine_id: medicine.id,
        patient_id: patientId,
        scheduled_time: targetTime,
        taken_time: new Date().toISOString(),
        status: finalStatus,
        notes: evalResult.isLate ? "Auto-Late Evaluation: Taken after schedule window" : null,
      });
      const updated = await getMedicineLogsByDate(patientId, selectedDate);
      setCurrentLogs(updated);
      onRefresh();
    } catch {
      setPendingMarks(previousPending);
      setRollbackError("Update save नहीं हो पाया। कृपया पुनः प्रयास करें।");
      setTimeout(() => setRollbackError(null), 5000);
      onRefresh();
    }
  }

  async function handleMarkMissed(medicine: MedicineItem) {
    const previousPending = new Map(pendingMarks);
    setRollbackError(null);

    setPendingMarks((prev) => {
      const next = new Map(prev);
      next.set(medicine.id, "missed");
      return next;
    });

    setBulkSuccessMsg(`"${medicine.medicine_name}" को छूट गई (Missed) दर्ज किया गया।`);
    setTimeout(() => setBulkSuccessMsg(null), 4500);

    try {
      const targetTime = `${selectedDate}T${medicine.scheduled_time}`;
      await logMedicineStatus({
        medicine_id: medicine.id,
        patient_id: patientId,
        scheduled_time: targetTime,
        taken_time: null,
        status: "missed",
        notes: "User explicitly marked Missed",
      });
      const updated = await getMedicineLogsByDate(patientId, selectedDate);
      setCurrentLogs(updated);
      onRefresh();
    } catch {
      setPendingMarks(previousPending);
      setRollbackError("Update save नहीं हो पाया। पुनः प्रयास करें।");
      setTimeout(() => setRollbackError(null), 5000);
      onRefresh();
    }
  }

  // Unmark / Reset an entry
  async function handleUnmark(medicine: MedicineItem) {
    const existingLog = currentLogs.find((l) => l.medicine_id === medicine.id);
    if (existingLog) {
      await deleteMedicineLog(existingLog.id);
    }
    setPendingMarks((prev) => {
      const next = new Map(prev);
      next.delete(medicine.id);
      return next;
    });
    const updated = await getMedicineLogsByDate(patientId, selectedDate);
    setCurrentLogs(updated);
    onRefresh();
  }

  // 1-Tap Mark All Active Medicines Taken for selected date
  async function handleMarkAllTaken() {
    const activeMeds = medicines.filter((m) => m.active);
    if (activeMeds.length === 0) return;

    const previousPending = new Map(pendingMarks);
    const updated = new Map(pendingMarks);
    activeMeds.forEach((m) => updated.set(m.id, "taken"));
    setPendingMarks(updated);

    setBulkSuccessMsg(`इस तारीख की सभी ${activeMeds.length} दवाइयाँ 'Taken' मार्क हो गईं!`);
    setTimeout(() => setBulkSuccessMsg(null), 4000);

    try {
      await Promise.all(
        activeMeds.map((m) => {
          const targetTime = `${selectedDate}T${m.scheduled_time}`;
          return logMedicineStatus({
            medicine_id: m.id,
            patient_id: patientId,
            scheduled_time: targetTime,
            taken_time: targetTime,
            status: "taken",
            notes: "1-Tap Mark All Taken",
          });
        })
      );
      const updated = await getMedicineLogsByDate(patientId, selectedDate);
      setCurrentLogs(updated);
      onRefresh();
    } catch {
      setPendingMarks(previousPending);
      setRollbackError("दवाइयाँ सेव नहीं हो पाईं। पुनः प्रयास करें।");
      setTimeout(() => setRollbackError(null), 5000);
      onRefresh();
    }
  }

  // Reset all today logs so user can re-test clean white state
  async function handleResetAllTodayLogs() {
    const todayLogs = await getMedicineLogsByDate(patientId, selectedDate);
    await Promise.all(todayLogs.map((l) => deleteMedicineLog(l.id)));
    if (typeof window !== "undefined") {
      try {
        const stored = JSON.parse(localStorage.getItem("swasthtrack_medicine_logs") || "[]");
        const filtered = Array.isArray(stored)
          ? stored.filter((l: { scheduled_time?: string }) => !l.scheduled_time?.startsWith(selectedDate))
          : [];
        localStorage.setItem("swasthtrack_medicine_logs", JSON.stringify(filtered));
      } catch {}
    }
    setPendingMarks(new Map());
    setCurrentLogs([]);
    onRefresh();
    setBulkSuccessMsg(`इस तारीख (${selectedDate}) की सभी दवाइयाँ अनमार्क (Clean White State) कर दी गई हैं!`);
    setTimeout(() => setBulkSuccessMsg(null), 4000);
  }

  const activeMedsCount = medicines.filter((m) => m.active).length;
  const takenCount = medicines.filter(
    (m) => m.active && statusMap.get(m.id) === "taken"
  ).length;

  return (
    <Card className="border-2 border-slate-200/90 shadow-md">
      {/* HEADER & DATE NAVIGATOR */}
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-6 pb-4 border-b border-slate-100">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-xl sm:text-2xl font-bold text-slate-900">
              Medicine Schedule
            </CardTitle>
            <Badge variant="green" className="text-xs font-semibold px-2.5 py-1">
              दवाइयों का समय
            </Badge>
          </div>
          <CardDescription className="text-xs sm:text-sm font-medium text-slate-600 mt-1">
            दिन के समय के अनुसार दवाइयों की सूची एवं खुराक दर्ज करें
          </CardDescription>
        </div>
        <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
          <Button
            variant="secondary"
            onClick={() => setIsManageOpen(true)}
            className="flex-1 sm:flex-none"
          >
            <Settings aria-hidden className="h-4 w-4 shrink-0" />
            <span>Edit · बदलें</span>
          </Button>
          <Button
            variant="primary"
            onClick={onAddMedicine}
            className="flex-1 sm:flex-none"
          >
            <Plus aria-hidden className="h-4 w-4 shrink-0" />
            <span>Add · जोड़ें</span>
          </Button>
        </div>
      </CardHeader>

      {/* DATE NAVIGATION BAR */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-line bg-surface-sunken px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-1.5">
          <IconButton
            onClick={() => adjustDate(-1)}
            aria-label="पिछला दिन (Previous day)"
            size="sm"
            variant="secondary"
          >
            <ChevronLeft aria-hidden className="h-4 w-4" />
          </IconButton>

          <div className="flex items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 py-1.5 text-sm font-semibold text-ink">
            <Calendar aria-hidden className="h-4 w-4 shrink-0 text-brand" />
            <span className="tabular whitespace-nowrap">{formatDateLabel(selectedDate, todayStr)}</span>
          </div>

          <IconButton
            onClick={() => adjustDate(1)}
            aria-label="अगला दिन (Next day)"
            size="sm"
            variant="secondary"
            disabled={selectedDate >= todayStr}
          >
            <ChevronRight aria-hidden className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="flex items-center gap-2">
          <span className="tabular rounded-control border border-line bg-surface px-2.5 py-1.5 text-sm font-semibold text-ink">
            {takenCount}/{activeMedsCount}{" "}
            <span lang="hi" className="font-normal text-ink-muted">
              ली गईं
            </span>
          </span>
          {selectedDate !== todayStr && (
            <Button size="sm" variant="ghost" onClick={() => setSelectedDate(todayStr)}>
              <span lang="hi">आज पर जाएं</span>
            </Button>
          )}
        </div>
      </div>

      {rollbackError && (
        <div className="mx-4 sm:mx-6 mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs sm:text-sm font-semibold text-rose-800 animate-in fade-in">
          ⚠️ {rollbackError}
        </div>
      )}

      {bulkSuccessMsg && (
        <div className="mx-4 sm:mx-6 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs sm:text-sm font-semibold text-emerald-800 animate-in fade-in">
          {bulkSuccessMsg}
        </div>
      )}

      <div className="p-4 sm:p-6 space-y-6">
        {/* 1-TAP BULK MARK ALL MEDICINES TAKEN */}
        {activeMedsCount > 0 && (
          <div className="flex flex-col gap-3 rounded-card border border-brand-line bg-brand-softer p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <CheckCheck aria-hidden className="h-4.5 w-4.5 shrink-0 text-brand" />
                <span lang="hi">आसान 1-टैप मार्क</span>
              </p>
              <p lang="hi" className="mt-0.5 text-xs text-ink-muted">
                इस तारीख की सभी {activeMedsCount} दवाइयाँ एक साथ ली गईं दर्ज करें
              </p>
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <Button
                variant="primary"
                onClick={handleMarkAllTaken}
                className="flex-1 sm:flex-none"
              >
                <CheckCheck aria-hidden className="h-4 w-4 shrink-0" />
                <span lang="hi">सभी ली गईं</span>
              </Button>

              <Button
                variant="secondary"
                onClick={handleResetAllTodayLogs}
                title="इस तारीख की सभी एंट्री रीसेट करें"
              >
                <RotateCcw aria-hidden className="h-4 w-4 shrink-0" />
                <span lang="hi">रीसेट</span>
              </Button>
            </div>
          </div>
        )}

        {periods.map((period) => {
          const periodMeds = grouped[period] || [];
          const periodHi =
            period === "Morning"
              ? "सुबह (Morning)"
              : period === "Afternoon"
              ? "दोपहर (Afternoon)"
              : period === "Evening"
              ? "शाम (Evening)"
              : "रात (Night)";

          return (
            <section
              className="rounded-card border border-line bg-surface-sunken p-4 sm:p-5"
              key={period}
            >
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3">
                <h3 className="flex items-center gap-2 text-base font-semibold text-ink sm:text-lg">
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" />
                  <span lang="hi">{periodHi}</span>
                </h3>
                <span className="tabular shrink-0 whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-muted">
                  {periodMeds.length} scheduled
                </span>
              </div>

              <div className="space-y-4">
                {periodMeds.length > 0 ? (
                  periodMeds.map((medicine) => {
                    const currentStatus = statusMap.get(medicine.id) || "pending";
                    const existingLog = currentLogs.find((l) => l.medicine_id === medicine.id);
                    const markedIso = existingLog?.taken_time || existingLog?.created_at;
                    let markedTime: string | null = null;
                    if (markedIso) {
                      try {
                        const d = new Date(markedIso);
                        if (!isNaN(d.getTime())) {
                          markedTime = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
                        }
                      } catch {}
                    }

                    return (
                      <article
                        className={`rounded-2xl border-2 p-4 sm:p-5 transition-all shadow-xs ${
                          medicine.active
                            ? "border-slate-300/80 bg-white hover:border-slate-400"
                            : "border-slate-200 bg-slate-100/70 opacity-60"
                        }`}
                        key={medicine.id}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <h4 className="font-bold text-slate-950 text-base sm:text-lg tracking-tight">
                                {medicine.medicine_name}
                              </h4>
                              <span className="text-xs sm:text-sm font-bold text-emerald-800 bg-emerald-100/90 px-2.5 py-0.5 rounded-lg shadow-2xs">
                                {medicine.dose}
                              </span>
                              {currentStatus !== "pending" && (
                                <span
                                  className={`text-xs font-bold px-2.5 py-0.5 rounded-md flex items-center gap-1.5 border ${
                                    currentStatus === "taken"
                                      ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                                      : currentStatus === "late"
                                      ? "bg-amber-100 text-amber-900 border-amber-300"
                                      : "bg-rose-100 text-rose-900 border-rose-300"
                                  }`}
                                >
                                  <span>
                                    {currentStatus === "taken"
                                      ? "✓ TAKEN (ली गई)"
                                      : currentStatus === "late"
                                      ? "⏳ LATE (देर से ली)"
                                      : "✕ MISSED (छूट गई)"}
                                  </span>
                                </span>
                              )}
                            </div>
                            <p className="text-sm sm:text-base font-semibold text-slate-700 flex items-center gap-1.5">
                              <span className="text-emerald-700">●</span>
                              {medicine.meal_relation ? medicine.meal_relation.replace("_", " ") : "भोजन के बाद"}
                              <span className="text-slate-400 font-normal">·</span>
                              <span className="text-slate-600 font-semibold">{medicine.frequency}</span>
                            </p>

                            {/* MARKED TIME & SCHEDULED TIME HIGHLIGHT BANNER */}
                            <div className="mt-2.5 pt-1.5 flex flex-wrap items-center gap-2 text-xs font-semibold">
                              <span className="bg-slate-100 text-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 flex items-center gap-1.5 font-bold">
                                <Clock className="h-3.5 w-3.5 text-emerald-700" />
                                <span>निर्धारित समय (Scheduled): {medicine.scheduled_time.slice(0, 5)}</span>
                              </span>

                              {markedTime ? (
                                <span className="bg-purple-100 text-purple-950 px-2.5 py-1 rounded-lg border border-purple-300 flex items-center gap-1.5 font-bold animate-in fade-in">
                                  <span>🕒</span>
                                  <span>मार्क समय (Marked Time): {markedTime}</span>
                                </span>
                              ) : currentStatus !== "pending" ? (
                                <span className="bg-purple-100 text-purple-950 px-2.5 py-1 rounded-lg border border-purple-300 flex items-center gap-1.5 font-bold animate-in fade-in">
                                  <span>🕒</span>
                                  <span>मार्क समय (Marked Time): हाल ही में दर्ज (Just Now)</span>
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-start shrink-0">
                            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-900 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
                              <Clock aria-hidden="true" className="h-4 w-4 text-emerald-700" />
                              <span>{medicine.scheduled_time.slice(0, 5)}</span>
                            </div>
                          </div>
                        </div>

                        {medicine.active && (
                          <div className="mt-4 pt-3 border-t border-slate-100">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-500">
                                स्थिति बदलें / दर्ज करें (Change Entry):
                              </p>
                              {currentStatus !== "pending" && (
                                <button
                                  type="button"
                                  onClick={() => handleUnmark(medicine)}
                                  className="text-xs font-semibold text-slate-400 hover:text-rose-600 flex items-center gap-1 cursor-pointer"
                                  title="एंट्री हटाएं / रीसेट करें"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  <span>Unmark (रीसेट)</span>
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                              {/* Option 1: Taken (Auto evaluates on-time vs late) */}
                              <button
                                type="button"
                                onClick={() => handleMarkAuto(medicine)}
                                className={cn(
                                  "flex-1 min-h-11 rounded-xl border-2 px-3 text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 shadow-xs",
                                  currentStatus === "taken"
                                    ? statusStyles.taken
                                    : currentStatus === "late"
                                    ? statusStyles.late
                                    : statusStyles.pending,
                                )}
                              >
                                <span>✓</span>
                                <span>
                                  {currentStatus === "taken"
                                    ? "✓ Taken (ली गई)"
                                    : currentStatus === "late"
                                    ? "⏳ Late (देर से ली गई)"
                                    : "✓ Mark Taken (ली गई)"}
                                </span>
                              </button>

                              {/* Option 2: Missed */}
                              <button
                                type="button"
                                onClick={() => handleMarkMissed(medicine)}
                                className={cn(
                                  "flex-1 min-h-11 rounded-xl border-2 px-3 text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 shadow-xs",
                                  currentStatus === "missed"
                                    ? statusStyles.missed
                                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-rose-50 hover:text-rose-800 hover:border-rose-300 font-semibold",
                                )}
                              >
                                <span>✕</span>
                                <span>
                                  {currentStatus === "missed"
                                    ? "✕ Missed (छूट गई)"
                                    : "✕ Missed (छूट गई)"}
                                </span>
                              </button>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })
                ) : (
                  <p className="text-sm font-semibold text-slate-500 py-3 text-center bg-white rounded-xl border border-slate-200">
                    इस समय के लिए कोई दवाई निर्धारित नहीं है (No medicines scheduled).
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* MANAGE MEDICINES DIALOG */}
      {isManageOpen && (
        <ManageMedicinesDialog
          isOpen={isManageOpen}
          onClose={() => setIsManageOpen(false)}
          patientId={patientId}
          onSuccess={onRefresh}
        />
      )}

      {/* EDIT MEDICINE DIALOG */}
      {medicineToEdit && (
        <AddMedicineDialog
          isOpen={!!medicineToEdit}
          onClose={() => setMedicineToEdit(null)}
          patientId={patientId}
          medicineToEdit={medicineToEdit}
          onSuccess={() => {
            setMedicineToEdit(null);
            onRefresh();
          }}
        />
      )}
    </Card>
  );
}
