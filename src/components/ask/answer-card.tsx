"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Bot,
  Copy,
  ExternalLink,
  Globe,
  ListChecks,
  Phone,
  Share2,
  ShieldCheck,
  Stethoscope,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { TextArea } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { EvidenceItem, Recommendation, RecommendationKind, SoieAnswer } from "@/services/soie/types";

const KIND_ORDER: RecommendationKind[] = ["urgent", "ask_doctor", "monitoring", "diet", "lifestyle"];
const KIND_LABEL: Record<RecommendationKind, { hi: string; en: string }> = {
  urgent: { hi: "तुरंत करें", en: "Urgent" },
  ask_doctor: { hi: "डॉक्टर से पूछें", en: "Ask the doctor" },
  monitoring: { hi: "नज़र रखें", en: "Track" },
  diet: { hi: "खान-पान", en: "Diet" },
  lifestyle: { hi: "जीवनशैली", en: "Lifestyle" },
};
const BASIS_LABEL = {
  patient_data: { hi: "आपके डेटा से", en: "From your data", variant: "brand" as const },
  guideline: { hi: "गाइडलाइन", en: "Guideline", variant: "info" as const },
  general: { hi: "सामान्य", en: "General", variant: "neutral" as const },
};
const METRIC_HI: Record<string, string> = { bp: "BP", pulse: "नब्ज़", weight: "वज़न", food: "खाना", sleep: "नींद", steps: "कदम", medicine: "दवा" };
const CONF_LABEL = {
  high: { hi: "भरोसा: ज़्यादा", variant: "positive" as const },
  medium: { hi: "भरोसा: मध्यम", variant: "attention" as const },
  low: { hi: "भरोसा: कम", variant: "neutral" as const },
};

function chipText(e: EvidenceItem): string {
  const t = e.kind === "record" ? `${e.label} · ${e.date ?? ""}` : e.label;
  return t.length > 30 ? `${t.slice(0, 29)}…` : t;
}

function coverageLine(a: SoieAnswer): string {
  const { range, n, metrics } = a.data_coverage;
  const when = range.from === range.to ? range.from : `${range.from} से ${range.to}`;
  const what = metrics.length ? metrics.map((m) => METRIC_HI[m] ?? m).join(", ") : "डेटा";
  return `${when} · ${what} · ${n} रिकॉर्ड`;
}

export function answerAsText(a: SoieAnswer, lang: "hi" | "en"): string {
  const body = lang === "hi" ? a.answer_hi : a.answer_en;
  const recs = a.recommendations.map((r) => `- ${r.text}`).join("\n");
  const src = a.sources.map((s) => `- ${s.publisher}: ${s.title} ${s.url}`).join("\n");
  return [a.headline, "", body, recs ? `\n${recs}` : "", src ? `\nसूत्र / Sources:\n${src}` : "", "\n(SwasthTrack SOIE: यह सामान्य जानकारी है, डॉक्टर की सलाह का विकल्प नहीं।)"].filter((x) => x !== "").join("\n");
}

export function EvidenceChip({ item, onOpen }: { item: EvidenceItem; onOpen: (e: EvidenceItem) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={`प्रमाण देखें: ${item.label}`}
      className="pressable inline-flex min-h-9 max-w-full items-center gap-1 rounded-full border border-line bg-surface-sunken px-3 text-xs font-medium text-ink-muted hover:border-brand-line hover:bg-brand-softer hover:text-brand-ink"
    >
      <ListChecks aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{chipText(item)}</span>
    </button>
  );
}

