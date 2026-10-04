"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { checkAndTriggerMedicineReminders } from "@/services/notification-service";

/** How often the open page checks whether a dose is due. */
const CHECK_EVERY_MS = 60_000;

/**
 * Raises medicine reminders for the active patient. Renders nothing.
 *
 * Browser notifications only work while the app is open (a tab or the installed
 * PWA window): there is no push server, so a fully closed app cannot remind. The
 * check pauses while the page is hidden and runs once as soon as it is visible again.
 * Without notification permission each check returns immediately (no network), so
 * permission granted later in Settings starts working without a reload.
 */
export function MedicineReminders() {
  const { activePatientId } = useAuth();

  useEffect(() => {
    if (!activePatientId) return;

    let cancelled = false;
    let running = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const check = async () => {
      if (running || cancelled) return;
      running = true;
      try {
        await checkAndTriggerMedicineReminders(activePatientId);
      } catch {
        // A failed check (offline, signed out) is retried on the next tick.
      } finally {
        running = false;
      }
    };

    const start = () => {
      if (timer !== null) return;
      void check();
      timer = setInterval(() => void check(), CHECK_EVERY_MS);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [activePatientId]);

  return null;
}
