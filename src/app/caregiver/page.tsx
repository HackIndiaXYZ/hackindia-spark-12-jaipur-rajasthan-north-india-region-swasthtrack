"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  HeartPulse,
  Pill,
  Printer,
  ShieldAlert,
  Sparkles,
  UserCheck,
  UserPlus,
  Utensils,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/page-title";
import { useAuth } from "@/context/auth-context";
import { JoinPatientDialog } from "@/components/forms/join-patient-dialog";
import { AddCaregiverDialog } from "@/components/forms/add-caregiver-dialog";
import {
  getDashboardOverview,
  type DashboardOverview,
} from "@/services/patient-service";
import {
  detectHealthAnomaliesAndTrends,
  type ComprehensiveIntelligence,
} from "@/services/anomaly-detection-service";
import {
  generateSmartInsightsAndAlerts,
  type SmartInsightsData,
} from "@/services/smart-insights-service";
import { getHealthChanges, type HealthChangesResult } from "@/services/what-changed-service";
import { CaregiverHeroBrief } from "@/components/caregiver/caregiver-hero-brief";
import { getAuthorizedPatients } from "@/services/auth-service";
import type { PatientProfile } from "@/services/patient-service";
import Link from "next/link";

export default function CaregiverPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [authorizedPatients, setAuthorizedPatients] = useState<PatientProfile[]>([]);
  const [activePatientId, setActivePatientId] = useState<string | undefined>(undefined);
  const [intelligence, setIntelligence] = useState<ComprehensiveIntelligence | null>(null);
  const [smartData, setSmartData] = useState<SmartInsightsData | null>(null);
  const [healthChanges, setHealthChanges] = useState<HealthChangesResult | null>(null);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [isAddCaregiverOpen, setIsAddCaregiverOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    Promise.all([
      getDashboardOverview(activePatientId),
      getAuthorizedPatients().catch(() => [] as PatientProfile[]),
    ])
      .then(async ([overview, authPts]) => {
        if (!active) return;
        setData(overview);
        setAuthorizedPatients(authPts);

        const [intel, smart, changes] = await Promise.all([
          detectHealthAnomaliesAndTrends(overview.patient.id),
          generateSmartInsightsAndAlerts(overview.patient.id),
          getHealthChanges(overview.patient.id, "7d"),
        ]);

        if (active) {
          setIntelligence(intel);
          setSmartData(smart);
          setHealthChanges(changes);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Caregiver load error:", err);
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activePatientId]);

  function handlePrint() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <PageTitle
          description="Consolidated overview, adherence tracking, and critical attention items for family members and caregivers."
          eyebrow="Caregiver Intelligence (केयरगिवर डैशबोर्ड)"
          title="Caregiver Companion Dashboard"
        />
        <div className="h-96 rounded-panel bg-surface-sunken animate-pulse" />
      </div>
    );
  }

  const { patient, medicines, todayMedicineLogs } = data;
  const activeMeds = medicines.filter((m) => m.active);
  const takenMedsCount = activeMeds.filter((m) => {
    const l = todayMedicineLogs.find((log) => log.medicine_id === m.id);
    return l && (l.status === "taken" || l.status === "late");
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageTitle
          description="Consolidated overview, adherence tracking, and critical attention items for family members and caregivers."
          eyebrow="Caregiver Intelligence (केयरगिवर डैशबोर्ड)"
          title="Caregiver Companion Dashboard"
        />

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            onClick={() => setIsJoinOpen(true)}
            className="text-xs h-9"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Join Patient (मरीज़ जोड़ें)
          </Button>

          <Button variant="secondary" onClick={handlePrint} className="text-xs h-9">
            <Printer className="h-3.5 w-3.5" />
            Print Summary (प्रिंट करें)
          </Button>
        </div>
      </div>

      {/* CAREGIVER HERO BRIEF: "PAPA AAJ KAISE RAHE?" (§2) */}
      <CaregiverHeroBrief
        patient={patient}
        authorizedPatients={authorizedPatients}
        onSelectPatient={(pid) => {
          setLoading(true);
          setActivePatientId(pid);
        }}
      />

      {/* PATIENT HEADER BANNER */}
      <Card className="border-emerald-200 bg-linear-to-r from-emerald-500/10 via-emerald-50 to-surface p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-control bg-emerald-600 font-semibold text-ink-inverse shadow-e1 text-base">
              <UserCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-semibold text-ink">
                  {patient.name}
                </h2>
                <Badge variant="green">Patient Active</Badge>
              </div>
              <p className="text-xs text-ink-muted font-medium mt-0.5">
                {patient.age} yrs · {patient.gender} · Target Weight: {patient.target_weight_kg} kg
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="rounded-card border border-emerald-200 bg-surface px-3 py-2 text-center shadow-2xs">
              <span className="text-2xs text-ink-subtle block font-semibold uppercase">Med Adherence</span>
              <span className="text-sm font-bold text-emerald-700">
                {activeMeds.length > 0 ? `${Math.round((takenMedsCount / activeMeds.length) * 100)}%` : "100%"}
              </span>
            </div>
            <div className="rounded-card border border-emerald-200 bg-surface px-3 py-2 text-center shadow-2xs">
              <span className="text-2xs text-ink-subtle block font-semibold uppercase">Latest BP</span>
              <span className="text-sm font-bold text-ink">
                {data.todayMorningBP ? `${data.todayMorningBP.systolic}/${data.todayMorningBP.diastolic}` : "--/--"}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* WHAT CHANGED FOR PAPA (PHASE 8A §28) */}
      {healthChanges && healthChanges.dataSufficiency.isSufficient && (
        <Card className="border-purple-200 bg-linear-to-r from-purple-50/60 via-surface to-surface p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-control bg-purple-100 text-purple-800 border border-purple-200">
                <Sparkles className="h-4 w-4" />
              </span>
              <h3 className="font-semibold text-ink text-sm sm:text-base">
                What Changed for Papa? · पापा के स्वास्थ्य में क्या बदलाव आए?
              </h3>
            </div>
            <Link
              href="/insights/changes"
              className="text-xs font-semibold text-purple-700 hover:text-purple-950 underline self-start sm:self-auto"
            >
              विस्तृत विश्लेषण देखें →
            </Link>
          </div>
          <p className="text-xs sm:text-sm font-semibold text-ink-muted leading-relaxed bg-surface p-3 rounded-card border border-purple-100/90 shadow-2xs">
            {healthChanges.caregiverSummaryHi}
          </p>
        </Card>
      )}

      {/* CRITICAL ATTENTION ITEMS (MEANINGFUL FILTERED ALERTS) */}
      <Card className="border-attention-line/80 bg-surface p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-attention-soft text-attention">
            <ShieldAlert className="h-3.5 w-3.5" />
          </span>
          <h3 className="font-semibold text-ink text-sm sm:text-base">
            Caregiver Attention Items · ध्यान देने योग्य बिंदु
          </h3>
        </div>

        {intelligence?.anomalies && intelligence.anomalies.length > 0 ? (
          <div className="space-y-2.5">
            {intelligence.anomalies.map((anom) => (
              <div
                key={anom.id}
                className={`rounded-card border p-3.5 text-xs flex items-start gap-2.5 ${
                  anom.severity === "IMPORTANT"
                    ? "border-critical-line bg-critical-soft text-critical"
                    : "border-attention-line bg-attention-soft text-attention"
                }`}
              >
                <AlertTriangle
                  className={`h-4 w-4 shrink-0 mt-0.5 ${
                    anom.severity === "IMPORTANT" ? "text-critical" : "text-attention"
                  }`}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{anom.titleHi}</p>
                    <Badge variant={anom.severity === "IMPORTANT" ? "red" : "amber"}>
                      {anom.severity}
                    </Badge>
                  </div>
                  <p className="mt-1 font-medium text-ink-muted leading-relaxed">
                    {anom.descriptionHi}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-card border border-positive-line bg-positive-soft p-4 text-xs font-medium text-positive flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-positive shrink-0" />
            <span>इस समय कोई महत्वपूर्ण असामान्य विचलन या चेतावनी दर्ज नहीं है।</span>
          </div>
        )}
      </Card>

      {/* TODAY'S STATUS MATRIX */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
        {/* Medicines */}
        <Card className="p-4 border-line bg-surface">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-line">
            <span className="font-semibold text-ink flex items-center gap-1.5">
              <Pill className="h-3.5 w-3.5 text-emerald-600" />
              दवाइयाँ (Medicines)
            </span>
            <Badge variant={takenMedsCount === activeMeds.length ? "green" : "amber"}>
              {takenMedsCount}/{activeMeds.length} Confirmed
            </Badge>
          </div>
          <ul className="space-y-1.5 text-ink-muted">
            {activeMeds.map((m) => {
              const l = todayMedicineLogs.find((log) => log.medicine_id === m.id);
              const taken = l && (l.status === "taken" || l.status === "late");
              return (
                <li key={m.id} className="flex items-center justify-between">
                  <span>{m.medicine_name} ({m.dose})</span>
                  <span className={taken ? "text-positive font-semibold" : "text-attention font-semibold"}>
                    {taken ? "✓ Taken" : "Pending"}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Blood Pressure */}
        <Card className="p-4 border-line bg-surface">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-line">
            <span className="font-semibold text-ink flex items-center gap-1.5">
              <HeartPulse className="h-3.5 w-3.5 text-rose-600" />
              रक्तचाप (Blood Pressure)
            </span>
            <Badge variant="blue">Today</Badge>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-ink-muted">Morning BP:</span>
              <span className="font-semibold text-ink">
                {data.todayMorningBP ? `${data.todayMorningBP.systolic}/${data.todayMorningBP.diastolic} mmHg` : "Not recorded"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-ink-muted">Evening BP:</span>
              <span className="font-semibold text-ink">
                {data.todayEveningBP ? `${data.todayEveningBP.systolic}/${data.todayEveningBP.diastolic} mmHg` : "Not recorded"}
              </span>
            </div>
          </div>
        </Card>

        {/* Daily Summary */}
        <Card className="p-4 border-line bg-surface">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-line">
            <span className="font-semibold text-ink flex items-center gap-1.5">
              <Utensils className="h-3.5 w-3.5 text-amber-600" />
              भोजन एवं कैलोरी
            </span>
            <Badge variant="neutral">Target: {patient.daily_calorie_target} kcal</Badge>
          </div>
          <div className="space-y-1.5 text-ink-muted">
            <p className="text-ink-muted font-medium">
              {smartData?.dailySummary.summaryTextHi || "दैनिक प्रविष्टियां दर्ज की जा रही हैं।"}
            </p>
          </div>
        </Card>
      </div>

      {/* HEALTH PATTERN & CAREGIVER INSIGHTS */}
      {intelligence?.healthPatternBullets && intelligence.healthPatternBullets.length > 0 && (
        <Card className="p-5 border-line bg-surface">
          <CardHeader className="p-0 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <CardTitle className="text-sm font-semibold text-ink">
                Weekly Pattern Summary · साप्ताहिक स्वास्थ्य सारांश
              </CardTitle>
            </div>
          </CardHeader>
          <ul className="space-y-2 text-xs text-ink-muted">
            {intelligence.healthPatternBullets.map((b, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0 mt-1" />
                <span className="font-medium">{b.hi}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* FOOTER DISCLAIMER */}
      <div className="p-3 text-2xs text-ink-subtle rounded-card border border-line bg-surface-sunken">
        * यह केयरगिवर सारांश केवल दैनिक आदतों की निगरानी एवं सहायता के लिए है। किसी भी चिकित्सीय निर्णय के लिए डॉक्टर से संपर्क करें।
      </div>

      {/* JOIN PATIENT MODAL */}
      <JoinPatientDialog
        isOpen={isJoinOpen}
        onClose={() => setIsJoinOpen(false)}
        caregiverUserId={user?.id || "caregiver-user"}
        onSuccess={() => {
          // reload data
        }}
      />

      {/* ADD CAREGIVER MODAL */}
      {patient && (
        <AddCaregiverDialog
          isOpen={isAddCaregiverOpen}
          onClose={() => setIsAddCaregiverOpen(false)}
          patientId={patient.id}
          userId={user?.id || patient.id}
        />
      )}
    </div>
  );
}
