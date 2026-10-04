"use client";

import { useState } from "react";
import { AlertTriangle, ArrowDown, Check, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DEFAULT_BP_THRESHOLDS,
  classifyBP,
  isPlausibleBP,
  toISTDate,
  todayIST,
  type BPClassification,
  type BPThresholds,
} from "@/lib/health-rules";
import { formatTimeIST } from "@/lib/medicine-format";
import { cn } from "@/lib/utils";

type BadgeTone = "positive" | "attention" | "critical";

/** Colour follows the clinical category from health-rules, never a local rule. */
export function bpTone(c: BPClassification): BadgeTone {
  if (c.category === "crisis" || c.category === "stage2" || c.needsUrgentAttention) return "critical";
  if (c.category === "normal") return "positive";
  return "attention";
}

const toneText: Record<BadgeTone, string> = {
  positive: "text-positive",
  attention: "text-attention",
  critical: "text-critical",
};

/** Text colour for a BP number, from its category. */
export function bpTextClass(c: BPClassification): string {
  return toneText[bpTone(c)];
}

function BPIcon({ category }: { category: BPClassification["category"] }) {
  const className = "h-3.5 w-3.5 shrink-0";
  if (category === "crisis") return <AlertTriangle aria-hidden className={className} />;
  if (category === "low") return <ArrowDown aria-hidden className={className} />;
  if (category === "normal") return <Check aria-hidden className={className} />;
  return <TrendingUp aria-hidden className={className} />;
}

/** Icon + Hindi label (English in the accessible name): never colour alone. */
export function BPStatusChip({
  systolic,
  diastolic,
  thresholds = DEFAULT_BP_THRESHOLDS,
  className,
}: {
  systolic: number;
  diastolic: number;
  thresholds?: BPThresholds;
  className?: string;
}) {
  if (!isPlausibleBP(systolic, diastolic)) return null;
  const c = classifyBP(systolic, diastolic, thresholds);
  return (
    <Badge variant={bpTone(c)} className={className}>
      <BPIcon category={c.category} />
      <span lang="hi">{c.labelHi}</span>
      <span className="sr-only"> ({c.labelEn})</span>
    </Badge>
  );
}

type BannerReading = { systolic: number; diastolic: number; measured_at: string };

/** How long a reading keeps the safety banner on the dashboard. */
const BANNER_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Calm, non-diagnostic notice for the latest reading when it is in the crisis
 * range or low. Shown for readings from the last 24 hours only; older ones are
 * history, not news. Never says "you are fine" and never tells anyone to change
 * a medicine.
 */
export function BPSafetyBanner({
  reading,
  thresholds = DEFAULT_BP_THRESHOLDS,
  className,
}: {
  reading: BannerReading | null;
  thresholds?: BPThresholds;
  className?: string;
}) {
  const [mountedAt] = useState(() => Date.now());
  if (!reading || !isPlausibleBP(reading.systolic, reading.diastolic)) return null;
  const measured = new Date(reading.measured_at).getTime();
  if (!Number.isFinite(measured) || mountedAt - measured > BANNER_WINDOW_MS) return null;

  const c = classifyBP(reading.systolic, reading.diastolic, thresholds);
  if (c.category !== "crisis" && c.category !== "low") return null;

  const crisis = c.category === "crisis";
  const day = toISTDate(reading.measured_at) === todayIST() ? "आज" : "कल";
  const time = formatTimeIST(reading.measured_at);

  return (
    <div
      role="status"
      className={cn(
        "rounded-card border p-4",
        crisis ? "border-critical-line bg-critical-soft" : "border-attention-line bg-attention-soft",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          aria-hidden
          className={cn("mt-0.5 h-5 w-5 shrink-0", crisis ? "text-critical" : "text-attention")}
        />
        <div className="min-w-0 space-y-1.5">
          <p lang="hi" className={cn("text-sm font-semibold", crisis ? "text-critical" : "text-attention")}>
            {day}{time ? ` ${time}` : ""} की BP रीडिंग {reading.systolic}/{reading.diastolic} {crisis ? "बहुत ज़्यादा है" : "कम है"}
          </p>
          {crisis ? (
            <p lang="hi" className="text-sm text-ink">
              5 मिनट आराम से बैठकर दोबारा नापें। अगर रीडिंग अब भी इतनी ही है, तो डॉक्टर से तुरंत संपर्क करें।
              सीने में दर्द, साँस फूलना, कमज़ोरी, बोलने में दिक्कत, तेज़ सिरदर्द या नज़र धुंधली हो तो
              देर न करें — इमरजेंसी (112) बुलाएँ।
            </p>
          ) : (
            <p lang="hi" className="text-sm text-ink">
              चक्कर, कमज़ोरी या बेहोशी जैसा लगे तो लेट जाएँ और डॉक्टर से बात करें। अपनी दवा खुद से बंद या कम न करें।
            </p>
          )}
          <p className="text-xs text-ink-muted">
            This is a screening notice from the logged number, not a diagnosis. Please confirm with a doctor.
          </p>
        </div>
      </div>
    </div>
  );
}
