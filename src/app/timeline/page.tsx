"use client";

import { NoPatientState } from "@/components/health/no-patient-state";
import { PageBody, PageHeader } from "@/components/ui/page";
import { TimelineView } from "@/components/timeline/timeline-view";
import { useAuth } from "@/context/auth-context";

export default function TimelinePage() {
  const { activePatientId, loading } = useAuth();

  return (
    <PageBody>
      <PageHeader
        eyebrow="Timeline · एकीकृत स्वास्थ्य यात्रा"
        title="Health timeline"
        hindiTitle="स्वास्थ्य यात्रा"
        description="भोजन, रक्तचाप, दवाइयाँ, कदम, नींद और वजन के सारे रिकॉर्ड एक जगह, तारीख़ के क्रम में।"
      />
      {loading ? (
        <div aria-busy="true" aria-label="लोड हो रहा है" className="space-y-3">
          <div className="skeleton h-11 rounded-control" />
          <div className="skeleton h-24 rounded-card" />
          <div className="skeleton h-24 rounded-card" />
        </div>
      ) : activePatientId ? (
        <TimelineView key={activePatientId} patientId={activePatientId} />
      ) : (
        <NoPatientState what="टाइमलाइन" />
      )}
    </PageBody>
  );
}
