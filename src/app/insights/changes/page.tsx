"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HeartPulse,
  HelpCircle,
  Info,
  Minus,
  Moon,
  Scale,
  Sparkles,
  UserCheck,
  Utensils,
} from "lucide-react";
import { NoPatientState } from "@/components/health/no-patient-state";
import { isNoPatientError, loadErrorMessage, useAsyncData } from "@/components/health/use-async-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, metricChipClasses, type MetricTone } from "@/components/ui/card";
import { EmptyState, ErrorState, PageBody, PageHeader } from "@/components/ui/page";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";
import { getHealthChanges, type HealthChangesResult, type TrendDirection } from "@/services/what-changed-service";

type Period = "7d" | "30d";

const METRIC_STYLE: Record<string, { icon: typeof Activity; tone: MetricTone }> = {
  daily_steps: { icon: Activity, tone: "activity" },
  sleep_duration: { icon: Moon, tone: "sleep" },
  systolic_bp: { icon: HeartPulse, tone: "bp" },
  body_weight: { icon: Scale, tone: "weight" },
  food_consistency: { icon: Utensils, tone: "food" },
  medicine_adherence: { icon: CheckCircle2, tone: "meds" },
};

const PERIOD_OPTIONS: SegmentedOption<Period>[] = [
  { value: "7d", label: "7 days", hindiLabel: "7 दिन बनाम पिछले 7" },
  { value: "30d", label: "30 days", hindiLabel: "30 दिन बनाम पिछले 30" },
];

const DIR_ICON: Record<TrendDirection, typeof ArrowUpRight> = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  stable: Minus,
};

