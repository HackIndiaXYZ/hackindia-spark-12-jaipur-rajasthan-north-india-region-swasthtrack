"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Eye, LogOut } from "lucide-react";
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
                  "flex min-h-11 items-center justify-between gap-2 rounded-control px-3 text-sm transition-colors",
                  active
                    ? "bg-brand text-ink-inverse font-semibold"
                    : "text-ink-muted hover:bg-brand-softer hover:text-brand-ink",
                )}
                href={item.href}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Icon aria-hidden className="h-4.5 w-4.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                <span
                  lang="hi"
                  className={cn(
                    "shrink-0 text-2xs",
                    active ? "text-ink-inverse" : "text-ink-muted",
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

  const conditions = loaded?.patientId === activePatientId ? loaded.items : [];
  const viewOnly = memberRole === "viewer";

  return (
    <aside
      aria-label="Sidebar"
      className="fixed inset-y-0 left-0 z-30 hidden w-68 flex-col overflow-y-auto border-r border-line bg-surface px-3 py-4 lg:flex"
    >
      <Link className="flex items-center gap-3 rounded-control px-2" href="/">
        <Image
          src="/logo.jpg"
          alt=""
          width={88}
          height={88}
          sizes="44px"
          className="h-11 w-11 shrink-0 rounded-control border border-line object-cover"
        />
        <span className="min-w-0">
          <span className="block text-base font-semibold text-ink">SwasthTrack</span>
          <span lang="hi" className="block truncate text-xs text-ink-muted">
            स्वस्थ आदतें, खुशहाल जीवन
          </span>
        </span>
      </Link>

      <PatientSwitcher variant="sidebar" className="mt-5" />

      <Link
        href="/profile"
        className={cn(
          "pressable block rounded-card border border-brand-line bg-brand-softer p-3 hover:border-brand",
          authorizedPatients.length > 1 ? "mt-2.5" : "mt-5",
        )}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-surface text-sm font-semibold text-brand-ink shadow-e1"
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

      <nav className="mt-5 flex-1 space-y-5 pb-safe" aria-label="Main navigation">
        <NavGroup label="Daily" items={primaryNavigation} pathname={pathname} />
        <NavGroup label="Insight & care" items={secondaryNavigation} pathname={pathname} />
        {authProfile?.role === "admin" ? (
          <NavGroup label="Developer" items={developerNavigation} pathname={pathname} />
        ) : null}
        <NavGroup label="Information" items={informationNavigation} pathname={pathname} />
      </nav>

      <button
        type="button"
        onClick={() => void signOut()}
        className="pressable mt-4 flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-sm text-ink-muted hover:bg-surface-sunken hover:text-ink"
      >
        <LogOut aria-hidden className="h-4.5 w-4.5 shrink-0" />
        <span className="flex-1 text-left">Sign out</span>
        <span lang="hi" className="shrink-0 text-2xs text-ink-muted">
          लॉग आउट
        </span>
      </button>
    </aside>
  );
}
