"use client";

import { AlarmClock, Check, Clock, Hourglass, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DOSE_STATE_LABEL, formatMinutes, formatTimeIST, type DoseState } from "@/lib/medicine-format";
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

/**
 * When a dose was recorded, and how far from its schedule: "दर्ज किया: 8:42 am · 12 मि बाद".
 * For a dose nobody touched that ran out of time it says so, and for a dose that is overdue
 * today it warns that taking it now will be recorded as late (decided by the same rule that
 * records it).
 */
export function DoseRecordedAt({ dose, className }: { dose: Dose; className?: string }) {
  const time = dose.log ? formatTimeIST(dose.recordedAt) : null;
  const takenMs = dose.log?.taken_time ? new Date(dose.log.taken_time).getTime() : NaN;
  const diffMin = Number.isFinite(takenMs) ? Math.round((takenMs - dose.scheduledAt.getTime()) / 60_000) : null;

  if (dose.state === "taken" || dose.state === "late") {
    if (!time) return null;
    return (
      <p className={cn("text-xs text-ink-muted", className)}>
        <span lang="hi">दर्ज किया:</span> <span className="tabular font-medium text-ink">{time}</span>
        {diffMin !== null ? (
          <>
            {" · "}
            <span lang="hi" className={cn("tabular", dose.state === "late" && "font-medium text-attention")}>
              {diffMin > 12 * 60
                ? // Entered the next day or later: the stored time is when it was typed in, not when it was taken.
                  "बाद में दर्ज किया गया"
                : Math.abs(diffMin) < 5
                  ? "समय पर"
                  : diffMin > 0
                    ? `निर्धारित से ${formatMinutes(diffMin)} बाद`
                    : `निर्धारित से ${formatMinutes(-diffMin)} पहले`}
            </span>
          </>
        ) : null}
      </p>
    );
  }

  if (dose.state === "missed") {
    return (
      <p lang="hi" className={cn("text-xs text-ink-muted", className)}>
        {dose.autoMissed ? (
          "4 घंटे में कोई एंट्री नहीं हुई, इसलिए छूटी गिनी गई।"
        ) : time ? (
          <>
            छूटी दर्ज की गई: <span className="tabular font-medium text-ink">{time}</span>
          </>
        ) : null}
      </p>
    );
  }

  if (dose.state === "pending") {
    return (
      <p
        lang="hi"
        className={cn("flex items-start gap-x-1.5 text-xs", dose.lateIfTakenNow ? "font-medium text-attention" : "text-ink-muted", className)}
      >
        <AlarmClock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          {dose.overdueMin > 0 ? `निर्धारित समय से ${formatMinutes(dose.overdueMin)} ऊपर` : "समय हो गया"}
          {dose.lateIfTakenNow ? " — अभी ली गई तो ‘देर से’ दर्ज होगी" : ""}
        </span>
      </p>
    );
  }

  return null;
}

type DoseActionsProps = {
  dose: Dose;
  /** Viewers see the state but get no buttons. */
  canWrite: boolean;
  onTaken: () => void;
  onMissed: () => void;
  onUndo: () => void;
  /** Two big side-by-side buttons (the Medicines page); the default is the compact wrapping row. */
  large?: boolean;
  className?: string;
};

/**
 * The only dose controls in the product (dashboard card, Medicines page,
 * quick-mark sheet). Every button is at least 44px tall and does exactly what
 * it says: "taken" records a dose, it never deletes one.
 */
export function DoseActions({ dose, canWrite, onTaken, onMissed, onUndo, large = false, className }: DoseActionsProps) {
  if (!canWrite) return null;
  const { state, busy, autoMissed } = dose;
  const recorded = dose.log !== null && state !== "pending" && state !== "upcoming";
  const size = large ? "lg" : "md";
  const fill = large ? "w-full" : "flex-1 sm:flex-none";
  const showMissed = !autoMissed && state !== "missed";

  return (
    <div className={cn(large ? "grid grid-cols-2 gap-2.5" : "flex flex-wrap gap-2", className)}>
      {state === "taken" || state === "late" ? (
        <Button variant="quiet" size={size} onClick={onMissed} disabled={busy} className={fill}>
          <X aria-hidden className="h-4 w-4" />
          <span lang="hi">छूटी में बदलें</span>
        </Button>
      ) : (
        <>
          <Button
            variant="primary"
            size={size}
            onClick={onTaken}
            loading={busy}
            className={cn(fill, large && !showMissed && !recorded && "col-span-2")}
          >
            <Check aria-hidden className="h-4 w-4" />
            <span lang="hi">{state === "missed" ? "ली थी — दर्ज करें" : "ली गई"}</span>
            {large && state !== "missed" ? <span className="text-xs font-medium opacity-80">Taken</span> : null}
          </Button>
          {showMissed ? (
            <Button variant="quiet" size={size} onClick={onMissed} disabled={busy} className={fill}>
              <X aria-hidden className="h-4 w-4" />
              <span lang="hi">छूट गई</span>
              {large ? <span className="text-xs font-medium opacity-80">Missed</span> : null}
            </Button>
          ) : null}
        </>
      )}
      {recorded ? (
        <Button variant="ghost" size={size} onClick={onUndo} disabled={busy} aria-label={`पूर्ववत करें — ${dose.medicine.medicine_name} की एंट्री हटाएँ (Undo)`} className={large ? "w-full" : undefined}>
          <RotateCcw aria-hidden className="h-4 w-4" />
          <span lang="hi">पूर्ववत करें</span>
        </Button>
      ) : null}
    </div>
  );
}
