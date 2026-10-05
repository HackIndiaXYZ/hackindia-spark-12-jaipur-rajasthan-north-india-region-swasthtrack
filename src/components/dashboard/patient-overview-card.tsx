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

  const stats: Array<{ key: string; icon: typeof Scale; label: string; value: string; helper: string; chip: string }> = [
    {
      key: "current",
      icon: Scale,
      label: "वर्तमान वजन",
      value: patient.current_weight_kg ? `${patient.current_weight_kg} kg` : "—",
      helper: patient.current_weight_kg ? "आख़िरी दर्ज वजन" : "अभी दर्ज नहीं",
      chip: metricChipClasses.weight,
    },
    {
      key: "target",
      icon: Target,
      label: "लक्ष्य वजन",
      value: patient.target_weight_kg ? `${patient.target_weight_kg} kg` : "—",
      helper: patient.target_weight_kg ? targetHelper : "तय नहीं",
      chip: metricChipClasses.weight,
    },
    {
      key: "calories",
      icon: Utensils,
      label: "कैलोरी लक्ष्य",
      value: `${patient.daily_calorie_target} kcal`,
      helper: "दैनिक सीमा",
      chip: metricChipClasses.food,
    },
  ];

  return (
    <Card aria-label="Patient profile — मरीज़ प्रोफाइल">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
              <User aria-hidden className="h-3.5 w-3.5" />
              <span lang="hi">मरीज़ प्रोफाइल</span>
            </p>
            <h2 className="mt-1 text-xl font-semibold text-ink sm:text-2xl">{patient.name}</h2>
            {facts.length > 0 ? (
              <p lang="hi" className="mt-0.5 text-sm font-medium text-ink-muted">
                {facts.join(" · ")}
              </p>
            ) : (
              <p lang="hi" className="mt-0.5 text-sm text-ink-muted">
                उम्र, लिंग और लंबाई अभी दर्ज नहीं है
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span lang="hi" className="mr-0.5 text-xs font-semibold text-ink-muted">
              बीमारियाँ:
            </span>
            {conditions.map((cond) => (
              <Badge key={cond.id} variant="neutral" className="bg-surface">
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

        <dl className="grid grid-cols-3 gap-2 lg:w-[26rem] lg:shrink-0">
          {stats.map(({ key, icon: Icon, label, value, helper, chip }) => (
            <div key={key} className="tile rounded-card p-3">
              <dt className="flex flex-col items-start gap-1.5 text-2xs font-semibold text-ink-muted">
                <span aria-hidden className={`grid h-7 w-7 place-items-center rounded-field ${chip}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span lang="hi">{label}</span>
              </dt>
              <dd className="mt-1">
                <span className="tabular block text-base font-semibold leading-tight text-ink sm:text-lg">{value}</span>
                <span lang="hi" className="block text-2xs leading-snug text-ink-muted">
                  {helper}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-gold-line pt-4">
        {canWrite && onEditProfile ? (
          <Button variant="secondary" onClick={onEditProfile} className="flex-1 sm:flex-none">
            <Edit2 aria-hidden className="h-4 w-4" />
            <span lang="hi">प्रोफाइल बदलें</span>
          </Button>
        ) : null}
        <Link href="/profile" className={buttonClasses({ variant: "secondary", className: "flex-1 sm:flex-none" })}>
          <span lang="hi">दवाइयाँ और बीमारियाँ</span>
          <ChevronRight aria-hidden className="h-4 w-4" />
        </Link>
      </div>
    </Card>
  );
}
