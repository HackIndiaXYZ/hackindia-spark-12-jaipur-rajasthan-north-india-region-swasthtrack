"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { langOf } from "@/components/ui/lang";
import { cn } from "@/lib/utils";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  hindiTitle?: string;
  description?: string;
  children?: ReactNode;
  /** Original prop name, kept so existing callers compile. Same as `size`. */
  maxWidth?: Exclude<ModalSize, "full">;
  size?: ModalSize;
  /** Sticky action row pinned under the scrolling body (Save / Cancel). */
  footer?: ReactNode;
  /** Close when the dim backdrop is clicked. Default true. */
  closeOnBackdrop?: boolean;
  /** Close on Escape. Default true. */
  closeOnEscape?: boolean;
  /** Element to focus on open. Default: the dialog itself (no soft keyboard pops up). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** `alertdialog` for confirmations that interrupt the user. */
  role?: "dialog" | "alertdialog";
  hideCloseButton?: boolean;
  className?: string;
  bodyClassName?: string;
};

const widthClasses: Record<ModalSize, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
  full: "sm:max-w-[calc(100vw-2rem)] sm:h-[calc(100dvh-2rem)]",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), textarea:not([disabled]), summary, ' +
  '[tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0 && !el.hasAttribute("inert"),
  );
}

/* ---- Page scroll lock ------------------------------------------------------
   Shared across every Modal so a nested modal (e.g. AddMedicineDialog opened
   from inside QuickMarkMedicineDialog) closing does not re-enable page scroll
   while an outer modal is still open: only the 0->1 transition locks and only
   1->0 restores.

   `overflow: hidden` alone does not stop iOS Safari from scrolling the page
   behind a sheet, so the body is pinned with `position: fixed` at the current
   scroll offset and the offset is restored on unlock. */
let lockCount = 0;
let savedScrollY = 0;
let savedBodyStyle: Pick<
  CSSStyleDeclaration,
  "position" | "top" | "left" | "right" | "width" | "overflow" | "paddingRight"
> | null = null;

