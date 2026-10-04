"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw, UserRound } from "lucide-react";
import { SkeletonDashboard } from "@/components/ui/skeleton-loaders";
import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState, ErrorState, PageBody, Section } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { DashboardSections } from "@/components/dashboard/dashboard-sections";
import { PatientOverviewCard } from "@/components/dashboard/patient-overview-card";
import { HeroHealthCard, type WellnessView } from "@/components/dashboard/hero-health-card";
import { DailyStoryCard } from "@/components/dashboard/daily-story-card";
import { WhatChangedCard } from "@/components/dashboard/what-changed-card";
import { QuickActionsBar } from "@/components/dashboard/quick-actions-bar";
import { WellnessScoreCard } from "@/components/dashboard/wellness-score-card";
import { SmartDailySummaryCard } from "@/components/dashboard/smart-daily-summary";
import { AlertCenterCard } from "@/components/dashboard/alert-center-card";
import { PersonalHealthPatternCard } from "@/components/dashboard/personal-health-pattern-card";
import { HealthForecastCard } from "@/components/dashboard/health-forecast-card";
import { DeveloperDiagnosticsModal } from "@/components/dashboard/developer-diagnostics-modal";
import { BPSafetyBanner } from "@/components/dashboard/bp-status";
import { generateSmartInsightsAndAlerts, type SmartInsightsData } from "@/services/smart-insights-service";
import { detectHealthAnomaliesAndTrends, type ComprehensiveIntelligence } from "@/services/anomaly-detection-service";
import { generateHealthPredictions, type HealthPrediction } from "@/services/health-ml-service";
import { calculateDailyWellnessScore } from "@/services/wellness-score-service";
import { getBPThresholds } from "@/services/settings-service";
import { AddActivityDialog } from "@/components/forms/add-activity-dialog";
import { AddBPDialog } from "@/components/forms/add-bp-dialog";
import { AddFoodDialog } from "@/components/forms/add-food-dialog";
import { QuickMarkMedicineDialog } from "@/components/forms/quick-mark-medicine-dialog";
import { AddSleepDialog } from "@/components/forms/add-sleep-dialog";
import { AddWeightDialog } from "@/components/forms/add-weight-dialog";
import { EditPatientDialog } from "@/components/forms/edit-patient-dialog";
import {
  NoActivePatientError,
  SupabaseNotConfiguredError,
  getBloodPressureLogs,
  getDashboardOverview,
  type BPLogEntry,
  type DashboardOverview,
} from "@/services/patient-service";
import { DEFAULT_BP_THRESHOLDS, todayIST, type BPThresholds } from "@/lib/health-rules";
import { useAuth } from "@/context/auth-context";

type DialogName = "bp" | "weight" | "food" | "activity" | "sleep" | "medicine" | "profile";

/** One analytics result: loading, failed, or ready. A refresh keeps the old data on screen. */
type Slice<T> = { status: "loading" } | { status: "error" } | { status: "ready"; data: T };
const LOADING = { status: "loading" } as const;

type Forecast = { predictions: HealthPrediction[]; modelVersion: string };

type OverviewResult =
  | { ok: true; run: number; overview: DashboardOverview; thresholds: BPThresholds; latestBP: BPLogEntry | null }
  | { ok: false; run: number; error: unknown };

/** Analytics are slower than the overview; after a save they refresh once things settle. */
const ANALYTICS_DEBOUNCE_MS = 1500;

function keepOrFail<T>(prev: Slice<T>): Slice<T> {
  return prev.status === "ready" ? prev : { status: "error" };
}

