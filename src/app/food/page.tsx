"use client";

import { useState } from "react";
import { FoodEntryPanel } from "@/components/food/food-entry-panel";
import { FoodLogList } from "@/components/food/food-log-list";
import { NoPatientState } from "@/components/health/no-patient-state";
import { isNoPatientError, loadErrorMessage, useAsyncData } from "@/components/health/use-async-data";
import { fmtDateStrFull } from "@/components/health/format";
import { SkeletonCard } from "@/components/ui/skeleton-loaders";
import { ErrorState, PageBody, PageHeader } from "@/components/ui/page";
import { useAuth } from "@/context/auth-context";
import { todayIST } from "@/lib/health-rules";
import { getFoodLogsByDate, getPatientProfile } from "@/services/patient-service";
import { getPatientSettingsOrDefault } from "@/services/settings-service";

export default function FoodPage() {
  const { activePatientId, canWrite, loading: authLoading } = useAuth();
  // IST "today": the lazy initialiser runs on the client, after the skeleton paint.
  const [selectedDate, setSelectedDate] = useState(todayIST);

  // Patient and settings change rarely; the day's meals change with the date. They
  // are separate loaders so picking another date does not remount the entry panel.
  const profile = useAsyncData(
    async () => {
      const pid = activePatientId!;
      const [patient, settings] = await Promise.all([getPatientProfile(pid), getPatientSettingsOrDefault(pid)]);
      return { patient, settings };
    },
    [activePatientId],
    activePatientId !== null,
  );
  const logs = useAsyncData(
    () => getFoodLogsByDate(activePatientId!, selectedDate),
    [activePatientId, selectedDate],
    activePatientId !== null,
  );

  const header = (
    <PageHeader
      eyebrow="Food tracking"
      title="Food & calories"
      hindiTitle="भोजन और कैलोरी"
      description="भोजन, मात्रा और कैलोरी का रोज़ का रिकॉर्ड।"
    />
  );

  if (!authLoading && activePatientId === null) {
    return (
      <PageBody>
        {header}
        <NoPatientState what="भोजन का रिकॉर्ड" />
      </PageBody>
    );
  }

  if (profile.error) {
    return (
      <PageBody>
        {header}
        {isNoPatientError(profile.error) ? (
          <NoPatientState what="भोजन का रिकॉर्ड" />
        ) : (
          <ErrorState
            title="भोजन का पेज लोड नहीं हो पाया"
            englishTitle="The food page could not be loaded"
            description={loadErrorMessage(profile.error)}
            onRetry={profile.reload}
          />
        )}
      </PageBody>
    );
  }

  if (authLoading || profile.loading || !profile.data || !activePatientId) {
    return (
      <PageBody>
        {header}
        <SkeletonCard />
        <SkeletonCard />
      </PageBody>
    );
  }

  const { patient, settings } = profile.data;
  const refreshLogs = () => logs.reload();
  const today = todayIST();

  return (
    <PageBody>
      {header}
      <FoodEntryPanel
        patientId={patient.id}
        patientName={patient.name.split(" ")[0]}
        calorieTarget={settings.daily_calorie_target}
        canWrite={canWrite}
        onSuccess={refreshLogs}
      />
      {selectedDate !== today ? (
        <p lang="hi" className="rounded-card border border-info-line bg-info-soft p-3 text-xs text-ink-muted">
          आप {fmtDateStrFull(selectedDate)} का रिकॉर्ड देख रहे हैं। ऊपर से जोड़ा गया नया भोजन आज की तारीख़ में दर्ज होगा।
        </p>
      ) : null}
      <FoodLogList
        logs={logs.data}
        loading={logs.loading}
        error={Boolean(logs.error)}
        onRetry={logs.reload}
        patientId={patient.id}
        selectedDate={selectedDate}
        onRefresh={refreshLogs}
        onDateChange={setSelectedDate}
        dailyCalorieTarget={settings.daily_calorie_target}
        canWrite={canWrite}
      />
    </PageBody>
  );
}
