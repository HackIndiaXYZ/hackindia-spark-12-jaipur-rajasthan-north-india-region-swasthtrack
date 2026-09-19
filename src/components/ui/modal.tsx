"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  hindiTitle?: string;
  description?: string;
  children: ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl";
};

// Shared across every Modal instance so a nested modal (e.g. AddMedicineDialog
// opened from inside QuickMarkMedicineDialog) closing doesn't re-enable body
// scroll while an outer modal is still open. Only the 0->1 transition locks
// scroll, and only the 1->0 transition restores it.
let openModalCount = 0;

export function Modal({
  isOpen,
  onClose,
  title,
  hindiTitle,
  description,
  children,
  maxWidth = "md",
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    openModalCount += 1;
    if (openModalCount === 1) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      openModalCount -= 1;
      if (openModalCount === 0) {
        document.body.style.overflow = "unset";
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
    >
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={cn(
          "reveal relative z-10 w-full rounded-sheet border border-line bg-surface p-4 sm:p-6 shadow-e4 transition-all max-h-[90vh] overflow-y-auto",
          maxWidthClasses[maxWidth],
        )}
      >
        {/* Gold hairline — the one accent moment on an otherwise quiet sheet. */}
        <div aria-hidden className="absolute inset-x-0 top-0 h-1 grad-spring rounded-t-sheet" />

        <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-ink">{title}</h2>
              {hindiTitle ? (
                <span lang="hi" className="rounded-md border border-gold-line bg-gold-soft px-2 py-0.5 text-xs font-semibold text-gold-ink">
                  {hindiTitle}
                </span>
              ) : null}
            </div>
            {description ? (
              <p className="mt-1 text-sm text-ink-muted">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="pressable flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-control bg-surface-sunken text-ink-muted hover:bg-line hover:text-ink transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
