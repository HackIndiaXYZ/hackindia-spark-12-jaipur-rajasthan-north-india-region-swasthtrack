"use client";

import { Check, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Stage } from "@/services/soie/types";

const STEPS: Array<{ key: Stage; hi: string; optional?: boolean }> = [
  { key: "reading", hi: "डेटा पढ़ रहा हूँ" },
  { key: "analysing", hi: "विश्लेषण" },
  { key: "searching", hi: "इंटरनेट पर खोज", optional: true },
  { key: "checking", hi: "जाँच" },
];

/** Live progress while SOIE works. The stages come from the server's real events, not a timer. */
export function ProgressCard({ stage, tools, webSearch }: { stage: Stage; tools: string[]; webSearch: boolean }) {
  const steps = STEPS.filter((s) => !s.optional || webSearch || stage === "searching");
  const idx = Math.max(0, steps.findIndex((s) => s.key === stage));
  return (
    <Card className="space-y-3" aria-live="polite" role="status">
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {steps.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <li key={s.key} className={cn("flex items-center gap-1.5 text-sm", active ? "font-semibold text-brand-ink" : done ? "text-ink-muted" : "text-ink-subtle")}>
              <span className={cn("grid h-5 w-5 place-items-center rounded-full border text-2xs", done ? "border-brand bg-brand text-ink-inverse" : active ? "border-brand-line bg-brand-soft" : "border-line")}>
                {done ? <Check aria-hidden className="h-3 w-3" /> : active ? <Loader2 aria-hidden className="h-3 w-3 animate-spin" /> : i + 1}
              </span>
              <span lang="hi">{s.hi}</span>
              {i < steps.length - 1 ? <span aria-hidden className="text-ink-subtle">→</span> : null}
            </li>
          );
        })}
      </ol>
      {tools.length > 0 ? (
        <p lang="hi" className="text-xs text-ink-subtle">
          {tools.slice(-3).join(" · ")}
        </p>
      ) : null}
    </Card>
  );
}
