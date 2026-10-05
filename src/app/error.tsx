"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Route-level error boundary. Wraps every page inside the app shell, so the
 * header and navigation stay usable while the failed screen offers a retry.
 * The raw error message is never shown (it can carry server details); the
 * digest is, so it can be matched with server logs.
 */
export default function RouteError({
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
    <div className="mx-auto max-w-lg py-8 sm:py-12">
      <Card tone="premium" className="rounded-panel p-6 text-center sm:p-8">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-card bg-surface text-critical shadow-e2 ring-1 ring-gold-line">
          <TriangleAlert aria-hidden className="h-7 w-7" />
        </span>
        <h1 lang="hi" className="mt-4 text-xl font-semibold text-ink">
          कुछ गड़बड़ हो गई
        </h1>
        <p className="mt-0.5 text-sm font-medium text-ink-muted">Something went wrong on this screen.</p>
        <p lang="hi" className="mt-3 text-sm text-ink-muted">
          आपका डेटा सुरक्षित है। कृपया फिर कोशिश करें, या होम पर लौट जाएँ।
        </p>
        <p className="mt-1 text-xs text-ink-muted">Your saved data is not affected. Try again, or go back home.</p>

        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          {tryAgain ? (
            <Button variant="primary" onClick={() => tryAgain()}>
              <RefreshCw aria-hidden className="h-4 w-4" />
              फिर कोशिश करें (Try Again)
            </Button>
          ) : null}
          <Link href="/" className={buttonClasses({ variant: "secondary" })}>
            होम पर जाएँ (Home)
          </Link>
        </div>

        {error.digest ? (
          <p className="tabular mt-5 text-2xs text-ink-muted">Ref: {error.digest}</p>
        ) : null}
      </Card>
    </div>
  );
}
