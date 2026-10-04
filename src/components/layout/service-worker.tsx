"use client";

import { useEffect } from "react";

/**
 * Registers the offline-fallback service worker (public/sw.js) in production
 * only. In development it does the opposite: removes any worker and caches an
 * earlier build left behind, so a stale worker can never mask live edits.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => registrations.forEach((r) => r.unregister()))
        .catch(() => {});
      if ("caches" in window) {
        caches
          .keys()
          .then((keys) =>
            keys
              .filter((key) => key.startsWith("swasthtrack"))
              .forEach((key) => caches.delete(key)),
          )
          .catch(() => {});
      }
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        /* offline fallback is a nicety; the app works without it */
      });
  }, []);

  return null;
}
