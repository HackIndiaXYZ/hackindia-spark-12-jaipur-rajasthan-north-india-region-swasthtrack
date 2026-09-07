"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import {
  getMedicalConditions,
  getPatientProfile,
  type MedicalCondition,
  type PatientProfile,
} from "@/services/patient-service";
import {
  developerNavigation,
  informationNavigation,
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
      <p className="px-3 pb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
        {label}
      </p>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = pathname === item.href;
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
                    active ? "text-ink-inverse/75" : "text-ink-subtle",
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
  const { profile: authProfile } = useAuth();
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [conditions, setConditions] = useState<MedicalCondition[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const p = await getPatientProfile();
        if (!active) return;
        setProfile(p);
        const c = await getMedicalConditions(p.id);
        if (active) setConditions(c);
      } catch {
        /* non-critical chrome */
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [pathname]);

  const initials = profile?.name
    ? profile.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "—";

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-68 flex-col overflow-y-auto border-r border-line bg-surface px-3 py-4 lg:flex">
      <Link className="flex items-center gap-3 px-2" href="/">
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
          <span lang="hi" className="block truncate text-xs text-ink-subtle">
            स्वस्थ आदतें, खुशहाल जीवन
          </span>
        </span>
      </Link>

      <Link
        href="/profile"
        className="pressable mt-5 block rounded-card border border-brand-line bg-brand-softer p-3 hover:border-brand"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-surface text-sm font-semibold text-brand-ink shadow-e1">
            {initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">
              {profile?.name || "Patient"}
            </span>
            <span className="block text-xs text-ink-muted">
              {[
                profile?.age ? `${profile.age} years` : null,
                profile?.gender,
              ]
                .filter(Boolean)
                .join(" · ") || "Profile incomplete"}
            </span>
          </span>
        </div>
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

      <nav className="mt-5 flex-1 space-y-5" aria-label="Main navigation">
        <NavGroup label="Daily" items={primaryNavigation} pathname={pathname} />
        <NavGroup label="Insight & care" items={secondaryNavigation} pathname={pathname} />
        {authProfile?.role === "admin" ? (
          <NavGroup label="Developer" items={developerNavigation} pathname={pathname} />
        ) : null}
        <NavGroup label="Information" items={informationNavigation} pathname={pathname} />
      </nav>
    </aside>
  );
}
