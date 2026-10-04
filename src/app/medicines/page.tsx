"use client";

import { useState } from "react";
import { Pill, Plus, UserRound } from "lucide-react";
import { AddMedicineDialog } from "@/components/forms/add-medicine-dialog";
import { MedicineAdherenceSummary } from "@/components/medicines/medicine-adherence-summary";
import { MedicineSchedule } from "@/components/medicines/medicine-schedule";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, PageBody } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { PageTitle } from "@/components/ui/page-title";
import { useAuth } from "@/context/auth-context";
import { useMedicineMarking } from "@/hooks/use-medicine-marking";
import { todayIST } from "@/lib/health-rules";

const TITLE = {
  eyebrow: "Medicine Tracking (दवाइयाँ)",
  title: "Medicine Schedule & Adherence",
};

export default function MedicinesPage() {
  const { activePatientId, canWrite } = useAuth();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const toast = useToast();

  // Today's doses drive the summary and the "no medicines yet" state. The schedule
  // below has its own hook for whichever day is selected; both stay in sync
  // because every write re-notifies the other mounted hooks.
  const today = useMedicineMarking(activePatientId, todayIST());

  if (!activePatientId) {
    return (
      <PageBody>
        <PageTitle {...TITLE} />
        <EmptyState
          icon={UserRound}
          title="No patient selected"
          hindiTitle="अभी कोई मरीज़ चुना नहीं गया है।"
          description="मरीज़ जोड़ने या चुनने के बाद यहाँ दवाइयाँ दिखेंगी।"
        />
      </PageBody>
    );
  }

  if (today.loading) {
    return (
      <PageBody>
        <PageTitle {...TITLE} />
        <div className="space-y-4" aria-busy="true" aria-label="दवाइयाँ लोड हो रही हैं">
          <div className="skeleton h-36 w-full rounded-card" />
          <div className="skeleton h-64 w-full rounded-card" />
        </div>
      </PageBody>
    );
  }

  if (today.error) {
    return (
      <PageBody>
        <PageTitle {...TITLE} />
        <ErrorState
          title="दवाइयाँ लोड नहीं हो पाईं"
          englishTitle="The medicine list could not be loaded"
          description="इंटरनेट कनेक्शन जाँचें और दोबारा कोशिश करें।"
          onRetry={today.reload}
        />
      </PageBody>
    );
  }

  // `medicines` includes stopped ones; a patient with only stopped medicines still
  // gets the schedule (which explains it) rather than the first-run prompt.
  if (today.medicines.length === 0) {
    return (
      <PageBody>
        <PageTitle {...TITLE} />
        <EmptyState
          icon={Pill}
          title="No medicines added yet"
          hindiTitle="अभी कोई दवाई दर्ज नहीं है।"
          description={
            canWrite
              ? "डॉक्टर की पर्ची की दवाइयाँ जोड़ें। फिर यहाँ रोज़ की खुराक दर्ज होगी और नियमितता दिखेगी।"
              : "जब कोई दवाई जोड़ी जाएगी, वह यहाँ दिखेगी।"
          }
          action={
            canWrite ? (
              <Button variant="primary" onClick={() => setIsAddOpen(true)}>
                <Plus aria-hidden className="h-4 w-4" />
                <span lang="hi">पहली दवाई जोड़ें</span>
              </Button>
            ) : undefined
          }
        />
        <AddMedicineDialog
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          patientId={activePatientId}
          onSuccess={() => toast.success("दवाई जुड़ गई")}
        />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <PageTitle {...TITLE} />
      <MedicineAdherenceSummary summary={today.summary} />
      <MedicineSchedule patientId={activePatientId} onAddMedicine={() => setIsAddOpen(true)} />
      <AddMedicineDialog
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        patientId={activePatientId}
        onSuccess={() => toast.success("दवाई जुड़ गई")}
      />
    </PageBody>
  );
}
