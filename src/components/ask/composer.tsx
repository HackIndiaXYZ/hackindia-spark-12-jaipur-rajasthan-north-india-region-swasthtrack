"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Loader2, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";

/**
 * Sticky composer. On phones it sits ABOVE the fixed bottom navigation (about
 * 4.5rem tall plus the home-indicator safe area), so it is never hidden behind
 * it; from lg up the navigation is the sidebar and it pins to the viewport edge.
 */
export function Composer({
  disabled,
  sending,
  onSend,
  onCancel,
  maxLength = 1000,
  className,
}: {
  disabled?: boolean;
  sending: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
  maxLength?: number;
  className?: string;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t || disabled || sending) return;
    onSend(t);
    setText("");
    ref.current?.focus();
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter adds a line. (IME composition must not send.)
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={submit}
      className={cn("sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-30 -mx-4 border-t border-line bg-surface/95 px-4 pt-3 pb-3 backdrop-blur sm:-mx-6 sm:px-6 lg:bottom-0 lg:mx-0 lg:rounded-t-card lg:border lg:px-4", className)}
    >
      <label htmlFor="soie-input" className="sr-only">
        अपना सवाल लिखें
      </label>
      <div className="flex items-end gap-2">
        <TextArea
          id="soie-input"
          ref={ref}
          rows={1}
          value={text}
          maxLength={maxLength}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="पूछें: आज पापा कैसे रहे? / BP kaise kam karein?"
          enterKeyHint="send"
          className="max-h-40 min-h-control flex-1 resize-none py-2.5"
        />
        {sending ? (
          <Button type="button" variant="secondary" onClick={onCancel} aria-label="रोकें" className="h-control w-control px-0">
            <Square aria-hidden className="h-5 w-5" />
          </Button>
        ) : (
          <Button type="submit" variant="primary" disabled={disabled || text.trim().length === 0} aria-label="भेजें" className="h-control w-control px-0">
            {disabled ? <Loader2 aria-hidden className="h-5 w-5 animate-spin" /> : <Send aria-hidden className="h-5 w-5" />}
          </Button>
        )}
      </div>
      <p className="mt-1.5 text-2xs text-ink-subtle">
        सवाल में नाम या निजी जानकारी न लिखें। यह जानकारी सामान्य मार्गदर्शन है, डॉक्टर की सलाह का विकल्प नहीं।
      </p>
    </form>
  );
}