export default function DashboardPage() {
  const { profile: authProfile, activePatientId, canWrite } = useAuth();
  const toast = useToast();
  const isAdmin = authProfile?.role === "admin";

  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<"none" | "no-patient" | "not-configured" | "generic">("none");
  const [bpThresholds, setBpThresholds] = useState<BPThresholds>(DEFAULT_BP_THRESHOLDS);
  const [latestBP, setLatestBP] = useState<BPLogEntry | null>(null);

  const [smart, setSmart] = useState<Slice<SmartInsightsData>>(LOADING);
  const [intel, setIntel] = useState<Slice<ComprehensiveIntelligence>>(LOADING);
  const [forecast, setForecast] = useState<Slice<Forecast>>(LOADING);
  const [wellness, setWellness] = useState<WellnessView>(LOADING);

  const [dialog, setDialog] = useState<DialogName | null>(null);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);

  const analyticsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overviewRun = useRef(0);

  useEffect(
    () => () => {
      if (analyticsTimer.current) clearTimeout(analyticsTimer.current);
    },
    [],
  );

  const loadWellness = useCallback((patientId: string) => {
    return calculateDailyWellnessScore(patientId, todayIST())
      .then((result): WellnessView => ({ status: "ready", result }))
      .catch((): WellnessView => ({ status: "error" }))
      .then((next) => setWellness((prev) => (next.status === "error" && prev.status === "ready" ? prev : next)));
  }, []);

  /** The four analytics passes are independent: each one appears as soon as it is ready. */
  const loadAnalytics = useCallback(
    (patientId: string) => {
      void generateSmartInsightsAndAlerts(patientId)
        .then((d) => setSmart({ status: "ready", data: d }))
        .catch(() => setSmart(keepOrFail));
      void detectHealthAnomaliesAndTrends(patientId)
        .then((d) => setIntel({ status: "ready", data: d }))
        .catch(() => setIntel(keepOrFail));
      void generateHealthPredictions(patientId)
        .then((d) => setForecast({ status: "ready", data: { predictions: d.predictions, modelVersion: d.modelVersion } }))
        .catch(() => setForecast(keepOrFail));
      void loadWellness(patientId);
    },
    [loadWellness],
  );

  /**
   * Core screen first. This only fetches; `applyOverview` sets state, so the mount effect
   * never sets state synchronously.
   */
  const fetchOverview = useCallback(async (): Promise<OverviewResult> => {
    const run = ++overviewRun.current;
    try {
      const [overview, thresholds, bpList] = await Promise.all([
        getDashboardOverview(),
        getBPThresholds().catch(() => DEFAULT_BP_THRESHOLDS),
        getBloodPressureLogs(undefined, 10).catch(() => [] as BPLogEntry[]),
      ]);
      return { ok: true, run, overview, thresholds, latestBP: bpList[0] ?? null };
    } catch (error) {
      return { ok: false, run, error };
    }
  }, []);

  /**
   * `isRefresh` keeps what is on screen if the reload fails (the save itself already
   * succeeded), instead of swapping in an error page. Returns the overview when applied.
   */
  const applyOverview = useCallback(
    (result: OverviewResult, isRefresh: boolean): DashboardOverview | null => {
      // A newer request has started; this answer is already stale.
      if (result.run !== overviewRun.current) return null;
      if (result.ok) {
        setLoadError("none");
        setData(result.overview);
        setBpThresholds(result.thresholds);
        setLatestBP(result.latestBP);
        setLoading(false);
        return result.overview;
      }
      if (isRefresh) {
        toast.error("नया डेटा नहीं आ पाया", "आपका रिकॉर्ड सेव हो चुका है। पेज दोबारा खोलकर देखें।");
      } else {
        setLoadError(
          result.error instanceof NoActivePatientError
            ? "no-patient"
            : result.error instanceof SupabaseNotConfiguredError
              ? "not-configured"
              : "generic",
        );
        setLoading(false);
      }
      return null;
    },
    [toast],
  );

  useEffect(() => {
    if (!activePatientId) return;
    let cancelled = false;
    void fetchOverview().then((result) => {
      if (cancelled) return;
      const overview = applyOverview(result, false);
      if (overview) loadAnalytics(overview.patient.id);
    });
    return () => {
      cancelled = true;
    };
  }, [activePatientId, fetchOverview, applyOverview, loadAnalytics]);

  /** After any save: the overview now, the slower analytics once the dust settles. */
  const afterSave = useCallback(() => {
    void fetchOverview().then((result) => applyOverview(result, true));
    if (analyticsTimer.current) clearTimeout(analyticsTimer.current);
    analyticsTimer.current = setTimeout(() => {
      if (activePatientId) loadAnalytics(activePatientId);
    }, ANALYTICS_DEBOUNCE_MS);
  }, [activePatientId, applyOverview, fetchOverview, loadAnalytics]);

  const retryAnalytics = useCallback(() => {
    if (!activePatientId) return;
    setSmart(LOADING);
    setIntel(LOADING);
    setForecast(LOADING);
    setWellness(LOADING);
    loadAnalytics(activePatientId);
  }, [activePatientId, loadAnalytics]);

  const retryWellness = useCallback(() => {
    if (!activePatientId) return;
    setWellness(LOADING);
    void loadWellness(activePatientId);
  }, [activePatientId, loadWellness]);

  const open = (name: DialogName) => () => setDialog(name);
  const close = () => setDialog(null);

  if (!activePatientId || loadError === "no-patient") {
    return (
      <PageBody>
        <EmptyState
          icon={UserRound}
          title="No patient yet"
          hindiTitle="अभी कोई मरीज़ जुड़ा नहीं है।"
          description="पहले मरीज़ की प्रोफाइल बनाएँ, या परिवार के किसी सदस्य के न्योते से जुड़ें। उसके बाद डैशबोर्ड यहाँ दिखेगा।"
          action={
            <Link href="/onboarding" className={buttonClasses({ variant: "primary" })}>
              <span lang="hi">शुरू करें</span>
            </Link>
          }
        />
      </PageBody>
    );
  }

  if (loadError === "not-configured" && !data) {
    return (
      <PageBody>
        <ErrorState
          title="डेटाबेस सेटअप अधूरा है"
          englishTitle="The database is not configured"
          description="Supabase की कुंजियाँ (NEXT_PUBLIC_SUPABASE_URL और NEXT_PUBLIC_SUPABASE_ANON_KEY) जोड़ें। तब तक कोई स्वास्थ्य डेटा नहीं दिखाया जाएगा।"
        />
      </PageBody>
    );
  }

  if (loadError !== "none" && !data) {
    return (
      <PageBody>
        <ErrorState
          title="डैशबोर्ड लोड नहीं हो पाया"
          englishTitle="The dashboard could not be loaded"
          description="इंटरनेट कनेक्शन जाँचें और दोबारा कोशिश करें।"
          onRetry={() => {
            setLoading(true);
            setLoadError("none");
            void fetchOverview().then((result) => {
              const overview = applyOverview(result, false);
              if (overview) loadAnalytics(overview.patient.id);
            });
          }}
        />
      </PageBody>
    );
  }

  if (loading || !data) {
    return <SkeletonDashboard />;
  }

  const analyticsFailed = [smart, intel, forecast].some((s) => s.status === "error") || wellness.status === "error";
  const analyticsLoading = [smart, intel, forecast].some((s) => s.status === "loading");

  return (
    <PageBody>
      {/* Safety first: a crisis-range or low reading from the last day */}
      <BPSafetyBanner reading={latestBP} thresholds={bpThresholds} />

      {/* 1–3. Greeting, daily message, score and the six-vital snapshot */}
      <HeroHealthCard
        data={data}
        wellness={wellness}
        onRetryWellness={retryWellness}
        bpThresholds={bpThresholds}
        onOpenBP={canWrite ? open("bp") : undefined}
        onOpenWeight={canWrite ? open("weight") : undefined}
        onOpenFood={canWrite ? open("food") : undefined}
        onOpenActivity={canWrite ? open("activity") : undefined}
        onOpenMedicine={open("medicine")}
        onOpenSleep={canWrite ? open("sleep") : undefined}
      />

      {/* 4. Needs attention */}
      {smart.status === "ready" && smart.data.alerts.length > 0 ? (
        <AlertCenterCard alerts={smart.data.alerts} patientId={data.patient.id} />
      ) : null}

      {analyticsFailed ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-attention-line bg-attention-soft p-3.5"
        >
          <p lang="hi" className="text-sm text-attention">
            कुछ विश्लेषण अभी लोड नहीं हो पाए। आपके रिकॉर्ड सुरक्षित हैं।
          </p>
          <Button size="sm" variant="secondary" onClick={retryAnalytics}>
            <RefreshCw aria-hidden className="h-3.5 w-3.5" />
            <span lang="hi">फिर कोशिश करें</span>
          </Button>
        </div>
      ) : null}

      {/* 5. Quick Log — the easiest thing to reach (§18) */}
      {canWrite ? (
        <QuickActionsBar
          onOpenBP={open("bp")}
          onOpenWeight={open("weight")}
          onOpenFood={open("food")}
          onOpenActivity={open("activity")}
          onOpenSleep={open("sleep")}
          onOpenMedicine={open("medicine")}
        />
      ) : null}

      {/* 6. Today's narrative */}
      <DailyStoryCard data={data} />

      {/* 7. Personal insights and what changed */}
      <WhatChangedCard patientId={data.patient.id} />

      {smart.status === "ready" ? <SmartDailySummaryCard summary={smart.data.dailySummary} /> : null}

      {intel.status === "ready" &&
      (intel.data.healthPatternBullets.length > 0 || intel.data.multiFactorInsights.length > 0) ? (
        <PersonalHealthPatternCard
          patientId={data.patient.id}
          bullets={intel.data.healthPatternBullets}
          multiFactorObservations={intel.data.multiFactorInsights}
        />
      ) : null}

      {analyticsLoading && !analyticsFailed ? (
        <div aria-busy="true" aria-label="विश्लेषण तैयार हो रहे हैं" className="skeleton h-24 w-full rounded-card" />
      ) : null}

      {/* 8. Score breakdown */}
      <WellnessScoreCard wellness={wellness} onRetry={retryWellness} />

      {/* 9. Per-vital detail sections */}
      <Section title="Today's records" hindiTitle="आज के रिकॉर्ड">
        <DashboardSections
          data={data}
          bpThresholds={bpThresholds}
          onMedicineChange={afterSave}
          onOpenBP={open("bp")}
          onOpenWeight={open("weight")}
          onOpenFood={open("food")}
          onOpenActivity={open("activity")}
          onOpenMedicine={open("medicine")}
        />
      </Section>

      {forecast.status === "ready" && forecast.data.predictions.length > 0 ? (
        <HealthForecastCard
          predictions={forecast.data.predictions}
          modelVersion={forecast.data.modelVersion}
          onOpenDiagnostics={isAdmin ? () => setIsDiagnosticsOpen(true) : undefined}
        />
      ) : null}

      {/* 10. Profile summary */}
      <PatientOverviewCard patient={data.patient} conditions={data.conditions} onEditProfile={open("profile")} />

      {/* Dialogs render in a portal, so they never sit inside the page body's entrance animation. */}
      <AddBPDialog isOpen={dialog === "bp"} onClose={close} patientId={data.patient.id} onSuccess={afterSave} />

      <AddWeightDialog
        isOpen={dialog === "weight"}
        onClose={close}
        patientId={data.patient.id}
        currentWeight={data.patient.current_weight_kg}
        onSuccess={afterSave}
      />

      <AddFoodDialog isOpen={dialog === "food"} onClose={close} patientId={data.patient.id} onSuccess={afterSave} />

      <AddActivityDialog
        isOpen={dialog === "activity"}
        onClose={close}
        patientId={data.patient.id}
        initialSteps={data.todayActivity?.steps}
        initialDistanceKm={data.todayActivity?.distance_km}
        bodyWeightKg={data.patient.current_weight_kg}
        onSuccess={afterSave}
      />

      <AddSleepDialog isOpen={dialog === "sleep"} onClose={close} patientId={data.patient.id} onSuccess={afterSave} />

      <QuickMarkMedicineDialog
        isOpen={dialog === "medicine"}
        onClose={close}
        patientId={data.patient.id}
        onSuccess={afterSave}
      />

      <EditPatientDialog
        isOpen={dialog === "profile"}
        onClose={close}
        patient={data.patient}
        onSuccess={afterSave}
      />

      {isAdmin ? (
        <DeveloperDiagnosticsModal isOpen={isDiagnosticsOpen} onClose={() => setIsDiagnosticsOpen(false)} />
      ) : null}
    </PageBody>
  );
}
