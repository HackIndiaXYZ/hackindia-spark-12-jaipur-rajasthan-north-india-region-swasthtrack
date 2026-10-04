"use client";

import { useSyncExternalStore } from "react";

/**
 * `matchMedia` as React state without an effect. False on the server and during
 * hydration (so markup matches), then the real value.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** True from the `lg` breakpoint up, where the sidebar replaces the bottom nav. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 64rem)");
}