export function EvidenceModal({ item, onClose }: { item: EvidenceItem | null; onClose: () => void }) {
  return (
    <Modal isOpen={item !== null} onClose={onClose} title="प्रमाण" hindiTitle="Evidence" description="यह संख्या इन दर्ज आँकड़ों से कोड ने निकाली है, AI ने नहीं।" size="sm">
      {item ? (
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs text-ink-subtle">{item.kind === "fact" ? "गणना" : "दर्ज एंट्री"}</dt>
            <dd className="font-semibold text-ink">{item.label}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-subtle">मान</dt>
            <dd className="text-ink">{item.valueText}</dd>
          </div>
          {item.window ? (
            <div>
              <dt className="text-xs text-ink-subtle">अवधि</dt>
              <dd className="text-ink">{item.window}</dd>
            </div>
          ) : null}
          {item.date ? (
            <div>
              <dt className="text-xs text-ink-subtle">तारीख़ / समय (IST)</dt>
              <dd className="text-ink">{item.date}</dd>
            </div>
          ) : null}
          {item.n !== undefined ? (
            <div>
              <dt className="text-xs text-ink-subtle">कितने रिकॉर्ड पर आधारित</dt>
              <dd className="text-ink">{item.n}</dd>
            </div>
          ) : null}
          <p className="rounded-field bg-surface-sunken p-2.5 text-2xs text-ink-subtle">संदर्भ: {item.ref}</p>
        </dl>
      ) : null}
    </Modal>
  );
}

