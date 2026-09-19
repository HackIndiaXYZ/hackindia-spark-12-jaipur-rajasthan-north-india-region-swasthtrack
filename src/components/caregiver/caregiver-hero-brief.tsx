"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  HeartPulse,
  History,
  Info,
  Moon,
  Pill,
  PlusCircle,
  RefreshCw,
  Scale,
  Sparkles,
  UserCheck,
  Utensils,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DepthCard } from "@/components/ui/depth-card";
import { cn } from "@/lib/utils";
import {
  getCaregiverDailyBrief,
  getCaregiverMonthlyBrief,
  getCaregiverWeeklyBrief,
  type CaregiverDailyBrief,
  type CaregiverMonthlyBrief,
  type CaregiverWeeklyBrief,
} from "@/services/caregiver-intelligence-service";
import { CaregiverQuickLogModal } from "./caregiver-quick-log-modal";
import type { PatientProfile } from "@/services/patient-service";

type CaregiverHeroBriefProps = {
  patient: PatientProfile;
  authorizedPatients?: PatientProfile[];
  onSelectPatient?: (patientId: string) => void;
};

const vitalIcons: Record<string, typeof Activity> = {
  HeartPulse,
  Pill,
  Utensils,
  Activity,
  Moon,
  Scale,
};

function getTodayAndYesterdayDates() {
  const d = new Date();
  const today = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const yesterdayD = new Date(d.getTime() - 24 * 60 * 60 * 1000);
  const yesterday = yesterdayD.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return { today, yesterday };
}

