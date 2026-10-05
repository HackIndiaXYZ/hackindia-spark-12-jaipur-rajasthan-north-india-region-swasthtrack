"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BookMarked,
  CircleAlert,
  Globe,
  History,
  Leaf,
  MessageSquarePlus,
  Moon,
  Pill,
  RotateCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
  Utensils,
  HeartPulse,
  type LucideIcon,
} from "lucide-react";
import { AnswerCard } from "@/components/ask/answer-card";
import { Composer } from "@/components/ask/composer";
import { MemoriesManager } from "@/components/ask/memories-manager";
import { ProgressCard } from "@/components/ask/progress";
import { SessionDrawer } from "@/components/ask/session-drawer";
import { TracePanel } from "@/components/ask/trace-panel";
import { saveFeedback, useSoie, type AssistantMsg, type ErrorMsg } from "@/components/ask/use-soie";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, metricChipClasses, type MetricTone } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form-field";
import { EmptyState, PageBody, PageHeader } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/context/auth-context";
import { authFetch } from "@/lib/supabase/auth-fetch";
import { cn } from "@/lib/utils";

const QUICK_PROMPTS: Array<{ icon: LucideIcon; tone: MetricTone; text: string }> = [
  { icon: Sparkles, tone: "brand", text: "आज का हाल बताइए" },
  { icon: HeartPulse, tone: "bp", text: "पिछले 7 दिन का औसत BP क्या रहा?" },
  { icon: TrendingUp, tone: "activity", text: "पिछले हफ़्ते से क्या बदला?" },
  { icon: Pill, tone: "meds", text: "इस हफ़्ते दवा पालन कैसा रहा?" },
  { icon: Utensils, tone: "food", text: "कल खाने में क्या दर्ज है?" },
  { icon: Leaf, tone: "brand", text: "BP कम रखने के लिए खाने में क्या बदलाव करें?" },
  { icon: Moon, tone: "sleep", text: "पिछले 14 दिन की नींद कैसी रही?" },
  { icon: Scale, tone: "weight", text: "वज़न लक्ष्य से कितना दूर है?" },
];

interface EngineInfo {
  ai: boolean;
  webSearch: boolean;
  model: string | null;
}

