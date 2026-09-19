"use client";

import Link from "next/link";
import {
  ChevronRight,
  Edit2,
  Heart,
  Scale,
  Shield,
  User,
  Utensils,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { MedicalCondition, PatientProfile } from "@/services/patient-service";

type PatientOverviewCardProps = {
  patient: PatientProfile;
  conditions: MedicalCondition[];
  onEditProfile?: () => void;
};

export function PatientOverviewCard({
  patient,
  conditions,
  onEditProfile,
}: PatientOverviewCardProps) {
  const weightDiff =
    patient.current_weight_kg && patient.target_weight_kg
      ? (patient.current_weight_kg - patient.target_weight_kg).toFixed(1)
      : null;

  return (
    <Card className="border-brand-line bg-gradient-to-br from-surface via-brand-softer to-surface-sunken p-5 sm:p-6 shadow-xs">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-ink-inverse shadow-xs">
              <User className="h-3.5 w-3.5" />
              Patient Profile
            </span>
            <span className="text-xs font-semibold text-brand-ink bg-brand-soft/80 px-2.5 py-0.5 rounded-full">
              मरीज़ प्रोफाइल
            </span>
          </div>

          <div>
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-2xl font-semibold text-ink sm:text-3xl">
                {patient.name}
              </h2>
              <span className="text-sm font-semibold text-ink-muted">
                ({patient.age} yrs · {patient.gender || "Male"} · {patient.height_cm ? `${patient.height_cm} cm` : "172 cm"})
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-subtle">
              ID: {patient.id.slice(0, 8)}... · Monitored at SwasthTrack
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs font-semibold text-ink-muted">Conditions:</span>
            {conditions.map((cond) => (
              <Badge key={cond.id} variant="green">
                {cond.condition_name}
                {cond.diagnosed_year ? ` (${cond.diagnosed_year})` : ""}
              </Badge>
            ))}
            {conditions.length === 0 ? (
              <span className="text-xs italic text-ink-subtle">No conditions recorded</span>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-card border border-line bg-surface p-3.5 shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-subtle">
              <Scale className="h-3.5 w-3.5 text-amber-600" />
              <span>Current Weight</span>
            </div>
            <p className="mt-1.5 text-xl font-semibold text-ink">
              {patient.current_weight_kg ? `${patient.current_weight_kg} kg` : "--"}
            </p>
            <p className="text-xs text-ink-subtle">वर्तमान वजन</p>
          </div>

          <div className="rounded-card border border-line bg-surface p-3.5 shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-subtle">
              <Heart className="h-3.5 w-3.5 text-rose-500" />
              <span>Target Weight</span>
            </div>
            <p className="mt-1.5 text-xl font-semibold text-ink">
              {patient.target_weight_kg ? `${patient.target_weight_kg} kg` : "--"}
            </p>
            <p className="text-xs text-ink-subtle">
              {weightDiff ? `${weightDiff} kg to lose` : "लक्ष्य वजन"}
            </p>
          </div>

          <div className="col-span-2 sm:col-span-1 rounded-card border border-line bg-surface p-3.5 shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-subtle">
              <Utensils className="h-3.5 w-3.5 text-emerald-600" />
              <span>Calorie Ceiling</span>
            </div>
            <p className="mt-1.5 text-xl font-semibold text-ink">
              {patient.daily_calorie_target} kcal
            </p>
            <p className="text-xs text-ink-subtle">दैनिक लक्ष्य</p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-brand-line pt-4 text-xs">
        <div className="flex items-center gap-2 text-ink-muted">
          <Shield className="h-4 w-4 text-brand" />
          <span>Real Database-backed health profile</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onEditProfile}
            className="flex items-center gap-1.5 font-semibold text-brand hover:text-brand-ink"
          >
            <Edit2 className="h-3.5 w-3.5" />
            Edit Profile (संपादित करें)
          </button>
          <span className="text-ink-subtle">|</span>
          <Link
            href="/profile"
            className="flex items-center gap-1 font-semibold text-brand hover:text-brand-ink"
          >
            <span>Manage Medicines & Conditions</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
