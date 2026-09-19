"use client";

import { useState } from "react";
import { Footprints, Plus, Flame, Clock, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddActivityDialog } from "@/components/forms/add-activity-dialog";
import type { ActivityLogEntry } from "@/services/patient-service";

type ActivityPanelProps = {
  patientId: string;
  logs: ActivityLogEntry[];
  targetSteps?: number;
  onSuccess?: () => void;
};

export function ActivityPanel({
  patientId,
  logs,
  targetSteps = 6000,
  onSuccess,
}: ActivityPanelProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const totalLogs = logs.length;
  const avgSteps =
    totalLogs > 0
      ? Math.round(logs.reduce((sum, item) => sum + (item.steps || 0), 0) / totalLogs)
      : 0;

  const totalCalories = logs.reduce(
    (sum, item) => sum + (item.estimated_calories_burned || 0),
    0
  );

  const latestLog = logs[0] || null;

  return (
    <>
      <Card className="border-sky-100/80 shadow-xs overflow-hidden">
        <CardHeader className="bg-linear-to-r from-sky-50/60 via-surface-sunken/40 to-surface pb-4 border-b border-sky-100/50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-control bg-sky-600 text-white flex items-center justify-center shadow-xs">
                  <Footprints className="h-4.5 w-4.5" />
                </div>
                <CardTitle className="text-lg font-bold text-ink">
                  Daily Physical Activity (कदम व टहलना)
                </CardTitle>
                <Badge variant="blue">गतिविधि ट्रैकर</Badge>
              </div>
              <CardDescription className="text-xs font-semibold text-ink-subtle mt-1">
                नियमित 30-45 मिनट वॉक करने से वजन घटता है और BP व शुगर नियंत्रित रहता है।
              </CardDescription>
            </div>

            <Button
              onClick={() => setIsDialogOpen(true)}
              className="bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-control h-11 px-4 shadow-xs"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              + Log Walk (कदम दर्ज करें)
            </Button>
          </div>
        </CardHeader>

        <div className="p-4 sm:p-6 space-y-6">
          {/* STATS HIGHLIGHTS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="p-4 rounded-card border border-sky-100 bg-sky-50/50 flex flex-col justify-between">
              <div className="flex items-center justify-between text-ink-muted">
                <span className="text-xs font-bold uppercase tracking-wider text-sky-900">
                  औसत दैनिक कदम (Avg Steps)
                </span>
                <Footprints className="h-4 w-4 text-sky-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-sky-950">{avgSteps.toLocaleString("en-IN")}</span>
                <span className="text-sm font-semibold text-sky-800">कदम</span>
              </div>
              <span className="text-xs font-semibold text-sky-700 mt-1">
                दैनिक लक्ष्य: {targetSteps.toLocaleString("en-IN")} कदम
              </span>
            </div>

            <div className="p-4 rounded-card border border-amber-100 bg-amber-50/50 flex flex-col justify-between">
              <div className="flex items-center justify-between text-ink-muted">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                  कुल बर्न कैलोरी (Burned)
                </span>
                <Flame className="h-4 w-4 text-amber-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-amber-950">{Math.round(totalCalories)}</span>
                <span className="text-sm font-semibold text-amber-800">kcal</span>
              </div>
              <span className="text-xs font-semibold text-amber-700 mt-1">
                पिछले 14 दिनों की कुल एक्टिविटी
              </span>
            </div>

            <div className="p-4 rounded-card border border-line bg-surface-sunken/70 flex flex-col justify-between">
              <div className="flex items-center justify-between text-ink-muted">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                  हालिया वॉक (Latest Walk)
                </span>
                <Clock className="h-4 w-4 text-ink-muted" />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-ink">
                  {latestLog ? `${latestLog.steps} कदम` : "--"}
                </span>
                <span className="text-xs font-semibold text-ink-subtle">
                  {latestLog ? `(${latestLog.distance_km || 0} km)` : ""}
                </span>
              </div>
              <span className="text-xs font-semibold text-ink-muted mt-1">
                {latestLog ? `${latestLog.walking_minutes || 0} मिनट टहले · ${latestLog.date}` : "नियमित टहलें"}
              </span>
            </div>
          </div>

          {/* ACTIVITY HISTORY LIST */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-ink flex items-center gap-2">
                <Calendar className="h-4 w-4 text-sky-600" />
                टहलने का इतिहास (Activity History)
              </h4>
              <span className="text-xs font-semibold text-ink-subtle">
                कुल {logs.length} रिकॉर्ड
              </span>
            </div>

            {logs.length === 0 ? (
              <div className="text-center py-8 rounded-card border border-dashed border-line bg-surface-sunken/50">
                <Footprints className="h-8 w-8 text-ink-subtle mx-auto mb-2" />
                <p className="text-sm font-semibold text-ink-muted">कोई गतिविधि रिकॉर्ड नहीं है</p>
                <p className="text-xs text-ink-subtle mt-0.5">ऊपर दिए गए बटन से अपने कदम दर्ज करें।</p>
              </div>
            ) : (
              <div className="rounded-card border border-line divide-y divide-line overflow-hidden bg-surface shadow-2xs">
                {logs.map((log) => {
                  const metGoal = (log.steps || 0) >= targetSteps;
                  return (
                    <div
                      key={log.id}
                      className="p-3.5 sm:p-4 hover:bg-surface-sunken/70 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-11 w-11 rounded-control flex flex-col items-center justify-center shrink-0 border ${
                            metGoal
                              ? "bg-emerald-50 border-emerald-200 text-emerald-950 font-bold"
                              : "bg-sky-50 border-sky-200 text-sky-950 font-bold"
                          }`}
                        >
                          <span className="text-sm font-bold leading-none">{log.steps}</span>
                          <span className="text-2xs font-semibold uppercase text-ink-subtle">कदम</span>
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-ink">
                              {new Date(log.date).toLocaleDateString("hi-IN", {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                            <Badge variant={metGoal ? "green" : "blue"}>
                              {metGoal ? "🎯 लक्ष्य पूरा" : "🚶 दैनिक वॉक"}
                            </Badge>
                          </div>

                          <div className="text-xs text-ink-subtle font-medium mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                            {log.distance_km && log.distance_km > 0 ? (
                              <span>📍 दूरी: {log.distance_km} km</span>
                            ) : null}
                            <span>
                              ⏱️ समय: {log.walking_minutes && log.walking_minutes > 0 ? (
                                <strong className="text-ink font-semibold">{log.walking_minutes} min (दर्ज)</strong>
                              ) : (
                                <span className="text-ink-subtle">~{Math.round(log.steps / 125)}–{Math.round(log.steps / 95)} min (अनुमानित)</span>
                              )}
                            </span>
                            <span>
                              🔥 सक्रिय बर्न: {log.estimated_calories_burned && log.estimated_calories_burned > 0 ? (
                                <strong className="text-amber-800 font-semibold">{log.estimated_calories_burned} kcal</strong>
                              ) : (
                                <span className="text-ink-subtle">उपलब्ध नहीं</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Card>

      <AddActivityDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        patientId={patientId}
        initialSteps={latestLog?.steps || 3000}
        initialDistanceKm={latestLog?.distance_km || 2.1}
        onSuccess={() => {
          setIsDialogOpen(false);
          onSuccess?.();
        }}
      />
    </>
  );
}
