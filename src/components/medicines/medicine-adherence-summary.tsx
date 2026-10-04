import { Pill, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { DoseSummary } from "@/hooks/use-medicine-marking";

type MedicineAdherenceSummaryProps = {
  /** Today's doses, from `useMedicineMarking`. */
  summary: DoseSummary;
};

export function MedicineAdherenceSummary({ summary }: MedicineAdherenceSummaryProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
      <Card tone="premium">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Today&apos;s Adherence</p>
              <Badge variant="gold">
                <span lang="hi">आज की नियमितता</span>
              </Badge>
            </div>
            {summary.adherence === null ? (
              <>
                <p className="mt-2 text-4xl font-bold text-ink-subtle" aria-label="अभी कोई खुराक का समय नहीं हुआ">
                  —
                </p>
                <p lang="hi" className="mt-1 text-xs text-ink-muted">
                  {summary.total > 0 ? "आज की पहली खुराक का समय अभी नहीं हुआ" : "कोई सक्रिय दवाई नहीं है"}
                </p>
              </>
            ) : (
              <>
                <p className="tabular mt-2 text-4xl font-bold text-ink">{summary.adherence}%</p>
                <p lang="hi" className="mt-1 text-xs text-ink-muted">
                  आज तक: {summary.done} ली गईं
                  {summary.missed > 0 ? ` · ${summary.missed} छूटीं` : ""}
                  {summary.pending > 0 ? ` · ${summary.pending} दर्ज होना बाकी` : ""}
                  {summary.upcoming > 0 ? ` · ${summary.upcoming} आगे बाकी` : ""}
                </p>
                <p lang="hi" className="mt-0.5 text-2xs text-ink-subtle">
                  प्रतिशत सिर्फ़ दर्ज हो चुकी खुराकों (ली गई या छूटी) पर आधारित है।
                </p>
              </>
            )}
          </div>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-control bg-meds-soft text-meds shadow-xs">
            <Pill aria-hidden className="h-5 w-5" />
          </span>
        </div>
        {summary.adherence !== null ? <ProgressBar className="mt-5" label="नियमितता" value={summary.adherence} /> : null}
      </Card>

      <Card className="flex items-start gap-3 border-info-line bg-info-soft">
        <ShieldCheck aria-hidden className="mt-1 h-5 w-5 shrink-0 text-info" />
        <div>
          <h2 className="font-semibold text-ink">Medication Safety</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
            यहाँ सिर्फ़ वही दर्ज होता है जो परिवार बताता है कि दवाई ली गई या नहीं। यह डॉक्टर की सलाह की जगह नहीं लेता,
            और दवाई या खुराक बदलने का फ़ैसला हमेशा डॉक्टर से पूछकर करें।
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            This records patient-reported adherence only. It does not replace clinical advice or authorise any change in dose.
          </p>
          <p className="mt-3 text-xs font-semibold text-ink">
            <span lang="hi">सक्रिय दवाइयाँ:</span> {summary.total}
          </p>
        </div>
      </Card>
    </div>
  );
}
