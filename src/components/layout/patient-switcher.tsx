"use client";

import { useCallback, useId, useRef, useState } from "react";
import { Check, ChevronsUpDown, Eye } from "lucide-react";
import { memberRoleLabel } from "@/components/layout/member-role";
import { useMenu } from "@/components/layout/use-menu";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";

/** First letters of a name, safe for Devanagari (no splitting inside a cluster). */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return parts
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join("")
    .toUpperCase();
}

/**
 * Switches which family member's records the whole app shows. Renders nothing
 * unless the signed-in user belongs to more than one patient — a single-patient
 * household never sees it. The trigger names the active person and the user's
 * role on them, and flags view-only access.
 */
export function PatientSwitcher({
  variant,
  className,
}: {
  variant: "header" | "sidebar";
  className?: string;
}) {
  const { authorizedPatients, activePatientId, setActivePatientId, memberRole } =
    useAuth();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback(() => setOpen(false), []);
  const onMenuKeyDown = useMenu({ open, onClose: close, triggerRef, menuRef });

  if (authorizedPatients.length <= 1) return null;

  const active = authorizedPatients.find((p) => p.id === activePatientId);
  const role = memberRole ? memberRoleLabel[memberRole] : null;
  const viewOnly = memberRole === "viewer";

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`मरीज़ बदलें — Switch patient. अभी: ${active?.name ?? "—"}`}
        className={cn(
          "pressable flex w-full min-w-0 items-center gap-2.5 text-left",
          variant === "sidebar"
            ? "surface-lift min-h-11 rounded-card px-3 py-2"
            : "min-h-11 rounded-control px-1.5 hover:bg-surface/60",
        )}
      >
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-gold-soft text-sm font-semibold text-gold-ink ring-1 ring-gold-line"
        >
          {initialsOf(active?.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight text-ink">
            {active?.name ?? "—"}
          </span>
          <span className="flex items-center gap-1 text-2xs leading-tight text-ink-muted">
            {viewOnly ? <Eye aria-hidden className="h-3 w-3 shrink-0" /> : null}
            <span className="truncate">
              {role ? `${role.hi} · ${role.en}` : "स्वास्थ्य साथी"}
            </span>
          </span>
        </span>
        <ChevronsUpDown aria-hidden className="h-4 w-4 shrink-0 text-ink-subtle" />
      </button>

      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="मरीज़ चुनें — Choose patient"
          onKeyDown={onMenuKeyDown}
          className={cn(
            "reveal surface-lift absolute z-50 mt-1.5 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-card py-1.5 shadow-e4",
            variant === "sidebar" ? "left-0 right-0 w-auto" : "left-0 top-full",
          )}
        >
          {authorizedPatients.map((patient) => {
            const selected = patient.id === activePatientId;
            const label = memberRoleLabel[patient.member_role];
            return (
              <button
                key={patient.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  if (!selected) setActivePatientId(patient.id);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 px-3.5 py-1.5 text-left text-sm",
                  selected
                    ? "bg-gold-soft text-ink"
                    : "text-ink hover:bg-gold-soft/70 focus-visible:bg-gold-soft/70",
                )}
              >
                <span
                  aria-hidden
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-field bg-surface-sunken text-xs font-semibold text-ink-muted ring-1 ring-line"
                >
                  {initialsOf(patient.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{patient.name}</span>
                  <span className="block truncate text-2xs text-ink-muted">
                    {label.hi} · {label.en}
                    {patient.age ? ` · ${patient.age} वर्ष` : ""}
                  </span>
                </span>
                {selected ? (
                  <Check aria-hidden className="h-4 w-4 shrink-0 text-brand" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