export function CaregiverHeroBrief({
  patient,
  authorizedPatients = [],
  onSelectPatient,
}: CaregiverHeroBriefProps) {
  const { today: todayStr, yesterday: yesterdayStr } = getTodayAndYesterdayDates();
  const [viewMode, setViewMode] = useState<"daily" | "weekly" | "monthly">("daily");
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  const [dailyBrief, setDailyBrief] = useState<CaregiverDailyBrief | null>(null);
  const [weeklyBrief, setWeeklyBrief] = useState<CaregiverWeeklyBrief | null>(null);
  const [monthlyBrief, setMonthlyBrief] = useState<CaregiverMonthlyBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllAttention, setShowAllAttention] = useState(false);
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false);
  const [isQuickLogOpen, setIsQuickLogOpen] = useState(false);

  useEffect(() => {
    let active = true;

    if (viewMode === "daily") {
      getCaregiverDailyBrief(patient.id, selectedDate, false)
        .then((b) => {
          if (active) setDailyBrief(b);
        })
        .catch((err) => console.error("Caregiver daily brief error:", err))
        .finally(() => {
          if (active) {
            setLoading(false);
            setRefreshing(false);
          }
        });
    } else if (viewMode === "weekly") {
      getCaregiverWeeklyBrief(patient.id)
        .then((b) => {
          if (active) setWeeklyBrief(b);
        })
        .catch((err) => console.error("Caregiver weekly brief error:", err))
        .finally(() => {
          if (active) {
            setLoading(false);
            setRefreshing(false);
          }
        });
    } else if (viewMode === "monthly") {
      getCaregiverMonthlyBrief(patient.id)
        .then((b) => {
          if (active) setMonthlyBrief(b);
        })
        .catch((err) => console.error("Caregiver monthly brief error:", err))
        .finally(() => {
          if (active) {
            setLoading(false);
            setRefreshing(false);
          }
        });
    }

    return () => {
      active = false;
    };
  }, [patient.id, selectedDate, viewMode]);

  function triggerRefresh() {
    setRefreshing(true);
    if (viewMode === "daily") {
      getCaregiverDailyBrief(patient.id, selectedDate, true)
        .then((b) => setDailyBrief(b))
        .finally(() => setRefreshing(false));
    } else if (viewMode === "weekly") {
      getCaregiverWeeklyBrief(patient.id)
        .then((b) => setWeeklyBrief(b))
        .finally(() => setRefreshing(false));
    } else if (viewMode === "monthly") {
      getCaregiverMonthlyBrief(patient.id)
        .then((b) => setMonthlyBrief(b))
        .finally(() => setRefreshing(false));
    }
  }

  const isViewingOtherDate = selectedDate !== todayStr;
  const cardTitle = dailyBrief?.isPapa
    ? isViewingOtherDate
      ? `पापा — ${dailyBrief.dateLabelHi}`
      : "आज पापा कैसे रहे?"
    : isViewingOtherDate
    ? `${patient.name} — ${dailyBrief?.dateLabelHi || selectedDate}`
    : `आज ${patient.name} कैसे रहे?`;

  return (
    <div className="space-y-4">
      {/* 1. PATIENT CONTEXT SELECTOR BAR (§16, §17) */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-card bg-ink text-ink-inverse shadow-e2">
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              if (authorizedPatients.length > 1) {
                setIsPatientDropdownOpen(!isPatientDropdownOpen);
              }
            }}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-control text-xs sm:text-sm font-bold transition-all",
              authorizedPatients.length > 1
                ? "bg-white/10 hover:bg-white/15 cursor-pointer border border-white/15"
                : "bg-white/5 border border-white/10"
            )}
          >
            <UserCheck className="h-4 w-4 text-brand" />
            <span>Viewing:</span>
            <span className="text-brand-line underline underline-offset-2">
              {dailyBrief?.isPapa ? "पापा (Raj Kishore Gupta)" : patient.name}
            </span>
            {authorizedPatients.length > 1 && (
              <ChevronDown className="h-3.5 w-3.5 text-ink-inverse/60 ml-1" />
            )}
          </button>

          {/* PATIENT DROPDOWN */}
          {isPatientDropdownOpen && authorizedPatients.length > 1 && (
            <div className="absolute left-0 top-full mt-2 w-64 rounded-card bg-surface text-ink border-2 border-line shadow-e4 z-30 p-2 space-y-1">
              <span className="text-2xs font-semibold text-ink-subtle px-3 py-1 block uppercase">
                Authorized Patients (मरीज़ चुनें)
              </span>
              {authorizedPatients.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    if (onSelectPatient) onSelectPatient(p.id);
                    setIsPatientDropdownOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-control text-xs font-bold transition-colors flex items-center justify-between",
                    p.id === patient.id
                      ? "bg-brand-soft text-brand-ink border border-brand-line"
                      : "hover:bg-surface-sunken text-ink-muted"
                  )}
                >
                  <span>{p.name}</span>
                  {p.id === patient.id && <CheckCircle2 className="h-3.5 w-3.5 text-brand" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* DATE SELECTOR (§18) & LIVE REFRESH */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white/10 p-1 rounded-control border border-white/15">
            <button
              type="button"
              onClick={() => setSelectedDate(todayStr)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                selectedDate === todayStr
                  ? "bg-brand text-ink-inverse shadow-2xs"
                  : "text-ink-inverse/60 hover:text-ink-inverse"
              )}
            >
              आज (Today)
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(yesterdayStr)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                selectedDate === yesterdayStr
                  ? "bg-brand text-ink-inverse shadow-2xs"
                  : "text-ink-inverse/60 hover:text-ink-inverse"
              )}
            >
              कल (Yesterday)
            </button>
          </div>

          <button
            type="button"
            onClick={triggerRefresh}
            disabled={refreshing}
            className="h-9 w-9 rounded-control bg-white/10 hover:bg-white/15 border border-white/15 text-ink-inverse/70 flex items-center justify-center transition-colors cursor-pointer"
            title="रिफ्रेश करें"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin text-brand")} />
          </button>
        </div>
      </div>

      {/* 2. VIEW MODE TOGGLE (DAILY / WEEKLY / MONTHLY) */}
      <div className="flex items-center gap-1.5 p-1 bg-surface-sunken rounded-card border border-line">
        <button
          type="button"
          onClick={() => setViewMode("daily")}
          className={cn(
            "flex-1 py-2 rounded-control text-xs sm:text-sm font-bold transition-all cursor-pointer text-center",
            viewMode === "daily"
              ? "bg-surface text-ink shadow-xs border border-line"
              : "text-ink-muted hover:text-ink"
          )}
        >
          दैनिक ब्रीफ (Daily Brief)
        </button>
        <button
          type="button"
          onClick={() => setViewMode("weekly")}
          className={cn(
            "flex-1 py-2 rounded-control text-xs sm:text-sm font-bold transition-all cursor-pointer text-center",
            viewMode === "weekly"
              ? "bg-surface text-ink shadow-xs border border-line"
              : "text-ink-muted hover:text-ink"
          )}
        >
          साप्ताहिक (This Week)
        </button>
        <button
          type="button"
          onClick={() => setViewMode("monthly")}
          className={cn(
            "flex-1 py-2 rounded-control text-xs sm:text-sm font-bold transition-all cursor-pointer text-center",
            viewMode === "monthly"
              ? "bg-surface text-ink shadow-xs border border-line"
              : "text-ink-muted hover:text-ink"
          )}
        >
          मासिक (This Month)
        </button>
      </div>

      {/* 3. DAILY BRIEF HERO CONTENT */}
      {loading ? (
        <DepthCard depth={2} className="p-6 animate-pulse space-y-4">
          <div className="h-6 w-48 rounded bg-surface-sunken" />
          <div className="h-20 rounded-card bg-surface-sunken" />
          <div className="grid grid-cols-3 gap-3">
            <div className="h-24 rounded-card bg-surface-sunken" />
            <div className="h-24 rounded-card bg-surface-sunken" />
            <div className="h-24 rounded-card bg-surface-sunken" />
          </div>
        </DepthCard>
      ) : viewMode === "daily" && dailyBrief ? (
        <DepthCard
          depth={2}
          surface="gradient"
          glow="gold"
          highlight
          className="p-4 sm:p-6 bg-linear-to-b from-brand-softer/40 via-surface to-surface space-y-5"
        >
          {/* A. HERO HEADER BAR */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-card bg-info-soft border border-info-line text-info flex items-center justify-center shrink-0 shadow-2xs">
                <Sparkles className="h-6 w-6 stroke-[2.2]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-xl font-bold text-ink tracking-tight">
                    {cardTitle}
                  </h2>
                  <Badge
                    variant={
                      dailyBrief.routineStatus === "Routine on track"
                        ? "green"
                        : dailyBrief.routineStatus === "Needs attention"
                        ? "amber"
                        : "neutral"
                    }
                    className="text-2xs font-bold"
                  >
                    {dailyBrief.routineStatusHi}
                  </Badge>
                </div>
                <p className="text-xs font-semibold text-ink-subtle mt-0.5">
                  Daily Health Summary · {dailyBrief.dateLabelHi}
                </p>
              </div>
            </div>

            {/* ROUTINE SCORE & LAST UPDATED */}
            <div className="flex items-center gap-3 self-start sm:self-auto">
              <div className="text-right">
                <span className="text-2xs font-semibold text-ink-subtle block uppercase">
                  रूटीन स्कोर
                </span>
                <span className="text-lg font-bold text-ink">
                  {dailyBrief.routineScore} <span className="text-xs font-semibold text-ink-subtle">/ 100</span>
                </span>
              </div>
              <div className="h-8 w-px bg-line" />
              <div className="text-xs text-ink-subtle font-semibold">
                <span>अंतिम अपडेट:</span>
                <span className="font-semibold text-ink-muted block">{dailyBrief.cachedAt}</span>
              </div>
            </div>
          </div>

          {/* B. NATURAL LANGUAGE SUMMARY BANNER (§4, §10) */}
          <div className="p-4 rounded-card bg-info-soft/70 border border-info-line/90 shadow-2xs">
            <div className="flex items-start gap-2.5">
              <div className="h-6 w-6 rounded-lg bg-info-line/80 text-info flex items-center justify-center shrink-0 mt-0.5">
                <Info className="h-3.5 w-3.5" />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold text-info block">
                  संक्षिप्त दिनचर्या सारांश (Daily Overview):
                </span>
                <p className="text-xs sm:text-sm font-semibold text-info leading-relaxed">
                  {dailyBrief.naturalLanguageSummaryHi}
                </p>
              </div>
            </div>
          </div>

          {/* C. DATA COMPLETENESS TRACKER (§34, §35) */}
          <div className="p-3 rounded-card bg-surface border border-line shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-ink-muted">
                दैनिक ट्रैकिंग पूर्णता: {dailyBrief.completenessLabelHi}
              </span>
              <span className="text-positive font-bold">
                {dailyBrief.completenessPercent}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-sunken overflow-hidden">
              <div
                className="h-full rounded-full bg-linear-to-r from-brand to-brand-strong transition-all duration-300"
                style={{ width: `${dailyBrief.completenessPercent}%` }}
              />
            </div>
            <p className="text-2xs font-semibold text-ink-subtle">
              * यह माप केवल डेटा प्रविष्टि की पूर्णता को दर्शाता है, स्वास्थ्य की स्थिति को नहीं।
            </p>
          </div>

          {/* D. 6-VITAL SNAPSHOT GRID (§6) */}
          <div>
            <h4 className="text-xs font-bold text-ink-subtle uppercase tracking-wider mb-2.5">
              आज के मुख्य रिकॉर्ड्स (Snapshot)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {Object.entries(dailyBrief.snapshot).map(([key, vital]) => {
                const Icon = vitalIcons[vital.iconName] || Activity;
                return (
                  <div
                    key={key}
                    className={cn(
                      "p-3 rounded-card border-2 transition-all select-none",
                      vital.isLogged
                        ? "bg-surface border-line shadow-2xs"
                        : "bg-surface-sunken/60 border-dashed border-line"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-ink-subtle truncate">
                        {vital.labelHi}
                      </span>
                      <Icon className="h-3.5 w-3.5 text-ink-subtle" />
                    </div>

                    <div className="text-sm sm:text-base font-bold text-ink">
                      {vital.value}
                    </div>

                    {vital.subtext && (
                      <p className="text-2xs font-semibold text-ink-subtle truncate mt-0.5">
                        {vital.subtext}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* E. HIGHLIGHTS & ATTENTION COLUMNS (§7, §8) */}
          <div className="grid sm:grid-cols-2 gap-3.5 pt-1">
            {/* POSITIVE HIGHLIGHTS */}
            <div className="p-3.5 rounded-card bg-positive-soft/50 border border-positive-line/90 space-y-2">
              <div className="flex items-center gap-1.5 text-positive font-bold text-xs sm:text-sm">
                <CheckCircle2 className="h-4 w-4 text-positive" />
                <span>आज के मुख्य सकारात्मक बिंदु (Highlights)</span>
              </div>
              {dailyBrief.highlights.length > 0 ? (
                <ul className="space-y-1.5 text-xs text-positive font-semibold">
                  {dailyBrief.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-positive font-bold">•</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-positive font-semibold">नियमित दिनचर्या जारी है।</p>
              )}
            </div>

            {/* NEEDS ATTENTION */}
            <div className="p-3.5 rounded-card bg-attention-soft/50 border border-attention-line/90 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-attention font-bold text-xs sm:text-sm">
                  <AlertTriangle className="h-4 w-4 text-attention" />
                  <span>ध्यान देने योग्य बिंदु (Needs Attention)</span>
                </div>
                {dailyBrief.attentionItems.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllAttention(!showAllAttention)}
                    className="text-xs font-bold text-attention hover:underline cursor-pointer"
                  >
                    {showAllAttention ? "कम देखें ↑" : "सभी देखें ↓"}
                  </button>
                )}
              </div>

              {dailyBrief.attentionItems.length > 0 ? (
                <ul className="space-y-1.5 text-xs text-attention font-semibold">
                  {(showAllAttention
                    ? dailyBrief.attentionItems
                    : dailyBrief.attentionItems.slice(0, 3)
                  ).map((item) => (
                    <li key={item.id} className="flex items-start gap-1.5">
                      <span className="text-attention font-bold">⚠</span>
                      <div>
                        <span>{item.textHi}</span>
                        {item.detail && (
                          <span className="text-2xs text-attention/80 block font-normal">
                            {item.detail}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-attention font-semibold">
                  आज कोई लंबित चेतावनी नहीं है। सभी मुख्य रिकॉर्ड्स समय पर हैं।
                </p>
              )}
            </div>
          </div>

          {/* F. TODAY VS USUAL BASELINE COMPARISON (§12, §13) */}
          {dailyBrief.todayVsUsual.length > 0 && (
            <div className="space-y-2 pt-1">
              <h4 className="text-xs font-bold text-ink-subtle uppercase tracking-wider">
                आज बनाम सामान्य पैटर्न (Today vs Usual)
              </h4>
              <div className="grid sm:grid-cols-3 gap-2.5">
                {dailyBrief.todayVsUsual.map((c) => (
                  <div
                    key={c.metric}
                    className="p-3 rounded-card bg-surface border border-line shadow-2xs space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-ink">
                      <span>{c.metricHi}</span>
                      <span className="text-2xs text-ink-subtle font-semibold">
                        विश्वास: {c.confidence === "High" ? "उच्च" : "मध्यम"}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-ink-muted">
                      <span>आज: {c.todayValueStr}</span>
                      <span className="text-xs text-ink-subtle ml-1">
                        (सामान्य: {c.usualValueStr})
                      </span>
                    </div>
                    <div className="text-xs font-bold text-positive">
                      {c.comparisonTextHi}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* G. WHAT CHANGED REUSE & TIMELINE LINKS (§14, §15) */}
          <div className="pt-2 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
              <Sparkles className="h-4 w-4 text-info" />
              <span>
                <strong>What Changed:</strong> {dailyBrief.whatChangedCompactHi.slice(0, 75)}...
              </span>
            </div>

            <div className="flex items-center gap-2 self-stretch sm:self-auto">
              <Link
                href="/insights/changes"
                className="flex-1 sm:flex-none text-center px-3 py-1.5 rounded-control bg-info-soft hover:brightness-95 border border-info-line text-xs font-bold text-info transition-colors"
              >
                बदलाव विवरण देखें →
              </Link>
              <Link
                href="/timeline"
                className="flex-1 sm:flex-none text-center px-3 py-1.5 rounded-control bg-positive-soft hover:brightness-95 border border-positive-line text-xs font-bold text-positive transition-colors flex items-center justify-center gap-1"
              >
                <History className="h-3.5 w-3.5" />
                <span>स्वास्थ्य यात्रा</span>
              </Link>
            </div>
          </div>

          {/* H. QUICK CARE ACTIONS BUTTON (§25) */}
          <div className="pt-1 text-center">
            <Button
              type="button"
              onClick={() => setIsQuickLogOpen(true)}
              variant="primary"
              className="w-full sm:w-auto px-6 py-2.5 rounded-control text-xs sm:text-sm font-bold shadow-e2"
            >
              <PlusCircle className="h-4 w-4 mr-1.5" />
              पापा के लिए नया रिकॉर्ड जोड़ें (Quick Log for Papa)
            </Button>
          </div>
        </DepthCard>
      ) : viewMode === "weekly" && weeklyBrief ? (
        /* WEEKLY BRIEF (§28) */
        <DepthCard depth={2} className="p-5 sm:p-6 bg-surface border-2 border-line space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-line">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-ink">
                पापा — इस सप्ताह का स्वास्थ्य सारांश (Papa — This Week)
              </h3>
              <p className="text-xs font-semibold text-ink-subtle">
                साप्ताहिक औसत व निरंतरता विश्लेषण
              </p>
            </div>
            <Badge variant="blue" className="text-xs font-bold">
              रूटीन स्कोर: {weeklyBrief.routineScore}
            </Badge>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-card bg-surface-sunken border border-line">
              <span className="text-2xs font-semibold text-ink-subtle block uppercase">औसत BP</span>
              <span className="text-sm font-bold text-ink">{weeklyBrief.avgBP}</span>
            </div>
            <div className="p-3 rounded-card bg-surface-sunken border border-line">
              <span className="text-2xs font-semibold text-ink-subtle block uppercase">औसत कदम</span>
              <span className="text-sm font-bold text-ink">
                {weeklyBrief.avgSteps.toLocaleString()} / दिन
              </span>
            </div>
            <div className="p-3 rounded-card bg-surface-sunken border border-line">
              <span className="text-2xs font-semibold text-ink-subtle block uppercase">औसत नींद</span>
              <span className="text-sm font-bold text-ink">{weeklyBrief.avgSleepHours} घंटे</span>
            </div>
            <div className="p-3 rounded-card bg-surface-sunken border border-line">
              <span className="text-2xs font-semibold text-ink-subtle block uppercase">दवा पालन</span>
              <span className="text-sm font-bold text-positive">
                {weeklyBrief.medAdherencePercent}%
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-card bg-info-soft/60 border border-info-line text-xs space-y-1">
            <span className="font-bold text-info block">साप्ताहिक मुख्य बदलाव:</span>
            {weeklyBrief.topChanges.map((c, i) => (
              <p key={i} className="font-semibold text-info">
                • {c}
              </p>
            ))}
          </div>
        </DepthCard>
      ) : viewMode === "monthly" && monthlyBrief ? (
        /* MONTHLY BRIEF (§29) */
        <DepthCard depth={2} className="p-5 sm:p-6 bg-surface border-2 border-line space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-line">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-ink">
                पापा — मासिक स्वास्थ्य रुझान (Papa — This Month)
              </h3>
              <p className="text-xs font-semibold text-ink-subtle">{monthlyBrief.monthLabel}</p>
            </div>
            <Badge variant="green" className="text-xs font-bold">
              मासिक स्कोर: {monthlyBrief.routineScore}
            </Badge>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-card bg-surface-sunken border border-line">
              <span className="text-2xs font-semibold text-ink-subtle block uppercase">वजन ट्रेंड</span>
              <span className="text-sm font-bold text-ink">
                {monthlyBrief.weightTrend === "Stable"
                  ? "स्थिर (Stable)"
                  : monthlyBrief.weightTrend === "Gaining"
                  ? "हल्की वृद्धि"
                  : "हल्की कमी"}
              </span>
            </div>
            <div className="p-3 rounded-card bg-surface-sunken border border-line">
              <span className="text-2xs font-semibold text-ink-subtle block uppercase">BP ट्रेंड</span>
              <span className="text-sm font-bold text-ink">{monthlyBrief.bpTrend}</span>
            </div>
            <div className="p-3 rounded-card bg-surface-sunken border border-line">
              <span className="text-2xs font-semibold text-ink-subtle block uppercase">मासिक औसत कदम</span>
              <span className="text-sm font-bold text-ink">
                {monthlyBrief.stepsAvg.toLocaleString()}
              </span>
            </div>
            <div className="p-3 rounded-card bg-surface-sunken border border-line">
              <span className="text-2xs font-semibold text-ink-subtle block uppercase">दवा निरंतरता</span>
              <span className="text-sm font-bold text-positive">
                {monthlyBrief.medAdherencePercent}%
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-card bg-surface-sunken border border-line text-xs space-y-1.5">
            <span className="font-bold text-ink block">मासिक प्रमुख बिंदु:</span>
            {monthlyBrief.notableChanges.map((item, idx) => (
              <p key={idx} className="font-semibold text-ink-muted">
                ✓ {item}
              </p>
            ))}
          </div>
        </DepthCard>
      ) : null}

      {/* QUICK LOG MODAL FOR CAREGIVER */}
      <CaregiverQuickLogModal
        isOpen={isQuickLogOpen}
        onClose={() => setIsQuickLogOpen(false)}
        patientId={patient.id}
        patientName={dailyBrief?.isPapa ? "पापा (Raj Kishore Gupta)" : patient.name}
        onSuccess={triggerRefresh}
      />
    </div>
  );
}
