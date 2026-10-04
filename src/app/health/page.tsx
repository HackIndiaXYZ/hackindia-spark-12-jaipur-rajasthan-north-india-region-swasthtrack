"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, Footprints, HeartPulse, LayoutGrid, Moon, Scale } from "lucide-react";
import { BloodPressurePanel } from "@/components/health/blood-pressure-panel";
import { WeightPanel } from "@/components/health/weight-panel";
import { SleepPanel } from "@/components/health/sleep-panel";
import { ActivityPanel } from "@/components/health/activity-panel";
import { NoPatientState } from "@/components/health/no-patient-state";
import { isNoPatientError, loadErrorMessage, useAsyncData } from "@/components/health/use-async-data";
import { SkeletonHealthPanel } from "@/components/ui/skeleton-loaders";
import { ErrorState, PageBody, PageHeader } from "@/components/ui/page";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { useAuth } from "@/context/auth-context";
import {
  getActivityLogs,
  getBloodPressureLogs,
  getPatientProfile,
  getSleepLogs,
  getWeightLogs,
} from "@/services/patient-service";
import { getPatientSettingsOrDefault } from "@/services/settings-service";

type HealthTab = "all" | "bp" | "weight" | "sleep" | "activity";

const TABS: SegmentedOption<HealthTab>[] = [
  { value: "all", label: "All", hindiLabel: "सभी", icon: LayoutGrid },
  { value: "bp", label: "BP", hindiLabel: "रक्तचाप", icon: HeartPulse },
  { value: "weight", label: "Weight", hindiLabel: "वजन", icon: Scale },
  { value: "sleep", label: "Sleep", hindiLabel: "नींद", icon: Moon },
  { value: "activity", label: "Steps", hindiLabel: "कदम", icon: Footprints },
];

export default function HealthPage() {
  const { activePatientId, canWrite, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<HealthTab>("all");

  // One request set per patient; the shared patient-service cache dedupes
  // overlapping reads with the dashboard.
  const { data, error, loading, reload } = useAsyncData(
    async () => {
      const pid = activePatientId!;
      const [patient, settings, bp, weight, sleep, activity] = await Promise.all([
        getPatientProfile(pid),
        getPatientSettingsOrDefault(pid),
        getBloodPressureLogs(pid, 30),
        getWeightLogs(pid, 30),
        getSleepLogs(pid, 30),
        getActivityLogs(pid, 30),
      ]);
      return { patient, settings, bp, weight, sleep, activity };
    },
    [activePatientId],
    activePatientId !== null,
  );

  const header = (
    <PageHeader
      eyebrow="Health tracking"
      title="Vitals & daily trackers"
      hindiTitle="रक्तचाप, वजन, नींद और कदम"
      description="रक्तचाप, वजन, नींद और दैनिक कदमों का रिकॉर्ड और ट्रेंड।"
    />
  );

  if (!authLoading && activePatientId === null) {
    return (
      <PageBody>
        {header}
        <NoPatientState what="स्वास्थ्य रिकॉर्ड" />
      </PageBody>
    );
  }

  if (error) {
    return (
      <PageBody>
        {header}
        {isNoPatientError(error) ? (
          <NoPatientState what="स्वास्थ्य रिकॉर्ड" />
        ) : (
          <ErrorState
            title="स्वास्थ्य रिकॉर्ड लोड नहीं हो पाए"
            englishTitle="Health records could not be loaded"
            description={loadErrorMessage(error)}
            onRetry={reload}
          />
        )}
      </PageBody>
    );
  }

  if (authLoading || loading || !data || !activePatientId) {
    return (
      <PageBody>
        {header}
        <div aria-busy="true" aria-label="लोड हो रहा है" className="space-y-5">
          <SkeletonHealthPanel />
          <SkeletonHealthPanel />
        </div>
      </PageBody>
    );
  }

  const { patient, settings, bp, weight, sleep, activity } = data;
  const t = settings.bp_targets;
  const show = (tab: HealthTab) => activeTab === "all" || activeTab === tab;

  return (
    <PageBody>
      {header}

      <Segmented options={TABS} value={activeTab} onChange={setActiveTab} ariaLabel="Health tracker filter — कौन सा ट्रैकर देखें" />

      {!canWrite ? (
        <p className="flex items-start gap-2 rounded-card border border-info-line bg-info-soft p-3 text-sm text-ink-muted">
          <Eye aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <span lang="hi">आपके पास सिर्फ़ देखने की अनुमति है, इसलिए नई रीडिंग दर्ज करना या बदलना बंद है।</span>
        </p>
      ) : null}

      {settings.is_default ? (
        <p className="rounded-card border border-line bg-surface-sunken p-3 text-xs text-ink-muted">
          <span lang="hi">
            इस मरीज़ के लक्ष्य अभी सेटिंग में तय नहीं हैं, इसलिए सामान्य सीमाएँ इस्तेमाल हो रही हैं (BP {t.target_systolic}/{t.target_diastolic}, {settings.daily_step_goal} कदम, {settings.sleep_target_hours} घंटे नींद)।
          </span>{" "}
          {canWrite ? (
            <Link href="/settings" className="font-semibold text-brand-ink underline underline-offset-2">
              सेटिंग में बदलें
            </Link>
          ) : null}
        </p>
      ) : null}

      <div className="space-y-5 sm:space-y-6">
        {show("bp") ? (
          <BloodPressurePanel patientId={patient.id} logs={bp} thresholds={t} canWrite={canWrite} onSuccess={reload} />
        ) : null}

        {show("weight") ? (
          <WeightPanel
            patientId={patient.id}
            logs={weight}
            targetWeight={patient.target_weight_kg}
            heightCm={patient.height_cm}
            canWrite={canWrite}
            onSuccess={reload}
          />
        ) : null}

        {show("sleep") ? (
          <SleepPanel
            patientId={patient.id}
            logs={sleep}
            targetHours={settings.sleep_target_hours}
            canWrite={canWrite}
            onSuccess={reload}
          />
        ) : null}

        {show("activity") ? (
          <ActivityPanel
            patientId={patient.id}
            logs={activity}
            targetSteps={settings.daily_step_goal}
            canWrite={canWrite}
            onSuccess={reload}
          />
        ) : null}
      </div>
    </PageBody>
  );
}
