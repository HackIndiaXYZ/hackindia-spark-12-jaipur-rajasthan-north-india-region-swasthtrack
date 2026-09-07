"use client";

import { useCallback, useEffect, useState } from "react";
import { FoodEntryPanel } from "@/components/food/food-entry-panel";
import { FoodLogList } from "@/components/food/food-log-list";
import { SkeletonCard } from "@/components/ui/skeleton-loaders";
import { ErrorState, PageBody, PageHeader } from "@/components/ui/page";
import {
  getFoodLogsByDate,
  getPatientProfile,
  getTodayDateString,
  type FoodLogEntry,
  type PatientProfile,
} from "@/services/patient-service";

export default function FoodPage() {
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  // Lazily initialised rather than set from an effect. The first paint is the
  // skeleton (loading starts true), so the client's local date replaces the
  // server's before anything date-dependent is rendered (§56).
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString);
  const [logs, setLogs] = useState<FoodLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadData = useCallback(() => {
    if (!selectedDate) return Promise.resolve();

    return getPatientProfile()
      .then(async (p) => {
        const fLogs = await getFoodLogsByDate(p.id, selectedDate);
        setLoadError(false);
        setPatient(p);
        setLogs(fLogs);
        setLoading(false);
      })
      .catch(() => {
        setLoadError(true);
        setLoading(false);
      });
  }, [selectedDate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const header = (
    <PageHeader
      eyebrow="Food tracking"
      title="Food & calories"
      hindiTitle="भोजन और कैलोरी"
      description="भोजन, मात्रा और कैलोरी का दैनिक रिकॉर्ड।"
    />
  );

  if (loadError) {
    return (
      <PageBody>
        {header}
        <ErrorState
          title="भोजन का रिकॉर्ड लोड नहीं हो पाया"
          englishTitle="Food records could not be loaded"
          onRetry={() => void loadData()}
        />
      </PageBody>
    );
  }

  if (loading && !patient) {
    return (
      <PageBody>
        {header}
        <SkeletonCard />
        <SkeletonCard />
      </PageBody>
    );
  }

  if (!patient || !selectedDate) return null;

  return (
    <PageBody>
      {header}
      <FoodEntryPanel
        patientId={patient.id}
        patientName={patient.name.split(" ")[0]}
        calorieTarget={patient.daily_calorie_target}
        onSuccess={() => void loadData()}
      />
      <FoodLogList
        logs={logs}
        patientId={patient.id}
        selectedDate={selectedDate}
        onRefresh={() => void loadData()}
        onDateChange={setSelectedDate}
        dailyCalorieTarget={patient.daily_calorie_target}
      />
    </PageBody>
  );
}
