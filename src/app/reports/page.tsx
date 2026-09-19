"use client";

import { useEffect, useState } from "react";
import { ReportsTabs } from "@/components/reports/reports-tabs";
import { PageTitle } from "@/components/ui/page-title";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getFoodDataQualityReport,
  getPatientProfile,
  type DataQualityReport,
  type PatientProfile,
} from "@/services/patient-service";
import { AlertCircle, ShieldAlert, CheckCircle } from "lucide-react";
import { useAuth } from "@/context/auth-context";

export default function ReportsPage() {
  const { profile: authProfile } = useAuth();
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [report, setReport] = useState<DataQualityReport | null>(null);

  const isAdmin = authProfile?.role === "admin";

  useEffect(() => {
    getPatientProfile().then(setPatient);
    if (isAdmin) {
      getFoodDataQualityReport().then(setReport);
    }
  }, [isAdmin]);

  return (
    <div className="space-y-6">
      <PageTitle
        description="Comprehensive daily, weekly, monthly, and yearly habit consistency analytics and adherence reports."
        eyebrow="Reports & Analytics (रिपोर्ट्स और विश्लेषण)"
        title="Health & Adherence Reports"
      />

      {patient ? (
        <ReportsTabs patientId={patient.id} />
      ) : (
        <div className="h-64 rounded-panel bg-surface-sunken animate-pulse" />
      )}

      {/* Developer Data Quality Report Section (ADMIN ONLY) */}
      {isAdmin && (
        <Card>
          <CardHeader className="bg-surface-sunken border-b border-line">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-ink flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-brand" />
                  Food Database Data Quality Report (डेटाबेस गुणवत्ता रिपोर्ट)
                </CardTitle>
                <CardDescription>
                  Real-time validation metrics for raw, master, and custom food items tables
                </CardDescription>
              </div>
              <Badge variant="blue">Developer Mode (Admin)</Badge>
            </div>
          </CardHeader>

          {report ? (
            <div className="p-6 space-y-6">
              {/* Grid Metrics */}
              <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
                <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
                  <p className="text-xs font-semibold text-ink-subtle uppercase tracking-wider">Total Food Items</p>
                  <p className="mt-1 text-2xl font-bold text-ink">{report.totalFoods}</p>
                  <p className="text-2xs text-ink-subtle mt-0.5">कुल खाद्य पदार्थ</p>
                </div>

                <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
                  <p className="text-xs font-semibold text-ink-subtle uppercase tracking-wider">Duplicate Names</p>
                  <p className="mt-1 text-2xl font-bold text-ink">{report.duplicateNamesCount}</p>
                  <p className="text-2xs text-ink-subtle mt-0.5">दोहरे नाम वाले व्यंजन</p>
                </div>

                <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
                  <p className="text-xs font-semibold text-ink-subtle uppercase tracking-wider">Missing Calories</p>
                  <p className="mt-1 text-2xl font-bold text-ink">{report.missingCaloriesCount}</p>
                  <p className="text-2xs text-ink-subtle mt-0.5">बिना कैलोरी वैल्यू वाले</p>
                </div>

                <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
                  <p className="text-xs font-semibold text-ink-subtle uppercase tracking-wider">Calorie Variants</p>
                  <p className="mt-1 text-2xl font-bold text-ink">{report.duplicateVariantsCount}</p>
                  <p className="text-2xs text-ink-subtle mt-0.5">कैलोरी के विभिन्न प्रकार</p>
                </div>

                <div className="rounded-card border border-line bg-surface p-4 shadow-e1">
                  <p className="text-xs font-semibold text-ink-subtle uppercase tracking-wider">Missing Portions</p>
                  <p className="mt-1 text-2xl font-bold text-ink">{report.missingPortionsCount}</p>
                  <p className="text-2xs text-ink-subtle mt-0.5">बिना मात्रा अनुपात (Portion)</p>
                </div>
              </div>

              {/* Verification status warnings */}
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="font-semibold text-ink text-sm flex items-center gap-1.5">
                    <AlertCircle className="h-4.5 w-4.5 text-attention" />
                    Needs Verification / Custom Entries ({report.requireVerificationCount}):
                  </h4>
                  {report.details.requireVerification.length > 0 ? (
                    <div className="bg-attention-soft border border-attention-line rounded-card p-3 max-h-48 overflow-y-auto text-xs font-mono text-attention space-y-1">
                      {report.details.requireVerification.map((name, idx) => (
                        <div key={idx}>• {name}</div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-positive-soft text-positive text-xs p-3 rounded-card flex items-center gap-1.5">
                      <CheckCircle className="h-4 w-4 text-positive" />
                      All custom entries are verified.
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold text-ink text-sm flex items-center gap-1.5">
                    <AlertCircle className="h-4.5 w-4.5 text-critical" />
                    Missing Calories ({report.missingCaloriesCount}):
                  </h4>
                  {report.details.missingCalories.length > 0 ? (
                    <div className="bg-critical-soft border border-critical-line rounded-card p-3 max-h-48 overflow-y-auto text-xs font-mono text-critical space-y-1">
                      {report.details.missingCalories.map((name, idx) => (
                        <div key={idx}>• {name}</div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-positive-soft text-positive text-xs p-3 rounded-card flex items-center gap-1.5">
                      <CheckCircle className="h-4 w-4 text-positive" />
                      No missing calories found.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 text-sm text-ink-muted">Loading data quality report...</div>
          )}
        </Card>
      )}

      {/* Medical Disclaimer Banner */}
      <div className="rounded-card border border-line bg-surface p-4 text-xs text-ink-muted flex items-center justify-between gap-3 shadow-e1">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-ink-subtle shrink-0" />
          <span>स्वास्थट्रैक रिपोर्ट एक वेलनेस ट्रैकिंग रिकॉर्ड है, यह चिकित्सकीय सलाह या डॉक्टर के निदान का स्थान नहीं लेता है।</span>
        </div>
        <a href="/medical-disclaimer" className="font-semibold text-brand-ink hover:underline shrink-0">
          Medical Disclaimer →
        </a>
      </div>
    </div>
  );
}
