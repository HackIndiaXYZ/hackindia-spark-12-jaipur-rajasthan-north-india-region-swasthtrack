"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/**
 * Ask by speaking. Uses the browser's own speech recognition (Web Speech API), so
 * it works where the browser offers it (Chrome / Edge / Safari, Android and iOS)
 * and the button is simply not shown elsewhere. The spoken words land in the
 * question box so they can be checked before sending: speech recognition
 * mishears, and a wrong question gets a wrong answer.
 *
 * Privacy: recognition is done by the browser's speech service (for Chrome that is
 * Google's), not by this app; the audio never reaches our server.
 */

// The Web Speech API is not in every TypeScript DOM lib; declare only what is used.
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type VoiceLang = "hi-IN" | "en-IN";
const LANG_KEY = "soie.voiceLang";

const subscribeNever = () => () => {};

function readLang(): VoiceLang {
  try {
    const v = window.localStorage.getItem(LANG_KEY);
    return v === "en-IN" ? "en-IN" : "hi-IN";
  } catch {
    return "hi-IN";
  }
}

const ERROR_TEXT: Record<string, string> = {
  "not-allowed": "माइक की अनुमति नहीं मिली। ब्राउज़र की सेटिंग में माइक चालू करें।",
  "service-not-allowed": "माइक की अनुमति नहीं मिली। ब्राउज़र की सेटिंग में माइक चालू करें।",
  "no-speech": "कुछ सुनाई नहीं दिया। माइक दबाकर साफ़ बोलिए।",
  "audio-capture": "माइक नहीं मिला। माइक जुड़ा है या नहीं देखें।",
  network: "आवाज़ पहचानने के लिए इंटरनेट चाहिए।",
  "language-not-supported": "यह भाषा इस ब्राउज़र में सपोर्ट नहीं है। दूसरी भाषा चुनें।",
};

/** Joins what was already typed with what was just said. */
function join(base: string, said: string): string {
  const b = base.trimEnd();
  const s = said.trim();
  return b && s ? `${b} ${s}` : b || s;
}

export function VoiceInput({
  value,
  onChange,
  maxLength,
  disabled,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  maxLength: number;
  disabled?: boolean;
  className?: string;
}) {
  const toast = useToast();
  // Browser-only capability: false on the server and during hydration, so both renders agree.
  const supported = useSyncExternalStore(subscribeNever, () => recognitionCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState<VoiceLang>(readLang);
  const recRef = useRef<Recognition | null>(null);
  const baseRef = useRef("");
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => () => recRef.current?.abort(), []);

  // Typing or sending while it listens: stop, so the box is never overwritten by late results.
  useEffect(() => {
    if (disabled) recRef.current?.abort();
  }, [disabled]);

  const stop = useCallback(() => recRef.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || recRef.current) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    baseRef.current = valueRef.current;
    rec.onresult = (e) => {
      let said = "";
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0]?.transcript ?? "";
      onChange(join(baseRef.current, said).slice(0, maxLength));
    };
    rec.onerror = (e) => {
      // "aborted" is our own stop; everything else is worth telling the user.
      if (e.error !== "aborted") toast({ title: ERROR_TEXT[e.error] ?? "आवाज़ पहचान में दिक्कत आई। फिर कोशिश करें।", tone: "error" });
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      recRef.current = null;
      setListening(false);
    }
  }, [lang, maxLength, onChange, toast]);

  function pickLang(next: VoiceLang) {
    setLang(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      // not persisted; the choice still applies to this visit
    }
  }

  if (!supported) return null;

  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      <button
        type="button"
        onClick={() => pickLang(lang === "hi-IN" ? "en-IN" : "hi-IN")}
        disabled={listening}
        aria-label={lang === "hi-IN" ? "बोलने की भाषा: हिंदी / Hinglish। English के लिए दबाएँ" : "Speaking language: English. Tap for Hindi / Hinglish"}
        title={lang === "hi-IN" ? "बोलने की भाषा: हिंदी / Hinglish" : "Speaking language: English"}
        className="h-control min-w-control rounded-field px-2 text-2xs font-semibold text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50"
      >
        {lang === "hi-IN" ? "हिं" : "EN"}
      </button>
      <Button
        type="button"
        variant={listening ? "primary" : "secondary"}
        disabled={disabled}
        onClick={listening ? stop : start}
        aria-pressed={listening}
        aria-label={listening ? "सुनना बंद करें" : "बोलकर पूछें"}
        title={listening ? "सुनना बंद करें" : "बोलकर पूछें (हिंदी, English या Hinglish)"}
        className={cn("h-control w-control px-0", listening && "animate-pulse")}
      >
        {listening ? <MicOff aria-hidden className="h-5 w-5" /> : <Mic aria-hidden className="h-5 w-5" />}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {listening ? "सुन रहा हूँ, बोलिए" : ""}
      </span>
    </div>
  );
}
