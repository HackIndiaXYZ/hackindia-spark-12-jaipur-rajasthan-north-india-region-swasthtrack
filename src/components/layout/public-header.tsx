"use client";

import Link from "next/link";
import Image from "next/image";
import { buttonClasses } from "@/components/ui/button";
import { OfflineBanner } from "@/components/layout/offline-banner";

/**
 * Slim header for the public pages (About, Privacy, Terms, Medical disclaimer,
 * Contact) when the visitor is signed out. The full shell needs a signed-in
 * patient (sidebar, patient name, bottom navigation), so none of it renders here.
 */
export function PublicHeader() {
  return (
    <header className="frost sticky top-0 z-30 border-b border-line pt-safe">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/login" className="flex min-w-0 items-center gap-2.5 rounded-control">
          <Image
            src="/logo.jpg"
            alt=""
            width={72}
            height={72}
            sizes="36px"
            priority
            className="h-9 w-9 shrink-0 rounded-control border border-line object-cover"
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-tight text-ink">
              SwasthTrack
            </span>
            <span lang="hi" className="block truncate text-2xs leading-tight text-ink-muted">
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
