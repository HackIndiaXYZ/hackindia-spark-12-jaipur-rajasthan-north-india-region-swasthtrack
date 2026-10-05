import { Check, Clock, Hourglass, Pill, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { DOSE_STATE_LABEL, type DoseState } from "@/lib/medicine-format";
import { cn } from "@/lib/utils";
import type { Dose, DoseSummary } from "@/hooks/use-medicine-marking";

type MedicineAdherenceSummaryProps = {
  /** Today's doses, from `useMedicineMarking`. */
  summary: DoseSummary;
  doses: Dose[];
};

const STATE_TILE: Record<DoseState, { icon: typeof Check; tile: string }> = {
  taken: { icon: Check, tile: "border-positive-line bg-positive-soft text-positive" },
  late: { icon: Hourglass, tile: "border-attention-line bg-attention-soft text-attention" },
  missed: { icon: X, tile: "border-critical-line bg-critical-soft text-critical" },
  pending: { icon: Clock, tile: "border-info-line bg-info-soft text-info" },
  upcoming: { icon: Clock, tile: "border-line bg-surface/70 text-ink-muted" },
};

/** Today at a glance: the adherence figure, and one tile per dose in time order. */
export function MedicineAdherenceSummary({ summary, doses }: MedicineAdherenceSummaryProps) {
  return (
    <Card tone="premium" aria-label="आज की नियमितता" className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Today&apos;s adherence</p>
            <Badge variant="gold" className="bg-surface/70">
              <span lang="hi">आज की नियमितता</span>
            </Badge>
          </div>
          {summary.adherence === null ? (
            <>
              <p className="mt-2 text-4xl font-bold text-ink-muted" aria-label="अभी कोई खुराक का समय नहीं हुआ">
                —
              </p>
              <p lang="hi" className="mt-1 text-xs text-ink-muted">
                {summary.total > 0 ? "आज की पहली खुराक का समय अभी नहीं हुआ" : "कोई सक्रिय दवाई नहीं है"}
              </p>
            </>
          ) : (
            <>
              <p className="tabular mt-2 text-4xl font-bold text-ink">{summary.adherence}%</p>
              <p lang="hi" className="mt-1 text-sm text-ink-muted">
                आज तक: {summary.done} ली गईं
                {summary.late > 0 ? ` (${summary.late} देर से)` : ""}
                {summary.missed > 0 ? ` · ${summary.missed} छूटीं` : ""}
                {summary.pending > 0 ? ` · ${summary.pending} दर्ज होना बाकी` : ""}
                {summary.upcoming > 0 ? ` · ${summary.upcoming} आगे बाकी` : ""}
              </p>
            </>
          )}
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-control bg-surface/80 text-meds shadow-e1 ring-1 ring-gold-line/60">
          <Pill aria-hidden className="h-5 w-5" />
        </span>
      </div>

      {summary.adherence !== null ? <ProgressBar label="नियमितता" value={summary.adherence} /> : null}

      {doses.length > 0 ? (
        <ul aria-label="आज की खुराकें" className="scroll-x -mx-1 flex gap-2 px-1 pb-1">
          {doses.map((dose) => {
            const cfg = STATE_TILE[dose.state];
            const Icon = cfg.icon;
            return (
              <li
                key={dose.medicine.id}
                className={cn("relative min-w-28 flex-1 shrink-0 snap-start rounded-control border px-2.5 py-2", cfg.tile)}
              >
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
                  <span className="tabular text-ink">{dose.scheduledHHMM}</span>
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold text-ink">{dose.medicine.medicine_name}</p>
                <p lang="hi" className="truncate text-xs">
                  {DOSE_STATE_LABEL[dose.state].hi}
                  <span className="sr-only"> ({DOSE_STATE_LABEL[dose.state].en})</span>
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}

      {summary.adherence !== null ? (
        <p lang="hi" className="text-xs text-ink-muted">
          प्रतिशत सिर्फ़ दर्ज हो चुकी खुराकों (ली गई या छूटी) पर आधारित है। देर से ली गई खुराक भी ‘ली गई’ गिनी जाती है।
        </p>
      ) : null}
    </Card>
  );
}

/** The standing disclaimer, kept short and always visible. */
export function MedicationSafetyNote() {
  return (
    <Card tone="sunken" className="flex items-start gap-3 border-info-line bg-info-soft/60 p-3.5 sm:p-4">
      <ShieldCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-info" />
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">
          Medication safety <span lang="hi" className="font-normal text-ink-muted">· दवाई की सुरक्षा</span>
        </h2>
        <p lang="hi" className="mt-1 text-xs leading-relaxed text-ink-muted">
          यहाँ सिर्फ़ वही दर्ज होता है जो परिवार बताता है कि दवाई ली गई या नहीं। यह डॉक्टर की सलाह की जगह नहीं लेता, और
          दवाई या खुराक बदलने का फ़ैसला हमेशा डॉक्टर से पूछकर करें।
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          This records patient-reported adherence only. It does not replace clinical advice or authorise any change in dose.
        </p>
      </div>
    </Card>
  );
}
