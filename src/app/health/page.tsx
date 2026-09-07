"use client";

import { useCallback, useEffect, useState } from "react";
import { Footprints, HeartPulse, LayoutGrid, Moon, Scale } from "lucide-react";
import { BloodPressurePanel } from "@/components/health/blood-pressure-panel";
import { WeightPanel } from "@/components/health/weight-panel";
import { SleepPanel } from "@/components/health/sleep-panel";
import { ActivityPanel } from "@/components/health/activity-panel";
import { SkeletonHealthPanel } from "@/components/ui/skeleton-loaders";
import { ErrorState, PageBody, PageHeader } from "@/components/ui/page";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import {
  getBloodPressureLogs,
  getPatientProfile,
  getWeightLogs,
  getSleepLogs,
  getActivityLogs,
  type BPLogEntry,
  type PatientProfile,
  type WeightLogEntry,
  type SleepLogEntry,
  type ActivityLogEntry,
} from "@/services/patient-service";
import {
  getPatientSettings,
  DEFAULT_SETTINGS,
  type PatientSettings,
} from "@/services/settings-service";

type HealthTab = "all" | "bp" | "weight" | "sleep" | "activity";

export default function HealthPage() {
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [settings, setSettings] = useState<PatientSettings>(DEFAULT_SETTINGS);
  const [bpLogs, setBpLogs] = useState<BPLogEntry[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLogEntry[]>([]);
  const [sleepLogs, setSleepLogs] = useState<SleepLogEntry[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<HealthTab>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  /** One loader for both mount and refresh — these were duplicated verbatim. */
  const loadData = useCallback(
    () =>
      getPatientProfile()
        .then(async (p) => {
          const [bpList, wtList, slList, actList, patientSettings] =
            await Promise.all([
              getBloodPressureLogs(p.id, 30),
              getWeightLogs(p.id, 30),
              getSleepLogs(p.id, 30),
              getActivityLogs(p.id, 30),
              getPatientSettings(p.id).catch(() => DEFAULT_SETTINGS),
            ]);

          setLoadError(false);
          setPatient(p);
          setBpLogs(bpList);
          setWeightLogs(wtList);
          setSleepLogs(slList);
          setActivityLogs(actList);
          setSettings(patientSettings);
          setLoading(false);
        })
        .catch(() => {
          setLoadError(true);
          setLoading(false);
        }),
    [],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const refresh = useCallback(() => {
    void loadData();
  }, [loadData]);

  const tabs: SegmentedOption<HealthTab>[] = [
    { value: "all", label: "All", hindiLabel: "सभी", icon: LayoutGrid },
    { value: "bp", label: "BP", hindiLabel: "रक्तचाप", icon: HeartPulse, count: bpLogs.length },
    { value: "weight", label: "Weight", hindiLabel: "वजन", icon: Scale, count: weightLogs.length },
    { value: "sleep", label: "Sleep", hindiLabel: "नींद", icon: Moon, count: sleepLogs.length },
    { value: "activity", label: "Steps", hindiLabel: "कदम", icon: Footprints, count: activityLogs.length },
  ];

  return (
    <PageBody>
      <PageHeader
        eyebrow="Health tracking"
        title="Vitals & daily trackers"
        hindiTitle="रक्तचाप, वजन, नींद और कदम"
        description="रक्तचाप, वजन, नींद और दैनिक कदमों का सुरक्षित रिकॉर्ड व ट्रेंड विश्लेषण।"
      />

      <Segmented
        options={tabs}
        value={activeTab}
        onChange={setActiveTab}
        ariaLabel="Health tracker filter"
      />

      {loadError ? (
        <ErrorState
          title="स्वास्थ्य रिकॉर्ड लोड नहीं हो पाए"
          englishTitle="Health records could not be loaded"
          onRetry={refresh}
        />
      ) : loading && !patient ? (
        <div className="space-y-5">
          <SkeletonHealthPanel />
          <SkeletonHealthPanel />
        </div>
      ) : patient ? (
        <div className="space-y-5 sm:space-y-6">
          {(activeTab === "all" || activeTab === "bp") && (
            <BloodPressurePanel
              patientId={patient.id}
              logs={bpLogs}
              onSuccess={refresh}
            />
          )}

          {(activeTab === "all" || activeTab === "weight") && (
            <WeightPanel
              patientId={patient.id}
              logs={weightLogs}
              targetWeight={patient.target_weight_kg}
              onSuccess={refresh}
            />
          )}

          {(activeTab === "all" || activeTab === "sleep") && (
            <SleepPanel
              patientId={patient.id}
              logs={sleepLogs}
              onSuccess={refresh}
            />
          )}

          {(activeTab === "all" || activeTab === "activity") && (
            <ActivityPanel
              patientId={patient.id}
              logs={activityLogs}
              targetSteps={settings.daily_step_goal}
              onSuccess={refresh}
            />
          )}
        </div>
      ) : null}
    </PageBody>
  );
}
