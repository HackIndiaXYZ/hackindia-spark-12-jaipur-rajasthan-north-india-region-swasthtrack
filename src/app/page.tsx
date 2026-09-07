"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { SkeletonDashboard } from "@/components/ui/skeleton-loaders";
import { DashboardSections } from "@/components/dashboard/dashboard-sections";
import { PatientOverviewCard } from "@/components/dashboard/patient-overview-card";
import { HeroHealthCard } from "@/components/dashboard/hero-health-card";
import { DailyStoryCard } from "@/components/dashboard/daily-story-card";
import { WhatChangedCard } from "@/components/dashboard/what-changed-card";
import { QuickActionsBar } from "@/components/dashboard/quick-actions-bar";
import { WellnessScoreCard } from "@/components/dashboard/wellness-score-card";
import { SmartDailySummaryCard } from "@/components/dashboard/smart-daily-summary";
import { AlertCenterCard } from "@/components/dashboard/alert-center-card";
import { PersonalHealthPatternCard } from "@/components/dashboard/personal-health-pattern-card";
import { HealthForecastCard } from "@/components/dashboard/health-forecast-card";
import { DeveloperDiagnosticsModal } from "@/components/dashboard/developer-diagnostics-modal";
import {
  generateSmartInsightsAndAlerts,
  type SmartInsightsData,
} from "@/services/smart-insights-service";
import {
  detectHealthAnomaliesAndTrends,
  type ComprehensiveIntelligence,
} from "@/services/anomaly-detection-service";
import {
  generateHealthPredictions,
  type HealthPrediction,
} from "@/services/health-ml-service";
import {
  calculateDailyWellnessScore,
  type DailyWellnessScoreResult,
} from "@/services/wellness-score-service";
import { AddActivityDialog } from "@/components/forms/add-activity-dialog";
import { AddBPDialog } from "@/components/forms/add-bp-dialog";
import { AddFoodDialog } from "@/components/forms/add-food-dialog";
import { QuickMarkMedicineDialog } from "@/components/forms/quick-mark-medicine-dialog";
import { AddSleepDialog } from "@/components/forms/add-sleep-dialog";
import { AddWeightDialog } from "@/components/forms/add-weight-dialog";
import { EditPatientDialog } from "@/components/forms/edit-patient-dialog";
import { ErrorState, PageBody, Section } from "@/components/ui/page";
import {
  getDashboardOverview,
  getTodayDateString,
  type DashboardOverview,
} from "@/services/patient-service";
import { useAuth } from "@/context/auth-context";

