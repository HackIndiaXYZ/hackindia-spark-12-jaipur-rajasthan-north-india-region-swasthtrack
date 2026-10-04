"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bell,
  Check,
  ChevronRight,
  Info,
  ShieldAlert,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  dismissAlert,
  markAlertAsRead,
  type AlertSeverity,
  type HealthAlert,
} from "@/services/smart-insights-service";

type AlertCenterCardProps = {
  alerts: HealthAlert[];
  /** Keys the alerts' dismissed/read state to this patient (defaults to the active one). */
  patientId?: string;
  onAlertChange?: () => void;
};

/**
 * Three severity levels, three distinct treatments (§34). Only IMPORTANT is
 * red; ATTENTION is amber and INFORMATION stays neutral, so a screenful of
 * alerts does not read as a screenful of emergencies.
 */
const severityStyles = {
  IMPORTANT: {
    container: "border-critical-line bg-critical-soft",
    icon: ShieldAlert,
    iconClass: "text-critical",
    badge: "critical" as const,
    label: "Important · ज़रूरी",
  },
  ATTENTION: {
    container: "border-attention-line bg-attention-soft",
    icon: AlertCircle,
    iconClass: "text-attention",
    badge: "attention" as const,
    label: "Attention · ध्यान दें",
  },
  INFO: {
    container: "border-line bg-surface-sunken",
    icon: Info,
    iconClass: "text-info",
    badge: "neutral" as const,
    label: "Info · जानकारी",
  },
} satisfies Record<AlertSeverity, unknown> as Record<
  AlertSeverity,
  {
    container: string;
    icon: LucideIcon;
    iconClass: string;
    badge: "critical" | "attention" | "neutral";
    label: string;
  }
>;

export function AlertCenterCard({ alerts, patientId, onAlertChange }: AlertCenterCardProps) {
  // The alert list always comes from props (a refresh can add or remove alerts);
  // only what the user did on this device since is kept here.
  const [dismissedKeys, setDismissedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [readKeys, setReadKeys] = useState<ReadonlySet<string>>(() => new Set());

  // Most severe first, and never the same alert key twice (§34).
  const order: Record<AlertSeverity, number> = { IMPORTANT: 0, ATTENTION: 1, INFO: 2 };
  const visible = Array.from(new Map((alerts ?? []).map((a) => [a.key, a])).values())
    .filter((a) => !dismissedKeys.has(a.key))
    .map((a) => (readKeys.has(a.key) ? { ...a, isRead: true } : a))
    .sort((a, b) => Number(Boolean(b.isUrgent)) - Number(Boolean(a.isUrgent)) || (order[a.severity] ?? 3) - (order[b.severity] ?? 3));

  if (visible.length === 0) return null;

  function handleDismiss(alertKey: string) {
    dismissAlert(alertKey, patientId);
    setDismissedKeys((prev) => new Set(prev).add(alertKey));
    onAlertChange?.();
  }

  function handleMarkRead(alertKey: string) {
    markAlertAsRead(alertKey, patientId);
    setReadKeys((prev) => new Set(prev).add(alertKey));
    onAlertChange?.();
  }

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-control bg-attention-soft text-attention">
          <Bell aria-hidden className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold text-ink">
          ध्यान देने योग्य
          <span className="ml-1.5 font-normal text-ink-muted">
            Needs attention ({visible.length})
          </span>
        </h2>
      </div>

      <ul className="space-y-2.5">
        {visible.map((alert) => {
          const style = severityStyles[alert.severity] ?? severityStyles.INFO;
          const Icon = style.icon;

          return (
            <li
              key={alert.key}
              className={cn("rounded-card border p-3.5", style.container)}
            >
              <div className="flex items-start gap-2.5">
                <Icon
                  aria-hidden
                  className={cn("mt-0.5 h-4.5 w-4.5 shrink-0", style.iconClass)}
                />

                <div className="min-w-0 flex-1">
                  {/* wraps instead of truncating — the severity label used to
                      be clipped to "IMPORTA" on a 320px screen */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p lang="hi" className="text-sm font-semibold text-ink">
                      {alert.titleHi}
                    </p>
                    <Badge variant={style.badge} className="shrink-0">
                      {style.label}
                    </Badge>
                  </div>
                  <p lang="hi" className="mt-1 text-sm leading-relaxed text-ink-muted">
                    {alert.messageHi}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleDismiss(alert.key)}
                  aria-label={`सूचना हटाएं: ${alert.titleHi}`}
                  className="pressable -mr-1.5 -mt-1.5 grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-control text-ink-subtle hover:bg-surface hover:text-ink"
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
                {!alert.isRead ? (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(alert.key)}
                    className="pressable flex min-h-control cursor-pointer items-center gap-1.5 rounded-control px-2 text-xs font-medium text-ink-muted hover:bg-surface hover:text-brand"
                  >
                    <Check aria-hidden className="h-3.5 w-3.5" />
                    <span lang="hi">पढ़ा हुआ चिह्नित करें</span>
                  </button>
                ) : (
                  <span className="px-2 text-xs text-ink-muted">
                    <span lang="hi">पढ़ा गया</span>
                  </span>
                )}

                {alert.actionUrl ? (
                  <Link
                    href={alert.actionUrl}
                    className="pressable flex min-h-control items-center gap-1 rounded-control px-2 text-xs font-semibold text-brand hover:bg-surface"
                  >
                    <span lang="hi">विवरण देखें</span>
                    <ChevronRight aria-hidden className="h-3.5 w-3.5" />
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
