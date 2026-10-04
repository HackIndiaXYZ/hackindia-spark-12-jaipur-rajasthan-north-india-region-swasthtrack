"use client";

import { useEffect, useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";
import { useToast } from "@/components/ui/toast";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Browser connectivity. `true` on the server so SSR markup never claims "offline". */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Unobtrusive banner shown only while the device is offline. It is honest about
 * what that means: the app does not queue writes, so nothing new is saved, and
 * what is on screen may be stale. The live region stays mounted so the
 * announcement is made when the state flips.
 */
export function OfflineBanner() {
  const online = useOnline();
  const toast = useToast();

  useEffect(() => {
    const onBackOnline = () =>
      toast.success("इंटरनेट वापस आ गया", "Back online — you can save entries again.");
    window.addEventListener("online", onBackOnline);
    return () => window.removeEventListener("online", onBackOnline);
  }, [toast]);

  return (
    <div data-offline-banner role="status" aria-live="polite">
      {online ? null : (
        <div className="flex items-start gap-2.5 border-t border-attention-line bg-attention-soft px-4 py-2 text-attention sm:px-6 lg:px-8">
          <WifiOff aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-xs font-medium leading-snug">
            <span lang="hi">इंटरनेट नहीं है — नया डेटा सेव नहीं होगा और दिख रही जानकारी पुरानी हो सकती है।</span>{" "}
            <span lang="en" className="text-ink-muted">
              You are offline: new entries will not save and what you see may be out of date.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
