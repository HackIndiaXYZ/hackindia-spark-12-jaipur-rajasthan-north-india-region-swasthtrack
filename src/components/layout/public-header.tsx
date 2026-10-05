"use client";

import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";
import { Wordmark } from "@/components/brand/wordmark";
import { buttonClasses } from "@/components/ui/button";
import { OfflineBanner } from "@/components/layout/offline-banner";

/**
 * Slim header for the public pages (About, Privacy, Terms, Medical disclaimer,
 * Contact) when the visitor is signed out. The full shell needs a signed-in
 * patient (sidebar, patient name, bottom navigation), so none of it renders here.
 */
export function PublicHeader() {
  return (
    <header className="frost sticky top-0 z-30 pt-safe">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/login" className="flex min-w-0 items-center gap-2.5 rounded-control">
          <LogoMark sizes="40px" priority className="h-10 w-10" />
          <span className="min-w-0">
            <Wordmark variant="compact" className="block h-6 w-auto" />
            <span lang="hi" className="mt-0.5 block truncate text-2xs leading-tight text-ink-muted">
              स्वस्थ आदतें, खुशहाल जीवन
            </span>
          </span>
        </Link>

        <Link href="/login" className={buttonClasses({ variant: "primary", size: "sm" })}>
          <span lang="hi">साइन इन</span>
          <span lang="en">· Sign in</span>
        </Link>
      </div>
      <OfflineBanner />
    </header>
  );
}
