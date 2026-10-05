"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Eye, LogOut } from "lucide-react";
import { LogoMark } from "@/components/brand/logo-mark";
import { Wordmark } from "@/components/brand/wordmark";
import { initialsOf, PatientSwitcher } from "@/components/layout/patient-switcher";
import { useIsDesktop } from "@/components/layout/use-media-query";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import {
  getMedicalConditions,
  type MedicalCondition,
} from "@/services/patient-service";
import {
  developerNavigation,
  informationNavigation,
  isNavActive,
  primaryNavigation,
  secondaryNavigation,
  type NavigationItem,
} from "./navigation-items";

function NavGroup({
  label,
  items,
  pathname,
}: {
  label: string;
  items: NavigationItem[];
  pathname: string;
}) {
  return (
    <div>
      <p className="px-3 pb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </p>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = isNavActive(item.href, pathname);
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  // 40px rows on a mouse so the whole menu fits a 768px laptop;
                  // touch-first tablets keep the 44px floor.
                  "flex min-h-10 items-center justify-between gap-2 rounded-control px-3 text-sm transition-colors pointer-coarse:min-h-11",
                  active
                    ? "grad-gold-button border border-gold-line font-semibold text-gold-ink shadow-gold-button"
                    : "border border-transparent text-ink-muted hover:border-gold-line/60 hover:bg-surface/60 hover:text-ink",
                )}
                href={item.href}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Icon aria-hidden className="h-4.5 w-4.5 shrink-0" />
                  <span className="truncate">{item.shortLabel ?? item.label}</span>
                </span>
                <span
                  lang="hi"
                  className={cn(
                    "shrink-0 text-2xs",
                    active ? "text-gold-ink" : "text-ink-muted",
                  )}
                >
                  {item.hindiLabel}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const {
    profile: authProfile,
    authorizedPatients,
    activePatientId,
    memberRole,
    signOut,
  } = useAuth();

  // Name, age and gender come from the memberships the auth context already
  // loaded — no request here. The sidebar is only visible from `lg`, so the one
  // extra read (conditions) is skipped on phones and happens once per patient,
  // not once per navigation (patient-service caches it).
  const patient = authorizedPatients.find((p) => p.id === activePatientId);
  const isDesktop = useIsDesktop();
  const [loaded, setLoaded] = useState<{
    patientId: string;
    items: MedicalCondition[];
  } | null>(null);

  useEffect(() => {
    if (!isDesktop || !activePatientId) return;
    let active = true;
    getMedicalConditions(activePatientId)
      .then((items) => {
        if (active) setLoaded({ patientId: activePatientId, items });
      })
      .catch(() => {
        /* non-critical chrome */
      });
    return () => {
      active = false;
    };
  }, [isDesktop, activePatientId]);

  // Keep the current page's link on screen when the menu is taller than the window.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    navRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [pathname]);

  const conditions = loaded?.patientId === activePatientId ? loaded.items : [];
  const viewOnly = memberRole === "viewer";

  return (
    <aside
      aria-label="Sidebar"
      className="gilt-chrome fixed inset-y-0 left-0 z-30 hidden w-68 flex-col overflow-y-auto px-3 pt-4 lg:flex"
    >
      <Link className="flex items-center gap-3 rounded-control px-2" href="/">
        <LogoMark sizes="48px" className="h-12 w-12" />
        <span className="min-w-0">
          <Wordmark variant="compact" className="block h-7 w-auto" />
          <span lang="hi" className="mt-0.5 block truncate text-xs text-ink-muted">
            स्वस्थ आदतें, खुशहाल जीवन
          </span>
        </span>
      </Link>

      <PatientSwitcher variant="sidebar" className="mt-5" />

      <Link
        href="/profile"
        className={cn(
          "pressable gilt block rounded-card p-3",
          authorizedPatients.length > 1 ? "mt-2.5" : "mt-5",
        )}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-surface text-sm font-semibold text-gold-ink shadow-e1 ring-1 ring-gold-line"
          >
            {initialsOf(patient?.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">
              {patient?.name || "Patient"}
            </span>
            <span className="block text-xs text-ink-muted">
              {[patient?.age ? `${patient.age} years` : null, patient?.gender]
                .filter(Boolean)
                .join(" · ") || "Profile incomplete"}
            </span>
          </span>
        </div>
        {viewOnly ? (
          <Badge variant="info" className="mt-2.5">
            <Eye aria-hidden className="h-3 w-3" />
            <span lang="hi">केवल देखें</span> · View only
          </Badge>
        ) : null}
        {conditions.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {conditions.slice(0, 3).map((condition) => (
              <Badge key={condition.id} variant="brand">
                {condition.condition_name}
              </Badge>
            ))}
            {conditions.length > 3 ? (
              <Badge variant="neutral">+{conditions.length - 3}</Badge>
            ) : null}
          </div>
        ) : null}
      </Link>

      <nav ref={navRef} className="mt-4 flex-1 space-y-4" aria-label="Main navigation">
        <NavGroup label="Daily" items={primaryNavigation} pathname={pathname} />
        <NavGroup label="Insight & care" items={secondaryNavigation} pathname={pathname} />
        {authProfile?.role === "admin" ? (
          <NavGroup label="Developer" items={developerNavigation} pathname={pathname} />
        ) : null}
      </nav>

      {/* Reference pages: a quiet row rather than a whole group, which keeps
          the main menu on one screen of a laptop. */}
      <nav aria-label="Information" className="mt-3 flex flex-wrap items-center gap-x-0.5 gap-y-0.5 px-1">
        {informationNavigation.map((item) => {
          const active = isNavActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center rounded-control px-2 text-xs font-medium pointer-coarse:min-h-11",
                active ? "bg-gold-soft font-semibold text-ink" : "text-ink-muted hover:bg-surface/70 hover:text-ink",
              )}
            >
              {item.shortLabel ?? item.label}
            </Link>
          );
        })}
      </nav>

      {/* Pinned to the foot of the panel: it stays reachable however long the
          menu is, and the foot colour matches the panel gradient's end stop. */}
      <div className="sticky bottom-0 -mx-3 mt-3 border-t border-gold-line/60 bg-gilt-3 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        <button
          type="button"
          onClick={() => void signOut()}
          className="pressable flex min-h-10 w-full items-center gap-3 rounded-control px-3 text-sm text-ink-muted hover:bg-surface/70 hover:text-ink pointer-coarse:min-h-11"
        >
          <LogOut aria-hidden className="h-4.5 w-4.5 shrink-0" />
          <span className="flex-1 text-left">Sign out</span>
          <span lang="hi" className="shrink-0 text-2xs text-ink-muted">
            लॉग आउट
          </span>
        </button>
      </div>
    </aside>
  );
}