function ErrorBanner({ m, onRetry, busy }: { m: ErrorMsg; onRetry: () => void; busy: boolean }) {
  const soft = m.kind === "rate_limited" || m.kind === "cancelled";
  const canRetry = m.kind !== "auth" && m.kind !== "forbidden" && m.kind !== "rate_limited";
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-card border px-4 py-3 text-sm",
        m.kind === "cancelled"
          ? "border-line bg-surface-sunken text-ink-muted"
          : soft
            ? "border-attention-line bg-attention-soft text-attention"
            : "border-critical-line bg-critical-soft text-critical",
      )}
    >
      <CircleAlert aria-hidden className="h-5 w-5 shrink-0" />
      <p lang="hi" className="min-w-0 flex-1 basis-48 font-medium leading-relaxed">
        {m.text}
      </p>
      <div className="flex items-center gap-2">
        {canRetry ? (
          <Button size="sm" variant="secondary" onClick={onRetry} disabled={busy}>
            <RotateCcw aria-hidden className="h-3.5 w-3.5" />
            <span lang="hi">{m.kind === "cancelled" ? "फिर से पूछें" : "फिर कोशिश करें"}</span>
          </Button>
        ) : null}
        {m.kind === "auth" ? (
          <Link href="/login" className="inline-flex min-h-control items-center text-sm font-semibold underline underline-offset-2">
            <span lang="hi">साइन इन करें</span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function HeaderAction({
  label,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button variant="secondary" size="sm" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="min-w-control">
      <Icon aria-hidden className="h-4 w-4" />
      <span lang="hi" className="hidden md:inline">
        {label}
      </span>
    </Button>
  );
}

function AskSession() {
  const { profile, loading, activePatientId, authorizedPatients, setActivePatientId, canWrite, memberRole } = useAuth();
  const isAdmin = profile?.role === "admin";
  const toast = useToast();
  const chat = useSoie(activePatientId);
  const [engine, setEngine] = useState<EngineInfo | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [memoriesOpen, setMemoriesOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const patientName = authorizedPatients.find((p) => p.id === activePatientId)?.name ?? null;

  // What the server can really do right now (key present? web search on?). Drives the honest engine notice.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await authFetch("/api/soie");
        if (!res.ok) return;
        const json = (await res.json()) as EngineInfo;
        if (live) setEngine(json);
      } catch {
        // leave unknown; the first answer carries its own notice
      }
    })();
    return () => {
      live = false;
    };
  }, [activePatientId]);

  // Follow the conversation, but never yank the empty screen around on first paint.
  const messageCount = chat.messages.length;
  useEffect(() => {
    if (messageCount === 0) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messageCount, chat.sending]);

  async function rate(m: AssistantMsg, rating: "helpful" | "not_helpful", comment: string | null) {
    if (!m.messageId) {
      toast({ title: "फीडबैक सेव नहीं हो सका", description: "यह जवाब सेव नहीं हुआ था।", tone: "error" });
      return;
    }
    const ok = await saveFeedback(m.messageId, rating, comment);
    if (ok) {
      chat.setFeedback(m.id, rating);
      toast({ title: "धन्यवाद, फीडबैक सेव हो गया", tone: "success" });
    } else toast({ title: "फीडबैक सेव नहीं हो सका", tone: "error" });
  }

  const noPatient = !loading && !activePatientId;
  const stage = chat.live?.stage ?? "reading";
  const lastAnswerId = [...chat.messages].reverse().find((m) => m.role === "assistant")?.id;
  const firstName = patientName?.trim().split(/\s+/)[0];

  return (
    <PageBody>
      <PageHeader
        eyebrow="Health assistant"
        title="Ask SwasthTrack"
        hindiTitle="डेटा से पूछें"
        description="आपके दर्ज किए आँकड़ों से सीधा जवाब। आँकड़े कोड से गिने जाते हैं और हर जवाब में उनका प्रमाण दिखता है।"
        actions={
          <>
            <HeaderAction label="नई बातचीत" icon={MessageSquarePlus} onClick={chat.reset} disabled={noPatient} />
            <HeaderAction label="पुरानी बातचीत" icon={History} onClick={() => setHistoryOpen(true)} disabled={noPatient} />
            <HeaderAction label="सेव की गई बातें" icon={BookMarked} onClick={() => setMemoriesOpen(true)} disabled={noPatient} />
          </>
        }
      />

      <div className="flex min-h-[calc(100dvh-16rem)] flex-col gap-4">
        {authorizedPatients.length > 1 ? (
          <Field label="किसके बारे में पूछ रहे हैं?" labelHidden>
            <Select value={activePatientId ?? ""} onChange={(e) => setActivePatientId(e.target.value)} aria-label="मरीज़ चुनें">
              {authorizedPatients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {authorizedPatients.length === 1 && patientName ? (
          <p className="flex items-center gap-1.5 text-sm text-ink-muted">
            <UserRound aria-hidden className="h-4 w-4" />
            <span lang="hi">किसके बारे में पूछ रहे हैं:</span>
            <span className="font-semibold text-ink">{patientName}</span>
          </p>
        ) : null}

        {engine ? (
          engine.ai ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-muted">
              <Badge variant={engine.webSearch ? "gold" : "brand"}>
                {engine.webSearch ? <Globe aria-hidden className="h-3 w-3" /> : <Sparkles aria-hidden className="h-3 w-3" />}
                <span lang="hi">{engine.webSearch ? "AI + इंटरनेट खोज चालू" : "AI चालू · इंटरनेट खोज बंद"}</span>
              </Badge>
              <span lang="hi">हर आँकड़ा जवाब देने से पहले आपके डेटा से मिलाकर जाँचा जाता है।</span>
            </div>
          ) : (
            <Card tone="sunken" className="flex items-start gap-2.5 text-sm text-ink-muted">
              <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
              <p lang="hi">AI अभी चालू नहीं है (सर्वर पर API कुंजी सेट नहीं है)। जवाब नियम-आधारित इंजन से आएँगे: सिर्फ़ आपके दर्ज आँकड़ों से, बिना इंटरनेट खोज के और खुले सवालों की सलाह के बिना।</p>
            </Card>
          )
        ) : null}

        {noPatient ? (
          <EmptyState
            icon={UserRound}
            title="No patient yet"
            hindiTitle="अभी कोई मरीज़ नहीं जुड़ा है"
            description="पहले मरीज़ की प्रोफाइल बनाइए या कोड से जुड़िए, फिर यहाँ पूछ सकेंगे।"
            action={
              <Link href="/onboarding">
                <Button variant="primary">मरीज़ जोड़ें</Button>
              </Link>
            }
          />
        ) : chat.messages.length === 0 && !chat.sending ? (
          <Card tone="premium" className="space-y-5">
            <div className="flex items-start gap-3.5">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-card border border-gold-line bg-surface text-gold-ink shadow-gold-button">
                <Sparkles aria-hidden className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <h2 lang="hi" className="text-xl font-semibold leading-snug text-ink">
                  क्या जानना है?
                </h2>
                <p lang="hi" className="mt-1 text-sm text-ink-muted">
                  BP, वज़न, खाना, नींद, कदम और दवाइयों के बारे में पूछिए। खान-पान या जीवनशैली की समस्या पर AI चालू हो तो इंटरनेट से भरोसेमंद स्रोत देखकर योजना भी बताएगा।
                </p>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <span lang="hi">ये पूछकर देखें</span> · Try asking
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {QUICK_PROMPTS.map(({ icon: Icon, tone, text }) => (
                  <li key={text}>
                    <button
                      type="button"
                      onClick={() => void chat.send(text)}
                      className="tile pressable flex min-h-control w-full cursor-pointer items-center gap-3 rounded-card px-3 py-2.5 text-left transition-colors hover:border-gold-line hover:bg-surface"
                    >
                      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-field", metricChipClasses[tone])}>
                        <Icon aria-hidden className="h-4 w-4" />
                      </span>
                      <span lang="hi" className="text-sm font-medium leading-snug text-ink">
                        {text}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <p lang="hi" className="flex items-start gap-2 text-xs text-ink-muted">
              <ShieldCheck aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              आपके फीडबैक और सेव की गई बातें अगले जवाबों में इस्तेमाल होती हैं।
            </p>
          </Card>
        ) : (
          <div role="log" aria-label="बातचीत" className="space-y-4">
            {chat.messages.map((m) => {
              if (m.role === "user") {
                return (
                  <div key={m.id} className="flex justify-end">
                    <p
                      lang="hi"
                      className="surface-lift max-w-[88%] whitespace-pre-line break-words rounded-card rounded-br-sm px-4 py-2.5 text-base text-ink sm:max-w-[75%]"
                    >
                      {m.text}
                    </p>
                  </div>
                );
              }
              if (m.role === "error") return <ErrorBanner key={m.id} m={m} onRetry={chat.retry} busy={chat.sending} />;
              return (
                <div key={m.id} className="space-y-2">
                  <AnswerCard
                    answer={m.answer}
                    featured={m.id === lastAnswerId && !chat.sending}
                    feedback={m.feedback}
                    canRate={m.status !== "stored" || Boolean(m.messageId)}
                    onFeedback={(r, c) => rate(m, r, c)}
                    onAsk={chat.send}
                  />
                  {isAdmin && m.trace ? <TracePanel trace={m.trace} /> : null}
                </div>
              );
            })}
            {chat.sending ? (
              <>
                <ProgressCard stage={stage} tools={chat.liveTools} webSearch={Boolean(engine?.webSearch)} />
                {chat.liveNotices.map((n) => (
                  <p key={n.code} lang="hi" className="rounded-field border border-attention-line bg-attention-soft px-3 py-2 text-xs text-attention">
                    {n.hi}
                  </p>
                ))}
              </>
            ) : null}
          </div>
        )}

        <div ref={endRef} className="scroll-mb-40" aria-hidden />
        {/* A direct child of the column so `sticky` has the whole column as its containing block. */}
        <Composer
          className="mt-auto"
          disabled={noPatient || loading}
          sending={chat.sending}
          onSend={chat.send}
          onCancel={chat.cancel}
          patientFirstName={firstName}
        />
      </div>

      <SessionDrawer
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        patientId={activePatientId}
        activeId={chat.sessionId}
        onOpen={chat.loadSession}
        onNew={chat.reset}
      />
      <MemoriesManager isOpen={memoriesOpen} onClose={() => setMemoriesOpen(false)} patientId={activePatientId} canWrite={canWrite && memberRole !== "viewer"} />
    </PageBody>
  );
}

export default function AskPage() {
  const { activePatientId } = useAuth();
  // Keyed by patient: switching patients starts a clean conversation, so a session
  // that belongs to one patient is never continued for another.
  return <AskSession key={activePatientId ?? "none"} />;
}
