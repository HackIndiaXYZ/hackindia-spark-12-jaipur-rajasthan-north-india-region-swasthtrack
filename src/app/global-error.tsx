"use client";

import { useEffect } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import "./globals.css";

/**
 * Last-resort boundary: replaces the root layout, so it brings its own
 * <html>/<body>, imports the stylesheet itself and sets a system font stack
 * (next/font variables do not exist here). It deliberately uses no providers.
 */
export default function GlobalError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const tryAgain = retry ?? reset;

  return (
    <html lang="hi">
      <body
        className="min-h-dvh bg-canvas text-ink"
        style={{ fontFamily: 'system-ui, "Segoe UI", "Noto Sans Devanagari", sans-serif' }}
      >
        <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-5">
          <Card tone="premium" className="w-full rounded-panel p-6 text-center sm:p-8">
            <h1 lang="hi" className="text-2xl font-semibold">
              ऐप शुरू नहीं हो पाया
            </h1>
            <p className="mt-1 text-sm font-medium text-ink-muted">SwasthTrack could not start.</p>
            <p lang="hi" className="mt-4 text-sm text-ink-muted">
              आपका सहेजा हुआ डेटा सुरक्षित है। कृपया पेज दोबारा खोलें।
            </p>
            <p className="mt-1 text-xs text-ink-muted">Your saved data is not affected. Please try again.</p>
            {tryAgain ? (
              <button
                type="button"
                onClick={() => tryAgain()}
                className={buttonClasses({ variant: "primary", className: "mt-6 px-5" })}
              >
                फिर कोशिश करें (Try Again)
              </button>
            ) : null}
            {error.digest ? <p className="mt-5 text-2xs text-ink-muted">Ref: {error.digest}</p> : null}
          </Card>
        </main>
      </body>
    </html>
  );
}
