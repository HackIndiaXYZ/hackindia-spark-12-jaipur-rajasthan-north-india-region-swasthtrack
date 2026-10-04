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
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export type ConfirmOptions = {
  title: string;
  message?: string;
  /** Default: "ठीक है (OK)" — or "हटाएँ (Delete)" for the danger tone. */
  confirmLabel?: string;
  /** Default: "रद्द करें (Cancel)". */
  cancelLabel?: string;
  tone?: "danger" | "default";
};

/**
 * What `useConfirm()` returns. Callable and an object, so both spellings work:
 *   const confirm = useConfirm();        if (await confirm({ ... })) { ... }
 *   const { confirm } = useConfirm();    if (await confirm({ ... })) { ... }
 * Resolves `true` only on an explicit confirm; Escape, backdrop and Cancel all
 * resolve `false`.
 */
export type ConfirmFn = ((options: ConfirmOptions) => Promise<boolean>) & {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmFn | null>(null);

// Callable AND carries `.confirm`, so `useConfirm()` can be called or destructured.
function makeConfirmFn(confirm: (options: ConfirmOptions) => Promise<boolean>): ConfirmFn {
  return Object.assign((options: ConfirmOptions) => confirm(options), { confirm });
}

type Pending = { options: ConfirmOptions; resolve: (value: boolean) => void };

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Resolving inside the updater is safe: a promise settles once, so a
  // StrictMode double-invoke is harmless.
  const settle = useCallback((value: boolean) => {
    setPending((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        // A second request while one is open replaces it; the first caller is
        // told "no" rather than left hanging.
        setPending((current) => {
          current?.resolve(false);
          return { options, resolve };
        });
      }),
    [],
  );

  // Never leave an awaiting caller hanging if the provider goes away.
  const latest = useRef<Pending | null>(null);
  useEffect(() => {
    latest.current = pending;
  }, [pending]);
  useEffect(
    () => () => {
      latest.current?.resolve(false);
    },
    [],
  );

  const api = useMemo(() => makeConfirmFn(confirm), [confirm]);

  const options = pending?.options;
  const danger = options?.tone === "danger";

  return (
    <ConfirmContext.Provider value={api}>
      {children}

      <Modal
        isOpen={Boolean(pending)}
        onClose={() => settle(false)}
        title={options?.title ?? ""}
        description={options?.message}
        role="alertdialog"
        size="sm"
        // Focus lands on the harmless choice for destructive actions, so a
        // reflex Enter press cannot delete anything.
        initialFocusRef={danger ? cancelRef : confirmRef}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              ref={cancelRef}
              variant="secondary"
              onClick={() => settle(false)}
              className="sm:min-w-28"
            >
              {options?.cancelLabel ?? "रद्द करें (Cancel)"}
            </Button>
            <Button
              ref={confirmRef}
              variant={danger ? "destructive" : "primary"}
              onClick={() => settle(true)}
              className="sm:min-w-28"
            >
              {options?.confirmLabel ??
                (danger ? "हटाएँ (Delete)" : "ठीक है (OK)")}
            </Button>
          </div>
        }
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const api = useContext(ConfirmContext);
  if (!api) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return api;
}
