"use client";

import { useState } from "react";
import { CalorieHero } from "@/components/food/calorie-hero";
import { ENTRY_PANEL_ID, SEARCH_INPUT_ID, mealSlotNow } from "@/components/food/food-math";
import { FoodEntryPanel } from "@/components/food/food-entry-panel";
import { FoodHistory } from "@/components/food/food-history";
import { FoodLogList } from "@/components/food/food-log-list";
import { NoPatientState } from "@/components/health/no-patient-state";
import { isNoPatientError, loadErrorMessage, useAsyncData } from "@/components/health/use-async-data";
import { SkeletonCard } from "@/components/ui/skeleton-loaders";
import { ErrorState, PageBody, PageHeader } from "@/components/ui/page";
import { useAuth } from "@/context/auth-context";
import { todayIST } from "@/lib/health-rules";
import { getFoodLogsByDate, getPatientProfile } from "@/services/patient-service";
import { getPatientSettingsOrDefault } from "@/services/settings-service";

/** Smooth scrolling unless the reader asked for reduced motion. */
function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

export default function FoodPage() {
  const { activePatientId, canWrite, loading: authLoading } = useAuth();
  // IST "today": the lazy initialiser runs on the client, after the skeleton paint.
  const [selectedDate, setSelectedDate] = useState(todayIST);
  // The meal the entry panel will save into; the meal cards' "add" buttons change it.
  const [entryMeal, setEntryMeal] = useState(mealSlotNow);
  // Bumped after every write so the history chart re-reads too.
  const [historyTick, setHistoryTick] = useState(0);

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
  const target = settings.daily_calorie_target;
  const refreshLogs = () => {
    logs.reload();
    setHistoryTick((t) => t + 1);
  };

  function addToMeal(slot: string) {
    setEntryMeal(slot);
    scrollToId(ENTRY_PANEL_ID);
    // After the scroll starts, so the soft keyboard does not fight it; the box may be absent while a food is being edited.
    window.setTimeout(() => document.getElementById(SEARCH_INPUT_ID)?.focus({ preventScroll: true }), 350);
  }

  return (
    <PageBody>
      {header}
      <CalorieHero
        date={selectedDate}
        onDateChange={setSelectedDate}
        logs={logs.error ? null : logs.data}
        loading={logs.loading}
        error={Boolean(logs.error)}
        target={target}
      />
      <FoodEntryPanel
        patientId={patient.id}
        patientName={patient.name.split(" ")[0]}
        calorieTarget={target}
        canWrite={canWrite}
        logDate={selectedDate}
        mealType={entryMeal}
        onMealTypeChange={setEntryMeal}
        onSuccess={refreshLogs}
      />
      <FoodLogList
        logs={logs.data}
        loading={logs.loading}
        error={Boolean(logs.error)}
        onRetry={logs.reload}
        patientId={patient.id}
        selectedDate={selectedDate}
        onRefresh={refreshLogs}
        onAddToMeal={addToMeal}
        canWrite={canWrite}
      />
      <FoodHistory
        patientId={patient.id}
        target={target}
        selectedDate={selectedDate}
        refreshKey={historyTick}
        onSelectDate={(date) => {
          setSelectedDate(date);
          scrollToId("food-day-hero");
        }}
      />
    </PageBody>
  );
}
