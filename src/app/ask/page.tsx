"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BookMarked, Globe, History, MessageSquarePlus, ShieldCheck, Sparkles } from "lucide-react";
import { AnswerCard } from "@/components/ask/answer-card";
import { Composer } from "@/components/ask/composer";
import { MemoriesManager } from "@/components/ask/memories-manager";
import { ProgressCard } from "@/components/ask/progress";
import { SessionDrawer } from "@/components/ask/session-drawer";
import { TracePanel } from "@/components/ask/trace-panel";
import { saveFeedback, useSoie, type AssistantMsg, type ErrorMsg } from "@/components/ask/use-soie";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form-field";
import { EmptyState, PageBody, PageHeader } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/context/auth-context";
import { authFetch } from "@/lib/supabase/auth-fetch";
import { cn } from "@/lib/utils";

const QUICK_PROMPTS = [
  "आज का हाल बताइए",
  "पिछले 7 दिन का औसत BP क्या रहा?",
  "पिछले हफ़्ते से क्या बदला?",
  "इस हफ़्ते दवा पालन कैसा रहा?",
  "कल खाने में क्या दर्ज है?",
  "BP कम रखने के लिए खाने में क्या बदलाव करें?",
  "पिछले 14 दिन की नींद कैसी रही?",
  "वज़न लक्ष्य से कितना दूर है?",
];

interface EngineInfo {
  ai: boolean;
  webSearch: boolean;
  model: string | null;
}

function ErrorBanner({ m }: { m: ErrorMsg }) {
  const tone = m.kind === "rate_limited" ? "attention" : "critical";
  return (
    <div
      role="alert"
      className={cn("rounded-card border px-4 py-3 text-sm", tone === "attention" ? "border-attention-line bg-attention-soft text-attention" : "border-critical-line bg-critical-soft text-critical")}
    >
      <p lang="hi" className="font-medium">
        {m.text}
      </p>
      {m.kind === "auth" ? (
        <Link href="/login" className="mt-1 inline-block underline">
          साइन इन करें
        </Link>
      ) : null}
    </div>
  );
}

export default function AskPage() {
  const { profile, loading, activePatientId, authorizedPatients, setActivePatientId, canWrite, memberRole } = useAuth();
  const isAdmin = profile?.role === "admin";
  const toast = useToast();
  const chat = useSoie(activePatientId);
  const [engine, setEngine] = useState<EngineInfo | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [memoriesOpen, setMemoriesOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.messages.length, chat.sending]);

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

  return (
    <PageBody>
      <PageHeader
        eyebrow="SOIE"
        title="Ask SwasthTrack"
        hindiTitle="डेटा से पूछें"
        description="आपके दर्ज किए आँकड़ों से सीधा जवाब। आँकड़े कोड से गिने जाते हैं और हर जवाब में उनका प्रमाण दिखता है।"
        actions={
          <>
            <IconButton aria-label="नई बातचीत" onClick={chat.reset} disabled={noPatient}>
              <MessageSquarePlus aria-hidden className="h-5 w-5" />
            </IconButton>
            <IconButton aria-label="पुरानी बातचीत" onClick={() => setHistoryOpen(true)} disabled={noPatient}>
              <History aria-hidden className="h-5 w-5" />
            </IconButton>
            <IconButton aria-label="सेव की गई बातें" onClick={() => setMemoriesOpen(true)} disabled={noPatient}>
              <BookMarked aria-hidden className="h-5 w-5" />
            </IconButton>
          </>
        }
      />

      <div className="flex min-h-[calc(100dvh-15rem)] flex-col gap-4">
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

        {engine ? (
          engine.ai ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              <Badge variant={engine.webSearch ? "gold" : "brand"}>
                {engine.webSearch ? <Globe aria-hidden className="h-3 w-3" /> : <Sparkles aria-hidden className="h-3 w-3" />}
                <span lang="hi">{engine.webSearch ? "AI + इंटरनेट खोज चालू" : "AI चालू · इंटरनेट खोज बंद"}</span>
              </Badge>
              <span lang="hi">हर आँकड़ा जवाब देने से पहले आपके डेटा से मिलाकर जाँचा जाता है।</span>
            </div>
          ) : (
            <Card tone="sunken" className="flex items-start gap-2.5 text-sm text-ink-muted">
              <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" />
              <p lang="hi">AI अभी चालू नहीं है (सर्वर पर API कुंजी सेट नहीं है)। जवाब नियम-आधारित इंजन से आएँगे: सिर्फ़ आपके दर्ज आँकड़ों से, बिना इंटरनेट खोज के और खुले सवालों की सलाह के बिना।</p>
            </Card>
          )
        ) : null}

        {noPatient ? (
          <EmptyState title="No patient yet" hindiTitle="अभी कोई मरीज़ नहीं जुड़ा है" description="पहले मरीज़ की प्रोफाइल बनाइए या कोड से जुड़िए, फिर यहाँ पूछ सकेंगे।" action={<Link href="/onboarding"><Button variant="primary">मरीज़ जोड़ें</Button></Link>} />
        ) : chat.messages.length === 0 && !chat.sending ? (
          <Card className="space-y-4">
            <div>
              <h2 lang="hi" className="text-lg font-semibold text-ink">
                क्या जानना है?
              </h2>
              <p lang="hi" className="mt-1 text-sm text-ink-muted">
                BP, वज़न, खाना, नींद, कदम और दवाइयों के बारे में पूछिए। खान-पान या जीवनशैली की समस्या पर AI चालू हो तो इंटरनेट से भरोसेमंद स्रोत देखकर योजना भी बताएगा।
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((q) => (
                <Button key={q} size="sm" variant="secondary" onClick={() => chat.send(q)}>
                  <span lang="hi" className="whitespace-normal text-left">
                    {q}
                  </span>
                </Button>
              ))}
            </div>
            <p lang="hi" className="rounded-field bg-surface-sunken px-3 py-2 text-xs text-ink-subtle">
              आपके फीडबैक और सेव की गई बातें अगले जवाबों में इस्तेमाल होती हैं।
            </p>
          </Card>
        ) : (
          <div role="log" aria-label="बातचीत" className="space-y-4">
            {chat.messages.map((m) => {
              if (m.role === "user") {
                return (
                  <div key={m.id} className="flex justify-end">
                    <p lang="hi" className="max-w-[85%] whitespace-pre-line rounded-card rounded-br-sm border border-brand-line bg-brand-soft px-4 py-2.5 text-base text-brand-ink">
                      {m.text}
                    </p>
                  </div>
                );
              }
              if (m.role === "error") return <ErrorBanner key={m.id} m={m} />;
              return (
                <div key={m.id} className="space-y-2">
                  <AnswerCard answer={m.answer} feedback={m.feedback} canRate={m.status !== "stored" || Boolean(m.messageId)} onFeedback={(r, c) => rate(m, r, c)} onAsk={chat.send} />
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

        <div ref={endRef} />
        {/* A direct child of the column so `sticky` has the whole column as its containing block. */}
        <Composer className="mt-auto" disabled={noPatient || loading} sending={chat.sending} onSend={chat.send} onCancel={chat.cancel} />
      </div>

      <SessionDrawer isOpen={historyOpen} onClose={() => setHistoryOpen(false)} patientId={activePatientId} activeId={chat.sessionId} onOpen={chat.loadSession} onNew={chat.reset} />
      <MemoriesManager isOpen={memoriesOpen} onClose={() => setMemoriesOpen(false)} patientId={activePatientId} canWrite={canWrite && memberRole !== "viewer"} />
    </PageBody>
  );
}
