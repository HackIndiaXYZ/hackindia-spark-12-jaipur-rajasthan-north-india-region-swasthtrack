"use client";

import { useCallback, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { CalendarDays, Eye, LogOut, Menu, MessageSquareText, X } from "lucide-react";
import { CurrentDate } from "@/components/layout/current-date";
import { OfflineBanner } from "@/components/layout/offline-banner";
import { PatientSwitcher } from "@/components/layout/patient-switcher";
import {
  informationNavigation,
  isNavActive,
  secondaryNavigation,
} from "@/components/layout/navigation-items";
import { useMenu } from "@/components/layout/use-menu";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";

export function Header() {
  const pathname = usePathname();
  const { authorizedPatients, activePatientId, memberRole, signOut } = useAuth();
  const patient = authorizedPatients.find((p) => p.id === activePatientId);
  const viewOnly = memberRole === "viewer";

  // The menu is "open at" the path it was opened on, so navigating anywhere
  // (link, back button) closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const menuOpen = openAt === pathname;
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setOpenAt(null), []);
  const onMenuKeyDown = useMenu({
    open: menuOpen,
    onClose: closeMenu,
    triggerRef,
    menuRef,
  });

  const patientName = patient?.name || "SwasthTrack";
  const hasSwitcher = authorizedPatients.length > 1;

  return (
    <header className="frost sticky top-0 z-30 border-b border-line pt-safe">
      {/* ---------- MOBILE ----------
          Two actions only. The previous header packed six 34px icon buttons
          into the right edge; they were below the 44px tap minimum and gave no
          hint of what they opened. Secondary destinations now live in one
          labelled menu (§16). */}
      <div className="flex h-14 items-center justify-between gap-2 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] lg:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link
            href="/"
            className="shrink-0 rounded-control"
            aria-label="Dashboard — होम"
          >
            <Image
              src="/logo.jpg"
              alt=""
              width={72}
              height={72}
              sizes="36px"
              priority
              className="h-9 w-9 rounded-control border border-line object-cover"
            />
          </Link>

          {hasSwitcher ? (
            <PatientSwitcher variant="header" className="min-w-0 flex-1" />
          ) : (
            <Link
              href="/profile"
              className="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-control"
            >
              <span className="block truncate text-sm font-semibold leading-tight text-ink">
                {patientName}
              </span>
              <span className="flex items-center gap-1 text-2xs leading-tight text-ink-muted">
                {viewOnly ? (
                  <>
                    <Eye aria-hidden className="h-3 w-3 shrink-0" />
                    <span lang="hi">केवल देखें</span>
                    <span lang="en">· View only</span>
                  </>
                ) : (
                  <span lang="hi">स्वास्थ्य साथी</span>
                )}
              </span>
            </Link>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href="/ask"
            aria-label="Ask SwasthTrack — डेटा से पूछें"
            aria-current={pathname === "/ask" ? "page" : undefined}
            className={cn(
              "pressable grid h-11 w-11 place-items-center rounded-control border",
              pathname === "/ask"
                ? "border-meds bg-meds-soft text-meds"
                : "border-line bg-surface text-ink-muted",
            )}
          >
            <MessageSquareText aria-hidden className="h-5 w-5" />
          </Link>

          <div className="relative">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setOpenAt(menuOpen ? null : pathname)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-controls={menuOpen ? menuId : undefined}
              aria-label={menuOpen ? "Close menu — बंद करें" : "Open menu — और विकल्प"}
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
                ref={menuRef}
                id={menuId}
                role="menu"
                aria-label="और विकल्प — More"
                onKeyDown={onMenuKeyDown}
                className="reveal absolute right-0 top-13 z-50 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-line bg-surface shadow-e3"
              >
                <div className="py-1.5">
                  {secondaryNavigation.map((item) => {
                    const Icon = item.icon;
                    const active = isNavActive(item.href, pathname);
                    return (
                      <Link
                        key={item.href}
                        role="menuitem"
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        onClick={closeMenu}
                        className={cn(
                          "flex min-h-11 items-center gap-3 px-3.5 text-sm focus-visible:outline-offset-[-2px]",
                          active
                            ? "bg-brand-soft font-semibold text-brand-ink"
                            : "text-ink hover:bg-surface-sunken",
                        )}
                      >
                        <Icon aria-hidden className="h-4.5 w-4.5 shrink-0 text-ink-subtle" />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        <span lang="hi" className="shrink-0 text-2xs text-ink-muted">
                          {item.hindiLabel}
                        </span>
                      </Link>
                    );
                  })}
                </div>
                <div className="border-t border-line py-1.5">
                  {informationNavigation.map((item) => (
                    <Link
                      key={item.href}
                      role="menuitem"
                      href={item.href}
                      aria-current={isNavActive(item.href, pathname) ? "page" : undefined}
                      onClick={closeMenu}
                      className="flex min-h-11 items-center gap-3 px-3.5 text-sm text-ink-muted hover:bg-surface-sunken focus-visible:outline-offset-[-2px]"
                    >
                      <item.icon aria-hidden className="h-4.5 w-4.5 shrink-0 text-ink-subtle" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  ))}
                </div>
                <div className="border-t border-line py-1.5">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      closeMenu();
                      void signOut();
                    }}
                    className="flex min-h-11 w-full items-center gap-3 px-3.5 text-left text-sm text-ink-muted hover:bg-surface-sunken focus-visible:outline-offset-[-2px]"
                  >
                    <LogOut aria-hidden className="h-4.5 w-4.5 shrink-0 text-ink-subtle" />
                    <span className="min-w-0 flex-1 truncate">Sign out</span>
                    <span lang="hi" className="shrink-0 text-2xs text-ink-muted">
                      लॉग आउट
                    </span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ---------- DESKTOP ---------- */}
      <div className="hidden items-center justify-between gap-6 px-8 py-3 lg:flex">
        <div className="min-w-0">
          <p className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">
            Patient overview · <span lang="hi">स्वास्थ्य निगरानी</span>
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
            <Link
              href="/profile"
              className="text-lg font-semibold text-ink hover:text-brand"
            >
              {patient?.name || "Patient"}
            </Link>
            {patient?.daily_calorie_target ? (
              <Badge variant="brand">
                {patient.daily_calorie_target} kcal/day target
              </Badge>
            ) : null}
            {viewOnly ? (
              <Badge variant="info">
                <Eye aria-hidden className="h-3 w-3" />
                <span lang="hi">केवल देखें</span> · View only
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
            aria-current={pathname === "/ask" ? "page" : undefined}
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

      <OfflineBanner />
    </header>
  );
}
