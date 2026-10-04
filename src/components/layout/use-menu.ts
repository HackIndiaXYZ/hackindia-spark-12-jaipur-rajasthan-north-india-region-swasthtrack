"use client";

import { useCallback, useEffect, type KeyboardEvent, type RefObject } from "react";

const ITEM_SELECTOR =
  '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

/**
 * Keyboard + dismissal behaviour for a small popover menu (`role="menu"`):
 * focus moves into the menu on open, arrows / Home / End move between items,
 * Escape closes and hands focus back to the trigger, Tab or an outside press
 * closes it. Returns the `onKeyDown` to put on the menu element.
 */
export function useMenu({
  open,
  onClose,
  triggerRef,
  menuRef,
}: {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  menuRef: RefObject<HTMLElement | null>;
}) {
  useEffect(() => {
    if (!open) return;

    const menu = menuRef.current;
    const items = menu?.querySelectorAll<HTMLElement>(ITEM_SELECTOR);
    const selected =
      menu?.querySelector<HTMLElement>('[aria-checked="true"], [aria-current="page"]') ??
      items?.[0];
    selected?.focus({ preventScroll: true });

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, triggerRef, menuRef]);

  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [],
      );
      if (items.length === 0) return;

      const index = items.indexOf(document.activeElement as HTMLElement);
      let next: number | null = null;

      switch (event.key) {
        case "ArrowDown":
          next = index === -1 || index === items.length - 1 ? 0 : index + 1;
          break;
        case "ArrowUp":
          next = index <= 0 ? items.length - 1 : index - 1;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = items.length - 1;
          break;
        case "Tab":
          // Let focus leave naturally, but do not strand an open menu behind it.
          onClose();
          return;
        default:
          return;
      }

      event.preventDefault();
      items[next]?.focus();
    },
    [menuRef, onClose],
  );
}