export default function DashboardPage() {
  const { profile: authProfile } = useAuth();
  const isAdmin = authProfile?.role === "admin";

  const [data, setData] = useState<DashboardOverview | null>(null);
  const [smartData, setSmartData] = useState<SmartInsightsData | null>(null);
  const [intelligence, setIntelligence] = useState<ComprehensiveIntelligence | null>(null);
  const [wellness, setWellness] = useState<DailyWellnessScoreResult | null>(null);
  const [predictions, setPredictions] = useState<HealthPrediction[]>([]);
  const [modelVersion, setModelVersion] = useState<string>("");
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Dialogs open state
  const [isBPOpen, setIsBPOpen] = useState(false);
  const [isWeightOpen, setIsWeightOpen] = useState(false);
  const [isFoodOpen, setIsFoodOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [isSleepOpen, setIsSleepOpen] = useState(false);
  const [isMedicineOpen, setIsMedicineOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(null), 3500);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  /**
   * The dashboard renders as soon as the core overview resolves; the four
   * analytics passes stream in behind it (§49). Previously this logic was
   * duplicated between the mount effect and the refresh handler.
   */
  const loadData = useCallback(
    () =>
      getDashboardOverview()
        .then(async (overview) => {
          // Render the core screen immediately; a refresh keeps the current
          // data on screen instead of flashing the skeleton again.
          setLoadError(false);
          setData(overview);
          setLoading(false);

          const [smart, intel, preds, score] = await Promise.all([
            generateSmartInsightsAndAlerts(overview.patient.id).catch(() => null),
            detectHealthAnomaliesAndTrends(overview.patient.id).catch(() => null),
            generateHealthPredictions(overview.patient.id).catch(() => null),
            calculateDailyWellnessScore(
              overview.patient.id,
              getTodayDateString(),
            ).catch(() => null),
          ]);

          if (smart) setSmartData(smart);
          if (intel) setIntelligence(intel);
          if (score) setWellness(score);
          if (preds) {
            setPredictions(preds.predictions);
            setModelVersion(preds.modelVersion);
          }
        })
        .catch(() => {
          setLoadError(true);
          setLoading(false);
        }),
    [],
  );

  const refresh = useCallback(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loadError && !data) {
    return (
      <PageBody>
        <ErrorState
          title="डैशबोर्ड लोड नहीं हो पाया"
          englishTitle="The dashboard could not be loaded"
          description="इंटरनेट कनेक्शन जाँचें और दोबारा कोशिश करें।"
          onRetry={() => void loadData()}
        />
      </PageBody>
    );
  }

  if (loading && !data) {
    return <SkeletonDashboard />;
  }

  if (!data) return null;

  return (
    <PageBody>
      {/* Save confirmation (§39) */}
      <div aria-live="polite" role="status">
        {toastMessage ? (
          <div className="reveal flex items-center gap-2 rounded-card border border-positive-line bg-positive-soft px-4 py-3 text-sm font-medium text-positive">
            <Check aria-hidden className="h-4 w-4 shrink-0" />
            {toastMessage}
          </div>
        ) : null}
      </div>

      {/* 1–3. Greeting, daily message, score and the six-vital snapshot */}
      <HeroHealthCard
        data={data}
        wellnessScore={wellness ? wellness.totalScore : null}
        onOpenBP={() => setIsBPOpen(true)}
        onOpenWeight={() => setIsWeightOpen(true)}
        onOpenFood={() => setIsFoodOpen(true)}
        onOpenActivity={() => setIsActivityOpen(true)}
        onOpenMedicine={() => setIsMedicineOpen(true)}
        onOpenSleep={() => setIsSleepOpen(true)}
      />

      {/* 4. Needs attention */}
      {smartData?.alerts && smartData.alerts.length > 0 ? (
        <AlertCenterCard alerts={smartData.alerts} onAlertChange={refresh} />
      ) : null}

      {/* 5. Quick Log — the easiest thing to reach (§18) */}
      <QuickActionsBar
        onOpenBP={() => setIsBPOpen(true)}
        onOpenWeight={() => setIsWeightOpen(true)}
        onOpenFood={() => setIsFoodOpen(true)}
        onOpenActivity={() => setIsActivityOpen(true)}
        onOpenSleep={() => setIsSleepOpen(true)}
        onOpenMedicine={() => setIsMedicineOpen(true)}
      />

      {/* 6. Today's narrative */}
      <DailyStoryCard data={data} />

      {/* 7. Personal insights and what changed */}
      <WhatChangedCard patientId={data.patient.id} />

      {smartData?.dailySummary ? (
        <SmartDailySummaryCard summary={smartData.dailySummary} />
      ) : null}

      {intelligence && intelligence.healthPatternBullets.length > 0 ? (
        <PersonalHealthPatternCard
          patientId={data.patient.id}
          bullets={intelligence.healthPatternBullets}
          multiFactorObservations={intelligence.multiFactorInsights}
        />
      ) : null}

      {/* 8. Score breakdown — reuses the score already computed above (§57) */}
      <WellnessScoreCard
        patientId={data.patient.id}
        result={wellness}
        onRefresh={refresh}
      />

      {/* 9. Per-vital detail sections */}
      <Section
        title="Today's records"
        hindiTitle="आज के रिकॉर्ड"
      >
        <DashboardSections
          data={data}
          onRefresh={refresh}
          onOpenBP={() => setIsBPOpen(true)}
          onOpenWeight={() => setIsWeightOpen(true)}
          onOpenFood={() => setIsFoodOpen(true)}
          onOpenActivity={() => setIsActivityOpen(true)}
          onOpenMedicine={() => setIsMedicineOpen(true)}
        />
      </Section>

      {predictions.length > 0 ? (
        <HealthForecastCard
          predictions={predictions}
          modelVersion={modelVersion}
          onOpenDiagnostics={isAdmin ? () => setIsDiagnosticsOpen(true) : undefined}
        />
      ) : null}

      {/* 10. Profile summary */}
      <PatientOverviewCard
        patient={data.patient}
        conditions={data.conditions}
        onEditProfile={() => setIsEditProfileOpen(true)}
      />

      {/* MODAL FORMS */}
      <AddBPDialog
        isOpen={isBPOpen}
        onClose={() => setIsBPOpen(false)}
        patientId={data.patient.id}
        onSuccess={() => {
          showToast("BP दर्ज हो गया · Blood pressure saved");
          refresh();
        }}
      />

      <AddWeightDialog
        isOpen={isWeightOpen}
        onClose={() => setIsWeightOpen(false)}
        patientId={data.patient.id}
        currentWeight={data.patient.current_weight_kg}
        onSuccess={() => {
          showToast("वजन दर्ज हो गया · Weight saved");
          refresh();
        }}
      />

      <AddFoodDialog
        isOpen={isFoodOpen}
        onClose={() => setIsFoodOpen(false)}
        patientId={data.patient.id}
        onSuccess={() => {
          showToast("भोजन दर्ज हो गया · Food logged");
          refresh();
        }}
      />

      <AddActivityDialog
        isOpen={isActivityOpen}
        onClose={() => setIsActivityOpen(false)}
        patientId={data.patient.id}
        initialSteps={data.todayActivity?.steps || 0}
        initialDistanceKm={data.todayActivity?.distance_km || 0}
        onSuccess={() => {
          showToast("गतिविधि दर्ज हो गई · Activity saved");
          refresh();
        }}
      />

      <AddSleepDialog
        isOpen={isSleepOpen}
        onClose={() => setIsSleepOpen(false)}
        patientId={data.patient.id}
        onSuccess={() => {
          showToast("नींद दर्ज हो गई · Sleep saved");
          refresh();
        }}
      />

      <QuickMarkMedicineDialog
        isOpen={isMedicineOpen}
        onClose={() => setIsMedicineOpen(false)}
        patientId={data.patient.id}
        onSuccess={() => {
          showToast("दवाई की स्थिति दर्ज हो गई · Medicine updated");
          refresh();
        }}
      />

      <EditPatientDialog
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
        patient={data.patient}
        onSuccess={() => {
          showToast("प्रोफाइल अपडेट हो गई · Profile updated");
          refresh();
        }}
      />

      {isAdmin ? (
        <DeveloperDiagnosticsModal
          isOpen={isDiagnosticsOpen}
          onClose={() => setIsDiagnosticsOpen(false)}
        />
      ) : null}
    </PageBody>
  );
}
