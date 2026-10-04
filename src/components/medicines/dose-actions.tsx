"use client";

import { Check, Clock, Hourglass, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DOSE_STATE_LABEL, formatTimeIST, type DoseState } from "@/lib/medicine-format";
import { cn } from "@/lib/utils";
import type { Dose } from "@/hooks/use-medicine-marking";

const STATE_BADGE: Record<DoseState, "positive" | "attention" | "critical" | "info" | "neutral"> = {
  taken: "positive",
  late: "attention",
  missed: "critical",
  pending: "info",
  upcoming: "neutral",
};

const STATE_ICON: Record<DoseState, typeof Check> = {
  taken: Check,
  late: Hourglass,
  missed: X,
  pending: Clock,
  upcoming: Clock,
};

/** State is always icon + words, never colour alone. */
export function DoseStatusChip({ state, className }: { state: DoseState; className?: string }) {
  const Icon = STATE_ICON[state];
  const label = DOSE_STATE_LABEL[state];
  return (
    <Badge variant={STATE_BADGE[state]} className={cn("shrink-0", className)}>
      <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span lang="hi">{label.hi}</span>
      <span className="sr-only"> ({label.en})</span>
    </Badge>
  );
}

/** "दर्ज: 8:42 am" when a person recorded the dose; empty for untouched doses. */
export function DoseRecordedAt({ dose, className }: { dose: Dose; className?: string }) {
  const time = dose.log ? formatTimeIST(dose.recordedAt) : null;
  if (!time) return null;
  return (
    <p className={cn("text-xs text-ink-muted", className)}>
      <span lang="hi">दर्ज किया:</span> <span className="tabular">{time}</span>
    </p>
  );
}

type DoseActionsProps = {
  dose: Dose;
  /** Viewers see the state but get no buttons. */
  canWrite: boolean;
  onTaken: () => void;
  onMissed: () => void;
  onUndo: () => void;
  className?: string;
};

/**
 * The only dose controls in the product (dashboard card, Medicines page,
 * quick-mark sheet). Every button is at least 44px tall and does exactly what
 * it says: "taken" records a dose, it never deletes one.
 */
export function DoseActions({ dose, canWrite, onTaken, onMissed, onUndo, className }: DoseActionsProps) {
  if (!canWrite) return null;
  const { state, busy, autoMissed } = dose;
  const recorded = dose.log !== null && state !== "pending" && state !== "upcoming";

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {state === "taken" || state === "late" ? (
        <Button variant="quiet" onClick={onMissed} disabled={busy} className="flex-1 sm:flex-none">
          <X aria-hidden className="h-4 w-4" />
          <span lang="hi">छूटी में बदलें</span>
        </Button>
      ) : (
        <>
          <Button variant="primary" onClick={onTaken} loading={busy} className="flex-1 sm:flex-none">
            <Check aria-hidden className="h-4 w-4" />
            <span lang="hi">{state === "missed" ? "ली थी — दर्ज करें" : "ली गई"}</span>
          </Button>
          {!autoMissed && state !== "missed" ? (
            <Button variant="quiet" onClick={onMissed} disabled={busy} className="flex-1 sm:flex-none">
              <X aria-hidden className="h-4 w-4" />
              <span lang="hi">छूट गई</span>
            </Button>
          ) : null}
        </>
      )}
      {recorded ? (
        <Button variant="ghost" onClick={onUndo} disabled={busy} aria-label="एंट्री हटाएँ (Undo)">
          <RotateCcw aria-hidden className="h-4 w-4" />
          <span lang="hi">पूर्ववत करें</span>
        </Button>
      ) : null}
    </div>
  );
}
