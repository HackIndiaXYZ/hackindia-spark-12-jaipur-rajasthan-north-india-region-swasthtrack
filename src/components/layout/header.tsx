"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { CalendarDays, MessageSquareText, Menu, X } from "lucide-react";
import { CurrentDate } from "@/components/layout/current-date";
import {
  informationNavigation,
  secondaryNavigation,
} from "@/components/layout/navigation-items";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getPatientProfile, type PatientProfile } from "@/services/patient-service";

export function Header() {
  const pathname = usePathname();
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    getPatientProfile()
      .then((p) => {
        if (active) setProfile(p);
      })
      .catch(() => {
        /* header identity is non-critical; the page below reports load errors */
      });
    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [menuOpen]);

  const patientName = profile?.name || "SwasthTrack";

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur-md">
      {/* ---------- MOBILE ----------
          Two actions only. The previous header packed six 34px icon buttons
          into the right edge; they were below the 44px tap minimum and gave no
          hint of what they opened. Secondary destinations now live in one
          labelled menu (§16). */}
      <div className="flex h-14 items-center justify-between gap-2 px-4 lg:hidden">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5"
          aria-label="Dashboard"
        >
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
              {patientName}
            </span>
            <span lang="hi" className="block text-2xs leading-tight text-ink-subtle">
              स्वास्थ्य साथी
            </span>
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href="/ask"
            aria-label="Ask SwasthTrack — डेटा से पूछें"
            className={cn(
              "pressable grid h-11 w-11 place-items-center rounded-control border",
              pathname === "/ask"
                ? "border-meds bg-meds-soft text-meds"
                : "border-line bg-surface text-ink-muted",
            )}
          >
            <MessageSquareText aria-hidden className="h-5 w-5" />
          </Link>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label={menuOpen ? "Close menu" : "Open menu — और विकल्प"}
              className="pressable grid h-11 w-11 place-items-center rounded-control border border-line bg-surface text-ink-muted"
            >
              {menuOpen ? (
                <X aria-hidden className="h-5 w-5" />
              ) : (
                <Menu aria-hidden className="h-5 w-5" />
              )}
            </button>

            {menuOpen ? (
              <div
                role="menu"
                className="reveal absolute right-0 top-13 z-50 w-64 overflow-hidden rounded-card border border-line bg-surface shadow-e3"
              >
                <ul className="py-1.5">
                  {secondaryNavigation.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href;
                    return (
                      <li key={item.href}>
                        <Link
                          role="menuitem"
                          href={item.href}
                          onClick={() => setMenuOpen(false)}
                          className={cn(
                            "flex min-h-11 items-center gap-3 px-3.5 text-sm",
                            active
                              ? "bg-brand-soft font-semibold text-brand-ink"
                              : "text-ink hover:bg-surface-sunken",
                          )}
                        >
                          <Icon aria-hidden className="h-4.5 w-4.5 shrink-0 text-ink-subtle" />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          <span lang="hi" className="shrink-0 text-2xs text-ink-subtle">
                            {item.hindiLabel}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <ul className="border-t border-line py-1.5">
                  {informationNavigation.map((item) => (
                    <li key={item.href}>
                      <Link
                        role="menuitem"
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className="flex min-h-11 items-center gap-3 px-3.5 text-sm text-ink-muted hover:bg-surface-sunken"
                      >
                        <item.icon aria-hidden className="h-4.5 w-4.5 shrink-0 text-ink-subtle" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ---------- DESKTOP ---------- */}
      <div className="hidden items-center justify-between gap-6 px-8 py-3 lg:flex">
        <div className="min-w-0">
          <p className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
            Patient overview · स्वास्थ्य निगरानी
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
            <Link
              href="/profile"
              className="text-lg font-semibold text-ink hover:text-brand"
            >
              {profile?.name || "Patient"}
            </Link>
            {profile?.daily_calorie_target ? (
              <Badge variant="brand">
                {profile.daily_calorie_target} kcal/day target
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <div className="flex min-h-11 items-center gap-2 rounded-control border border-line bg-surface px-3 text-sm text-ink-muted">
            <CalendarDays aria-hidden className="h-4 w-4 text-brand" />
            <CurrentDate />
          </div>

          <Link
            href="/ask"
            className={cn(
              "pressable flex min-h-11 items-center gap-2 rounded-control border px-3.5 text-sm font-semibold",
              pathname === "/ask"
                ? "border-meds bg-meds-soft text-meds"
                : "border-line bg-surface text-ink-muted hover:border-meds-line hover:text-meds",
            )}
          >
            <MessageSquareText aria-hidden className="h-4 w-4" />
            <span>Ask SwasthTrack</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
