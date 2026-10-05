"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { langOf } from "@/components/ui/lang";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error" | "info";

export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds before it dismisses itself. Errors stay longer by default. */
  durationMs?: number;
};

type ToastItem = ToastInput & { id: number; tone: ToastTone };

/**
 * What `useToast()` returns. It is both callable and an object, so every
 * natural spelling works:
 *   const toast = useToast();          toast({ title: "सेव हो गया" })
 *   const { toast } = useToast();      toast({ title: "सेव हो गया" })
 *   toast.success("सेव हो गया")        toast.error("कुछ गड़बड़ हुई", "फिर कोशिश करें")
 */
export type ToastApi = ((input: ToastInput) => number) & {
  toast: (input: ToastInput) => number;
  success: (title: string, description?: string) => number;
  error: (title: string, description?: string) => number;
  info: (title: string, description?: string) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const MAX_VISIBLE = 4;
let toastSeq = 0;

// Callable AND carries the helpers, so `useToast()` can be called, destructured
// or used as `toast.success(...)`.
function makeToastApi(
  push: (input: ToastInput) => number,
  dismiss: (id: number) => void,
): ToastApi {
  return Object.assign((input: ToastInput) => push(input), {
    toast: push,
    dismiss,
    success: (title: string, description?: string) =>
      push({ title, description, tone: "success" }),
    error: (title: string, description?: string) =>
      push({ title, description, tone: "error" }),
    info: (title: string, description?: string) =>
      push({ title, description, tone: "info" }),
  });
}

// Frosted white glass with a metal rim (the same family as menus and the raised
// card), carrying its meaning in a coloured accent bar and icon chip rather than
// a full tinted fill, so a toast reads as part of the gilded UI.
const toneStyles: Record<
  ToastTone,
  { accent: string; chip: string; Icon: typeof Info }
> = {
  success: {
    accent: "bg-positive",
    chip: "bg-positive-soft text-positive",
    Icon: CircleCheck,
  },
  error: {
    accent: "bg-critical",
    chip: "bg-critical-soft text-critical",
    Icon: CircleAlert,
  },
  info: {
    accent: "bg-info",
    chip: "bg-info-soft text-info",
    Icon: Info,
  },
};

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const { id, title, description, tone } = item;
  const duration = item.durationMs ?? (tone === "error" ? 8000 : 4500);

  const remaining = useRef(duration);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    startedAt.current = Date.now();
    timer.current = setTimeout(() => onDismiss(id), remaining.current);
  }, [id, onDismiss]);

  const pause = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    remaining.current = Math.max(
      1200,
      remaining.current - (Date.now() - startedAt.current),
    );
  }, []);

  useEffect(() => {
    start();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [start]);

  const { accent, chip, Icon } = toneStyles[tone];

  return (
    <li
      // Hover and keyboard focus both hold the toast so it can be read and
      // dismissed without racing the timer.
      onMouseEnter={pause}
      onMouseLeave={start}
      onFocus={pause}
      onBlur={start}
      className={cn(
        "toast-in surface-lift pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-card py-3 pl-4 pr-3 shadow-e4",
        "sm:max-w-sm",
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", accent)} />
      <span
        aria-hidden
        className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", chip)}
      >
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p lang={langOf(title)} className="text-sm font-semibold text-ink">
          {title}
        </p>
        {description ? (
          <p
            lang={langOf(description)}
            className="mt-0.5 text-xs text-ink-muted"
          >
            {description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification — बंद करें"
        className="-my-2 -mr-2.5 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-gold-soft hover:text-ink"
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
    </li>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback((input: ToastInput) => {
    const id = ++toastSeq;
    const tone = input.tone ?? "info";
    setItems((current) => {
      // The same message fired twice (a double tap on Save) replaces itself
      // instead of stacking.
      const fresh = current.filter(
        (item) =>
          !(
            item.tone === tone &&
            item.title === input.title &&
            item.description === input.description
          ),
      );
      return [...fresh, { ...input, id, tone }].slice(-MAX_VISIBLE);
    });
    return id;
  }, []);

  const api = useMemo(() => makeToastApi(push, dismiss), [push, dismiss]);

  const polite = items.filter((item) => item.tone !== "error");
  const assertive = items.filter((item) => item.tone === "error");

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* Both live regions are always mounted so assistive tech is already
          listening when a message arrives. Errors are announced assertively.
          Sits above the mobile bottom nav (and its safe-area inset). */}
      <div
        data-toast-region
        // While a dialog is open on a phone the stack moves to the top edge: a
        // bottom sheet (e.g. the delete confirmation) owns the bottom of the
        // screen and a toast there would cover its message and buttons.
        className="pointer-events-none fixed inset-x-0 z-[80] flex flex-col items-center gap-2 px-4 bottom-[calc(var(--bottom-nav-h)+0.75rem)] max-sm:[[data-modal-open]_&]:bottom-auto max-sm:[[data-modal-open]_&]:top-[calc(max(0.75rem,env(safe-area-inset-top))+0.5rem)] sm:items-end sm:px-6 lg:bottom-6 lg:right-0"
      >
        <ul
          role="status"
          aria-live="polite"
          aria-atomic="false"
          className="flex w-full flex-col items-center gap-2 sm:items-end"
        >
          {polite.map((item) => (
            <ToastCard key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </ul>
        <ul
          role="alert"
          aria-live="assertive"
          aria-atomic="false"
          className="flex w-full flex-col items-center gap-2 sm:items-end"
        >
          {assertive.map((item) => (
            <ToastCard key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </ul>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return api;
}