function lockScroll() {
  lockCount += 1;
  if (lockCount !== 1) return;

  const { body, documentElement } = document;
  savedScrollY = window.scrollY;
  savedBodyStyle = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
    paddingRight: body.style.paddingRight,
  };

  // Keep the layout from jumping sideways when a desktop scrollbar disappears.
  const scrollbar = window.innerWidth - documentElement.clientWidth;
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

  body.style.position = "fixed";
  body.style.top = `-${savedScrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overflow = "hidden";
}

function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount !== 0 || !savedBodyStyle) return;

  const { body } = document;
  Object.assign(body.style, savedBodyStyle);
  savedBodyStyle = null;
  window.scrollTo({ top: savedScrollY, behavior: "instant" });
}

/* Open modals, oldest first. Only the top one reacts to Escape and Tab. */
const modalStack: symbol[] = [];

const subscribeNoop = () => () => {};

export function Modal({
  isOpen,
  onClose,
  title,
  hindiTitle,
  description,
  children,
  maxWidth,
  size,
  footer,
  closeOnBackdrop = true,
  closeOnEscape = true,
  initialFocusRef,
  role = "dialog",
  hideCloseButton = false,
  className,
  bodyClassName,
}: ModalProps) {
  // false during SSR/hydration, true on the client: the portal target only
  // exists in the browser.
  const isClient = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const pointerDownOnBackdrop = useRef(false);

  // Latest callbacks/options without re-running the open effect (callers pass
  // inline arrows, which would otherwise tear down and re-lock every render).
  const latest = useRef({ onClose, closeOnEscape, initialFocusRef });
  useEffect(() => {
    latest.current = { onClose, closeOnEscape, initialFocusRef };
  });

  const open = isOpen && isClient;

  useEffect(() => {
    if (!open) return;

    const token = Symbol("modal");
    modalStack.push(token);
    const isTop = () => modalStack[modalStack.length - 1] === token;

    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    lockScroll();

    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      const target = latest.current.initialFocusRef?.current ?? panel;
      target.focus({ preventScroll: true });
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTop()) return;

      if (event.key === "Escape" && latest.current.closeOnEscape) {
        event.preventDefault();
        event.stopPropagation();
        latest.current.onClose();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const items = focusableIn(panelRef.current);
      if (items.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (!panelRef.current.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    // Focus that lands outside the dialog (a programmatic focus() in the page
    // behind, or a click on the backdrop) is pulled back in. Toasts live in
    // their own region and may take focus.
    const onFocusIn = (event: FocusEvent) => {
      if (!isTop() || !panelRef.current) return;
      const target = event.target as Node | null;
      if (!target || panelRef.current.contains(target)) return;
      if (target instanceof Element && target.closest("[data-toast-region]")) return;
      panelRef.current.focus({ preventScroll: true });
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn);

      const index = modalStack.indexOf(token);
      if (index !== -1) modalStack.splice(index, 1);
      unlockScroll();

      // Hand focus back to whatever opened the dialog.
      if (opener && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [open]);

  const handleBackdropPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      pointerDownOnBackdrop.current = event.target === event.currentTarget;
    },
    [],
  );

  const handleBackdropClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      // Require the press AND the release on the backdrop, so dragging a text
      // selection out of an input never dismisses the dialog.
      if (
        closeOnBackdrop &&
        pointerDownOnBackdrop.current &&
        event.target === event.currentTarget
      ) {
        onClose();
      }
      pointerDownOnBackdrop.current = false;
    },
    [closeOnBackdrop, onClose],
  );

  if (!open) return null;

  const resolvedSize: ModalSize = size ?? maxWidth ?? "md";

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
      onPointerDown={handleBackdropPointerDown}
      onClick={handleBackdropClick}
    >
      <div
        aria-hidden="true"
        className="modal-backdrop pointer-events-none absolute inset-0 bg-ink/60 backdrop-blur-xs"
      />

      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "modal-panel relative flex w-full flex-col overflow-hidden bg-surface shadow-e4 outline-none",
          // Phone: bottom sheet that stops below the status bar. `dvh` follows
          // the browser toolbars, unlike vh.
          "max-h-[calc(100dvh-max(0.75rem,env(safe-area-inset-top)))] rounded-t-sheet border border-b-0 border-line",
          // Tablet / desktop: centred card.
          "sm:max-h-[calc(100dvh-2rem)] sm:rounded-sheet sm:border-b",
          widthClasses[resolvedSize],
          className,
        )}
      >
        {/* Gold hairline — the one accent moment on an otherwise quiet sheet. */}
        <div aria-hidden className="grad-spring absolute inset-x-0 top-0 h-1" />

        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-4 pb-4 pt-5 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2
                id={titleId}
                lang={langOf(title)}
                className="text-xl font-semibold text-ink"
              >
                {title}
              </h2>
              {hindiTitle ? (
                <span
                  lang={langOf(hindiTitle)}
                  className="rounded-md border border-gold-line bg-gold-soft px-2 py-0.5 text-xs font-semibold text-gold-ink"
                >
                  {hindiTitle}
                </span>
              ) : null}
            </div>
            {description ? (
              <p
                id={descriptionId}
                lang={langOf(description)}
                className="mt-1 text-sm text-ink-muted"
              >
                {description}
              </p>
            ) : null}
          </div>
          {hideCloseButton ? null : (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog — बंद करें"
              className="pressable -mr-1 -mt-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-control bg-surface-sunken text-ink-muted transition-colors hover:bg-line hover:text-ink"
            >
              <X aria-hidden className="h-5 w-5" />
            </button>
          )}
        </div>

        {children ? (
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5",
              footer ? "" : "pb-[max(1rem,env(safe-area-inset-bottom))]",
              bodyClassName,
            )}
          >
            {children}
          </div>
        ) : null}

        {footer ? (
          <div className="shrink-0 border-t border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