export default function HealthChangesPage() {
  const { activePatientId, authorizedPatients, loading: authLoading } = useAuth();
  const [period, setPeriod] = useState<Period>("7d");
  const [showExplanation, setShowExplanation] = useState(false);
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const [caregiverMode, setCaregiverMode] = useState(false);

  const patientName = authorizedPatients.find((p) => p.id === activePatientId)?.name ?? "मरीज़";

  const { data, error, loading, reload } = useAsyncData<HealthChangesResult>(
    () => getHealthChanges(activePatientId!, period),
    [activePatientId, period],
    activePatientId !== null,
  );

  const header = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="inline-flex min-h-control items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink">
          <ArrowLeft aria-hidden className="h-4 w-4" />
          डैशबोर्ड पर लौटें
        </Link>
        <Button variant={caregiverMode ? "primary" : "secondary"} size="sm" aria-pressed={caregiverMode} onClick={() => setCaregiverMode((v) => !v)}>
          <UserCheck aria-hidden className="h-4 w-4" />
          {caregiverMode ? "केयरगिवर सारांश चालू" : "केयरगिवर सारांश देखें"}
        </Button>
      </div>
      <PageHeader
        eyebrow="Health comparison"
        title="What changed?"
        hindiTitle="स्वास्थ्य में क्या बदला?"
        description="हाल के रिकॉर्ड की तुलना उससे ठीक पहले की उतनी ही अवधि से। यह निदान नहीं, सिर्फ़ आपके अपने आँकड़ों का अवलोकन है।"
      />
      <Segmented options={PERIOD_OPTIONS} value={period} onChange={setPeriod} ariaLabel="Comparison period — तुलना की अवधि" />
    </>
  );

  if (!authLoading && activePatientId === null) {
    return (
      <PageBody>
        {header}
        <NoPatientState what="बदलावों की तुलना" />
      </PageBody>
    );
  }

  if (error) {
    return (
      <PageBody>
        {header}
        {isNoPatientError(error) ? (
          <NoPatientState what="बदलावों की तुलना" />
        ) : (
          <ErrorState
            title="तुलना लोड नहीं हो पाई"
            englishTitle="The comparison could not be loaded"
            description={loadErrorMessage(error)}
            onRetry={reload}
          />
        )}
      </PageBody>
    );
  }

  if (authLoading || loading || !data) {
    return (
      <PageBody>
        {header}
        <div aria-busy="true" aria-label="लोड हो रहा है" className="space-y-4">
          <div className="skeleton h-28 rounded-panel" />
          <div className="skeleton h-40 rounded-panel" />
          <div className="skeleton h-40 rounded-panel" />
        </div>
      </PageBody>
    );
  }

  const noReference = data.metrics.every((m) => !m.hasReference);

  return (
    <PageBody>
      {header}

      {!data.dataSufficiency.isSufficient ? (
        <EmptyState
          icon={Info}
          title={data.dataSufficiency.reasonHi || "अभी तुलना के लिए पर्याप्त रिकॉर्ड नहीं हैं"}
          hindiTitle="Not enough history yet"
          description="सटीक तुलना के लिए कुछ हफ़्ते नियमित रूप से भोजन, BP, कदम और दवाइयाँ दर्ज करते रहें।"
        />
      ) : (
        <div className="space-y-5">
          {caregiverMode ? (
            <Card className="border-info-line bg-info-soft">
              <h2 className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-info">
                <UserCheck aria-hidden className="h-4 w-4" />
                केयरगिवर सारांश: {patientName} में क्या बदला?
              </h2>
              <p lang="hi" className="text-sm leading-relaxed text-ink">
                {data.caregiverSummaryHi}
              </p>
            </Card>
          ) : null}

          <Card tone="premium">
            <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control border border-gold-line bg-gold-soft text-gold-ink">
                  <Sparkles aria-hidden className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 lang="hi" className="text-base font-semibold text-ink sm:text-lg">
                    मुख्य बदलावों का सारांश
                  </h2>
                  <p className="text-xs text-ink-subtle">
                    हाल की अवधि: {data.dateRange.recentStart} से {data.dateRange.recentEnd} · तुलना: {data.dateRange.referenceStart} से {data.dateRange.referenceEnd}
                  </p>
                </div>
              </div>
              <Button
                variant="quiet"
                size="sm"
                aria-expanded={showExplanation}
                onClick={() => setShowExplanation((v) => !v)}
              >
                <HelpCircle aria-hidden className="h-3.5 w-3.5" />
                तुलना का आधार
                {showExplanation ? <ChevronUp aria-hidden className="h-3.5 w-3.5" /> : <ChevronDown aria-hidden className="h-3.5 w-3.5" />}
              </Button>
            </div>

            {showExplanation ? (
              <div className="mt-3.5 space-y-1.5 rounded-card border border-info-line bg-info-soft p-3.5 text-xs text-ink-muted">
                <p className="flex items-center gap-1.5 font-semibold text-info">
                  <Info aria-hidden className="h-4 w-4 shrink-0" />
                  तुलना कैसे होती है
                </p>
                <p lang="hi" className="leading-relaxed">
                  • एक दिन के अजीब आँकड़े का असर कम करने के लिए औसत की जगह मध्यमान (median) लिया जाता है।
                  <br />• हाल की अवधि की तुलना उससे ठीक पहले की उतनी ही लंबी अवधि से होती है।
                  <br />• यह निदान नहीं है, सिर्फ़ आपके अपने रिकॉर्ड का अवलोकन है।
                </p>
              </div>
            ) : null}

            <div className="mt-4 rounded-card border border-line bg-surface p-3.5">
              <pre lang="hi" className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">
                {data.compactSummaryHi}
              </pre>
            </div>

            {noReference ? (
              <p lang="hi" className="mt-3 text-xs text-ink-subtle">
                पिछली अवधि का रिकॉर्ड न होने से अभी असली तुलना नहीं हो सकी, इसलिए &ldquo;स्थिर&rdquo; या &ldquo;बदलाव&rdquo; जैसा कुछ नहीं कहा जा रहा।
              </p>
            ) : data.rankedKeyChanges.length === 0 ? (
              <p lang="hi" className="mt-3 text-xs text-ink-subtle">
                जिन मापों की तुलना हो सकी, उनमें कोई बड़ा बदलाव नहीं दिखा।
              </p>
            ) : null}
          </Card>

          <ul className="grid gap-3.5 sm:grid-cols-2">
            {data.metrics.map((m) => {
              const style = METRIC_STYLE[m.metric] ?? { icon: Activity, tone: "neutral" as MetricTone };
              const Icon = style.icon;
              const isExpanded = expandedMetric === m.metric;
              const comparable = m.isSufficient && m.hasReference;
              const DirIcon = DIR_ICON[m.direction];

              return (
                <li key={m.metric}>
                  <button
                    type="button"
                    disabled={!comparable}
                    aria-expanded={comparable ? isExpanded : undefined}
                    onClick={() => setExpandedMetric(isExpanded ? null : m.metric)}
                    className={cn(
                      "pressable w-full rounded-card border bg-surface p-4 text-left shadow-e1",
                      comparable ? "cursor-pointer border-line hover:shadow-e2" : "cursor-default border-line bg-surface-sunken shadow-none",
                    )}
                  >
                    <div className="mb-2.5 flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-control", metricChipClasses[style.tone])}>
                          <Icon aria-hidden className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <h3 lang="hi" className="text-sm font-semibold text-ink sm:text-base">
                            {m.metricHi}
                          </h3>
                          <span lang="hi" className="text-xs text-ink-subtle">
                            {m.dataPoints} रिकॉर्ड · {m.confidenceLabelHi}
                          </span>
                        </div>
                      </div>

                      {comparable ? (
                        <Badge variant={m.direction === "stable" ? "neutral" : "info"}>
                          <DirIcon aria-hidden className="h-3 w-3" />
                          <span lang="hi">{m.directionLabelHi}</span>
                        </Badge>
                      ) : (
                        <Badge variant="neutral">
                          <span lang="hi">{m.isSufficient ? "पिछला रिकॉर्ड नहीं" : "डेटा कम है"}</span>
                        </Badge>
                      )}
                    </div>

                    {comparable ? (
                      <div className="space-y-2">
                        <p lang="hi" className="text-sm leading-snug text-ink">
                          {m.explanationHi}
                        </p>
                        <div className="flex flex-wrap items-center justify-between gap-1 border-t border-line pt-2 text-xs text-ink-muted">
                          {m.personalPatternRange ? <span lang="hi">सामान्य दायरा: {m.personalPatternRange}</span> : <span />}
                          <span className="text-ink-subtle">{isExpanded ? "विवरण बंद करें" : "विवरण देखें"}</span>
                        </div>

                        {isExpanded ? (
                          <div className="space-y-1.5 border-t border-line pt-3 text-xs text-ink-muted">
                            <div className="grid grid-cols-2 gap-2 rounded-card border border-line bg-surface-sunken p-2.5 text-center">
                              <div>
                                <span lang="hi" className="block text-2xs text-ink-subtle">
                                  हाल का मध्यमान
                                </span>
                                <span className="tabular text-sm font-semibold text-ink">
                                  {m.recentValue.toLocaleString("en-IN")} {m.unit}
                                </span>
                              </div>
                              <div>
                                <span lang="hi" className="block text-2xs text-ink-subtle">
                                  पिछली अवधि का मध्यमान
                                </span>
                                <span className="tabular text-sm font-semibold text-ink">
                                  {m.referenceValue.toLocaleString("en-IN")} {m.unit}
                                </span>
                              </div>
                            </div>
                            <p lang="hi" className="tabular text-xs text-ink-subtle">
                              अंतर: {m.difference > 0 ? "+" : ""}
                              {m.difference} {m.unit} ({m.percentChange > 0 ? "+" : ""}
                              {m.percentChange}%)
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p lang="hi" className="rounded-field border border-line bg-surface p-2.5 text-xs text-ink-muted">
                        {m.insufficientReasonHi ||
                          (m.isSufficient
                            ? "तुलना के लिए पिछली अवधि का रिकॉर्ड नहीं है।"
                            : "इस माप के लिए अभी पर्याप्त डेटा नहीं है।")}
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="flex items-start gap-1.5 rounded-card border border-attention-line bg-attention-soft p-4 text-xs text-ink-muted">
            <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-attention" />
            <span lang="hi" className="leading-relaxed">
              यह सिर्फ़ आपके दर्ज आँकड़ों में सांख्यिकीय बदलाव दिखाता है। यह किसी बीमारी की पुष्टि नहीं करता और दवा बदलने की सलाह नहीं देता। किसी भी लक्षण या फ़ैसले के लिए डॉक्टर से बात करें।
            </span>
          </p>
        </div>
      )}
    </PageBody>
  );
}
