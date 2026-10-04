"use client";

import { useState } from "react";
import Link from "next/link";
import { Printer, UserPlus, Users } from "lucide-react";
import { AddCaregiverDialog } from "@/components/forms/add-caregiver-dialog";
import { JoinPatientDialog } from "@/components/forms/join-patient-dialog";
import { CaregiverHeroBrief } from "@/components/caregiver/caregiver-hero-brief";
import {
  CaregiverPatterns,
  CaregiverTodayStatus,
  CaregiverWhatChanged,
} from "@/components/caregiver/caregiver-today-status";
import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState, PageBody, PageHeader } from "@/components/ui/page";
import { useAuth } from "@/context/auth-context";

export default function CaregiverPage() {
  const { activePatientId, authorizedPatients, memberRole, loading, setActivePatientId, refreshSession } = useAuth();
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  // The name comes from the membership list the session already loaded, so the
  // page can say who it is about before any health data has arrived.
  const patientName = authorizedPatients.find((p) => p.id === activePatientId)?.name ?? "मरीज़";

  const header = (
    <PageHeader
      eyebrow="Caregiver companion"
      title="Caregiver dashboard"
      hindiTitle="परिवार और देखभाल करने वालों के लिए"
      description="आज की स्थिति, ध्यान देने वाली बातें और रोज़ की दवाइयाँ एक जगह।"
      actions={
        <div className="no-print flex flex-wrap items-center gap-2 print:hidden">
          <Button variant="secondary" size="sm" onClick={() => setIsJoinOpen(true)}>
            <UserPlus aria-hidden className="h-4 w-4" />
            कोड से जुड़ें (Join)
          </Button>
          {memberRole === "owner" && activePatientId ? (
            <Button variant="secondary" size="sm" onClick={() => setIsInviteOpen(true)}>
              <Users aria-hidden className="h-4 w-4" />
              परिवार को जोड़ें (Invite)
            </Button>
          ) : null}
          {activePatientId ? (
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer aria-hidden className="h-4 w-4" />
              प्रिंट (Print)
            </Button>
          ) : null}
        </div>
      }
    />
  );

  return (
    <PageBody>
      {header}

      {loading ? (
        <div aria-busy="true" aria-label="लोड हो रहा है" className="space-y-4">
          <div className="skeleton h-12 rounded-card" />
          <div className="skeleton h-72 rounded-panel" />
        </div>
      ) : !activePatientId ? (
        <EmptyState
          icon={Users}
          title="अभी कोई मरीज़ जुड़ा नहीं है"
          hindiTitle="No patient yet"
          description="परिवार के किसी सदस्य से 6 अंकों का न्योता कोड लेकर जुड़ें, या अपने मरीज़ की प्रोफ़ाइल बनाएँ।"
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="primary" onClick={() => setIsJoinOpen(true)}>
                <UserPlus aria-hidden className="h-4 w-4" />
                कोड दर्ज करें
              </Button>
              <Link href="/onboarding" className={buttonClasses({ variant: "secondary" })}>
                प्रोफ़ाइल बनाएँ
              </Link>
            </div>
          }
        />
      ) : (
        <>
          {/* Keyed by patient so every section reloads cleanly when the patient changes. */}
          <CaregiverHeroBrief key={activePatientId} patientId={activePatientId} patientName={patientName} />
          <CaregiverTodayStatus key={`status-${activePatientId}`} patientId={activePatientId} patientName={patientName} memberRole={memberRole} />
          <CaregiverWhatChanged key={`changes-${activePatientId}`} patientId={activePatientId} patientName={patientName} />
          <CaregiverPatterns key={`patterns-${activePatientId}`} patientId={activePatientId} />

          <p lang="hi" className="rounded-card border border-line bg-surface-sunken p-3 text-xs text-ink-subtle">
            यह सारांश रोज़ की आदतों पर नज़र रखने में मदद के लिए है। किसी भी इलाज के फ़ैसले के लिए डॉक्टर से बात करें। आपात स्थिति में 112 / 108।
          </p>
        </>
      )}

      <JoinPatientDialog
        isOpen={isJoinOpen}
        onClose={() => setIsJoinOpen(false)}
        onSuccess={(joinedId) => {
          void refreshSession().then(() => {
            if (joinedId) setActivePatientId(joinedId);
          });
        }}
      />

      {memberRole === "owner" && activePatientId ? (
        <AddCaregiverDialog isOpen={isInviteOpen} onClose={() => setIsInviteOpen(false)} patientId={activePatientId} />
      ) : null}
    </PageBody>
  );
}
