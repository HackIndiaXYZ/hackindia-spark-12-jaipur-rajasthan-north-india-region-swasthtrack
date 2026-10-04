"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { NoPatientState } from "@/components/health/no-patient-state";
import { FoodDataQuality } from "@/components/reports/food-data-quality";
import { ReportsTabs } from "@/components/reports/reports-tabs";
import { PageBody, PageHeader } from "@/components/ui/page";
import { useAuth } from "@/context/auth-context";

export default function ReportsPage() {
  const { activePatientId, profile, loading } = useAuth();
  const isAdmin = profile?.role === "admin";

  return (
    <PageBody>
      <PageHeader
        eyebrow="Reports & analytics"
        title="Health & adherence reports"
        hindiTitle="रिपोर्ट और विश्लेषण"
        description="दैनिक, साप्ताहिक, मासिक और वार्षिक रिपोर्ट, और डॉक्टर के लिए प्रिंट करने लायक सारांश।"
      />

      {loading ? (
        <div aria-busy="true" aria-label="लोड हो रहा है" className="space-y-4">
          <div className="skeleton h-11 rounded-control" />
          <div className="skeleton h-40 rounded-card" />
        </div>
      ) : activePatientId ? (
        <ReportsTabs key={activePatientId} patientId={activePatientId} />
      ) : (
        <NoPatientState what="रिपोर्ट" />
      )}

      {isAdmin ? <FoodDataQuality /> : null}

      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 text-xs text-ink-muted shadow-e1 print:hidden">
        <p className="flex items-center gap-2">
          <ShieldAlert aria-hidden className="h-4 w-4 shrink-0 text-ink-subtle" />
          <span lang="hi">स्वास्थट्रैक की रिपोर्ट रिकॉर्ड का सारांश है। यह डॉक्टर की सलाह या निदान की जगह नहीं लेती।</span>
        </p>
        <Link href="/medical-disclaimer" className="shrink-0 font-semibold text-brand-ink hover:underline">
          Medical disclaimer →
        </Link>
      </div>
    </PageBody>
  );
}
