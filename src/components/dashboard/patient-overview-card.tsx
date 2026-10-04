"use client";

import Link from "next/link";
import { ChevronRight, Edit2, Scale, Target, User, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClasses, Button } from "@/components/ui/button";
import { Card, metricChipClasses } from "@/components/ui/card";
import { useAuth } from "@/context/auth-context";
import type { MedicalCondition, PatientProfile } from "@/services/patient-service";

type PatientOverviewCardProps = {
  patient: PatientProfile;
  conditions: MedicalCondition[];
  onEditProfile?: () => void;
};

export function PatientOverviewCard({ patient, conditions, onEditProfile }: PatientOverviewCardProps) {
  const { canWrite } = useAuth();

  // Only what was actually entered: a missing age, gender or height is left out,
  // never replaced with a typical value.
  const facts = [
    patient.age ? `${patient.age} वर्ष` : null,
    patient.gender || null,
    patient.height_cm ? `${patient.height_cm} cm` : null,
  ].filter((f): f is string => f !== null);

  const diff =
    patient.current_weight_kg && patient.target_weight_kg
      ? Math.round((patient.current_weight_kg - patient.target_weight_kg) * 10) / 10
      : null;
  const targetHelper =
    diff === null
      ? "लक्ष्य वजन"
      : diff === 0
        ? "लक्ष्य पर"
        : diff > 0
          ? `लक्ष्य से ${diff} kg ऊपर`
          : `लक्ष्य से ${Math.abs(diff)} kg नीचे`;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge variant="brand">
              <User aria-hidden className="h-3.5 w-3.5" />
              <span lang="hi">मरीज़ प्रोफाइल</span>
            </Badge>
          </div>

          <div>
            <h2 className="text-2xl font-semibold text-ink sm:text-3xl">{patient.name}</h2>
            {facts.length > 0 ? (
              <p lang="hi" className="mt-1 text-sm font-medium text-ink-muted">
                {facts.join(" · ")}
              </p>
            ) : (
              <p lang="hi" className="mt-1 text-sm text-ink-muted">
                उम्र, लिंग और लंबाई अभी दर्ज नहीं है
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span lang="hi" className="text-xs font-semibold text-ink-muted">
              बीमारियाँ:
            </span>
            {conditions.map((cond) => (
              <Badge key={cond.id} variant="brand">
                {cond.condition_name}
                {cond.diagnosed_year ? ` (${cond.diagnosed_year})` : ""}
              </Badge>
            ))}
            {conditions.length === 0 ? (
              <span lang="hi" className="text-xs text-ink-muted">
                कोई दर्ज नहीं
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-card border border-line bg-surface p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
              <span className={`grid h-6 w-6 place-items-center rounded-field ${metricChipClasses.weight}`}>
                <Scale aria-hidden className="h-3.5 w-3.5" />
              </span>
              <span lang="hi">वर्तमान वजन</span>
            </div>
            <p className="tabular mt-1.5 text-xl font-semibold text-ink">
              {patient.current_weight_kg ? `${patient.current_weight_kg} kg` : "—"}
            </p>
            <p lang="hi" className="text-xs text-ink-muted">
              {patient.current_weight_kg ? "आख़िरी दर्ज वजन" : "अभी दर्ज नहीं"}
            </p>
          </div>

          <div className="rounded-card border border-line bg-surface p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
              <span className={`grid h-6 w-6 place-items-center rounded-field ${metricChipClasses.weight}`}>
                <Target aria-hidden className="h-3.5 w-3.5" />
              </span>
              <span lang="hi">लक्ष्य वजन</span>
            </div>
            <p className="tabular mt-1.5 text-xl font-semibold text-ink">
              {patient.target_weight_kg ? `${patient.target_weight_kg} kg` : "—"}
            </p>
            <p lang="hi" className="text-xs text-ink-muted">
              {patient.target_weight_kg ? targetHelper : "तय नहीं"}
            </p>
          </div>

          <div className="col-span-2 rounded-card border border-line bg-surface p-3.5 sm:col-span-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
              <span className={`grid h-6 w-6 place-items-center rounded-field ${metricChipClasses.food}`}>
                <Utensils aria-hidden className="h-3.5 w-3.5" />
              </span>
              <span lang="hi">कैलोरी लक्ष्य</span>
            </div>
            <p className="tabular mt-1.5 text-xl font-semibold text-ink">{patient.daily_calorie_target} kcal</p>
            <p lang="hi" className="text-xs text-ink-muted">
              दैनिक सीमा
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        {canWrite && onEditProfile ? (
          <Button variant="secondary" onClick={onEditProfile}>
            <Edit2 aria-hidden className="h-4 w-4" />
            <span lang="hi">प्रोफाइल बदलें</span>
          </Button>
        ) : null}
        <Link href="/profile" className={buttonClasses({ variant: "secondary" })}>
          <span lang="hi">दवाइयाँ और बीमारियाँ</span>
          <ChevronRight aria-hidden className="h-4 w-4" />
        </Link>
      </div>
    </Card>
  );
}
