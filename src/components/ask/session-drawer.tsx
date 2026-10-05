"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquarePlus, MessageSquareText, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/page";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface SessionRow {
  id: string;
  title: string | null;
  last_active_at: string;
}

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Past conversations for the active patient (read straight from Supabase; RLS limits rows to the signed-in user). */
export function SessionDrawer({
  isOpen,
  onClose,
  patientId,
  activeId,
  onOpen,
  onNew,
}: {
  isOpen: boolean;
  onClose: () => void;
  patientId: string | null;
  activeId: string | null;
  /** Resolves false when the conversation could not be loaded. */
  onOpen: (id: string) => Promise<boolean> | void;
  onNew: () => void;
}) {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const confirm = useConfirm();
  const toast = useToast();

  const fetchRows = useCallback(async (): Promise<SessionRow[] | null> => {
    if (!patientId) return [];
    const { data, error } = await supabase.from("soie_sessions").select("id,title,last_active_at").eq("patient_id", patientId).order("last_active_at", { ascending: false }).limit(40);
    return error ? null : (data ?? []);
  }, [patientId]);

  const apply = useCallback((result: SessionRow[] | null) => {
    setFailed(result === null);
    setRows(result ?? []);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let live = true;
    void fetchRows().then((result) => {
      if (live) apply(result);
    });
    return () => {
      live = false;
    };
  }, [isOpen, fetchRows, apply]);

  async function open(id: string) {
    if (opening) return;
    setOpening(id);
    try {
      const ok = await onOpen(id);
      if (ok === false) {
        toast({ title: "बातचीत खुल नहीं सकी", description: "कृपया फिर कोशिश करें।", tone: "error" });
        return;
      }
      onClose();
    } finally {
      setOpening(null);
    }
  }

  async function remove(id: string) {
    const ok = await confirm({ title: "यह बातचीत हटाएँ?", message: "इसके सवाल-जवाब हमेशा के लिए हट जाएँगे।", confirmLabel: "हटाएँ", tone: "danger" });
    if (!ok) return;
    const { error } = await supabase.from("soie_sessions").delete().eq("id", id);
    if (error) {
      toast({ title: "हटाया नहीं जा सका", tone: "error" });
      return;
    }
    setRows((r) => (r ?? []).filter((x) => x.id !== id));
    if (id === activeId) onNew();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="पुरानी बातचीत"
      hindiTitle="History"
      description="किसी भी बातचीत को खोलकर वहीं से आगे पूछ सकते हैं।"
      size="md"
      footer={
        <Button
          variant="primary"
          block
          onClick={() => {
            onNew();
            onClose();
          }}
        >
          <MessageSquarePlus aria-hidden className="h-4 w-4" />
          नई बातचीत शुरू करें
        </Button>
      }
    >
      {rows === null ? (
        <div aria-busy="true" role="status" aria-label="लोड हो रहा है" className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-14 rounded-card" />
          ))}
        </div>
      ) : failed ? (
        <EmptyState
          icon={MessageSquareText}
          title="History could not load"
          hindiTitle="बातचीत की सूची लोड नहीं हो सकी"
          description="इंटरनेट जाँचकर फिर कोशिश करें।"
          action={
            <Button variant="secondary" onClick={() => void fetchRows().then(apply)}>
              फिर कोशिश करें
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState icon={MessageSquareText} title="No conversations yet" hindiTitle="अभी कोई बातचीत नहीं" description="पहला सवाल पूछते ही यहाँ दिखेगी।" />
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => {
            const active = s.id === activeId;
            return (
              <li
                key={s.id}
                className={cn("flex items-center gap-1 rounded-card border pr-1", active ? "border-gold-line bg-gold-soft" : "border-line bg-surface")}
              >
                <button
                  type="button"
                  onClick={() => void open(s.id)}
                  disabled={opening !== null}
                  aria-current={active ? "true" : undefined}
                  className="pressable min-h-control min-w-0 flex-1 cursor-pointer rounded-card px-3 py-2 text-left hover:bg-gold-soft disabled:cursor-wait"
                >
                  <span lang="hi" className="line-clamp-2 text-sm font-medium text-ink">
                    {s.title || "बातचीत"}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-2xs text-ink-subtle">
                    {when(s.last_active_at)}
                    {active ? <span className="rounded-full bg-gold-ink px-1.5 py-px text-ink-inverse">खुली है</span> : null}
                  </span>
                </button>
                <IconButton variant="ghost" aria-label={`बातचीत हटाएँ: ${s.title || "बातचीत"}`} onClick={() => void remove(s.id)}>
                  <Trash2 aria-hidden className="h-4 w-4" />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
