"use client";

import Link from "next/link";
import { Heart } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-10 border-t border-line bg-surface px-4 py-8 text-sm text-ink-muted sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          {/* Brand & Subtitle */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">SwasthTrack</span>
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-2xs font-medium text-brand-ink">
                Family Companion
              </span>
            </div>
            <p className="max-w-md text-sm text-ink-muted">
              Personal health tracking and daily wellness companion designed to care for the people who cared for us.
            </p>
          </div>

          {/* Quick Legal & Info Links */}
          <nav
            className="flex flex-wrap items-center gap-x-1 gap-y-0.5"
            aria-label="Footer navigation"
          >
            {[
              { href: "/about", label: "About" },
              { href: "/contact", label: "Contact" },
              { href: "/privacy", label: "Privacy Policy" },
              { href: "/terms", label: "Terms of Use" },
              { href: "/medical-disclaimer", label: "Medical Disclaimer" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                /* 44px tall so these are reachable on a phone (§44) */
                className="flex min-h-11 items-center rounded-control px-2.5 text-sm font-medium text-ink-muted hover:bg-surface-sunken hover:text-brand"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Bottom Attribution & Copyright */}
        <div className="mt-6 flex flex-col gap-3 border-t border-line pt-6 text-xs text-ink-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} SwasthTrack. All rights reserved.</p>
          <div className="flex items-center gap-1 text-ink-muted">
            <span>Made with</span>
            <Heart aria-hidden className="inline h-3.5 w-3.5 fill-bp text-bp" />
            <span>by <strong className="font-semibold text-ink">Pawan Kumar</strong></span>
          </div>
        </div>
      </div>
    </footer>
  );
}