function RecGroup({ kind, recs }: { kind: RecommendationKind; recs: Recommendation[] }) {
  const urgent = kind === "urgent";
  return (
    <div className={cn("rounded-card border p-3", urgent ? "border-critical-line bg-critical-soft" : "border-line bg-surface-sunken")}>
      <p className={cn("mb-2 text-xs font-semibold", urgent ? "text-critical" : "text-ink-muted")}>
        <span lang="hi">{KIND_LABEL[kind].hi}</span> <span className="font-normal text-ink-subtle">· {KIND_LABEL[kind].en}</span>
      </p>
      <ul className="space-y-2.5">
        {recs.map((r, i) => (
          <li key={i} className="text-sm text-ink">
            <p lang="hi" className="leading-relaxed">
              {r.text}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant={BASIS_LABEL[r.basis].variant}>
                <span lang="hi">{BASIS_LABEL[r.basis].hi}</span>
              </Badge>
              {r.source_urls.map((u) => (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-2xs font-medium text-info underline underline-offset-2">
                  <ExternalLink aria-hidden className="h-3 w-3" />
                  स्रोत
                </a>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EmergencyCard({ answer }: { answer: SoieAnswer }) {
  const [lang, setLang] = useState<"hi" | "en">("hi");
  const text = lang === "hi" ? answer.answer_hi : answer.answer_en;
  return (
    <Card className="border-2 border-critical bg-critical-soft" role="alert" aria-live="assertive">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-control bg-critical text-ink-inverse">
          <AlertTriangle aria-hidden className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p lang="hi" className="text-xl font-bold leading-tight text-critical">
            तुरंत 112 / 108 पर कॉल करें
          </p>
          <p className="text-sm text-ink-muted">Call 112 / 108 now. Do not wait for this app.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <a href="tel:112" className="pressable flex min-h-14 items-center justify-center gap-2 rounded-control bg-critical px-4 text-lg font-bold text-ink-inverse shadow-e2">
          <Phone aria-hidden className="h-5 w-5" />
          112 कॉल करें
        </a>
        <a href="tel:108" className="pressable flex min-h-14 items-center justify-center gap-2 rounded-control border-2 border-critical bg-surface px-4 text-lg font-bold text-critical">
          <Phone aria-hidden className="h-5 w-5" />
          108 एम्बुलेंस
        </a>
      </div>
      <div className="mt-4">
        <Segmented
          ariaLabel="भाषा / Language"
          size="sm"
          value={lang}
          onChange={setLang}
          options={[
            { value: "hi", label: "हिन्दी" },
            { value: "en", label: "English" },
          ]}
        />
        <p lang={lang} className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">
          {text}
        </p>
      </div>
      <p className="mt-3 text-2xs text-ink-muted">यह जवाब पहले से तय सुरक्षा नियमों से आया है, AI से नहीं।</p>
    </Card>
  );
}

export interface AnswerCardProps {
  answer: SoieAnswer;
  feedback?: "helpful" | "not_helpful";
  canRate: boolean;
  onFeedback: (rating: "helpful" | "not_helpful", comment: string | null) => void;
  onAsk: (q: string) => void;
}

export function AnswerCard({ answer, feedback, canRate, onFeedback, onAsk }: AnswerCardProps) {
  const [lang, setLang] = useState<"hi" | "en">("hi");
  const [open, setOpen] = useState<EvidenceItem | null>(null);
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState("");
  const toast = useToast();

  const evidence = useMemo(() => new Map(answer.evidence.map((e) => [e.ref, e])), [answer.evidence]);
  const grouped = useMemo(() => KIND_ORDER.map((k) => ({ kind: k, recs: answer.recommendations.filter((r) => r.kind === k) })).filter((g) => g.recs.length > 0), [answer.recommendations]);

  if (answer.engine === "safety") return <EmergencyCard answer={answer} />;

  const engineBadge =
    answer.engine === "ai"
      ? answer.webSearchUsed
        ? { label: "AI + इंटरनेट", variant: "gold" as const, icon: Globe }
        : { label: "AI", variant: "brand" as const, icon: Bot }
      : { label: "नियम-आधारित", variant: "neutral" as const, icon: ShieldCheck };
  const text = lang === "hi" ? answer.answer_hi : answer.answer_en;
  const conf = CONF_LABEL[answer.confidence];
  // Rule-engine answers often open with the headline verbatim; showing both reads as a stutter.
  const stripEnd = (value: string) => value.trim().replace(/[।.\s]+$/, "");
  const headlineRepeatsBody = stripEnd(text).startsWith(stripEnd(answer.headline));

  async function copy() {
    try {
      await navigator.clipboard.writeText(answerAsText(answer, lang));
      toast({ title: "कॉपी हो गया", tone: "success" });
    } catch {
      toast({ title: "कॉपी नहीं हो सका", tone: "error" });
    }
  }
  async function share() {
    const payload = answerAsText(answer, lang);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "SwasthTrack", text: payload });
        return;
      } catch {
        return; // user dismissed the share sheet
      }
    }
    await copy();
  }

  const EngineIcon = engineBadge.icon;
  return (
    <Card tone="premium" className="space-y-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={engineBadge.variant}>
          <EngineIcon aria-hidden className="h-3 w-3" />
          <span lang="hi">{engineBadge.label}</span>
        </Badge>
        <Badge variant={conf.variant}>
          <span lang="hi">{conf.hi}</span>
        </Badge>
        {answer.validation === "passed" || answer.validation === "repaired" ? (
          <Badge variant="positive">
            <ShieldCheck aria-hidden className="h-3 w-3" />
            <span lang="hi">आँकड़े जाँचे गए</span>
          </Badge>
        ) : null}
        <div className="ml-auto">
          <Segmented
            ariaLabel="भाषा / Language"
            size="sm"
            value={lang}
            onChange={setLang}
            options={[
              { value: "hi", label: "हिन्दी" },
              { value: "en", label: "English" },
            ]}
          />
        </div>
      </div>

      {answer.notices.map((n) => (
        <div key={n.code} className={cn("rounded-field border px-3 py-2 text-xs leading-relaxed", n.tone === "attention" ? "border-attention-line bg-attention-soft text-attention" : "border-info-line bg-info-soft text-info")}>
          <p lang={lang}>{lang === "hi" ? n.hi : n.en}</p>
        </div>
      ))}

      {answer.needs_doctor ? (
        <div className="flex items-start gap-2 rounded-field border border-attention-line bg-attention-soft px-3 py-2.5 text-sm text-attention" role="note">
          <Stethoscope aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <p lang="hi" className="font-medium">
            डॉक्टर से बात करना ज़रूरी है / Please speak to the doctor.
          </p>
        </div>
      ) : null}

      <div>
        {headlineRepeatsBody ? null : (
          <h3 lang="hi" className="text-lg font-semibold leading-snug text-ink">
            {answer.headline}
          </h3>
        )}
        <p
          lang={lang}
          className={cn(
            "whitespace-pre-line leading-relaxed text-ink",
            headlineRepeatsBody ? "text-base font-medium" : "mt-2 text-base",
          )}
        >
          {text}
        </p>
      </div>

      {answer.key_points.length > 0 ? (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">मुख्य बातें · Key points</h4>
          <ul className="space-y-3">
            {answer.key_points.map((k, i) => {
              const items = k.fact_refs.map((r) => evidence.get(r)).filter((e): e is EvidenceItem => Boolean(e));
              return (
                <li key={i} className="rounded-field border border-line bg-surface p-3">
                  <p lang="hi" className="text-sm leading-relaxed text-ink">
                    {k.text}
                  </p>
                  {items.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {items.slice(0, 5).map((e) => (
                        <EvidenceChip key={e.ref} item={e} onOpen={setOpen} />
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {answer.numbers.length > 0 ? (
        <ul className="divide-y divide-line rounded-field border border-line" aria-label="मुख्य आँकड़े">
          {answer.numbers.map((n, i) => {
            const ev = evidence.get(n.ref);
            return (
              <li key={i} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2 text-sm">
                <span className="min-w-0 text-ink-muted">{n.label}</span>
                <span className="tabular font-semibold text-ink">
                  {n.value} <span className="font-normal text-ink-subtle">{n.unit}</span>
                </span>
                {ev ? (
                  <span className="basis-full sm:basis-auto">
                    <EvidenceChip item={ev} onOpen={setOpen} />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {grouped.length > 0 ? (
        <div className="space-y-2.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">क्या करें · What to do</h4>
          {grouped.map((g) => (
            <RecGroup key={g.kind} kind={g.kind} recs={g.recs} />
          ))}
        </div>
      ) : null}

      {answer.sources.length > 0 ? (
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            <BookOpen aria-hidden className="h-3.5 w-3.5" />
            स्रोत · Sources
          </h4>
          <ul className="space-y-1.5">
            {answer.sources.map((s) => (
              <li key={s.url} className="text-sm">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 text-info underline underline-offset-2">
                  <ExternalLink aria-hidden className="mt-1 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <span className="font-semibold">{s.publisher}</span>: {s.title}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="rounded-field bg-surface-sunken px-3 py-2 text-xs text-ink-muted" lang="hi">
        जिस डेटा पर यह जवाब टिका है: {coverageLine(answer)}
      </p>

      {answer.follow_up_questions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {answer.follow_up_questions.map((q) => (
            <Button key={q} size="sm" variant="secondary" onClick={() => onAsk(q)}>
              <span lang="hi" className="whitespace-normal text-left">
                {q}
              </span>
            </Button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Button size="sm" variant="quiet" onClick={copy}>
          <Copy aria-hidden className="h-4 w-4" />
          कॉपी
        </Button>
        <Button size="sm" variant="quiet" onClick={share}>
          <Share2 aria-hidden className="h-4 w-4" />
          शेयर
        </Button>
        {canRate ? (
          <div className="ml-auto flex items-center gap-1.5" role="group" aria-label="क्या यह जवाब काम का था?">
            <Button size="sm" variant={feedback === "helpful" ? "primary" : "quiet"} aria-pressed={feedback === "helpful"} aria-label="काम का था" onClick={() => onFeedback("helpful", null)}>
              <ThumbsUp aria-hidden className="h-4 w-4" />
            </Button>
            <Button size="sm" variant={feedback === "not_helpful" ? "danger" : "quiet"} aria-pressed={feedback === "not_helpful"} aria-label="काम का नहीं था" onClick={() => setCommenting(true)}>
              <ThumbsDown aria-hidden className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>

      <EvidenceModal item={open} onClose={() => setOpen(null)} />
      <Modal
        isOpen={commenting}
        onClose={() => setCommenting(false)}
        title="क्या ठीक नहीं था?"
        hindiTitle="Feedback"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCommenting(false)}>
              रद्द करें
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                onFeedback("not_helpful", comment);
                setCommenting(false);
                setComment("");
              }}
            >
              भेजें
            </Button>
          </div>
        }
      >
        <label htmlFor="soie-fb" className="mb-1.5 block text-sm font-medium text-ink">
          अपनी बात लिखें (वैकल्पिक)
        </label>
        <TextArea id="soie-fb" value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} placeholder="जैसे: जवाब बहुत लंबा था / दवा वाला हिस्सा साफ़ नहीं था" />
        <p className="mt-2 text-xs text-ink-subtle">आपके फीडबैक और सेव की गई बातें अगले जवाबों में इस्तेमाल होती हैं।</p>
      </Modal>
    </Card>
  );
}
