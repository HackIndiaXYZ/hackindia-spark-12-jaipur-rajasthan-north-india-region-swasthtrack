"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock, RefreshCw, Trash2, UserPlus, Users } from "lucide-react";
import { AddCaregiverDialog } from "@/components/forms/add-caregiver-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/form-field";
import { EmptyState } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";
import { getAuthorizedCaregivers, revokeCaregiverAccess, setCaregiverRole, type AuthorizedCaregiver } from "@/services/auth-service";
import { sendAppEmailQuietly } from "@/services/email-client";
import type { PatientProfile } from "@/services/patient-service";
import { ROLE_LABEL } from "./account-panel";
import { SettingsCard } from "./settings-ui";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function Avatar({ name, active }: { name: string; active?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-full border text-sm font-bold",
        active ? "grad-gold-button border-gold-line text-gold-ink" : "border-line bg-surface-sunken text-ink-muted",
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Who can see or fill this patient's record. The roster itself is owner-only (the RPC refuses anyone else). */
export function FamilyPanel({ patient }: { patient: PatientProfile }) {
  const { user, profile, memberRole } = useAuth();
  const isOwner = memberRole === "owner";
  const toast = useToast();
  const confirm = useConfirm();

  const [members, setMembers] = useState<AuthorizedCaregiver[] | null>(null);
  const [error, setError] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchMembers = useCallback(async (): Promise<{ rows: AuthorizedCaregiver[] } | { error: string }> => {
    try {
      const rows = await getAuthorizedCaregivers(patient.id);
      return { rows: rows.filter((r) => r.status === "active") };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "सूची लोड नहीं हो सकी। (Could not load the list.)" };
    }
  }, [patient.id]);

  const apply = useCallback((result: { rows: AuthorizedCaregiver[] } | { error: string }) => {
    if ("rows" in result) {
      setMembers(result.rows);
      setError("");
    } else {
      setMembers((current) => current ?? []);
      setError(result.error);
    }
  }, []);

  const load = useCallback(async () => apply(await fetchMembers()), [apply, fetchMembers]);

  useEffect(() => {
    if (!isOwner) return;
    let live = true;
    void fetchMembers().then((result) => {
      if (live) apply(result);
    });
    return () => {
      live = false;
    };
  }, [isOwner, fetchMembers, apply]);

  async function handleRevoke(member: AuthorizedCaregiver) {
    const label = member.display_name || member.email || "यह सदस्य";
    const ok = await confirm({
      title: "एक्सेस हटाएं?",
      message: `${label} अब ${patient.name} की स्वास्थ्य जानकारी नहीं देख पाएंगे। बाद में नया कोड देकर दोबारा जोड़ा जा सकता है।`,
      confirmLabel: "हटाएं (Remove)",
      tone: "danger",
    });
    if (!ok) return;
    setBusyId(member.member_id);
    try {
      await revokeCaregiverAccess(member.member_id);
      sendAppEmailQuietly({ type: "caregiver.access-changed", patientId: patient.id, memberId: member.member_id, change: "removed" });
      await load();
      toast({ title: "एक्सेस हटा दिया गया", tone: "success" });
    } catch (err) {
      toast({ title: "एक्सेस नहीं हटाया जा सका", description: err instanceof Error ? err.message : undefined, tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  async function handleRoleChange(member: AuthorizedCaregiver, role: "editor" | "viewer") {
    if (member.role === role) return;
    setBusyId(member.member_id);
    try {
      await setCaregiverRole(member.member_id, role);
      sendAppEmailQuietly({ type: "caregiver.access-changed", patientId: patient.id, memberId: member.member_id, change: "role-changed" });
      await load();
      toast({ title: "भूमिका बदल दी गई", tone: "success" });
    } catch (err) {
      toast({ title: "भूमिका नहीं बदली जा सकी", description: err instanceof Error ? err.message : undefined, tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  const others = (members ?? []).filter((c) => c.user_id !== user?.id);
  const myName = profile?.display_name || user?.email || "आप";
  const myRole = memberRole ? ROLE_LABEL[memberRole] : null;

  return (
    <>
      <SettingsCard
        icon={Users}
        title="केयरगिवर और परिवार"
        description={`${patient.name} की जानकारी कौन देख या भर सकता है`}
        action={
          isOwner ? (
            <Button type="button" variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus aria-hidden className="h-4 w-4" />
              <span>जोड़ें</span>
              <span className="sr-only"> (Add caregiver)</span>
            </Button>
          ) : undefined
        }
      >
        <ul className="space-y-2.5">
          <li className="tile flex items-center gap-3 rounded-card p-3">
            <Avatar name={myName} active />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">
                {myName} <span className="font-normal text-ink-muted">· आप (You)</span>
              </p>
              {user?.email && myName !== user.email ? <p className="truncate text-xs text-ink-muted">{user.email}</p> : null}
            </div>
            {myRole ? (
              <Badge variant="brand">
                <span lang="hi">{myRole.hi}</span>
              </Badge>
            ) : null}
          </li>

          {isOwner ? (
            members === null ? (
              <li aria-busy="true" role="status" aria-label="लोड हो रहा है">
                <div className="skeleton h-16 rounded-card" />
              </li>
            ) : (
              others.map((member) => {
                const label = member.display_name || member.email || "—";
                const busy = busyId === member.member_id;
                return (
                  <li key={member.member_id} className="tile flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-card p-3">
                    <div className="flex min-w-0 flex-1 basis-52 items-center gap-3">
                      <Avatar name={label} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{label}</p>
                        <p className="truncate text-xs text-ink-muted">
                          {member.email && member.display_name ? `${member.email} · ` : ""}
                          जुड़े: {new Date(member.added_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`role-${member.member_id}`}>
                        {label} की भूमिका (Role)
                      </label>
                      <Select
                        id={`role-${member.member_id}`}
                        value={member.role === "editor" ? "editor" : "viewer"}
                        disabled={busy}
                        onChange={(e) => void handleRoleChange(member, e.target.value as "editor" | "viewer")}
                        className="min-h-control-sm w-auto text-sm pointer-coarse:min-h-control"
                      >
                        <option value="viewer">Viewer (देखना)</option>
                        <option value="editor">Editor (भरना)</option>
                      </Select>
                      <Button type="button" variant="danger" size="sm" loading={busy} onClick={() => void handleRevoke(member)} aria-label={`${label} का एक्सेस हटाएं`}>
                        {busy ? null : <Trash2 aria-hidden className="h-3.5 w-3.5" />}
                        हटाएं
                      </Button>
                    </div>
                  </li>
                );
              })
            )
          ) : null}
        </ul>

        {isOwner && members !== null && others.length === 0 && !error ? (
          <EmptyState
            icon={Users}
            title="No other members yet"
            hindiTitle="अभी कोई और सदस्य नहीं जुड़ा है"
            description="परिवार के किसी सदस्य को जोड़ने के लिए “जोड़ें” दबाएं। वे कोड से जुड़ेंगे।"
            action={
              <Button type="button" variant="primary" onClick={() => setInviteOpen(true)}>
                <UserPlus aria-hidden className="h-4 w-4" />
                परिवार को जोड़ें
              </Button>
            }
          />
        ) : null}

        {error ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-critical-line bg-critical-soft px-3.5 py-3 text-sm">
            <p className="font-semibold text-critical">{error}</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
              <RefreshCw aria-hidden className="h-3.5 w-3.5" />
              फिर कोशिश करें
            </Button>
          </div>
        ) : null}

        {!isOwner ? (
          <p className="flex items-start gap-2 rounded-card border border-info-line bg-info-soft px-3.5 py-3 text-sm text-ink-muted">
            <Lock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            <span lang="hi">केयरगिवर जोड़ना या हटाना सिर्फ़ मरीज़ का मालिक (Owner) कर सकता है।</span>
          </p>
        ) : null}
      </SettingsCard>

      {isOwner ? <AddCaregiverDialog isOpen={inviteOpen} onClose={() => setInviteOpen(false)} patientId={patient.id} onSuccess={() => void load()} /> : null}
    </>
  );
}
